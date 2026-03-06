const { WebSocket } = require('ws');

const clients = new Map(); // jobId -> Set<WebSocket>

function setupWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    const jobId = extractJobIdFromUrl(req.url);

    if (!jobId) {
      ws.close(1008, 'Invalid job ID');
      return;
    }

    // Add client to job
    if (!clients.has(jobId)) {
      clients.set(jobId, new Set());
    }
    clients.get(jobId).add(ws);

    console.log(`🔌 WebSocket connected for job: ${jobId}`);

    ws.on('close', () => {
      const jobClients = clients.get(jobId);
      if (jobClients) {
        jobClients.delete(ws);
        if (jobClients.size === 0) {
          clients.delete(jobId);
        }
      }
      console.log(`🔌 WebSocket disconnected for job: ${jobId}`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Send initial connection message
    ws.send(JSON.stringify({
      event: 'connected',
      data: { job_id: jobId, message: 'Connected to build logs' }
    }));
  });
}

function broadcastToJob(jobId, message) {
  const jobClients = clients.get(jobId);
  if (!jobClients) return;

  const messageStr = JSON.stringify(message);

  jobClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  });
}

function extractJobIdFromUrl(url) {
  const match = url?.match(/\/ws\/builds\/([a-f0-9-]+)/);
  return match ? match[1] : null;
}

module.exports = { setupWebSocket, broadcastToJob };
