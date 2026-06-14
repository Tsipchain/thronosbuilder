/* ─── ThronosBuild Dashboard — Multi-Wallet + Cross-Chain ───────────── */

const API = '/api/v1';
const GATEWAY_URL = window.GATEWAY_URL || '/api/gateway';

// ─── State ────────────────────────────────────────────────────────────
let wallet = { address: null, type: null, chain: null, provider: null };
let pricingData  = null;
let publicConfig = null;
let currentWs   = null;
let currentQuote = null; // backend-generated quote for the current modal selection

const FALLBACK_PRICING = {
  android: { apk: 10, aab: 10 },
  ios: { ipa: 50 },
  bundle_discount: 5,
};

function normalizeBuildType(rawBuildType) {
  const value = String(rawBuildType || '').trim().toLowerCase();
  if (!value) return 'apk';
  if (value.includes('aab')) return 'aab';
  return 'apk';
}

function getSafePricing(rawPricing) {
  const pricing = rawPricing && typeof rawPricing === 'object' ? rawPricing : {};
  const android = pricing.android && typeof pricing.android === 'object' ? pricing.android : {};
  const ios     = pricing.ios     && typeof pricing.ios     === 'object' ? pricing.ios     : {};
  return {
    android: {
      apk: Number.isFinite(Number(android.apk)) ? Number(android.apk) : FALLBACK_PRICING.android.apk,
      aab: Number.isFinite(Number(android.aab)) ? Number(android.aab) : FALLBACK_PRICING.android.aab,
    },
    ios: { ipa: Number.isFinite(Number(ios.ipa)) ? Number(ios.ipa) : FALLBACK_PRICING.ios.ipa },
    bundle_discount: Number.isFinite(Number(pricing.bundle_discount))
      ? Number(pricing.bundle_discount) : FALLBACK_PRICING.bundle_discount,
  };
}

// Chain configs
const CHAINS = {
  thronos:  { name: 'ThronosChain', symbol: 'THR',  color: 'var(--accent)' },
  ethereum: { name: 'Ethereum',     symbol: 'ETH',  chainId: '0x1',    color: '#627eea' },
  arbitrum: { name: 'Arbitrum',     symbol: 'ETH',  chainId: '0xa4b1', color: '#28a0f0' },
  bsc:      { name: 'BNB Chain',    symbol: 'BNB',  chainId: '0x38',   color: '#F3BA2F' },
  base:     { name: 'Base',         symbol: 'ETH',  chainId: '0x2105', color: '#0052FF' },
  solana:   { name: 'Solana',       symbol: 'USDC', color: '#9945FF'  },
};

const TREASURY = {
  ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e',
  arbitrum: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e',
  bsc:      '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e',
  base:     '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e',
  solana:   'THRtreas1111111111111111111111111111111111',
};

const USDC_CONTRACTS = {
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  solana:   'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

const USDT_CONTRACTS = {
  ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  bsc:      '0x55d398326f99059fF775485246999027B3197955',
};

const ERC20_TRANSFER_ABI = '0xa9059cbb';

// ─── Page Navigation ──────────────────────────────────────────────────
document.querySelectorAll('.navbar-links a').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); showPage(link.dataset.page); });
});

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.navbar-links a').forEach(a => a.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) { el.classList.add('active'); el.style.display = 'block'; }
  const link = document.querySelector(`[data-page="${page}"]`);
  if (link) link.classList.add('active');
  document.querySelectorAll('.page').forEach(p => { if (p.id !== 'page-' + page) p.style.display = 'none'; });
  if (page === 'dashboard') loadDashboard();
  if (page === 'pricing')   loadPricing();
}

document.querySelectorAll('.page').forEach(p => { if (!p.classList.contains('active')) p.style.display = 'none'; });

async function loadPublicConfig() {
  try {
    const res = await fetch(`${API}/public/config`);
    if (!res.ok) return;
    publicConfig = await res.json();
  } catch (_) {}
}
loadPublicConfig();

// ─── Wallet Connect Modal ──────────────────────────────────────────────
document.getElementById('connectWallet').addEventListener('click', () => {
  if (wallet.address) { disconnectWallet(); return; }
  document.getElementById('walletModal').classList.add('active');
});

function closeWalletModal() { document.getElementById('walletModal').classList.remove('active'); }

function disconnectWallet() {
  wallet = { address: null, type: null, chain: null, provider: null };
  sessionStorage.removeItem('thr_auth');
  if (window.ThronosBuilderWallet) window.ThronosBuilderWallet.disconnect();
  const btn = document.getElementById('connectWallet');
  btn.textContent = 'Connect Wallet';
  btn.classList.remove('connected');
  document.getElementById('chainBadge').style.display = 'none';
  toast('Wallet disconnected');
}

function setWalletConnected(address, type, chain) {
  wallet.address = address; wallet.type = type; wallet.chain = chain;
  const short = address.slice(0, 6) + '...' + address.slice(-4);
  const btn = document.getElementById('connectWallet');
  btn.textContent = short;
  btn.classList.add('connected');
  const badge = document.getElementById('chainBadge');
  badge.textContent = CHAINS[chain]?.name || chain;
  badge.className = 'chain-badge ' + chain;
  badge.style.display = 'inline';
  closeWalletModal();
  toast(`Connected via ${type} on ${CHAINS[chain]?.name}`, 'success');
  loadDashboard();
}

// Legacy session storage helpers (kept for compat)
function storeThrAuth(address, secret) {
  if (window.ThronosBuilderWallet) window.ThronosBuilderWallet.storeSession(address, secret);
  else sessionStorage.setItem('thr_auth', btoa(JSON.stringify({ a: address, s: secret, t: Date.now() })));
}

