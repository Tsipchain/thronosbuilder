require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { setupWebSocket } = require('./utils/websocket');

// SECURITY: Phase 0 — fail-fast on missing critical env vars
const REQUIRED_ENV_VARS = ['GITHUB_TOKEN', 'DATABASE_URL', 'BUILDER_API_KEY'];
const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const { sequelize } = require('./models');
const buildRoutes = require('./routes/builds');
const statusRoutes = require('./routes/status');

const app = express();
const server = createServer(app);

// SECURITY: Phase 0 — restrict CORS to known domains
const corsOptions = {
    origin: [
        'https://thronoschain.org',
        'https://builder.thronoschain.org',
        'https://api.thronoschain.org',
        'https://commerce.thronoschain.org',
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
};

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/v1/builds', buildRoutes);
app.use('/api/v1/status', statusRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// WebSocket setup
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

// Database connection and server start
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');

    await sequelize.sync({ alter: true });
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
