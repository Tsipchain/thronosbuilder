const Queue = require('bull');
const { BuildJob } = require('../models');
const { broadcastToJob } = require('../utils/websocket');
const { buildAndroid } = require('./androidBuilder');
const { buildIOS } = require('./iosBuilder');

// Initialize queues
const buildQueue = new Queue('build jobs', process.env.REDIS_URL);

// Process jobs
buildQueue.process(async (job, done) => {
  const { jobId, platform, sourceUrl, sourceType, branch, buildType, signingConfig } = job.data;

  try {
    console.log(`🚀 Processing build job ${jobId} for platform: ${platform}`);

    // Update status
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

      done(null, result);
    } else {
      throw new Error(result.error || 'Build failed');
    }

  } catch (error) {
    console.error(`❌ Build job ${jobId} failed:`, error);

    await BuildJob.update(
      { status: 'failed', completed_at: new Date() },
      { where: { id: jobId } }
    );

    broadcastToJob(jobId, {
      event: 'build.error',
      data: { job_id: jobId, error: error.message }
    });

    done(error);
  }
});

// Add job to queue
async function addBuildJob(jobId, data) {
  await buildQueue.add(data, {
    jobId,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 60000
    },
    removeOnComplete: 10,
    removeOnFail: 5
  });
  console.log(`✅ Build job ${jobId} added to queue`);
}

// Get queue status
async function getQueueStatus() {
  const [waiting, active, completed, failed] = await Promise.all([
    buildQueue.getWaitingCount(),
    buildQueue.getActiveCount(),
    buildQueue.getCompletedCount(),
    buildQueue.getFailedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed
  };
}

module.exports = {
  buildQueue,
  addBuildJob,
  getQueueStatus
};