function getThrAuth() {
  if (window.ThronosBuilderWallet) return window.ThronosBuilderWallet.getStoredSession();
  try {
    const raw = sessionStorage.getItem('thr_auth');
    if (!raw) return null;
    const data = JSON.parse(atob(raw));
    if (Date.now() - data.t > 30 * 60 * 1000) { sessionStorage.removeItem('thr_auth'); return null; }
    return { address: data.a, secret: data.s };
  } catch { return null; }
}

// ─── Thronos Wallet (v2 integration) ─────────────────────────────────
async function connectThronosWallet() {
  const bridge = window.ThronosBuilderWallet;

  // 1. Try auto-connect from existing walletSession (thronos-v3.6 wallet already loaded)
  if (bridge) {
    const auto = bridge.autoConnect();
    if (auto.ok) {
      setWalletConnected(auto.address, 'thronos', 'thronos');
      wallet.provider = bridge;
      toast('Connected from Thronos Wallet session', 'success');
      return;
    }

    // 2. Try restoring from sessionStorage
    const stored = bridge.getStoredSession();
    if (stored && /^THR[a-fA-F0-9]{40}$/.test(stored.address)) {
      bridge.connectWithSecret(stored.address, stored.secret);
      setWalletConnected(stored.address, 'thronos', 'thronos');
      wallet.provider = bridge;
      toast('Reconnected from session', 'success');
      return;
    }
  } else {
    // Legacy: no bridge, try session
    const cached = getThrAuth();
    if (cached && /^THR[a-fA-F0-9]{40}$/.test(cached.address)) {
      setWalletConnected(cached.address, 'thronos', 'thronos');
      return;
    }
  }

  // 3. Show connect modal (import key or address+secret)
  showThronosConnectModal();
}

function showThronosConnectModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.id = 'thronosConnectOverlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px">
      <h2 style="margin-bottom:4px">Connect Thronos Wallet</h2>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">Choose how to connect your THR wallet to pay for builds.</p>

      <!-- Tab selector -->
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button id="tabSecretBtn" onclick="switchThrTab('secret')" class="btn btn-primary" style="flex:1;font-size:12px">Address + Secret</button>
        <button id="tabKeyBtn" onclick="switchThrTab('key')" class="btn btn-secondary" style="flex:1;font-size:12px">Import Signing Key</button>
      </div>

      <!-- Tab: Address + Secret -->
      <div id="tabSecret">
        <div style="margin-bottom:12px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">THR Address</label>
          <input type="text" id="thrAddrInput" placeholder="THRa60e1cef..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-family:monospace;font-size:13px" />
        </div>
        <div style="margin-bottom:16px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Send Secret</label>
          <input type="password" id="thrSecretInput" placeholder="Your auth secret from pledge" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-family:monospace;font-size:13px" />
          <span style="font-size:11px;color:var(--text-secondary);margin-top:4px;display:block">Required for payments. Used only in this session.</span>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('thronosConnectOverlay').remove()" class="btn btn-secondary" style="flex:1">Cancel</button>
          <button onclick="submitThronosConnect()" class="btn btn-primary" style="flex:1" id="thrConnectBtn">Connect</button>
        </div>
      </div>

      <!-- Tab: Import Signing Key -->
      <div id="tabKey" style="display:none">
        <div style="margin-bottom:16px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Private Key (hex)</label>
          <input type="password" id="thrKeyInput" placeholder="64-character hex key (with or without 0x)" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-family:monospace;font-size:13px" />
          <span style="font-size:11px;color:var(--text-secondary);margin-top:4px;display:block">Your signing key is never sent to any server. Payment is signed client-side.</span>
        </div>
        <div id="thrKeyError" style="display:none;color:var(--red);font-size:12px;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('thronosConnectOverlay').remove()" class="btn btn-secondary" style="flex:1">Cancel</button>
          <button onclick="submitThronosKeyImport()" class="btn btn-primary" style="flex:1" id="thrKeyConnectBtn">Import &amp; Connect</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('thrAddrInput')?.focus();
}

function switchThrTab(tab) {
  document.getElementById('tabSecret').style.display = tab === 'secret' ? 'block' : 'none';
  document.getElementById('tabKey').style.display    = tab === 'key'    ? 'block' : 'none';
  document.getElementById('tabSecretBtn').className  = tab === 'secret' ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('tabKeyBtn').className     = tab === 'key'    ? 'btn btn-primary' : 'btn btn-secondary';
  if (tab === 'secret') document.getElementById('tabSecretBtn').style.flex = '1';
}
switchThrTab.toString; // expose to inline onclick

async function submitThronosConnect() {
  const addr   = document.getElementById('thrAddrInput').value.trim();
  const secret = document.getElementById('thrSecretInput').value.trim();
  const btn    = document.getElementById('thrConnectBtn');
  if (!addr)   { toast('THR address required', 'error'); return; }
  if (!/^THR[a-fA-F0-9]{40}$/.test(addr)) { toast('Invalid THR address. Format: THR + 40 hex chars', 'error'); return; }
  if (!secret) { toast('Send secret required for payments', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Verifying...';
  try {
    const res  = await fetch(`${API}/builds/preflight`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet_address: addr }) });
    const data = await res.json();
    if (data.error && data.error.includes('Invalid')) {
      toast('Address not found on Thronos chain', 'error');
      btn.disabled = false; btn.textContent = 'Connect'; return;
    }
    if (window.ThronosBuilderWallet) {
      window.ThronosBuilderWallet.connectWithSecret(addr, secret);
      window.ThronosBuilderWallet.storeSession(addr, secret);
    } else {
      storeThrAuth(addr, secret);
    }
    setWalletConnected(addr, 'thronos', 'thronos');
    wallet.provider = window.ThronosBuilderWallet || 'manual';
    document.getElementById('thronosConnectOverlay').remove();
    if (data.balance !== null) toast(`Connected! Balance: ${data.balance} THR`, 'success');
  } catch (err) {
    toast('Connection error: ' + err.message, 'error');
    btn.disabled = false; btn.textContent = 'Connect';
  }
}

