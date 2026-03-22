require('dotenv').config();
const Queue = require('bull');
const { sequelize, BuildJob } = require('../models');
const { buildAndroid } = require('../services/androidBuilder');
const { buildIOS } = require('../services/iosBuilder');
const { broadcastToJob } = require('../utils/websocket');
const { addLog } = require('../utils/logger');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY, 10) || 2;

// Connect to the same Bull queue used by the API server
const buildQueue = new Queue('build jobs', REDIS_URL);

console.log(`Build worker starting (concurrency: ${CONCURRENCY})...`);

buildQueue.process(CONCURRENCY, async (job) => {
  const {
    jobId,
    platform,
    sourceUrl,
    sourceType,
    branch,
    buildType,
    signingConfig
  } = job.data;

  console.log(`Processing build job ${jobId} for platform: ${platform}`);

  try {
    // Mark job as building
    await BuildJob.update(
      { status: 'building', started_at: new Date() },
      { where: { id: jobId } }
    );

    broadcastToJob(jobId, {
      event: 'status',
      data: { job_id: jobId, status: 'building', progress: 0 }
    });

    const onProgress = (progress, message) => {
      broadcastToJob(jobId, {
        event: 'progress',
        data: { job_id: jobId, progress, message }
      });
    };

    const onLog = (logLine, logType = 'info') => {
      addLog(jobId, logLine, logType);
      broadcastToJob(jobId, {
        event: 'log',
        data: { job_id: jobId, line: logLine, type: logType }
      });
    };

    let result = { success: false };

    // Execute Android build
    if (platform === 'android' || platform === 'both') {
      result = await buildAndroid({
        jobId,
        sourceUrl,
        sourceType,
        branch,
        buildType: buildType === 'both' ? 'apk' : buildType,
        signingConfig: signingConfig || {},
        onProgress,
        onLog
      });

      if (!result.success) {
        throw new Error(result.error || 'Android build failed');
      }
    }

    // Execute iOS build
    if (platform === 'ios' || platform === 'both') {
      const iosResult = await buildIOS({
        jobId,
        sourceUrl,
        sourceType,
        branch,
        buildType: buildType === 'both' ? 'ipa' : buildType,
        signingConfig: signingConfig || {},
        onProgress,
        onLog
      });

      if (!iosResult.success) {
        throw new Error(iosResult.error || 'iOS build failed');
      }

      // Merge results for 'both' platform builds
      result = {
        success: true,
        androidUrl: result.androidUrl || null,
        iosUrl: iosResult.iosUrl || null
      };
    }

    // Update job as successful
    await BuildJob.update(
      {
        status: 'success',
        completed_at: new Date(),
        progress: 100,
        android_artifact_url: result.androidUrl || null,
        ios_artifact_url: result.iosUrl || null
      },
      { where: { id: jobId } }
    );

    broadcastToJob(jobId, {
      event: 'complete',
      data: {
        job_id: jobId,
        status: 'success',
        android_url: result.androidUrl,
        ios_url: result.iosUrl
      }
    });

    return result;

  } catch (error) {
    console.error(`Build job ${jobId} failed:`, error.message);

    await BuildJob.update(
      { status: 'failed', completed_at: new Date() },
      { where: { id: jobId } }
    );

    broadcastToJob(jobId, {
      event: 'error',
      data: { job_id: jobId, error: error.message }
    });

    throw error;
  }
});

// Queue event listeners
buildQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message);
});

buildQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed successfully`);
});

buildQueue.on('error', (error) => {
  console.error('Queue error:', error);
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down build worker...');
  await buildQueue.close();
  await sequelize.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Verify database connection on startup
sequelize.authenticate()
  .then(() => console.log('Database connected, worker ready for jobs'))
  .catch((err) => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
