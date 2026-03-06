const { BuildLog } = require('../models');

async function addLog(jobId, logLine, logType = 'info') {
  try {
    await BuildLog.create({
      job_id: jobId,
      log_line: logLine,
      log_type: logType
    });
  } catch (error) {
    console.error('Failed to save log:', error);
  }
}

function createLogger(jobId, onLog) {
  return {
      info: (message) => {
      addLog(jobId, message, 'info');
      onLog(message, 'info');
    },
    warn: (message) => {
      addLog(jobId, message, 'warning');
      onLog(message, 'warning');
    },
    error: (message) => {
      addLog(jobId, message, 'error');
      onLog(message, 'error');
    },
    success: (message) => {
      addLog(jobId, message, 'success');
      onLog(message, 'success');
    }
  };
}

module.exports = { addLog, createLogger };