async function submitThronosKeyImport() {
  const keyInput = document.getElementById('thrKeyInput');
  const errEl    = document.getElementById('thrKeyError');
  const btn      = document.getElementById('thrKeyConnectBtn');
  const hexKey   = keyInput.value.trim();
  if (!hexKey) { errEl.textContent = 'Private key required'; errEl.style.display = 'block'; return; }
  if (!window.ThronosBuilderWallet) { errEl.textContent = 'Wallet bridge not loaded'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Importing...';
  errEl.style.display = 'none';
  try {
    const result = await window.ThronosBuilderWallet.connectWithPrivateKey(hexKey);
    if (!result.ok) { errEl.textContent = 'Error: ' + result.reason; errEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Import & Connect'; return; }
    setWalletConnected(result.address, 'thronos', 'thronos');
    wallet.provider = window.ThronosBuilderWallet;
    document.getElementById('thronosConnectOverlay').remove();
    toast(`Signing key imported! Address: ${result.address.slice(0,10)}...`, 'success');
  } catch (err) {
    errEl.textContent = 'Error: ' + err.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Import & Connect';
  }
}

// ─── MetaMask ─────────────────────────────────────────────────────────
async function connectMetaMask() {
  if (typeof window.ethereum === 'undefined') { toast('MetaMask not detected.', 'error'); return; }
  try {
    const accounts  = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const chainHex  = await window.ethereum.request({ method: 'eth_chainId' });
    wallet.provider = window.ethereum;
    setWalletConnected(accounts[0], 'metamask', detectEVMChain(chainHex));
    window.ethereum.on('chainChanged', hex => {
      wallet.chain = detectEVMChain(hex);
      const badge = document.getElementById('chainBadge');
      badge.textContent = CHAINS[wallet.chain]?.name || wallet.chain;
      badge.className = 'chain-badge ' + wallet.chain;
      toast(`Switched to ${CHAINS[wallet.chain]?.name}`, 'success');
    });
    window.ethereum.on('accountsChanged', accs => {
      if (!accs.length) disconnectWallet();
      else { wallet.address = accs[0]; document.getElementById('connectWallet').textContent = accs[0].slice(0,6)+'...'+accs[0].slice(-4); }
    });
  } catch { toast('MetaMask connection rejected', 'error'); }
}

function detectEVMChain(hex) {
  return { '0x1': 'ethereum', '0xa4b1': 'arbitrum', '0x38': 'bsc', '0x2105': 'base' }[hex] || 'ethereum';
}

// ─── Phantom ───────────────────────────────────────────────────────────
async function connectPhantom() {
  const phantom = window.solana || window.phantom?.solana;
  if (!phantom || !phantom.isPhantom) { toast('Phantom wallet not detected.', 'error'); return; }
  try {
    const resp = await phantom.connect();
    wallet.provider = phantom;
    setWalletConnected(resp.publicKey.toString(), 'phantom', 'solana');
  } catch { toast('Phantom connection rejected', 'error'); }
}

// ─── Manual wallet ────────────────────────────────────────────────────
function connectManualWallet() {
  const input = document.getElementById('manualWalletInput').value.trim();
  if (!input) { toast('Please enter a wallet address', 'error'); return; }
  if      (/^THR[a-fA-F0-9]{40}$/.test(input))       setWalletConnected(input, 'thronos', 'thronos');
  else if (/^0x[a-fA-F0-9]{40}$/.test(input))         setWalletConnected(input, 'metamask', 'ethereum');
  else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input)) setWalletConnected(input, 'phantom', 'solana');
  else toast('Unrecognized address format', 'error');
}

// ─── Payment Method Selection ──────────────────────────────────────────
document.addEventListener('click', e => {
  const opt = e.target.closest('.payment-option');
  if (!opt) return;
  const usdtChainSelect = document.getElementById('usdtChainSelect');
  if (usdtChainSelect && usdtChainSelect.contains(opt)) {
    usdtChainSelect.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected'); opt.querySelector('input').checked = true;
    updateCost(); return;
  }
  const container = document.getElementById('paymentMethods');
  if (!container || !container.contains(opt)) return;
  container.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  opt.classList.add('selected'); opt.querySelector('input').checked = true;
  if (usdtChainSelect) usdtChainSelect.style.display = opt.dataset.method === 'usdt_evm' ? 'block' : 'none';
  updateCost();
});

// ─── Dashboard ─────────────────────────────────────────────────────────
async function loadDashboard() { loadStats(); loadBuilds(); }

async function loadStats() {
  try {
    const res  = await fetch(`${API}/status/stats`);
    const data = await res.json();
    document.getElementById('statTotal').textContent   = data.total_builds || 0;
    document.getElementById('statSuccess').textContent = data.status_breakdown?.success || 0;
    document.getElementById('statBuilding').textContent =
      (data.status_breakdown?.building || 0) + (data.status_breakdown?.pending || 0);
    document.getElementById('statSpent').textContent = parseFloat(data.total_revenue || 0).toFixed(2);
  } catch (e) { console.error('Failed to load stats:', e); }
}

async function loadBuilds() {
  if (!wallet.address) return;
  try {
    const res = await fetch(`${API}/builds?wallet_address=${encodeURIComponent(wallet.address)}`);
    if (!res.ok) { showEmptyState(); return; }
    renderBuilds((await res.json()).builds || []);
  } catch { showEmptyState(); }
}

function showEmptyState() {
  document.getElementById('buildsList').innerHTML = `
    <div class="empty-state">
      <div class="icon">&#128230;</div>
      <p>No builds yet. Start by creating your first build.</p>
      <button class="btn btn-primary" onclick="openNewBuild()">Create Build</button>
    </div>`;
}

