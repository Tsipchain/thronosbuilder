/**
 * ThronosBuilderWallet Bridge
 *
 * Bridges the builder frontend with the Thronos wallet system from
 * thronos-v3.6. Two connection paths:
 *
 *   A) Auto: window.walletSession already exists (wallet_session.js loaded)
 *      → uses ThronosWallet.send() for client-side payment, returns tx_id
 *
 *   B) Manual: user imports signing key (private key hex) or address+secret
 *      → stores in-memory only, uses /api/v1/builds backend payment path
 *
 * Exposes window.ThronosBuilderWallet
 */
(function (window) {
  'use strict';

  const THRONOS_API_WRITE = 'https://api.thronoschain.org';
  const THR_ADDR_RE = /^THR[0-9a-fA-F]{40}$/;

  // In-memory only — never persisted to localStorage
  let _state = {
    address: null,
    secret: null,        // send secret (manual path)
    privateKey: null,    // hex private key (import path)
    method: null,        // 'session' | 'secret' | 'key'
  };

  // ─── Internal helpers ───────────────────────────────────────────────

  function _sessionWallet() {
    // Checks if the v3.6 wallet_session.js and wallet_sdk.js are loaded
    if (window.walletSession && typeof window.walletSession.getAddress === 'function') {
      const addr = window.walletSession.getAddress();
      if (addr && THR_ADDR_RE.test(addr)) return { addr };
    }
    // Also check getActiveAddress (some versions)
    if (window.walletSession && typeof window.walletSession.getActiveAddress === 'function') {
      const addr = window.walletSession.getActiveAddress();
      if (addr && THR_ADDR_RE.test(addr)) return { addr };
    }
    return null;
  }

  // Derive THR address from hex private key using secp256k1 + keccak256
  // We use the same derivation as the Thronos chain: THR + keccak256(pubkey)[12:]
  async function _deriveAddress(hexKey) {
    try {
      const clean = hexKey.replace(/^0x/, '');
      if (clean.length !== 64) throw new Error('invalid_key_length');
      // Use SubtleCrypto to import the key and derive a public key
      // Thronos uses secp256k1 which SubtleCrypto doesn't support natively.
      // We use a lightweight approach: call the node's /api/wallet/derive endpoint.
      const resp = await fetch(`${THRONOS_API_WRITE}/api/wallet/derive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ private_key: clean }),
      });
      if (!resp.ok) throw new Error('derive_failed');
      const data = await resp.json();
      if (!data.address || !THR_ADDR_RE.test(data.address)) throw new Error('invalid_derived_address');
      return data.address;
    } catch (e) {
      throw new Error('key_derive_failed: ' + e.message);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────

  const ThronosBuilderWallet = {

    /**
     * Try to auto-connect from existing walletSession.
     * Returns { ok, address } or { ok: false, reason }
     */
    autoConnect() {
      const sess = _sessionWallet();
      if (!sess) return { ok: false, reason: 'no_session' };
      _state = { address: sess.addr, method: 'session', secret: null, privateKey: null };
      return { ok: true, address: sess.addr };
    },

    /**
     * Connect with address + send secret (manual path, legacy).
     */
    connectWithSecret(address, secret) {
      if (!THR_ADDR_RE.test(address)) return { ok: false, reason: 'invalid_address' };
      if (!secret || secret.length < 8) return { ok: false, reason: 'invalid_secret' };
      _state = { address, secret, privateKey: null, method: 'secret' };
      return { ok: true, address };
    },

    /**
     * Connect by importing a hex private key.
     * Derives the THR address from the key via the Thronos node.
     * Returns Promise<{ ok, address }> or Promise<{ ok: false, reason }>
     */
    async connectWithPrivateKey(hexKey) {
      try {
        const address = await _deriveAddress(hexKey);
        const clean = hexKey.replace(/^0x/, '');
        _state = { address, privateKey: clean, secret: null, method: 'key' };
        return { ok: true, address };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    },

    /** Returns connected address or null */
    getAddress() {
      if (_state.method === 'session') {
        // Re-check live session in case wallet was locked
        const sess = _sessionWallet();
        return sess ? sess.addr : null;
      }
      return _state.address;
    },

    /** Returns true if wallet is connected and usable */
    isConnected() {
      return !!this.getAddress();
    },

    /**
     * Pay build fee in THR. Returns { ok, tx_id } or { ok: false, error }.
     *
     * - 'session' method: uses window.ThronosWallet.send() (client-side)
     * - 'secret'  method: returns auth_secret for backend to use
     * - 'key'     method: posts to /api/wallet/send with the key (client-side)
     */
    async pay({ to, amount, speed = 'fast' }) {
      const address = this.getAddress();
      if (!address) return { ok: false, error: 'not_connected' };

      // ── A: walletSession is loaded → client-side send via ThronosWallet SDK ──
      if (_state.method === 'session' && window.ThronosWallet) {
        try {
          const result = await window.ThronosWallet.send({ token: 'THR', to, amount, speed });
          const txId = result?.tx?.id || result?.tx_id || result?.txId || null;
          if (!txId) return { ok: false, error: 'no_tx_id_returned' };
          return { ok: true, tx_id: txId, method: 'session' };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }

      // ── B: private key → client-side send via node API ──
      if (_state.method === 'key' && _state.privateKey) {
        try {
          const resp = await fetch(`${THRONOS_API_WRITE}/api/wallet/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: 'THR',
              from: address,
              to,
              amount,
              private_key: _state.privateKey,
              speed,
            }),
          });
          const data = await resp.json();
          if (!resp.ok || data.error) return { ok: false, error: data.error || data.reject_reason || 'send_failed' };
          const txId = data.tx_id || data.txId || data.tx?.id || null;
          return { ok: true, tx_id: txId, method: 'key' };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }

      // ── C: address+secret → return secret for backend-side payment ──
      if (_state.method === 'secret' && _state.secret) {
        return { ok: true, auth_secret: _state.secret, method: 'secret' };
      }

      return { ok: false, error: 'no_payment_method' };
    },

    disconnect() {
      _state = { address: null, secret: null, privateKey: null, method: null };
    },

    /** Return session storage key for legacy compat */
    storeSession(address, secret) {
      try {
        sessionStorage.setItem('thr_auth', btoa(JSON.stringify({ a: address, s: secret, t: Date.now() })));
      } catch (_) {}
    },

    getStoredSession() {
      try {
        const raw = sessionStorage.getItem('thr_auth');
        if (!raw) return null;
        const data = JSON.parse(atob(raw));
        if (Date.now() - data.t > 30 * 60 * 1000) { sessionStorage.removeItem('thr_auth'); return null; }
        return { address: data.a, secret: data.s };
      } catch { return null; }
    },
  };

  window.ThronosBuilderWallet = ThronosBuilderWallet;

})(window);
