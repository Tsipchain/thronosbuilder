require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { setupWebSocket } = require('./utils/websocket');
const { sequelize } = require('./models');
const buildRoutes = require('./routes/builds');
const statusRoutes = require('./routes/status');

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/v1/builds', buildRoutes);
app.use('/api/v1/status', statusRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// WebSocket setup
const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss);

// Database connection and server start
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');

    await sequelize.sync();
    console.log('✅ Database models synchronized');

    server.listen(PORT, () => {
      console.log(`🚀 ThronosBuild API running on port ${PORT}`);
      console.log(`📡 WebSocket server ready at ws://localhost:${PORT}/ws`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app, server };