function renderBuilds(builds) {
  const list = document.getElementById('buildsList');
  if (!builds.length) { showEmptyState(); return; }
  list.innerHTML = builds.map(b => `
    <div class="build-card" onclick="openBuildDetail('${b.job_id}')">
      <div class="build-info">
        <h3>${escapeHtml(b.project_name)}</h3>
        <div class="meta"><span>${b.platform}</span><span>${b.build_type}</span><span>${timeAgo(b.created_at)}</span></div>
      </div>
      <span class="badge badge-${b.status}">${b.status}</span>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="fill" style="width:${b.progress||0}%"></div></div>
        <div class="progress-text">${b.progress||0}%</div>
      </div>
      <div class="build-actions">
        ${b.status==='success'?`<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();downloadArtifact('${b.job_id}','${b.platform}')">Download</button>`:''}
        ${(b.status==='building'||b.status==='pending')?`<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();cancelBuild('${b.job_id}')">Cancel</button>`:''}
        ${b.status==='failed'&&(b.payment_status==='paid'||b.payment_status==='internal_waived')?`<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();editAndRetryBuild('${b.job_id}')">Edit &amp; Retry</button>`:''}
        ${b.status==='failed'&&!(b.payment_status==='paid'||b.payment_status==='internal_waived')?`<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();retryBuild('${b.job_id}')">Retry</button>`:''}
      </div>
    </div>`).join('');
}

// ─── Build Detail ──────────────────────────────────────────────────────
async function openBuildDetail(jobId) {
  showPage('detail');
  try {
    const res = await fetch(`${API}/builds/${jobId}`);
    const b   = await res.json();
    document.getElementById('detailTitle').textContent  = b.project_name;
    document.getElementById('detailBadge').className    = `badge badge-${b.status}`;
    document.getElementById('detailBadge').textContent  = b.status;
    document.getElementById('detailGrid').innerHTML = `
      <div class="detail-field"><div class="label">Job ID</div><div class="value" style="font-size:12px;font-family:monospace">${b.job_id}</div></div>
      <div class="detail-field"><div class="label">Platform</div><div class="value">${b.platform} / ${b.build_type}</div></div>
      <div class="detail-field"><div class="label">Created</div><div class="value">${new Date(b.created_at).toLocaleString()}</div></div>
      <div class="detail-field"><div class="label">Cost</div><div class="value">${b.cost_thron} THR</div></div>
      <div class="detail-field"><div class="label">Progress</div><div class="value">
        <div class="progress-bar" style="margin-top:4px"><div class="fill" style="width:${b.progress||0}%"></div></div>
        <span style="font-size:12px;color:var(--text-secondary)">${b.progress||0}%</span></div></div>
      <div class="detail-field"><div class="label">Payment</div><div class="value">${b.payment_status}</div></div>`;
    const actions = document.getElementById('detailActions');
    actions.innerHTML = '';
    if (b.status === 'success') {
      if (b.android_artifact_url) actions.innerHTML += `<button class="btn btn-primary" onclick="downloadArtifact('${b.job_id}','android')">Download APK</button> `;
      if (b.ios_artifact_url)     actions.innerHTML += `<button class="btn btn-primary" onclick="downloadArtifact('${b.job_id}','ios')">Download IPA</button>`;
    }
    loadBuildLogs(jobId);
    if (b.status === 'building' || b.status === 'pending') connectBuildWs(jobId);
  } catch { toast('Failed to load build details', 'error'); showPage('dashboard'); }
}

async function loadBuildLogs(jobId) {
  const el = document.getElementById('buildConsole');
  try {
    const data = await (await fetch(`${API}/builds/${jobId}/logs`)).json();
    if (data.logs && data.logs.length) {
      el.innerHTML = data.logs.map(l => `<div class="log-line ${l.type||''}">${escapeHtml(l.line)}</div>`).join('');
      el.scrollTop = el.scrollHeight;
    } else { el.innerHTML = '<div class="log-line">No logs yet...</div>'; }
  } catch { el.innerHTML = '<div class="log-line error">Failed to load logs</div>'; }
}

function connectBuildWs(jobId) {
  if (currentWs) { currentWs.close(); currentWs = null; }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws/builds/${jobId}`);
  currentWs = ws;
  document.getElementById('liveIndicator').style.display = 'inline';
  ws.onmessage = event => {
    try {
      const msg = JSON.parse(event.data);
      const el  = document.getElementById('buildConsole');
      if (msg.event === 'log') {
        const div = document.createElement('div');
        div.className = `log-line ${msg.data.type||''}`; div.textContent = msg.data.line;
        el.appendChild(div); el.scrollTop = el.scrollHeight;
      }
      if (msg.event === 'progress') document.querySelectorAll('.fill').forEach(f => f.style.width = msg.data.progress + '%');
      if (msg.event === 'complete') {
        document.getElementById('liveIndicator').style.display = 'none';
        document.getElementById('detailBadge').className = `badge badge-${msg.data.status}`;
        document.getElementById('detailBadge').textContent = msg.data.status;
        toast(`Build ${msg.data.status}!`, msg.data.status === 'success' ? 'success' : 'error');
        ws.close();
      }
      if (msg.event === 'error') {
        document.getElementById('liveIndicator').style.display = 'none';
        document.getElementById('detailBadge').className = 'badge badge-failed';
        document.getElementById('detailBadge').textContent = 'failed';
        const div = document.createElement('div');
        div.className = 'log-line error'; div.textContent = `ERROR: ${msg.data.error}`;
        el.appendChild(div); toast('Build failed!', 'error'); ws.close();
      }
    } catch { /* ignore */ }
  };
  ws.onclose = () => { document.getElementById('liveIndicator').style.display = 'none'; currentWs = null; };
}

// ─── Source Type UI Toggle ─────────────────────────────────────────────
function updateSourceTypeUI() {
  const form = document.getElementById('buildForm');
  if (!form) return;
  const isZip = form.source_type.value === 'zip';
  document.getElementById('sourceUrlGroup').style.display  = isZip ? 'none'  : 'block';
  document.getElementById('sourceUrlInput').toggleAttribute('required', !isZip);
  document.getElementById('branchGroup').style.display     = isZip ? 'none'  : 'block';
  document.getElementById('zipFileGroup').style.display    = isZip ? 'block' : 'none';
  document.getElementById('zipMetaGroup').style.display    = isZip ? 'flex'  : 'none';
}

