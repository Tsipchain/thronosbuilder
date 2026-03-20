const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { BuildJob, User } = require('../models');
const { addBuildJob } = require('../services/queue');
const { calculateCost } = require('../utils/pricing');
const { verifyPayment } = require('../services/blockchain');

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
      signing_config = {}
    } = req.body;

    // Validation
    if (!wallet_address || !source_url || !platform || !build_type || !project_name) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['wallet_address', 'source_url', 'platform', 'build_type', 'project_name']
      });
    }

    // Calculate cost
    const cost_thron = calculateCost(platform, build_type);

    // Find or create user
    let [user] = await User.findOrCreate({
      where: { wallet_address },
      defaults: { id: uuidv4(), wallet_address }
    });

    // Verify payment (placeholder - integrate with ThronosChain)
    const paymentVerified = await verifyPayment(wallet_address, cost_thron);
    if (!paymentVerified.success) {
      return res.status(402).json({ 
        error: 'Payment verification failed',
        required_amount: cost_thron,
        message: 'Please pay the required THR amount before submitting build'
      });
    }

    // Create build job
    const job = await BuildJob.create({
      user_id: user.id,
      project_name,
      source_type,
      source_url,
      branch,
      build_type,
      platform,
      cost_thron,
      payment_status: 'paid',
      status: 'pending'
    });

    // Add to queue
    await addBuildJob(job.id, {
      jobId: job.id,
      sourceUrl: source_url,
      sourceType: source_type,
      branch,
      platform,
      buildType: build_type,
      signingConfig: signing_config
    });

    res.status(201).json({
      success: true,
      job_id: job.id,
      status: 'pending',
      cost_thron,
      message: 'Build job submitted successfully',
      websocket_url: `/ws/builds/${job.id}`
    });

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

module.exports = router;
