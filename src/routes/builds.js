'use strict';
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { BuildJob, User } = require('../models');
const { addBuildJob, retryBuild, getRedisStatus } = require('../services/queue');
const { calculateCost } = require('../utils/pricing');
const { getBuildQuote, validateQuote } = require('../services/pricingQuote');
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
const { requireApiKey } = require('../middleware/auth');
const { deriveFallbackArtifactUrl } = require('../services/storage');

function normalizeWalletAddress(addr) {
  return String(addr || '').trim().toLowerCase();
}

function shortWallet(addr) {
  const v = String(addr || '').trim();
  return v.length <= 12 ? v : `${v.slice(0, 6)}...${v.slice(-4)}`;
}

function isInternalFreeBuildWallet(walletAddress) {
  if (process.env.BUILDER_ALLOW_INTERNAL_FREE_BUILDS !== 'true') return false;
  const norm = normalizeWalletAddress(walletAddress);
  return String(process.env.BUILDER_INTERNAL_FREE_WALLETS || '')
    .split(',')
    .map(w => normalizeWalletAddress(w))
    .filter(Boolean)
    .includes(norm);
}

// ─── List builds ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { wallet_address } = req.query;
    if (!wallet_address) return res.status(400).json({ error: 'wallet_address query parameter required' });

    const user = await User.findOne({ where: { wallet_address } });
    if (!user) return res.json({ builds: [] });

    const jobs = await BuildJob.findAll({
      where: { user_id: user.id },
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    res.json({
      builds: jobs.map(j => ({
        job_id: j.id,
        project_name: j.project_name,
        source_type: j.source_type,
        platform: j.platform,
        build_type: j.build_type,
        project_path: j.project_path,
        status: j.status,
        progress: j.progress,
        cost_thron: j.cost_thron,
        payment_status: j.payment_status,
        created_at: j.created_at,
        completed_at: j.completed_at,
        android_artifact_url: j.android_artifact_url,
        ios_artifact_url: j.ios_artifact_url,
        android_fallback_artifact_url: deriveFallbackArtifactUrl(j.android_artifact_url),
        ios_fallback_artifact_url: deriveFallbackArtifactUrl(j.ios_artifact_url),
      })),
    });
  } catch (error) {
    console.error('List builds error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Preflight / Quote ────────────────────────────────────────────────
// Returns a server-signed quote for any payment method.
// For THR payments, also validates wallet balance.
router.post('/preflight', async (req, res) => {
  try {
    const {
      wallet_address,
      platform       = 'android',
      build_type     = 'apk',
      payment_method = 'thr',
    } = req.body;

    const quote = getBuildQuote({ platform, build_type, payment_method });
    if (!quote) {
      return res.status(400).json({
        error: 'Cannot generate quote: exchange rate not configured for this payment method',
        payment_method,
        hint: 'Set ETH_USD_REFERENCE or BNB_USD_REFERENCE in server config to enable this payment method.',
      });
    }

    const response = {
      platform,
      build_type,
      payment_method,
      quote_id:         quote.quote_id,
      amount:           quote.external_amount,
      currency:         quote.external_currency,
      native_cost_thr:  quote.native_cost_thr,
      floor_applied:    quote.floor_applied,
      quote_expires_at: quote.quote_expires_at,
      split:            quote.split,
    };

    // THR: additionally validate wallet balance
    if ((payment_method === 'thr' || payment_method === 'thronos') && wallet_address) {
      if (!validateThrAddress(wallet_address)) {
        return res.status(400).json({
          error: 'Invalid THR wallet address format',
          hint: 'THR address must be THR followed by 40 hex characters',
        });
      }

      const [balanceResult, authResult] = await Promise.all([
        getBalance(wallet_address),
        authenticateWallet(wallet_address),
      ]);

      Object.assign(response, {
        wallet_address,
        address_valid:  true,
        authenticated:  authResult.success,
        balance:        balanceResult.success ? balanceResult.balance : null,
        balance_error:  balanceResult.success ? null : balanceResult.error,
        cost_thron:     quote.native_cost_thr,
        can_afford:     balanceResult.success && balanceResult.balance >= quote.native_cost_thr,
        treasury_address: TREASURY_ADDRESS,
        fee_estimate:   quote.native_cost_thr * 0.005,
      });
    }

    res.json(response);
  } catch (error) {
    console.error('Preflight error:', error);
    res.status(500).json({ error: 'Preflight check failed' });
  }
});

// ─── Submit new build job ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      wallet_address,
      source_url,
      source_type    = 'github',
      branch         = 'main',
      upload_id      = null,
      upload_token   = null,
      project_type   = 'auto',
      project_path   = null,
      platform,
      build_type,
      project_name,
      signing_config = {},
      auth_secret,
      passphrase,
      tx_id,
      payment_method = 'thr',
      quote_id       = null,
    } = req.body;

    if (!wallet_address || !platform || !build_type || !project_name) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['wallet_address', 'platform', 'build_type', 'project_name'],
      });
    }

    if (source_type !== 'zip' && !source_url) {
      return res.status(400).json({ error: 'source_url required for non-zip sources' });
    }
    if (source_type === 'zip' && (!upload_id || !upload_token || !source_url)) {
      return res.status(400).json({ error: 'upload_id, upload_token and source_url are required for zip builds' });
    }

    // iOS guard
    if (platform === 'ios' && process.env.IOS_ENABLED !== 'true') {
      return res.status(400).json({
        error: 'iOS builds require signing/macOS configuration and are not currently enabled.',
        supported_platforms: ['android'],
      });
    }

    let effectivePlatform = platform;
    let iosNote = null;
    if (platform === 'both' && process.env.IOS_ENABLED !== 'true') {
      effectivePlatform = 'android';
      iosNote = 'iOS builds are not yet available. Your build has been submitted for Android only.';
    }

    const isInternalWaived = isInternalFreeBuildWallet(wallet_address);

    // ─── Quote validation for cross-chain payments ───────────────────
    const isCrossChain = payment_method !== 'thr' && payment_method !== 'thronos';

    if (isCrossChain && !isInternalWaived) {
      if (!quote_id) {
        return res.status(400).json({
          error: 'quote_id required for cross-chain payments',
          hint: 'Call POST /api/v1/builds/preflight first to obtain a validated quote.',
        });
      }

      const { valid, reason } = validateQuote(quote_id, {
        platform: effectivePlatform,
        build_type,
        payment_method,
      });
      if (!valid) {
        return res.status(400).json({ error: `Quote invalid: ${reason}` });
      }
    }

    const cost_thron = calculateCost(effectivePlatform, build_type);

    // ─── Payment verification ────────────────────────────────────────
    let paymentResult;
    let paymentStatus = 'paid';
    let successMessage = 'Build job submitted successfully';

    if (isInternalWaived) {
      console.info(`Internal free build waived for wallet ${shortWallet(wallet_address)}`);
      paymentResult = { success: true, txId: null, method: 'internal_waived' };
      paymentStatus = 'internal_waived';
      successMessage = 'Internal test build submitted successfully';
    } else if (payment_method === 'thronos' || payment_method === 'thr') {
      if (!validateThrAddress(wallet_address)) {
        return res.status(400).json({
          error: 'Invalid THR wallet address',
          hint: 'THR address format: THR + 40 hex characters',
        });
      }

      if (tx_id) {
        paymentResult = await verifyPayment(wallet_address, cost_thron, tx_id);
        if (!paymentResult.success) {
          return res.status(402).json({ error: 'Payment transaction verification failed', detail: paymentResult.error, tx_id });
        }
      } else if (auth_secret) {
        paymentResult = await requestBuildPayment(wallet_address, cost_thron, auth_secret, passphrase);
        if (!paymentResult.success) {
          return res.status(402).json({ error: 'Payment failed', detail: paymentResult.error, required_amount: cost_thron, treasury_address: TREASURY_ADDRESS });
        }
      } else {
        paymentResult = await verifyPayment(wallet_address, cost_thron);
        if (!paymentResult.success) {
          return res.status(402).json({ error: 'Insufficient THR balance', detail: paymentResult.error, required_amount: cost_thron, treasury_address: TREASURY_ADDRESS });
        }
      }
    } else {
      // Cross-chain: require tx_id (payment already sent by client)
      if (!tx_id) {
        return res.status(402).json({
          error: 'Transaction hash required for cross-chain payment',
          hint: 'Complete the payment transaction and provide tx_id',
        });
      }
      paymentResult = { success: true, txId: tx_id, method: 'cross_chain' };
    }

    // ─── Create build job ────────────────────────────────────────────
    const [user] = await User.findOrCreate({
      where: { wallet_address },
      defaults: { id: uuidv4(), wallet_address },
    });

    const job = await BuildJob.create({
      user_id: user.id,
      project_name,
      source_type,
      source_url,
      upload_id,
      upload_token,
      project_type,
      branch,
      project_path,
      build_type,
      platform: effectivePlatform,
      cost_thron,
      payment_status: paymentStatus,
      status: 'pending',
    });

    if (!isInternalWaived) {
      await recordBuildPayment(job.id, wallet_address, cost_thron, paymentResult.txId);
    }

    await addBuildJob(job.id, {
      jobId: job.id,
      sourceUrl: source_url,
      sourceType: source_type,
      uploadId: upload_id,
      uploadToken: upload_token,
      projectType: project_type,
      branch,
      projectPath: project_path,
      platform: effectivePlatform,
      buildType: build_type,
      signingConfig: signing_config,
    });

    const responseBody = {
      success: true,
      job_id: job.id,
      status: 'pending',
      payment_status: paymentStatus,
      platform: effectivePlatform,
      cost_thron,
      payment_tx: paymentResult.txId || null,
      message: successMessage,
      websocket_url: `/ws/builds/${job.id}`,
    };
    if (iosNote) responseBody.ios_note = iosNote;

    res.status(201).json(responseBody);
  } catch (error) {
    console.error('Build submission error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ─── Get build status ─────────────────────────────────────────────────
router.get('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await BuildJob.findByPk(jobId, {
      include: [{ model: User, attributes: ['wallet_address'] }],
    });
    if (!job) return res.status(404).json({ error: 'Build job not found' });

    res.json({
      job_id: job.id,
      project_name: job.project_name,
      source_url: job.source_url,
      branch: job.branch,
      status: job.status,
      progress: job.progress,
      platform: job.platform,
      build_type: job.build_type,
      project_path: job.project_path,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      android_artifact_url: job.android_artifact_url,
      ios_artifact_url: job.ios_artifact_url,
      android_fallback_artifact_url: deriveFallbackArtifactUrl(job.android_artifact_url),
      ios_fallback_artifact_url: deriveFallbackArtifactUrl(job.ios_artifact_url),
      cost_thron: job.cost_thron,
      payment_status: job.payment_status,
    });
  } catch (error) {
    console.error('Get build status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get build logs ───────────────────────────────────────────────────
router.get('/:jobId/logs', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    const { BuildLog } = require('../models');
    const logs = await BuildLog.findAll({
      where: { job_id: jobId },
      order: [['timestamp', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    res.json({
      job_id: jobId,
      logs: logs.map(log => ({ timestamp: log.timestamp, line: log.log_line, type: log.log_type })),
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Paid retry (no additional charge) ───────────────────────────────
router.post('/:jobId/retry-paid', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { wallet_address, source_url, branch, project_path, build_type } = req.body || {};

    if (!wallet_address) return res.status(400).json({ error: 'wallet_address required' });

    const job = await BuildJob.findByPk(jobId, {
      include: [{ model: User, attributes: ['wallet_address'] }],
    });
    if (!job) return res.status(404).json({ error: 'Build job not found' });

    if (normalizeWalletAddress(job.User?.wallet_address) !== normalizeWalletAddress(wallet_address)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!['failed', 'cancelled'].includes(job.status)) {
      return res.status(400).json({ error: 'Job must be failed or cancelled to retry' });
    }
    if (!['paid', 'internal_waived'].includes(job.payment_status)) {
      return res.status(400).json({ error: 'Job is not eligible for paid retry' });
    }

    const nextBuildType  = build_type || job.build_type;
    const nextCost       = Number(calculateCost(job.platform, nextBuildType));
    const originalCost   = Number(job.cost_thron);
    if (nextCost > originalCost) {
      return res.status(402).json({ error: 'Additional payment required', price_difference: nextCost - originalCost });
    }

    const updatePayload = {
      source_url:   source_url   || job.source_url,
      branch:       branch       || job.branch,
      project_path: typeof project_path === 'string' ? project_path : job.project_path,
      build_type:   nextBuildType,
      status: 'pending', progress: 0,
      started_at: null, completed_at: null,
      android_artifact_url: null, ios_artifact_url: null,
    };
    if (Object.prototype.hasOwnProperty.call(job.dataValues, 'failure_reason')) {
      updatePayload.failure_reason = null;
    }
    await job.update(updatePayload);

    await addBuildJob(job.id, {
      jobId: job.id,
      sourceUrl: job.source_url,
      sourceType: job.source_type,
      branch: job.branch,
      projectPath: job.project_path,
      platform: job.platform,
      buildType: job.build_type,
      signingConfig: {},
    });

    return res.json({
      success: true, job_id: job.id, status: 'pending',
      payment_status: job.payment_status, reused_payment: true,
      message: 'Paid retry submitted without additional charge',
    });
  } catch (error) {
    console.error('Retry paid error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Cancel (protected) ───────────────────────────────────────────────
router.post('/:jobId/cancel', requireApiKey, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await BuildJob.findByPk(jobId);
    if (!job) return res.status(404).json({ error: 'Build job not found' });
    if (job.status === 'completed' || job.status === 'failed') {
      return res.status(400).json({ error: 'Cannot cancel completed job' });
    }
    await job.update({ status: 'cancelled' });
    res.json({ success: true, job_id: job.id, status: 'cancelled' });
  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Retry stuck/failed (protected) ──────────────────────────────────
router.post('/:jobId/retry', requireApiKey, async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await retryBuild(jobId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Retry build error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Queue/Redis status (debug, protected) ───────────────────────────
router.get('/system/status', requireApiKey, async (req, res) => {
  const redis = getRedisStatus();
  res.json({ redis, queue_mode: redis.connected ? 'redis' : 'inline' });
});

// ─── Download artifact ────────────────────────────────────────────────
router.get('/:jobId/download/:platform', async (req, res) => {
  try {
    const { jobId, platform } = req.params;
    const job = await BuildJob.findByPk(jobId);
    if (!job) return res.status(404).json({ error: 'Build job not found' });

    const artifactUrl = platform === 'android' ? job.android_artifact_url : job.ios_artifact_url;
    if (!artifactUrl) return res.status(404).json({ error: 'Artifact not found' });

    const fallbackArtifactUrl = deriveFallbackArtifactUrl(artifactUrl);
    const useFallback = req.query.fallback === '1' || req.query.fallback === 'true';
    res.redirect(useFallback && fallbackArtifactUrl ? fallbackArtifactUrl : artifactUrl);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Serve local artifacts ────────────────────────────────────────────
router.get('/artifacts/*', (req, res) => {
  const localStoragePath = process.env.LOCAL_STORAGE_PATH;
  if (!localStoragePath) return res.status(404).json({ error: 'Local storage not configured' });

  const key = req.params[0];
  if (!key) return res.status(400).json({ error: 'Artifact key required' });

  const rootPath = path.resolve(localStoragePath);
  const filePath = path.resolve(rootPath, key);
  if (!filePath.startsWith(`${rootPath}${path.sep}`) && filePath !== rootPath) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const filename  = path.basename(filePath);
  const extension = path.extname(filename).toLowerCase();
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (extension === '.apk') res.setHeader('Content-Type', 'application/vnd.android.package-archive');

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => { if (!res.headersSent) res.status(404).json({ error: 'Artifact not found' }); });
  stream.pipe(res);
});

module.exports = router;