// ─── iOS Guard ─────────────────────────────────────────────────────────
function applyIosGuard() {
  const iosEnabled    = pricingData?.ios_enabled === true;
  const platformSelect = document.getElementById('platformSelect');
  if (!platformSelect) return;
  const iosOpt  = platformSelect.querySelector('[value="ios"]');
  const bothOpt = platformSelect.querySelector('[value="both"]');
  if (iosOpt)  iosOpt.disabled  = !iosEnabled;
  if (bothOpt) bothOpt.disabled = !iosEnabled;
  const existing = document.getElementById('iosGuardNotice');
  if (!iosEnabled) {
    if (!existing) {
      const p = document.createElement('p');
      p.id = 'iosGuardNotice';
      p.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-top:4px;';
      p.textContent = 'iOS builds require signing/macOS configuration. Currently unavailable.';
      platformSelect.parentElement.appendChild(p);
    }
    if (platformSelect.value === 'ios' || platformSelect.value === 'both') {
      platformSelect.value = 'android';
    }
  } else if (existing) {
    existing.remove();
  }
}

// ─── Quote / Cost Display ───────────────────────────────────────────────
async function updateCost() {
  const form = document.getElementById('buildForm');
  if (!form) return;

  const platform      = form.platform.value;
  const build_type    = form.build_type.value;
  const payment_method = form.payment_method?.value || 'thr';

  const costEl      = document.getElementById('costPreview');
  const feeInfo     = document.getElementById('feeInfo');
  const floorNotice = document.getElementById('floorNotice');

  costEl.textContent = 'Loading...';
  currentQuote = null;

  try {
    const body = { platform, build_type, payment_method };
    if (wallet.address) body.wallet_address = wallet.address;

    const res = await fetch(`${API}/builds/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      costEl.textContent = err.error || 'Pricing unavailable';
      if (floorNotice) floorNotice.style.display = 'none';
      feeInfo.style.display = 'none';
      return;
    }

    const data = await res.json();
    currentQuote = data;

    costEl.textContent = `${data.amount} ${data.currency}`;

    if (floorNotice) floorNotice.style.display = data.floor_applied ? 'block' : 'none';

    if (data.currency !== 'THR') {
      feeInfo.style.display = 'block';
      document.getElementById('feeNote').textContent = 'Cross-chain fee split: 50% treasury, 25% burn, 25% LP pools.';
    } else {
      feeInfo.style.display = 'none';
    }
  } catch (e) {
    costEl.textContent = 'Pricing unavailable';
    currentQuote = null;
    console.warn('updateCost error:', e);
  }
}

// ─── New Build Modal ───────────────────────────────────────────────────
document.getElementById('newBuildBtn').addEventListener('click', openNewBuild);
document.getElementById('sourceTypeSelect').addEventListener('change', updateSourceTypeUI);

async function openNewBuild() {
  if (!wallet.address) { toast('Please connect your wallet first', 'error'); return; }
  document.getElementById('newBuildModal').classList.add('active');

  // Pre-select payment method
  const methodMap = { thronos: 'thr', metamask: wallet.chain === 'bsc' ? 'bnb' : 'eth', phantom: 'usdc_sol' };
  const method = methodMap[wallet.type] || 'thr';
  const pmContainer = document.getElementById('paymentMethods');
  pmContainer.querySelectorAll('.payment-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.method === method);
    o.querySelector('input').checked = o.dataset.method === method;
  });
  const usdtChainSelect = document.getElementById('usdtChainSelect');
  if (usdtChainSelect) usdtChainSelect.style.display = method === 'usdt_evm' ? 'block' : 'none';

  if (!pricingData) {
    try {
      const res = await fetch(`${API}/status/pricing`);
      if (res.ok) pricingData = await res.json();
    } catch { /* use fallback */ }
  }

  updateSourceTypeUI();
  applyIosGuard();
  updateCost();
}

function closeNewBuild() {
  document.getElementById('newBuildModal').classList.remove('active');
  document.getElementById('buildForm').reset();
  currentQuote = null;
  updateSourceTypeUI();
}

document.getElementById('newBuildModal').addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeNewBuild();
});

// ─── Preflight ─────────────────────────────────────────────────────────
async function preflightCheck(walletAddress, platform, buildType, paymentMethod) {
  try {
    const res = await fetch(`${API}/builds/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: walletAddress,
        platform,
        build_type: normalizeBuildType(buildType),
        payment_method: paymentMethod || 'thr',
      }),
    });
    const data = await res.json();
    if (!res.ok) return data?.error ? data : { error: 'Preflight check failed' };
    return data;
  } catch (err) { return { error: err.message }; }
}

