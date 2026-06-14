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

  // ─── Internal helpers ───────────────────────────────────────────────────

  function _sessionWallet() {
    if (window.walletSession && typeof window.walletSession.getAddress === 'function') {
      const addr = window.walletSession.getAddress();
      if (addr && THR_ADDR_RE.test(addr)) return { addr };
    }
    if (window.walletSession && typeof window.walletSession.getActiveAddress === 'function') {
      const addr = window.walletSession.getActiveAddress();
      if (addr && THR_ADDR_RE.test(addr)) return { addr };
    }
    return null;
  }

  async function _deriveAddress(hexKey) {
    try {
      const clean = hexKey.replace(/^0x/, '');
      if (clean.length !== 64) throw new Error('invalid_key_length');
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

  // ─── AES-GCM / PBKDF2 decrypt — matches wallet_session.js aesKeyFromPin exactly ───

  function _hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    return bytes;
  }

  function _bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function _aesKeyFromPin(pin, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt', 'decrypt']
    );
  }

  async function _decryptPrivateKey(encryptedBlob, pin) {
    const p = typeof encryptedBlob === 'string' ? JSON.parse(encryptedBlob) : encryptedBlob;
    if (!p.salt || !p.iv || !p.ct) throw new Error('invalid_encrypted_blob');
    const key = await _aesKeyFromPin(pin, _hexToBytes(p.salt));
    const clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: _hexToBytes(p.iv) },
      key,
      _hexToBytes(p.ct)
    );
    return _bytesToHex(new Uint8Array(clear));
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  const ThronosBuilderWallet = {

    autoConnect() {
      const sess = _sessionWallet();
      if (!sess) return { ok: false, reason: 'no_session' };
      _state = { address: sess.addr, method: 'session', secret: null, privateKey: null };
      return { ok: true, address: sess.addr };
    },

    connectWithSecret(address, secret) {
      if (!THR_ADDR_RE.test(address)) return { ok: false, reason: 'invalid_address' };
      if (!secret || secret.length < 8) return { ok: false, reason: 'invalid_secret' };
      _state = { address, secret, privateKey: null, method: 'secret' };
      return { ok: true, address };
    },

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

    /**
     * Connect using a Thronos wallet recovery JSON file + PIN.
     *
     * Supports the official recovery kit format from walletV1GenerateRecoveryKit():
     *   { version: 'wallet-v1-recovery-kit', canonical_v1_address, encrypted_private_key_backup, ... }
     *
     * Also supports legacy formats:
     *   { wallet_v1_encrypted_priv: ... }
     *   { wallet_v1_encrypted_private_key: ... }
     *   Raw blob: { v:1, salt, iv, ct }
     */
    async connectWithRecoveryJson(jsonData, pin) {
      try {
        if (!pin || pin.length < 1) return { ok: false, reason: 'pin_required' };

        let parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

        // Detect recovery kit format — check all known key names
        let encryptedBlob = null;
        let kitAddress = null;

        if (parsed.encrypted_private_key_backup) {
          // Official format from walletV1GenerateRecoveryKit():
          // { version, canonical_v1_address, encrypted_private_key_backup, ... }
          encryptedBlob = parsed.encrypted_private_key_backup;
          kitAddress = parsed.canonical_v1_address || null;
        } else if (parsed.wallet_v1_encrypted_priv) {
          // Legacy localStorage export
          encryptedBlob = parsed.wallet_v1_encrypted_priv;
          kitAddress = parsed.wallet_v1_address || parsed.wallet_v1_canonical_address || null;
        } else if (parsed.wallet_v1_encrypted_private_key) {
          // Normalized key variant
          encryptedBlob = parsed.wallet_v1_encrypted_private_key;
          kitAddress = parsed.wallet_v1_canonical_address || parsed.wallet_v1_address || null;
        } else if (parsed.v === 1 && parsed.salt && parsed.iv && parsed.ct) {
          // Raw encrypted blob
          encryptedBlob = parsed;
        } else {
          return { ok: false, reason: 'unrecognized_recovery_format' };
        }

        // Wrap decrypt in own try-catch — any DOMException (wrong PIN) is caught here.
        // Chrome's AES-GCM failure throws DOMException with e.name='OperationError'
        // but e.message='' (empty), so we can't rely on message content.
        let privHex;
        try {
          privHex = await _decryptPrivateKey(encryptedBlob, pin);
        } catch (_) {
          return { ok: false, reason: 'wrong_pin' };
        }
        if (!privHex || privHex.length !== 64) return { ok: false, reason: 'wrong_pin' };

        // Same philosophy as main repo (walletV1RestoreFromRecoveryKit in base.html):
        // trust canonical_v1_address from the kit — no external API call needed.
        if (kitAddress && THR_ADDR_RE.test(kitAddress)) {
          const clean = privHex.replace(/^0x/, '');
          _state = { address: kitAddress, privateKey: clean, secret: null, method: 'key' };
          return { ok: true, address: kitAddress };
        }

        // Fallback: no address in kit, derive it from the key
        return await this.connectWithPrivateKey(privHex);
      } catch (e) {
        const name = (e.name || '').toLowerCase();
        const msg = (e.message || '').toLowerCase();
        if (name === 'operationerror' || msg.includes('decrypt') || msg.includes('operation')) {
          return { ok: false, reason: 'wrong_pin' };
        }
        return { ok: false, reason: e.message || 'recovery_failed' };
      }
    },

    getAddress() {
      if (_state.method === 'session') {
        const sess = _sessionWallet();
        return sess ? sess.addr : null;
      }
      return _state.address;
    },

    isConnected() {
      return !!this.getAddress();
    },

    async pay({ to, amount, speed = 'fast' }) {
      const address = this.getAddress();
      if (!address) return { ok: false, error: 'not_connected' };

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

      if (_state.method === 'secret' && _state.secret) {
        return { ok: true, auth_secret: _state.secret, method: 'secret' };
      }

      return { ok: false, error: 'no_payment_method' };
    },

    disconnect() {
      _state = { address: null, secret: null, privateKey: null, method: null };
    },

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
