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
const { cleanupOldArtifacts } = require('./services/storage');

const app = express();
const server = createServer(app);

// SECURITY: CORS allowlist (production defaults + optional env extension)
const DEFAULT_CORS_ORIGINS = [
  'https://builder.thronoschain.org',
  'https://thronosbuilder-production.up.railway.app',
  'https://thronoschain.org',
  'https://api.thronoschain.org',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
];

const envCorsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const corsAllowlist = Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...envCorsOrigins]));
const corsAllowlistSet = new Set(corsAllowlist);

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser requests (no Origin header)
    if (!origin) {
      return callback(null, true);
    }
    if (corsAllowlistSet.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: false,
  optionsSuccessStatus: 204,
};

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
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

// Public config flags for frontend/service checks
app.get('/api/v1/public/config', (req, res) => {
  res.json({
    status: 'ok',
    internal_free_builds_enabled: process.env.BUILDER_ALLOW_INTERNAL_FREE_BUILDS === 'true',
    pricing_public: true,
    build_submit_public: true
  });
});

// WebSocket setup
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

// Database connection and server start
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log(`🌐 Allowed CORS origins: ${corsAllowlist.join(', ')}`);

    await sequelize.authenticate();
    console.log('✅ Database connected successfully');

    await sequelize.sync({ alter: true });
    console.log('✅ Database models synchronized');

    await cleanupOldArtifacts();
    setInterval(() => {
      cleanupOldArtifacts().catch((error) => {
        console.warn('Scheduled artifact cleanup failed:', error.message);
      });
    }, 6 * 60 * 60 * 1000);

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
