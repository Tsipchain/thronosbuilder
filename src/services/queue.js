const Queue = require('bull');
const { BuildJob } = require('../models');
const { broadcastToJob } = require('../utils/websocket');
const { buildAndroid } = require('./androidBuilder');
const { buildIOS } = require('./iosBuilder');

// Track Redis connectivity
let redisConnected = false;
let redisError = null;
let buildQueue = null;

// ─── Build processor logic (shared by queue and inline) ─────────────
async function processBuild({ jobId, platform, sourceUrl, sourceType, branch, buildType, signingConfig }) {
  try {
    console.log(`🚀 Processing build job ${jobId} for platform: ${platform}`);

    await BuildJob.update(
      { status: 'building', started_at: new Date() },
      { where: { id: jobId } }
    );

    broadcastToJob(jobId, {
      event: 'build.status',
      data: { job_id: jobId, status: 'building', progress: 0 }
    });

    let result = { success: false };

    // Execute build based on platform
    if (platform === 'android' || platform === 'both') {
      result = await buildAndroid({
        jobId,
        sourceUrl,
        sourceType,
        branch,
        buildType: buildType === 'both' ? 'apk' : buildType,
        signingConfig,
        onProgress: (progress, message) => {
          broadcastToJob(jobId, {
            event: 'build.progress',
            data: { job_id: jobId, progress, message }
          });
        },
        onLog: (logLine, logType = 'info') => {
          broadcastToJob(jobId, {
            event: 'build.log',
            data: { job_id: jobId, line: logLine, type: logType }
          });
        }
      });
    }

    if ((platform === 'ios' || platform === 'both') && result.success !== false) {
      result = await buildIOS({
        jobId,
        sourceUrl,
        sourceType,
        branch,
        buildType: buildType === 'both' ? 'ipa' : buildType,
        signingConfig,
        onProgress: (progress, message) => {
          broadcastToJob(jobId, {
            event: 'build.progress',
            data: { job_id: jobId, progress, message }
          });
        },
        onLog: (logLine, logType = 'info') => {
          broadcastToJob(jobId, {
            event: 'build.log',
            data: { job_id: jobId, line: logLine, type: logType }
          });
        }
      });
    }

    if (result.success) {
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
        event: 'build.complete',
        data: {
          job_id: jobId,
          status: 'success',
          android_url: result.androidUrl,
          ios_url: result.iosUrl
        }
      });

      return result;
    } else {
      throw new Error(result.error || 'Build failed');
    }

  } catch (error) {
    console.error(`❌ Build job ${jobId} failed:`, error.message);

    await BuildJob.update(
      { status: 'failed', completed_at: new Date() },
      { where: { id: jobId } }
    ).catch(() => {});

    broadcastToJob(jobId, {
      event: 'build.error',
      data: { job_id: jobId, error: error.message }
    });

    throw error;
  }
}

// ─── Initialize Redis queue (if available) ──────────────────────────
try {
  if (process.env.REDIS_URL) {
    buildQueue = new Queue('build jobs', process.env.REDIS_URL);

    buildQueue.on('ready', () => {
      redisConnected = true;
      console.log('✅ Redis queue connected');
    });

    buildQueue.on('error', (err) => {
      console.error('❌ Redis queue error:', err.message);
      redisError = err.message;
      redisConnected = false;
    });

    // Register queue processor
    buildQueue.process(async (job, done) => {
      try {
        const result = await processBuild(job.data);
        done(null, result);
      } catch (error) {
        done(error);
      }
    });
  } else {
    console.log('⚠️  No REDIS_URL configured — builds will run inline (no queue)');
  }
} catch (err) {
  console.error('⚠️  Failed to initialize Redis queue:', err.message);
  console.log('⚠️  Falling back to inline build processing');
  buildQueue = null;
}

// ─── Add job to queue (or process inline) ───────────────────────────
async function addBuildJob(jobId, data) {
  // Try Redis queue first
  if (buildQueue && redisConnected) {
    try {
      await buildQueue.add(data, {
        jobId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: 10,
        removeOnFail: 5
      });
      console.log(`✅ Build job ${jobId} added to Redis queue`);
      return;
    } catch (err) {
      console.error(`⚠️  Failed to add job to Redis queue: ${err.message}`);
      console.log(`⚠️  Falling back to inline processing for job ${jobId}`);
    }
  }

  // Fallback: process inline (async — don't block the response)
  console.log(`🔧 Processing build job ${jobId} inline (no Redis)`);
  processBuild(data).catch(err => {
    console.error(`❌ Inline build job ${jobId} failed:`, err.message);
  });
}

// Get queue status
async function getQueueStatus() {
  if (buildQueue && redisConnected) {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        buildQueue.getWaitingCount(),
        buildQueue.getActiveCount(),
        buildQueue.getCompletedCount(),
        buildQueue.getFailedCount()
      ]);
      return { waiting, active, completed, failed, mode: 'redis' };
    } catch {
      return { waiting: 0, active: 0, completed: 0, failed: 0, mode: 'redis_error' };
    }
  }
  return { waiting: 0, active: 0, completed: 0, failed: 0, mode: 'inline' };
}

// Retry a stuck build by processing it inline
async function retryBuild(jobId) {
  const job = await BuildJob.findByPk(jobId);
  if (!job) return { success: false, error: 'Job not found' };
  if (job.status === 'success') return { success: false, error: 'Job already completed' };

  // Reset to pending and process inline
  await BuildJob.update(
    { status: 'pending', progress: 0, started_at: null, completed_at: null },
    { where: { id: jobId } }
  );

  console.log(`🔄 Retrying build job ${jobId} inline`);
  processBuild({
    jobId,
    platform: job.platform,
    sourceUrl: job.source_url,
    sourceType: job.source_type,
    branch: job.branch || 'main',
    buildType: job.build_type,
    signingConfig: {},
  }).catch(err => {
    console.error(`❌ Retry build ${jobId} failed:`, err.message);
  });

  return { success: true, message: 'Build retry started' };
}

module.exports = {
  buildQueue,
  addBuildJob,
  getQueueStatus,
  retryBuild,
  getRedisStatus: () => ({ connected: redisConnected, error: redisError }),
};