// ─── Submit Build ──────────────────────────────────────────────────────
async function submitBuild(e) {
  e.preventDefault();
  const form = document.getElementById('buildForm');
  const btn  = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = 'Processing...';

  const sourceType    = form.source_type.value;
  const paymentMethod = form.payment_method?.value || 'thr';

  try {
    // ── ZIP Upload flow ─────────────────────────────────────────────
    if (sourceType === 'zip') {
      const zipInput = form.querySelector('[name="project_zip"]');
      if (!zipInput?.files?.length) { toast('Please select a .zip file to upload', 'error'); return; }
      const zipFile = zipInput.files[0];
      if (!zipFile.name.toLowerCase().endsWith('.zip')) { toast('File must be a .zip archive', 'error'); return; }

      btn.textContent = 'Uploading ZIP...';
      const uploadData = new FormData();
      uploadData.append('wallet_address', wallet.address);
      uploadData.append('project_name', form.project_name.value);
      uploadData.append('platform', form.platform.value);
      uploadData.append('build_type', normalizeBuildType(form.build_type.value));
      uploadData.append('project_type', form.project_type?.value || 'auto');
      uploadData.append('project_path', form.project_path?.value || '');
      uploadData.append('file', zipFile);

      const uploadRes  = await fetch(`${API}/uploads/project-zip`, { method: 'POST', body: uploadData });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) { toast(uploadJson.error || uploadJson.detail || 'ZIP upload failed', 'error'); return; }

      btn.textContent = 'Submitting Build...';
      const body = {
        wallet_address: wallet.address,
        project_name:  form.project_name.value,
        source_type:   'zip',
        source_url:    uploadJson.source_url,
        upload_id:     uploadJson.upload_id,
        upload_token:  uploadJson.upload_token,
        project_type:  form.project_type?.value || 'auto',
        project_path:  form.project_path?.value || '',
        platform:      form.platform.value,
        build_type:    normalizeBuildType(form.build_type.value),
        payment_method: paymentMethod,
        payment_chain: wallet.chain,
        branch: '',
        quote_id: currentQuote?.quote_id || null,
      };
      await _attachThrPayment(body, paymentMethod);
      const res  = await fetch(`${API}/builds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) { toast('Build submitted!', 'success'); closeNewBuild(); openBuildDetail(data.job_id); }
      else toast(data.error || data.detail || 'Submission failed', 'error');
      return;
    }

    // ── GitHub / GitLab flow ───────────────────────────────────────────
    if (!currentQuote || new Date(currentQuote.quote_expires_at) < new Date()) {
      btn.textContent = 'Fetching quote...';
      await updateCost();
      if (!currentQuote) { toast('Could not fetch pricing. Please try again.', 'error'); return; }
    }

    const isCrossChain = paymentMethod !== 'thr' && paymentMethod !== 'thronos';
    if (isCrossChain && !currentQuote) {
      toast('Pricing not loaded. Please wait a moment and try again.', 'error'); return;
    }

    if (paymentMethod === 'thr' || wallet.type === 'thronos') {
      btn.textContent = 'Checking wallet...';
      const preflight = await preflightCheck(wallet.address, form.platform.value, form.build_type.value, paymentMethod);
      if (preflight.error) { toast(preflight.error + (preflight.hint ? ' — ' + preflight.hint : ''), 'error'); return; }
      if (preflight.address_valid === false) { toast('Invalid THR wallet address.', 'error'); return; }
      if (preflight.balance !== null && preflight.can_afford === false) {
        toast(`Insufficient balance: ${preflight.balance} THR. Need: ${preflight.native_cost_thr} THR`, 'error'); return;
      }
      if (preflight.quote_id) currentQuote = preflight;
    }

    let paymentProof = null;
    if (isCrossChain) {
      btn.textContent = 'Awaiting wallet...';
      paymentProof = await processCrossChainPayment(paymentMethod, form);
      if (!paymentProof) { toast('Payment cancelled or failed', 'error'); return; }
    }

    btn.textContent = 'Submitting Build...';
    const body = {
      wallet_address: wallet.address,
      project_name:   form.project_name.value,
      source_type:    sourceType,
      source_url:     form.source_url.value,
      branch:         form.branch.value || 'main',
      platform:       form.platform.value,
      build_type:     normalizeBuildType(form.build_type.value),
      payment_method: paymentMethod,
      payment_chain:  wallet.chain,
      payment_proof:  paymentProof,
      tx_id:          paymentProof?.txHash || paymentProof?.signature || undefined,
      quote_id:       currentQuote?.quote_id || null,
    };

    await _attachThrPayment(body, paymentMethod);

    const res  = await fetch(`${API}/builds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) { toast('Build submitted!', 'success'); closeNewBuild(); openBuildDetail(data.job_id); }
    else toast(data.error || data.detail || 'Submission failed', 'error');

  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Submit Build';
  }
}

/**
 * Attach THR payment info to a build body.
 * Priority: ThronosBuilderWallet.pay() (client-side tx_id) > auth_secret (legacy)
 */
async function _attachThrPayment(body, paymentMethod) {
  if (paymentMethod !== 'thr' && paymentMethod !== 'thronos') return;

  const bridge = window.ThronosBuilderWallet;

  // A: Bridge available and connected with session or key → client-side payment
  if (bridge && bridge.isConnected() &&
      (bridge._getMethod?.() === 'session' || bridge._getMethod?.() === 'key')) {
    try {
      const TREASURY_THR = currentQuote?.treasury_address || '';
      const amount = currentQuote?.native_cost_thr || 0;
      if (TREASURY_THR && amount) {
        const payResult = await bridge.pay({ to: TREASURY_THR, amount });
        if (payResult.ok && payResult.tx_id) {
          body.tx_id = payResult.tx_id;
          body.payment_method = 'thr';
          return;
        }
      }
    } catch (_) { /* fall through to legacy */ }
  }

  // B: Bridge available with secret
  if (bridge && bridge.isConnected()) {
    const payResult = await bridge.pay({ to: '', amount: 0 });
    if (payResult.ok && payResult.auth_secret) {
      body.auth_secret = payResult.auth_secret;
      return;
    }
  }

  // C: Legacy sessionStorage
  const thrAuth = getThrAuth();
  if (thrAuth?.secret) {
    body.auth_secret = thrAuth.secret;
  }
}

// ─── Cross-Chain Payment Processing ────────────────────────────────────
async function processCrossChainPayment(method, form) {
  if (method === 'usdc_sol')  return await processPhantomPayment(form);
  if (method === 'usdt_evm')  return await processUsdtPayment(form);
  if (method === 'eth' || method === 'bnb') return await processEVMPayment(method, form);
  if (method === 'btc_bridge') return await processBtcBridgePayment(form);
  return null;
}

