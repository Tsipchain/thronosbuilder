const express = require('express');
const router = express.Router();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { BuildJob, User } = require('../models');
const { addBuildJob, retryBuild, getRedisStatus } = require('../services/queue');
const { calculateCost } = require('../utils/pricing');
const {
  validateThrAddress,
  getBalance,
  verifyPayment,
  requestBuildPayment,
  authenticateWallet,
  recordBuildPayment,
  refundPayment,
  TREASURY_ADDRESS,
} = require('../services/blockchain');

// List builds for a wallet
router.get('/', async (req, res) => {
  try {
    const { wallet_address } = req.query;

    if (!wallet_address) {
      return res.status(400).json({ error: 'wallet_address query parameter required' });
    }

    const user = await User.findOne({ where: { wallet_address } });
    if (!user) {
      return res.json({ builds: [] });
    }

    const jobs = await BuildJob.findAll({
      where: { user_id: user.id },
      order: [['created_at', 'DESC']],
      limit: 50
    });

    res.json({
      builds: jobs.map(j => ({
        job_id: j.id,
        project_name: j.project_name,
        source_type: j.source_type,
        platform: j.platform,
        build_type: j.build_type,
        status: j.status,
        progress: j.progress,
        cost_thron: j.cost_thron,
        payment_status: j.payment_status,
        created_at: j.created_at,
        completed_at: j.completed_at,
        android_artifact_url: j.android_artifact_url,
        ios_artifact_url: j.ios_artifact_url
      }))
    });
  } catch (error) {
    console.error('List builds error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check wallet balance and validate before payment
router.post('/preflight', async (req, res) => {
  try {
    const { wallet_address, platform, build_type } = req.body;

    if (!wallet_address) {
      return res.status(400).json({ error: 'wallet_address required' });
    }

    // Validate address format
    if (!validateThrAddress(wallet_address)) {
      return res.status(400).json({
        error: 'Invalid THR wallet address format',
        hint: 'THR address must be THR followed by 40 hex characters',
      });
    }

    // Calculate cost
    const cost_thron = calculateCost(platform || 'android', build_type || 'apk');

    // Check balance on chain
    const balanceResult = await getBalance(wallet_address);

    // Authenticate wallet
    const authResult = await authenticateWallet(wallet_address);

    res.json({
      wallet_address,
      address_valid: true,
      authenticated: authResult.success,
      balance: balanceResult.success ? balanceResult.balance : null,
      balance_error: balanceResult.success ? null : balanceResult.error,
      cost_thron,
      can_afford: balanceResult.success && balanceResult.balance >= cost_thron,
      treasury_address: TREASURY_ADDRESS,
      fee_estimate: cost_thron * 0.005, // 0.5% transfer fee
    });
  } catch (error) {
    console.error('Preflight error:', error);
    res.status(500).json({ error: 'Preflight check failed' });
  }
});

// Submit new build job
router.post('/', async (req, res) => {
  try {
    const {
      wallet_address,
      source_url,
      source_type = 'github',
      branch = 'main',
      platform,
      build_type,
      project_name,
      signing_config = {},
      // Payment fields
      auth_secret,
      passphrase,
      tx_id, // Pre-existing tx from client-side payment
      payment_method = 'thr', // thr | thronos | eth | bnb | usdt_evm | usdc_sol
    } = req.body;

    // Validation
    if (!wallet_address || !source_url || !platform || !build_type || !project_name) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['wallet_address', 'source_url', 'platform', 'build_type', 'project_name']
      });
    }

    // iOS build guard — iOS is not yet available
    if (platform === 'ios') {
      return res.status(400).json({
        error: 'iOS builds are not yet available. Android builds are fully supported.',
        supported_platforms: ['android']
      });
    }

    let effectivePlatform = platform;
    let iosNote = null;
    if (platform === 'both') {
      effectivePlatform = 'android';
      iosNote = 'iOS builds are not yet available. Your build has been submitted for Android only.';
    }

    // Calculate cost
    const cost_thron = calculateCost(effectivePlatform, build_type);

    // ─── Payment Verification ───

    let paymentResult;

    if (payment_method === 'thronos' || payment_method === 'thr') {
      // THR native payment: validate address first
      if (!validateThrAddress(wallet_address)) {
        return res.status(400).json({
          error: 'Invalid THR wallet address',
          hint: 'THR address format: THR + 40 hex characters',
        });
      }

      if (tx_id) {
        // User already sent payment, verify the transaction
        paymentResult = await verifyPayment(wallet_address, cost_thron, tx_id);
        if (!paymentResult.success) {
          return res.status(402).json({
            error: 'Payment transaction verification failed',
            detail: paymentResult.error,
            tx_id,
          });
        }
      } else if (auth_secret) {
        // Server-side payment: send THR from user wallet to treasury
        paymentResult = await requestBuildPayment(
          wallet_address, cost_thron, auth_secret, passphrase
        );
        if (!paymentResult.success) {
          return res.status(402).json({
            error: 'Payment failed',
            detail: paymentResult.error,
            required_amount: cost_thron,
            treasury_address: TREASURY_ADDRESS,
          });
        }
      } else {
        // No auth_secret and no tx_id: check balance only
        paymentResult = await verifyPayment(wallet_address, cost_thron);
        if (!paymentResult.success) {
          return res.status(402).json({
            error: 'Insufficient THR balance',
            detail: paymentResult.error,
            required_amount: cost_thron,
            treasury_address: TREASURY_ADDRESS,
            hint: 'Send THR to treasury address or provide auth_secret for automatic payment',
          });
        }
      }
    } else {
      // Cross-chain payment (MetaMask/Phantom): verify tx_id exists
      if (!tx_id) {
        return res.status(402).json({
          error: 'Transaction hash required for cross-chain payment',
          hint: 'Complete the payment transaction and provide tx_id',
        });
      }
      // Cross-chain tx verification is handled client-side
      // We trust the tx_id for now; webhook/oracle can verify later
      paymentResult = { success: true, txId: tx_id, method: 'cross_chain' };
    }

    // ─── Create Build Job ───

    // Find or create user
    let [user] = await User.findOrCreate({
      where: { wallet_address },
      defaults: { id: uuidv4(), wallet_address }
    });

    // Create build job
    const job = await BuildJob.create({
      user_id: user.id,
      project_name,
      source_type,
      source_url,
      branch,
      build_type,
      platform: effectivePlatform,
      cost_thron,
      payment_status: 'paid',
      status: 'pending'
    });

    // Record payment on chain
    await recordBuildPayment(job.id, wallet_address, cost_thron, paymentResult.txId);

    // Add to build queue
    await addBuildJob(job.id, {
      jobId: job.id,
      sourceUrl: source_url,
      sourceType: source_type,
      branch,
      platform: effectivePlatform,
      buildType: build_type,
      signingConfig: signing_config
    });

    const responseBody = {
      success: true,
      job_id: job.id,
      status: 'pending',
      platform: effectivePlatform,
      cost_thron,
      payment_tx: paymentResult.txId || null,
      message: 'Build job submitted successfully',
      websocket_url: `/ws/builds/${job.id}`
    };

    if (iosNote) {
      responseBody.ios_note = iosNote;
    }

    res.status(201).json(responseBody);

  } catch (error) {
    console.error('Build submission error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Get build status
router.get('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await BuildJob.findByPk(jobId, {
      include: [{
        model: User,
        attributes: ['wallet_address']
      }]
    });

    if (!job) {
      return res.status(404).json({ error: 'Build job not found' });
    }

    res.json({
      job_id: job.id,
      project_name: job.project_name,
      status: job.status,
      progress: job.progress,
      platform: job.platform,
      build_type: job.build_type,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      android_artifact_url: job.android_artifact_url,
      ios_artifact_url: job.ios_artifact_url,
      cost_thron: job.cost_thron,
      payment_status: job.payment_status
    });

  } catch (error) {
    console.error('Get build status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get build logs
router.get('/:jobId/logs', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const { BuildLog } = require('../models');
    const logs = await BuildLog.findAll({
      where: { job_id: jobId },
      order: [['timestamp', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      job_id: jobId,
      logs: logs.map(log => ({
        timestamp: log.timestamp,
        line: log.log_line,
        type: log.log_type
      }))
    });

  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel build job
router.post('/:jobId/cancel', async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await BuildJob.findByPk(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Build job not found' });
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return res.status(400).json({ error: 'Cannot cancel completed job' });
    }

    await job.update({ status: 'cancelled' });

    res.json({
      success: true,
      job_id: job.id,
      status: 'cancelled'
    });

  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retry a stuck/failed build
router.post('/:jobId/retry', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await retryBuild(jobId);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Retry build error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Queue/Redis status (debug)
router.get('/system/status', async (req, res) => {
  const redis = getRedisStatus();
  res.json({ redis, queue_mode: redis.connected ? 'redis' : 'inline' });
});

// Download artifact
router.get('/:jobId/download/:platform', async (req, res) => {
  try {
    const { jobId, platform } = req.params;

    const job = await BuildJob.findByPk(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Build job not found' });
    }

    const artifactUrl = platform === 'android' 
      ? job.android_artifact_url 
      : job.ios_artifact_url;

    if (!artifactUrl) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    // Redirect to artifact URL (IPFS or S3)
    res.redirect(artifactUrl);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve locally stored artifacts
router.get('/artifacts/*', (req, res) => {
  const localStoragePath = process.env.LOCAL_STORAGE_PATH;
  if (!localStoragePath) {
    return res.status(404).json({ error: 'Local storage not configured' });
  }

  const key = req.params[0];
  if (!key) {
    return res.status(400).json({ error: 'Artifact key required' });
  }

  const filePath = path.resolve(localStoragePath, key);

  // Prevent directory traversal
  if (!filePath.startsWith(path.resolve(localStoragePath))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.sendFile(filePath, (err) => {
    if (err) {
      if (!res.headersSent) {
        res.status(404).json({ error: 'Artifact not found' });
      }
    }
  });
});

module.exports = router;
