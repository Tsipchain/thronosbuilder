const express = require('express');
const router = express.Router();
const { BuildJob } = require('../models');

// Get pricing
router.get('/pricing', (req, res) => {
  const { getPricing } = require('../utils/pricing');
  res.json(getPricing());
});

// Get queue status
router.get('/queue', async (req, res) => {
  try {
    const { getQueueStatus } = require('../services/queue');
    const status = await getQueueStatus();

    res.json({
      queue_status: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

// Get system stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await BuildJob.findAll({
      attributes: [
        [BuildJob.sequelize.fn('COUNT', BuildJob.sequelize.col('*')), 'total_builds'],
        [BuildJob.sequelize.fn('SUM', BuildJob.sequelize.col('cost_thron')), 'total_revenue']
      ],
      raw: true
    });

    const statusBreakdown = await BuildJob.findAll({
      attributes: ['status', [BuildJob.sequelize.fn('COUNT', '*'), 'count']],
      group: ['status'],
      raw: true
    });

    res.json({
      total_builds: parseInt(stats[0].total_builds) || 0,
      total_revenue: parseFloat(stats[0].total_revenue) || 0,
      status_breakdown: statusBreakdown.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