async function processBtcBridgePayment(form) {
  if (!currentQuote) { toast('No pricing quote available', 'error'); return null; }
  const btcAmount = currentQuote.external_amount;
  try {
    toast('Requesting BTC bridge deposit address...', 'success');
    const res = await fetch(`${API}/payments/btc-bridge/prepare`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payer_thr: wallet.address, amount_thr_equivalent: currentQuote.native_cost_thr, amount_btc: btcAmount, service_type: 'builder_build' }),
    });
    if (res.ok) {
      const data = await res.json();
      const confirmed = confirm(`Send exactly ${btcAmount} BTC to:\n\n${data.btc_deposit_address}\n\nThe SHA-256 bridge will convert to ${currentQuote.native_cost_thr} THR automatically.\nClick OK after sending the BTC transaction.`);
      if (!confirmed) return null;
      return { type: 'btc_bridge', btc_deposit_address: data.btc_deposit_address, amount_btc: btcAmount, amount_thr_equivalent: currentQuote.native_cost_thr, payer_thr: wallet.address, bridge_id: data.bridge_id, timestamp: Date.now() };
    }
    const txHash = prompt(`BTC Bridge Payment\nAmount: ${btcAmount} BTC (= ${currentQuote.native_cost_thr} THR)\n\nSend BTC to the Thronos SHA-256 bridge and paste the BTC transaction hash:`);
    if (!txHash) return null;
    return { type: 'btc_bridge', txHash: txHash.trim(), amount_btc: btcAmount, amount_thr_equivalent: currentQuote.native_cost_thr, payer_thr: wallet.address, timestamp: Date.now() };
  } catch (err) { toast('BTC bridge error: ' + err.message, 'error'); return null; }
}

async function processPhantomPayment(form) {
  const phantom = wallet.provider;
  if (!phantom) { toast('Phantom wallet not connected', 'error'); return null; }
  if (!currentQuote) { toast('No pricing quote available', 'error'); return null; }
  try {
    const usdcAmount = currentQuote.external_amount * 1e6;
    const paymentRes = await fetch(`${API}/payments/solana/prepare`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payer: wallet.address, amount_usdc: usdcAmount, service_type: 'builder_build', treasury: TREASURY.solana }),
    });
    if (paymentRes.ok) {
      const paymentData = await paymentRes.json();
      return paymentData.payment_proof;
    }
    toast('Requesting payment confirmation...', 'success');
    const message   = new TextEncoder().encode(`ThronosBuild payment: ${currentQuote.native_cost_thr} THR equivalent in USDC\nProject: ${form.project_name.value}\nTimestamp: ${Date.now()}`);
    const signature = await phantom.signMessage(message, 'utf8');
    return { type: 'solana_signed_intent', payer: wallet.address, signature: btoa(String.fromCharCode(...signature.signature)), amount_usdc: currentQuote.external_amount, amount_thr_equivalent: currentQuote.native_cost_thr, timestamp: Date.now() };
  } catch (err) { toast('Solana payment failed: ' + err.message, 'error'); return null; }
}

async function processEVMPayment(method, form) {
  if (!wallet.provider) { toast('MetaMask not connected', 'error'); return null; }
  if (!currentQuote)    { toast('No pricing quote available', 'error'); return null; }
  try {
    const amount = currentQuote.external_amount;
    let value, chain;
    if (method === 'eth') {
      value = '0x' + BigInt(Math.round(amount * 1e18)).toString(16);
      chain = wallet.chain;
    } else {
      value = '0x' + BigInt(Math.round(amount * 1e18)).toString(16);
      chain = 'bsc';
      if (wallet.chain !== 'bsc') {
        try { await wallet.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] }); }
        catch { toast('Please switch to BNB Chain in MetaMask', 'error'); return null; }
      }
    }
    toast('Confirm transaction in MetaMask...', 'success');
    const txHash = await wallet.provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: wallet.address, to: TREASURY[chain] || TREASURY.ethereum, value, data: '0x' }],
    });
    toast('Transaction submitted!', 'success');
    await fetch(`${API}/payments/crosschain/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_hash: txHash, chain, payer: wallet.address, amount_thr_equivalent: currentQuote.native_cost_thr, service_type: 'builder_build', fee_action: 'stake_and_mint' }),
    }).catch(() => {});
    return { type: 'evm_tx', tx_hash: txHash, chain, payer: wallet.address, amount_thr_equivalent: currentQuote.native_cost_thr, timestamp: Date.now() };
  } catch (err) {
    toast(err.code === 4001 ? 'Transaction rejected by user' : 'EVM payment failed: ' + err.message, 'error');
    return null;
  }
}

async function processUsdtPayment(form) {
  if (!wallet.provider) { toast('MetaMask not connected', 'error'); return null; }
  if (!currentQuote)    { toast('No pricing quote available', 'error'); return null; }
  try {
    const usdtAmount  = currentQuote.external_amount;
    const usdtChain   = form.usdt_chain?.value || 'ethereum';
    const usdtContract = USDT_CONTRACTS[usdtChain];
    if (!usdtContract) { toast('USDT not available on this chain', 'error'); return null; }
    const chainIds     = { ethereum: '0x1', arbitrum: '0xa4b1', bsc: '0x38' };
    const currentChainId = await wallet.provider.request({ method: 'eth_chainId' });
    if (currentChainId !== chainIds[usdtChain]) {
      try { await wallet.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIds[usdtChain] }] }); }
      catch { toast(`Please switch to ${usdtChain} in MetaMask`, 'error'); return null; }
    }
    toast('Confirm USDT transfer in MetaMask...', 'success');
    const decimals  = usdtChain === 'bsc' ? 18 : 6;
    const amountRaw = BigInt(Math.floor(usdtAmount * (10 ** decimals)));
    const amountHex = '0x' + amountRaw.toString(16).padStart(64, '0');
    const toPadded  = (TREASURY[usdtChain] || TREASURY.ethereum).toLowerCase().replace('0x', '').padStart(64, '0');
    const data      = ERC20_TRANSFER_ABI + toPadded + amountHex;
    const txHash = await wallet.provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: wallet.address, to: usdtContract, data, value: '0x0' }],
    });
    toast('USDT transaction submitted!', 'success');
    await fetch(`${API}/payments/crosschain/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_hash: txHash, chain: usdtChain, payer: wallet.address, amount_thr_equivalent: currentQuote.native_cost_thr, service_type: 'builder_build', fee_action: 'stake_and_mint', token_symbol: 'USDT' }),
    }).catch(() => {});
    return { type: 'evm_token_tx', tx_hash: txHash, chain: usdtChain, token: 'USDT', token_contract: usdtContract, payer: wallet.address, amount_usdt: usdtAmount, amount_thr_equivalent: currentQuote.native_cost_thr, timestamp: Date.now() };
  } catch (err) {
    toast(err.code === 4001 ? 'Transaction rejected by user' : 'USDT payment failed: ' + err.message, 'error');
    return null;
  }
}

