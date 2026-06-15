'use strict';
/**
 * walletConnect.js — in-memory WalletConnect-style relay for ThronosBuilder.
 *
 * Endpoints:
 *   POST /api/wallet/wc/session/create  → Builder creates pairing session
 *   GET  /api/wallet/wc/session/:id     → Builder polls pairing status
 *   POST /api/wallet/wc/pair            → Mobile wallet confirms pairing
 *   POST /api/wallet/wc/request         → Builder submits tx for approval
 *   GET  /api/wallet/wc/result/:id      → Builder polls approval result
 *   POST /api/wallet/wc/approve         → Mobile approves request
 *   POST /api/wallet/wc/reject          → Mobile rejects request
 *   GET  /api/wallet/wc/pending/:addr   → Mobile polls pending requests
 */

const { Router } = require('express');
const { randomUUID } = require('crypto');
const router = Router();

const SESSION_TTL_MS  = 15 * 60 * 1000; // 15 min
const REQUEST_TTL_MS  = 5  * 60 * 1000; // 5 min

// In-memory stores (survive within the process; cleared on restart)
const _pairingSessions = new Map(); // session_id → {status,dapp,created_at,address,paired_at}
const _requests        = new Map(); // request_id → {session_id,action,payload,dapp,ts,status,result}
const _mobileRequests  = new Map(); // address → [request_id, ...]

function _expire() {
  const now = Date.now();
  for (const [id, s] of _pairingSessions) {
    if (now - s.created_at > SESSION_TTL_MS) _pairingSessions.delete(id);
  }
  for (const [id, r] of _requests) {
    if (now - r.ts > REQUEST_TTL_MS) _requests.delete(id);
  }
}
setInterval(_expire, 60_000);

// POST /api/wallet/wc/session/create
router.post('/session/create', (req, res) => {
  const dapp = (req.body.dapp || 'ThronosBuilder').trim();
  const session_id = randomUUID();
  const relay = process.env.APP_URL || req.protocol + '://' + req.get('host');

  _pairingSessions.set(session_id, {
    status: 'pending',
    dapp,
    created_at: Date.now(),
    address: null,
    paired_at: null,
  });

  const uri     = `thrconnect://${session_id}?relay=${encodeURIComponent(relay)}&dapp=${encodeURIComponent(dapp)}`;
  const qr_url  = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(uri)}&size=220x220&color=ffffff&bgcolor=0d0a1a&margin=8`;

  res.json({ ok: true, session_id, uri, qr_url });
});

// GET /api/wallet/wc/session/:session_id
router.get('/session/:session_id', (req, res) => {
  const session = _pairingSessions.get(req.params.session_id);
  if (!session) return res.status(404).json({ ok: false, error: 'session_not_found' });
  res.json({
    ok: true,
    status:     session.status,
    dapp:       session.dapp,
    address:    session.address,
    created_at: session.created_at,
    paired_at:  session.paired_at,
  });
});

// POST /api/wallet/wc/pair  (called by mobile PWA after scanning QR)
router.post('/pair', (req, res) => {
  const session_id = (req.body.session_id || '').trim();
  const address    = (req.body.address    || '').trim().toUpperCase();

  if (!session_id || !address) {
    return res.status(400).json({ ok: false, error: 'session_id and address required' });
  }

  const session = _pairingSessions.get(session_id);
  if (!session) return res.status(404).json({ ok: false, error: 'session_not_found' });

  session.status    = 'connected';
  session.address   = address;
  session.paired_at = Date.now();

  res.json({ ok: true, status: 'connected', dapp: session.dapp });
});

// POST /api/wallet/wc/request  (Builder submits a tx for mobile approval)
router.post('/request', (req, res) => {
  const { session_id, action, payload, dapp } = req.body || {};
  if (!session_id || !action) {
    return res.status(400).json({ ok: false, error: 'session_id and action required' });
  }

  const session = _pairingSessions.get(session_id);
  if (!session || session.status !== 'connected' || !session.address) {
    return res.status(400).json({ ok: false, error: 'session_not_connected' });
  }

  const request_id = randomUUID();
  const entry = {
    request_id,
    session_id,
    action,
    payload:  payload || {},
    dapp:     dapp || session.dapp,
    address:  session.address,
    ts:       Date.now(),
    status:   'pending',
    result:   null,
  };
  _requests.set(request_id, entry);

  // Index by address for mobile polling
  if (!_mobileRequests.has(session.address)) _mobileRequests.set(session.address, []);
  _mobileRequests.get(session.address).push(request_id);

  res.json({ ok: true, request_id, status: 'pending' });
});

// GET /api/wallet/wc/result/:request_id  (Builder polls for approval result)
router.get('/result/:request_id', (req, res) => {
  const entry = _requests.get(req.params.request_id);
  if (!entry) return res.status(404).json({ ok: false, error: 'request_not_found' });
  res.json({
    ok:        true,
    status:    entry.status,
    signature: entry.result?.signature || null,
    address:   entry.address,
    ts:        entry.result?.ts || null,
  });
});

// GET /api/wallet/wc/pending/:address  (Mobile polls for pending requests)
router.get('/pending/:address', (req, res) => {
  const addr = req.params.address.toUpperCase();
  const ids  = _mobileRequests.get(addr) || [];
  const pending = ids
    .map(id => _requests.get(id))
    .filter(r => r && r.status === 'pending');
  res.json({ ok: true, requests: pending });
});

// POST /api/wallet/wc/approve  (Mobile approves a request)
router.post('/approve', (req, res) => {
  const { request_id, address, signature } = req.body || {};
  if (!request_id) return res.status(400).json({ ok: false, error: 'request_id required' });

  const entry = _requests.get(request_id);
  if (!entry) return res.status(404).json({ ok: false, error: 'request_not_found' });

  entry.status = 'approved';
  entry.result = { signature: signature || 'mobile_approved', address, ts: Date.now() };
  res.json({ ok: true });
});

// POST /api/wallet/wc/reject  (Mobile rejects a request)
router.post('/reject', (req, res) => {
  const { request_id, address, reason } = req.body || {};
  if (!request_id) return res.status(400).json({ ok: false, error: 'request_id required' });

  const entry = _requests.get(request_id);
  if (!entry) return res.status(404).json({ ok: false, error: 'request_not_found' });

  entry.status = 'rejected';
  entry.result = { reason: reason || 'rejected_by_user', address, ts: Date.now() };
  res.json({ ok: true });
});

module.exports = router;
