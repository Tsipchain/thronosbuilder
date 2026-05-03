'use strict';
const express = require('express');
const router  = express.Router();
const { BuildJob } = require('../models');
const { requireApiKey } = require('../middleware/auth');

// Public: Get pricing (THR native + external floors + metadata)
router.get('/pricing', (req, res) => {
  const { getPricing } = require('../utils/pricing');
  const { getExternalFloorTable } = require('../services/pricingQuote');

  res.json({
    ...getPricing(),
    ios_enabled: process.env.IOS_ENABLED === 'true',
    enabled_payment_methods: ['thr', 'eth', 'bnb', 'usdt_evm', 'usdc_sol', 'btc_bridge'],
    external_floors: getExternalFloorTable(),
    fee_split: {
      treasury_percent: 50,
      burn_percent: 25,
      lp_percent: 25,
      description: 'Cross-chain fee split: 50% treasury, 25% burn, 25% LP pools.',
    },
    note: 'Cross-chain amounts are backend-generated quotes with minimum floors. Use POST /api/v1/builds/preflight to get an exact, validated quote.',
  });
});

// Public: Get system stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await BuildJob.findAll({
      attributes: [
        [BuildJob.sequelize.fn('COUNT', BuildJob.sequelize.col('*')), 'total_builds'],
        [BuildJob.sequelize.fn('SUM', BuildJob.sequelize.col('cost_thron')), 'total_revenue'],
      ],
      raw: true,
    });

    const statusBreakdown = await BuildJob.findAll({
      attributes: ['status', [BuildJob.sequelize.fn('COUNT', '*'), 'count']],
      group: ['status'],
      raw: true,
    });

    res.json({
      total_builds:     parseInt(stats[0].total_builds)    || 0,
      total_revenue:    parseFloat(stats[0].total_revenue) || 0,
      status_breakdown: statusBreakdown.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Protected admin route: Get queue status
router.get('/queue', requireApiKey, async (req, res) => {
  try {
    const { getQueueStatus } = require('../services/queue');
    const status = await getQueueStatus();
    res.json({ queue_status: status, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

module.exports = router;