// ─── Actions ───────────────────────────────────────────────────────────
async function cancelBuild(jobId) {
  if (!confirm('Cancel this build?')) return;
  try {
    const res = await fetch(`${API}/builds/${jobId}/cancel`, { method: 'POST' });
    if (res.ok) { toast('Build cancelled', 'success'); loadBuilds(); }
    else toast('Failed to cancel', 'error');
  } catch { toast('Network error', 'error'); }
}

async function editAndRetryBuild(jobId) {
  if (!wallet.address) { toast('Please connect your wallet first', 'error'); return; }
  try {
    const detailRes = await fetch(`${API}/builds/${jobId}`);
    const build = await detailRes.json();
    if (!detailRes.ok) { toast(build.error || 'Failed to load build details', 'error'); return; }
    const nextSourceUrl  = prompt('Repository URL', build.source_url || '');
    if (nextSourceUrl === null) return;
    const nextBranch     = prompt('Branch', build.branch || 'main');
    if (nextBranch === null) return;
    const nextProjectPath = prompt('Project path (e.g. frontend)', build.project_path || '');
    if (nextProjectPath === null) return;
    const nextBuildType  = normalizeBuildType(prompt('Build type (apk or aab)', build.build_type || 'apk'));
    const res  = await fetch(`${API}/builds/${jobId}/retry-paid`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: wallet.address, source_url: nextSourceUrl.trim(), branch: (nextBranch||'main').trim(), project_path: (nextProjectPath||'').trim(), build_type: nextBuildType }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 402 && data.price_difference !== undefined) toast(`Additional payment required: +${data.price_difference} THR`, 'error');
      else toast(data.error || 'Retry failed', 'error');
      return;
    }
    toast('Retry submitted without additional charge', 'success');
    openBuildDetail(jobId); loadBuilds();
  } catch { toast('Network error', 'error'); }
}

async function retryBuild(jobId) {
  try {
    const res  = await fetch(`${API}/builds/${jobId}/retry`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) { toast('Build retry started!', 'success'); openBuildDetail(jobId); }
    else toast(data.error || 'Retry failed', 'error');
  } catch { toast('Network error', 'error'); }
}

function downloadArtifact(jobId, platform) {
  const appUrl      = publicConfig?.app_url;
  const fallbackUrl = publicConfig?.public_fallback_url;
  let useFallback = false;
  if (appUrl && fallbackUrl) {
    try { if (window.location.hostname !== new URL(appUrl).hostname) useFallback = true; } catch {}
  }
  window.open(`${API}/builds/${jobId}/download/${platform}${useFallback ? '?fallback=1' : ''}`, '_blank');
}

// ─── Pricing Page ──────────────────────────────────────────────────────
async function loadPricing() {
  if (!pricingData) {
    try { const res = await fetch(`${API}/status/pricing`); if (res.ok) pricingData = await res.json(); }
    catch { pricingData = FALLBACK_PRICING; }
  }
  const p = getSafePricing(pricingData);
  document.getElementById('pricingGrid').innerHTML = `
    <div class="price-card">
      <div class="platform-icon">&#129302;</div><h3>Android APK</h3>
      <div class="price">${p.android.apk} <span class="unit">THR</span></div>
      <ul class="features"><li>Debug &amp; Release builds</li><li>GitHub / GitLab / ZIP source</li><li>Real-time build logs</li><li>IPFS artifact storage</li><li>Pay with THR, ETH, USDT, USDC, BNB</li></ul>
    </div>
    <div class="price-card">
      <div class="platform-icon">&#127922;</div><h3>Android AAB</h3>
      <div class="price">${p.android.aab} <span class="unit">THR</span></div>
      <ul class="features"><li>Play Store ready</li><li>Signed &amp; optimized</li><li>Real-time build logs</li><li>IPFS artifact storage</li><li>Pay with THR, ETH, USDT, USDC, BNB</li></ul>
    </div>
    <div class="price-card">
      <div class="platform-icon">&#127823;</div><h3>iOS IPA</h3>
      <div class="price">${p.ios.ipa} <span class="unit">THR</span></div>
      <ul class="features"><li>macOS cloud build</li><li>Ad-hoc &amp; App Store distribution</li><li>Real-time build logs</li><li>IPFS artifact storage</li><li>Pay with THR, ETH, USDT, USDC, BNB</li></ul>
    </div>
    <div class="price-card" style="border-color:var(--accent)">
      <div class="platform-icon">&#128171;</div><h3>Both Platforms</h3>
      <div class="price">${p.android.apk + p.ios.ipa - p.bundle_discount} <span class="unit">THR</span></div>
      <ul class="features"><li>Android + iOS in one build</li><li>Save ${p.bundle_discount} THR bundle discount</li><li>Parallel builds</li><li>Cross-chain fee &rarr; LP pools</li></ul>
    </div>`;
}

// ─── Utilities ─────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(str) {
  const div = document.createElement('div'); div.textContent = str || ''; return div.innerHTML;
}

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// ─── Init ──────────────────────────────────────────────────────────────
loadDashboard();
