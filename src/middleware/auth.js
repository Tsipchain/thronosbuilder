// SECURITY: API key auth added — Phase 0 hardening
const API_KEY = process.env.BUILDER_API_KEY;

if (!API_KEY) {
    console.error('FATAL: BUILDER_API_KEY environment variable is required');
    process.exit(1);
}

function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (!key || key !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: valid API key required' });
    }
    next();
}

module.exports = { requireApiKey };
