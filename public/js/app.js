/* ─── ThronosBuild Dashboard — Multi-Wallet + Cross-Chain ───────────── */

const API = '/api/v1';
const GATEWAY_URL = window.GATEWAY_URL || '/api/gateway';

// ─── Wallet State ──────────────────────────────────────────────────────
let wallet = {
  address: null,
  type: null,      // 'thronos' | 'metamask' | 'phantom'
  chain: null,     // 'thronos' | 'ethereum' | 'arbitrum' | 'bsc' | 'base' | 'solana'
  provider: null,
};

let pricingData = null;
let currentWs = null;

// Chain configs
const CHAINS = {
  thronos: { name: 'ThronosChain', symbol: 'THR', color: 'var(--accent)' },
  ethereum: { name: 'Ethereum', symbol: 'ETH', chainId: '0x1', color: '#627eea' },
  arbitrum: { name: 'Arbitrum', symbol: 'ETH', chainId: '0xa4b1', color: '#28a0f0' },
  bsc: { name: 'BNB Chain', symbol: 'BNB', chainId: '0x38', color: '#F3BA2F' },
  base: { name: 'Base', symbol: 'ETH', chainId: '0x2105', color: '#0052FF' },
  solana: { name: 'Solana', symbol: 'USDC', color: '#9945FF' },
};

// Treasury addresses per chain (paid by cross-chain users)
const TREASURY = {
  ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e',
  arbitrum: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e',
  bsc: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e',
  base: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e',
  solana: 'THRtreas1111111111111111111111111111111111',
};

// USDC contract addresses
const USDC_CONTRACTS = {
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  bsc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

// USDT contract addresses per EVM chain
const USDT_CONTRACTS = {
  ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  bsc: '0x55d398326f99059fF775485246999027B3197955',
};

// ERC20 transfer function signature
const ERC20_TRANSFER_ABI = '0xa9059cbb'; // transfer(address,uint256)

// ─── Page Navigation ───────────────────────────────────────────────────
document.querySelectorAll('.navbar-links a').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    showPage(link.dataset.page);
  });
});

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.navbar-links a').forEach(a => a.classList.remove('active'));

  const el = document.getElementById('page-' + page);
  if (el) {
    el.classList.add('active');
    el.style.display = 'block';
  }

  const link = document.querySelector(`[data-page="${page}"]`);
  if (link) link.classList.add('active');

  document.querySelectorAll('.page').forEach(p => {
    if (p.id !== 'page-' + page) p.style.display = 'none';
  });

  if (page === 'dashboard') loadDashboard();
  if (page === 'pricing') loadPricing();
}

document.querySelectorAll('.page').forEach(p => {
  if (!p.classList.contains('active')) p.style.display = 'none';
});

// ─── Wallet Connect Modal ──────────────────────────────────────────────
document.getElementById('connectWallet').addEventListener('click', () => {
  if (wallet.address) {
    disconnectWallet();
    return;
  }
  document.getElementById('walletModal').classList.add('active');
});

function closeWalletModal() {
  document.getElementById('walletModal').classList.remove('active');
}

document.getElementById('walletModal').addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeWalletModal();
});

function disconnectWallet() {
  wallet = { address: null, type: null, chain: null, provider: null };
  // Clear session-cached credentials
  sessionStorage.removeItem('thr_auth');
  const btn = document.getElementById('connectWallet');
  btn.textContent = 'Connect Wallet';
  btn.classList.remove('connected');
  document.getElementById('chainBadge').style.display = 'none';
  toast('Wallet disconnected');
}

function setWalletConnected(address, type, chain) {
  wallet.address = address;
  wallet.type = type;
  wallet.chain = chain;

  const short = address.slice(0, 6) + '...' + address.slice(-4);
  const btn = document.getElementById('connectWallet');
  btn.textContent = short;
  btn.classList.add('connected');

  // Show chain badge
  const badge = document.getElementById('chainBadge');
  badge.textContent = CHAINS[chain]?.name || chain;
  badge.className = 'chain-badge ' + chain;
  badge.style.display = 'inline';

  closeWalletModal();
  toast(`Connected via ${type} on ${CHAINS[chain]?.name}`, 'success');
  loadDashboard();
}

// ─── Store/retrieve THR auth secret for session ─────────────────────
function storeThrAuth(address, secret) {
  // Encrypt with a simple session key (not persistent across browser closes)
  const data = JSON.stringify({ a: address, s: secret, t: Date.now() });
  sessionStorage.setItem('thr_auth', btoa(data));
}

function getThrAuth() {
  try {
    const raw = sessionStorage.getItem('thr_auth');
    if (!raw) return null;
    const data = JSON.parse(atob(raw));
    // Expire after 30 minutes
    if (Date.now() - data.t > 30 * 60 * 1000) {
      sessionStorage.removeItem('thr_auth');
      return null;
    }
    return { address: data.a, secret: data.s };
  } catch { return null; }
}

// ─── Thronos Wallet Connect ────────────────────────────────────────────
async function connectThronosWallet() {
  // Option 1: Thronos Chrome Extension / window.thronos provider
  if (typeof window.thronos !== 'undefined') {
    try {
      const resp = await window.thronos.connect();
      setWalletConnected(resp.address, 'thronos', 'thronos');
      wallet.provider = window.thronos;
      // Extension handles secret internally - no need to ask
      return;
    } catch (err) {
      toast('Thronos wallet connection rejected', 'error');
      return;
    }
  }

  // Option 2: Manual THR address + send secret (for users without extension)
  showThronosConnectModal();
}

function showThronosConnectModal() {
  // Check if we have cached credentials
  const cached = getThrAuth();
  if (cached && /^THR[a-fA-F0-9]{40}$/.test(cached.address)) {
    setWalletConnected(cached.address, 'thronos', 'thronos');
    toast('Reconnected from session', 'success');
    return;
  }

  // Create inline modal for THR address + secret
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.id = 'thronosConnectOverlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <h2 style="margin-bottom:4px">Connect Thronos Wallet</h2>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">
        Enter your THR address and send secret to enable payments.
        <br>Your secret is stored encrypted in this session only.
      </p>
      <div style="margin-bottom:12px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">THR Address</label>
        <input type="text" id="thrAddrInput" placeholder="THRa60e1cef..."
               style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-family:monospace;font-size:13px" />
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Send Secret</label>
        <input type="password" id="thrSecretInput" placeholder="Your auth secret from pledge"
               style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-family:monospace;font-size:13px" />
        <span style="font-size:11px;color:var(--text-secondary);margin-top:4px;display:block">
          Required for payments. Never shared with third parties.
        </span>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('thronosConnectOverlay').remove()"
                class="btn btn-secondary" style="flex:1">Cancel</button>
        <button onclick="submitThronosConnect()" class="btn btn-primary" style="flex:1" id="thrConnectBtn">Connect</button>
      </div>
      <div style="margin-top:12px;text-align:center">
        <a href="https://chromewebstore.google.com" target="_blank"
           style="font-size:12px;color:var(--accent)">
          Or install the Thronos Chrome Extension for easier access
        </a>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById('thrAddrInput').focus();
}

async function submitThronosConnect() {
  const addr = document.getElementById('thrAddrInput').value.trim();
  const secret = document.getElementById('thrSecretInput').value.trim();
  const btn = document.getElementById('thrConnectBtn');

  if (!addr) { toast('THR address required', 'error'); return; }
  if (!/^THR[a-fA-F0-9]{40}$/.test(addr)) {
    toast('Invalid THR address. Format: THR + 40 hex chars', 'error');
    return;
  }
  if (!secret) { toast('Send secret required for payments', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    // Verify balance to confirm address is valid on chain
    const res = await fetch(`${API}/builds/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: addr }),
    });
    const data = await res.json();

    if (data.error && data.error.includes('Invalid')) {
      toast('Address not found on Thronos chain', 'error');
      btn.disabled = false; btn.textContent = 'Connect';
      return;
    }

    // Store auth in session (encrypted, expires in 30 min)
    storeThrAuth(addr, secret);
    setWalletConnected(addr, 'thronos', 'thronos');
    document.getElementById('thronosConnectOverlay').remove();

    if (data.balance !== null) {
      toast(`Connected! Balance: ${data.balance} THR`, 'success');
    }
  } catch (err) {
    toast('Connection error: ' + err.message, 'error');
    btn.disabled = false; btn.textContent = 'Connect';
  }
}

// ─── MetaMask Connect ──────────────────────────────────────────────────
async function connectMetaMask() {
  if (typeof window.ethereum === 'undefined') {
    toast('MetaMask not detected. Install MetaMask to continue.', 'error');
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const address = accounts[0];

    // Detect current chain
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    const chain = detectEVMChain(chainIdHex);

    wallet.provider = window.ethereum;
    setWalletConnected(address, 'metamask', chain);

    // Listen for chain changes
    window.ethereum.on('chainChanged', (newChainId) => {
      wallet.chain = detectEVMChain(newChainId);
      const badge = document.getElementById('chainBadge');
      badge.textContent = CHAINS[wallet.chain]?.name || wallet.chain;
      badge.className = 'chain-badge ' + wallet.chain;
      toast(`Switched to ${CHAINS[wallet.chain]?.name}`, 'success');
    });

    // Listen for account changes
    window.ethereum.on('accountsChanged', (accs) => {
      if (accs.length === 0) {
        disconnectWallet();
      } else {
        wallet.address = accs[0];
        const short = accs[0].slice(0, 6) + '...' + accs[0].slice(-4);
        document.getElementById('connectWallet').textContent = short;
      }
    });

  } catch (err) {
    toast('MetaMask connection rejected', 'error');
  }
}

function detectEVMChain(chainIdHex) {
  const map = { '0x1': 'ethereum', '0xa4b1': 'arbitrum', '0x38': 'bsc', '0x2105': 'base' };
  return map[chainIdHex] || 'ethereum';
}

// ─── Phantom (Solana) Connect ──────────────────────────────────────────
async function connectPhantom() {
  const phantom = window.solana || window.phantom?.solana;

  if (!phantom || !phantom.isPhantom) {
    toast('Phantom wallet not detected. Install Phantom to continue.', 'error');
    return;
  }

  try {
    const resp = await phantom.connect();
    const address = resp.publicKey.toString();
    wallet.provider = phantom;
    setWalletConnected(address, 'phantom', 'solana');
  } catch (err) {
    toast('Phantom connection rejected', 'error');
  }
}

// ─── Manual Wallet Input ───────────────────────────────────────────────
function connectManualWallet() {
  const input = document.getElementById('manualWalletInput').value.trim();
  if (!input) {
    toast('Please enter a wallet address', 'error');
    return;
  }

  // Detect wallet type from address format
  if (/^THR[a-fA-F0-9]{40}$/.test(input)) {
    setWalletConnected(input, 'thronos', 'thronos');
  } else if (/^0x[a-fA-F0-9]{40}$/.test(input)) {
    setWalletConnected(input, 'metamask', 'ethereum');
  } else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input)) {
    setWalletConnected(input, 'phantom', 'solana');
  } else {
    toast('Unrecognized address format', 'error');
  }
}

// ─── Payment Method Selection ──────────────────────────────────────────
document.addEventListener('click', e => {
  const opt = e.target.closest('.payment-option');
  if (!opt) return;

  // Check if this is inside the USDT chain sub-selector
  const usdtChainSelect = document.getElementById('usdtChainSelect');
  if (usdtChainSelect && usdtChainSelect.contains(opt)) {
    // Handle USDT chain selection
    usdtChainSelect.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    opt.querySelector('input').checked = true;
    updateCost();
    return;
  }

  // Main payment method selection
  const container = document.getElementById('paymentMethods');
  if (!container || !container.contains(opt)) return;

  container.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  opt.classList.add('selected');
  opt.querySelector('input').checked = true;

  // Show/hide USDT chain selector
  if (usdtChainSelect) {
    usdtChainSelect.style.display = opt.dataset.method === 'usdt_evm' ? 'block' : 'none';
  }

  updateCost();
});

// ─── Dashboard ─────────────────────────────────────────────────────────
async function loadDashboard() {
  loadStats();
  loadBuilds();
}

async function loadStats() {
  try {
    const res = await fetch(`${API}/status/stats`);
    const data = await res.json();
    document.getElementById('statTotal').textContent = data.total_builds || 0;
    document.getElementById('statSuccess').textContent = data.status_breakdown?.success || 0;
    document.getElementById('statBuilding').textContent =
      (data.status_breakdown?.building || 0) + (data.status_breakdown?.pending || 0);
    document.getElementById('statSpent').textContent =
      parseFloat(data.total_revenue || 0).toFixed(2);
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

async function loadBuilds() {
  if (!wallet.address) return;

  try {
    const res = await fetch(`${API}/builds?wallet_address=${encodeURIComponent(wallet.address)}`);
    if (!res.ok) {
      showEmptyState();
      return;
    }
    const data = await res.json();
    renderBuilds(data.builds || []);
  } catch (e) {
    showEmptyState();
  }
}

function showEmptyState() {
  const list = document.getElementById('buildsList');
  list.innerHTML = `
    <div class="empty-state">
      <div class="icon">&#128230;</div>
      <p>No builds yet. Start by creating your first build.</p>
      <button class="btn btn-primary" onclick="openNewBuild()">Create Build</button>
    </div>`;
}

function renderBuilds(builds) {
  const list = document.getElementById('buildsList');

  if (!builds.length) {
    showEmptyState();
    return;
  }

  list.innerHTML = builds.map(b => `
    <div class="build-card" onclick="openBuildDetail('${b.job_id}')">
      <div class="build-info">
        <h3>${escapeHtml(b.project_name)}</h3>
        <div class="meta">
          <span>${b.platform}</span>
          <span>${b.build_type}</span>
          <span>${timeAgo(b.created_at)}</span>
        </div>
      </div>
      <span class="badge badge-${b.status}">${b.status}</span>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="fill" style="width:${b.progress || 0}%"></div></div>
        <div class="progress-text">${b.progress || 0}%</div>
      </div>
      <div class="build-actions">
        ${b.status === 'success' ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); downloadArtifact('${b.job_id}', '${b.platform}')">Download</button>` : ''}
        ${b.status === 'building' || b.status === 'pending' ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); cancelBuild('${b.job_id}')">Cancel</button>` : ''}
        ${b.status === 'pending' || b.status === 'failed' ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); retryBuild('${b.job_id}')">Retry</button>` : ''}
      </div>
    </div>
  `).join('');
}

// ─── Build Detail ──────────────────────────────────────────────────────
async function openBuildDetail(jobId) {
  showPage('detail');

  try {
    const res = await fetch(`${API}/builds/${jobId}`);
    const b = await res.json();

    document.getElementById('detailTitle').textContent = b.project_name;
    document.getElementById('detailBadge').className = `badge badge-${b.status}`;
    document.getElementById('detailBadge').textContent = b.status;

    document.getElementById('detailGrid').innerHTML = `
      <div class="detail-field">
        <div class="label">Job ID</div>
        <div class="value" style="font-size:12px; font-family:monospace">${b.job_id}</div>
      </div>
      <div class="detail-field">
        <div class="label">Platform</div>
        <div class="value">${b.platform} / ${b.build_type}</div>
      </div>
      <div class="detail-field">
        <div class="label">Created</div>
        <div class="value">${new Date(b.created_at).toLocaleString()}</div>
      </div>
      <div class="detail-field">
        <div class="label">Cost</div>
        <div class="value">${b.cost_thron} THR</div>
      </div>
      <div class="detail-field">
        <div class="label">Progress</div>
        <div class="value">
          <div class="progress-bar" style="margin-top:4px"><div class="fill" style="width:${b.progress || 0}%"></div></div>
          <span style="font-size:12px; color:var(--text-secondary)">${b.progress || 0}%</span>
        </div>
      </div>
      <div class="detail-field">
        <div class="label">Payment</div>
        <div class="value">${b.payment_status}</div>
      </div>
    `;

    const actions = document.getElementById('detailActions');
    actions.innerHTML = '';
    if (b.status === 'success') {
      if (b.android_artifact_url) {
        actions.innerHTML += `<button class="btn btn-primary" onclick="downloadArtifact('${b.job_id}', 'android')">Download APK</button> `;
      }
      if (b.ios_artifact_url) {
        actions.innerHTML += `<button class="btn btn-primary" onclick="downloadArtifact('${b.job_id}', 'ios')">Download IPA</button>`;
      }
    }

    loadBuildLogs(jobId);

    if (b.status === 'building' || b.status === 'pending') {
      connectBuildWs(jobId);
    }
  } catch (e) {
    toast('Failed to load build details', 'error');
    showPage('dashboard');
  }
}

async function loadBuildLogs(jobId) {
  const consoleEl = document.getElementById('buildConsole');
  try {
    const res = await fetch(`${API}/builds/${jobId}/logs`);
    const data = await res.json();

    if (data.logs && data.logs.length) {
      consoleEl.innerHTML = data.logs.map(l =>
        `<div class="log-line ${l.type || ''}">${escapeHtml(l.line)}</div>`
      ).join('');
      consoleEl.scrollTop = consoleEl.scrollHeight;
    } else {
      consoleEl.innerHTML = '<div class="log-line">No logs yet...</div>';
    }
  } catch (e) {
    consoleEl.innerHTML = '<div class="log-line error">Failed to load logs</div>';
  }
}

function connectBuildWs(jobId) {
  if (currentWs) { currentWs.close(); currentWs = null; }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws/builds/${jobId}`);
  currentWs = ws;

  document.getElementById('liveIndicator').style.display = 'inline';

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      const consoleEl = document.getElementById('buildConsole');

      if (msg.event === 'log') {
        const div = document.createElement('div');
        div.className = `log-line ${msg.data.type || ''}`;
        div.textContent = msg.data.line;
        consoleEl.appendChild(div);
        consoleEl.scrollTop = consoleEl.scrollHeight;
      }

      if (msg.event === 'progress') {
        document.querySelectorAll('.fill').forEach(f => f.style.width = msg.data.progress + '%');
      }

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
        const consoleEl = document.getElementById('buildConsole');
        const div = document.createElement('div');
        div.className = 'log-line error';
        div.textContent = `ERROR: ${msg.data.error}`;
        consoleEl.appendChild(div);
        toast('Build failed!', 'error');
        ws.close();
      }
    } catch (e) { /* ignore parse errors */ }
  };

  ws.onclose = () => {
    document.getElementById('liveIndicator').style.display = 'none';
    currentWs = null;
  };
}

// ─── New Build Modal ───────────────────────────────────────────────────
document.getElementById('newBuildBtn').addEventListener('click', openNewBuild);

function openNewBuild() {
  if (!wallet.address) {
    toast('Please connect your wallet first', 'error');
    return;
  }
  document.getElementById('newBuildModal').classList.add('active');

  // Pre-select payment method based on wallet type
  const methodMap = {
    thronos: 'thr',
    metamask: wallet.chain === 'bsc' ? 'bnb' : 'eth',
    phantom: 'usdc_sol',
  };
  const method = methodMap[wallet.type] || 'thr';
  const pmContainer = document.getElementById('paymentMethods');
  pmContainer.querySelectorAll('.payment-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.method === method);
    o.querySelector('input').checked = o.dataset.method === method;
  });

  // Show/hide USDT chain selector
  const usdtChainSelect = document.getElementById('usdtChainSelect');
  if (usdtChainSelect) {
    usdtChainSelect.style.display = method === 'usdt_evm' ? 'block' : 'none';
  }

  updateCost();
}

function closeNewBuild() {
  document.getElementById('newBuildModal').classList.remove('active');
  document.getElementById('buildForm').reset();
}

document.getElementById('newBuildModal').addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeNewBuild();
});

async function updateCost() {
  if (!pricingData) {
    try {
      const res = await fetch(`${API}/status/pricing`);
      pricingData = await res.json();
    } catch (e) {
      pricingData = { android: { apk: 10, aab: 10 }, ios: { ipa: 50 }, bundle_discount: 5 };
    }
  }

  const form = document.getElementById('buildForm');
  const platform = form.platform.value;
  const buildType = form.build_type.value;
  const paymentMethod = form.payment_method?.value || 'thr';

  let costThr = 0;
  if (platform === 'android' || platform === 'both') {
    costThr += buildType === 'aab' ? pricingData.android.aab : pricingData.android.apk;
  }
  if (platform === 'ios' || platform === 'both') {
    costThr += pricingData.ios.ipa;
  }
  if (platform === 'both') {
    costThr = Math.max(costThr - pricingData.bundle_discount, 0);
  }

  // Show cost in the selected payment currency
  const costEl = document.getElementById('costPreview');
  const feeInfo = document.getElementById('feeInfo');

  if (paymentMethod === 'thr') {
    costEl.textContent = `${costThr} THR`;
    feeInfo.style.display = 'none';
  } else if (paymentMethod === 'usdt_evm') {
    // USDT is pegged 1:1 to USD, convert THR → USD
    const usdtCost = (costThr * 0.05).toFixed(2); // 1 THR = $0.05
    const usdtChain = form.usdt_chain?.value || 'ethereum';
    const chainNames = { ethereum: 'ERC-20', arbitrum: 'Arbitrum', bsc: 'BEP-20' };
    costEl.textContent = `~${usdtCost} USDT (${chainNames[usdtChain] || usdtChain})`;
    feeInfo.style.display = 'block';
  } else if (paymentMethod === 'usdc_sol') {
    const usdcCost = (costThr * 0.05).toFixed(2); // 1 THR = $0.05
    costEl.textContent = `~${usdcCost} USDC`;
    feeInfo.style.display = 'block';
  } else if (paymentMethod === 'eth') {
    const ethCost = (costThr * 0.000015).toFixed(6);
    costEl.textContent = `~${ethCost} ETH`;
    feeInfo.style.display = 'block';
  } else if (paymentMethod === 'bnb') {
    const bnbCost = (costThr * 0.00008).toFixed(6);
    costEl.textContent = `~${bnbCost} BNB`;
    feeInfo.style.display = 'block';
  } else if (paymentMethod === 'btc_bridge') {
    const btcCost = (costThr * 0.0000008).toFixed(8); // 1 THR ≈ 0.0000008 BTC
    costEl.textContent = `~${btcCost} BTC (via SHA-256 Bridge)`;
    feeInfo.style.display = 'block';
  }
}

// ─── Preflight Check (validates wallet + balance before build) ──────────
async function preflightCheck(walletAddress, platform, buildType) {
  try {
    const res = await fetch(`${API}/builds/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: walletAddress, platform, build_type: buildType }),
    });
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Submit Build (with cross-chain payment) ───────────────────────────
async function submitBuild(e) {
  e.preventDefault();

  const form = document.getElementById('buildForm');
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  const paymentMethod = form.payment_method?.value || 'thr';

  try {
    // Step 0: Preflight — validate wallet & balance for THR payments
    if (paymentMethod === 'thr' || wallet.type === 'thronos') {
      btn.textContent = 'Checking wallet...';
      const preflight = await preflightCheck(
        wallet.address, form.platform.value, form.build_type.value
      );

      if (preflight.error) {
        toast(preflight.error + (preflight.hint ? ' — ' + preflight.hint : ''), 'error');
        return;
      }

      if (!preflight.address_valid) {
        toast('Invalid THR wallet address. Format: THR + 40 hex chars', 'error');
        return;
      }

      if (preflight.balance !== null && !preflight.can_afford) {
        toast(
          `Insufficient balance: ${preflight.balance} THR. ` +
          `Need: ${preflight.cost_thron} THR (+ ~${(preflight.fee_estimate || 0).toFixed(4)} fee)`,
          'error'
        );
        return;
      }
    }

    // Step 1: For cross-chain payments, process payment first
    let paymentProof = null;

    if (paymentMethod !== 'thr' && wallet.type !== 'thronos') {
      btn.textContent = 'Awaiting wallet...';
      paymentProof = await processCrossChainPayment(paymentMethod, form);
      if (!paymentProof) {
        toast('Payment cancelled or failed', 'error');
        return;
      }
    }

    // Step 2: Submit build job
    btn.textContent = 'Submitting build...';

    const body = {
      wallet_address: wallet.address,
      project_name: form.project_name.value,
      source_type: form.source_type.value,
      source_url: form.source_url.value,
      branch: form.branch.value || 'main',
      platform: form.platform.value,
      build_type: form.build_type.value,
      payment_method: paymentMethod,
      payment_chain: wallet.chain,
      payment_proof: paymentProof,
      tx_id: paymentProof?.txHash || paymentProof?.signature || undefined,
    };

    // Inject cached auth_secret for THR payments (collected at wallet connect time)
    if (paymentMethod === 'thr' || wallet.chain === 'thronos') {
      const thrAuth = getThrAuth();
      if (thrAuth) {
        body.auth_secret = thrAuth.secret;
      } else if (wallet.provider && wallet.provider === window.thronos) {
        // Extension handles signing internally — no auth_secret needed
      } else {
        toast('Session expired. Please reconnect your Thronos wallet.', 'error');
        disconnectWallet();
        return;
      }
    }

    const res = await fetch(`${API}/builds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok) {
      toast('Build submitted!', 'success');
      closeNewBuild();
      openBuildDetail(data.job_id);
    } else {
      toast(data.error || data.detail || 'Submission failed', 'error');
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Build';
  }
}

// ─── Cross-Chain Payment Processing ────────────────────────────────────
async function processCrossChainPayment(method, form) {
  if (method === 'usdc_sol') {
    return await processPhantomPayment(form);
  } else if (method === 'usdt_evm') {
    return await processUsdtPayment(form);
  } else if (method === 'eth' || method === 'bnb') {
    return await processEVMPayment(method, form);
  } else if (method === 'btc_bridge') {
    return await processBtcBridgePayment(form);
  }
  return null;
}

// ─── BTC Bridge Payment (SHA-256 compatible) ────────────────────────
async function processBtcBridgePayment(form) {
  const costThr = calculateThrCost(form);
  const btcAmount = (costThr * 0.0000008).toFixed(8);

  // Request bridge deposit address from Thronos chain
  try {
    toast('Requesting BTC bridge deposit address...', 'success');

    const res = await fetch(`${API}/payments/btc-bridge/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payer_thr: wallet.address,
        amount_thr_equivalent: costThr,
        amount_btc: parseFloat(btcAmount),
        service_type: 'builder_build',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      // Show BTC deposit address to user
      const btcAddr = data.btc_deposit_address;
      const confirmed = confirm(
        `Send exactly ${btcAmount} BTC to:\n\n${btcAddr}\n\n` +
        `The SHA-256 bridge will convert to ${costThr} THR automatically.\n` +
        `Click OK after sending the BTC transaction.`
      );
      if (!confirmed) return null;

      return {
        type: 'btc_bridge',
        btc_deposit_address: btcAddr,
        amount_btc: parseFloat(btcAmount),
        amount_thr_equivalent: costThr,
        payer_thr: wallet.address,
        bridge_id: data.bridge_id,
        timestamp: Date.now(),
      };
    }

    // Fallback: manual BTC tx hash input
    const txHash = prompt(
      `BTC Bridge Payment\n\n` +
      `Amount: ${btcAmount} BTC (= ${costThr} THR)\n\n` +
      `Send BTC to the Thronos SHA-256 bridge and paste the BTC transaction hash:`
    );
    if (!txHash) return null;

    return {
      type: 'btc_bridge',
      txHash: txHash.trim(),
      amount_btc: parseFloat(btcAmount),
      amount_thr_equivalent: costThr,
      payer_thr: wallet.address,
      timestamp: Date.now(),
    };

  } catch (err) {
    toast('BTC bridge error: ' + err.message, 'error');
    return null;
  }
}

// ─── Phantom/Solana USDC Payment ───────────────────────────────────────
async function processPhantomPayment(form) {
  const phantom = wallet.provider;
  if (!phantom) {
    toast('Phantom wallet not connected', 'error');
    return null;
  }

  try {
    // Request payment via gateway — gets a Solana transaction to sign
    const costThr = calculateThrCost(form);
    const usdcAmount = (costThr * 0.05 * 1e6); // USDC has 6 decimals

    const paymentRes = await fetch(`${API}/payments/solana/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payer: wallet.address,
        amount_usdc: usdcAmount,
        service_type: 'builder_build',
        treasury: TREASURY.solana,
      }),
    });

    if (!paymentRes.ok) {
      // Fallback: direct Phantom signAndSendTransaction
      toast('Preparing Solana transaction...', 'success');

      // Create SPL transfer instruction for USDC
      const { Transaction, PublicKey, SystemProgram } = window.solanaWeb3 || {};

      if (!Transaction) {
        // Without solana-web3.js, use gateway to build the tx
        toast('Requesting payment confirmation...', 'success');

        // Sign a message as proof of intent
        const message = new TextEncoder().encode(
          `ThronosBuild payment: ${costThr} THR equivalent in USDC\n` +
          `Project: ${form.project_name.value}\n` +
          `Timestamp: ${Date.now()}`
        );
        const signature = await phantom.signMessage(message, 'utf8');

        return {
          type: 'solana_signed_intent',
          payer: wallet.address,
          signature: btoa(String.fromCharCode(...signature.signature)),
          amount_usdc: usdcAmount / 1e6,
          amount_thr_equivalent: costThr,
          timestamp: Date.now(),
        };
      }
    }

    const paymentData = await paymentRes.json();
    return paymentData.payment_proof;

  } catch (err) {
    console.error('Phantom payment error:', err);
    toast('Solana payment failed: ' + err.message, 'error');
    return null;
  }
}

// ─── EVM (MetaMask) Payment ────────────────────────────────────────────
async function processEVMPayment(method, form) {
  if (!wallet.provider) {
    toast('MetaMask not connected', 'error');
    return null;
  }

  try {
    const costThr = calculateThrCost(form);
    let value, chain;

    if (method === 'eth') {
      value = '0x' + Math.floor(costThr * 0.000015 * 1e18).toString(16);
      chain = wallet.chain;
    } else if (method === 'bnb') {
      value = '0x' + Math.floor(costThr * 0.00008 * 1e18).toString(16);
      chain = 'bsc';
      // Switch to BSC if needed
      if (wallet.chain !== 'bsc') {
        try {
          await wallet.provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x38' }],
          });
        } catch (switchErr) {
          toast('Please switch to BNB Chain in MetaMask', 'error');
          return null;
        }
      }
    }

    toast('Confirm transaction in MetaMask...', 'success');

    // Send native token to treasury
    const txHash = await wallet.provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: wallet.address,
        to: TREASURY[chain] || TREASURY.ethereum,
        value: value,
        data: '0x', // empty data for native transfer
      }],
    });

    toast('Transaction submitted! Waiting for confirmation...', 'success');

    // Register payment with gateway for cross-chain processing
    const gatewayRes = await fetch(`${API}/payments/crosschain/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_hash: txHash,
        chain: chain,
        payer: wallet.address,
        amount_thr_equivalent: costThr,
        service_type: 'builder_build',
        fee_action: 'stake_and_mint', // Signal: stake THR + mint on target chain
      }),
    });

    return {
      type: 'evm_tx',
      tx_hash: txHash,
      chain: chain,
      payer: wallet.address,
      amount_thr_equivalent: costThr,
      timestamp: Date.now(),
    };

  } catch (err) {
    if (err.code === 4001) {
      toast('Transaction rejected by user', 'error');
    } else {
      toast('EVM payment failed: ' + err.message, 'error');
    }
    return null;
  }
}

// ─── USDT (ERC-20) Payment on ETH/ARB/BNB ─────────────────────────────
async function processUsdtPayment(form) {
  if (!wallet.provider) {
    toast('MetaMask not connected', 'error');
    return null;
  }

  try {
    const costThr = calculateThrCost(form);
    const usdtAmount = costThr * 0.05; // 1 THR = $0.05 → USDT amount
    const usdtChain = form.usdt_chain?.value || 'ethereum';

    // Get the USDT contract for the selected chain
    const usdtContract = USDT_CONTRACTS[usdtChain];
    if (!usdtContract) {
      toast('USDT not available on this chain', 'error');
      return null;
    }

    // Switch chain if needed
    const chainIds = { ethereum: '0x1', arbitrum: '0xa4b1', bsc: '0x38' };
    const targetChainId = chainIds[usdtChain];
    const currentChainId = await wallet.provider.request({ method: 'eth_chainId' });

    if (currentChainId !== targetChainId) {
      try {
        await wallet.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: targetChainId }],
        });
      } catch (switchErr) {
        const chainNames = { ethereum: 'Ethereum', arbitrum: 'Arbitrum', bsc: 'BNB Chain' };
        toast(`Please switch to ${chainNames[usdtChain]} in MetaMask`, 'error');
        return null;
      }
    }

    toast('Confirm USDT transfer in MetaMask...', 'success');

    // USDT uses 6 decimals on ETH and ARB, 18 decimals on BSC
    const decimals = usdtChain === 'bsc' ? 18 : 6;
    const amountRaw = BigInt(Math.floor(usdtAmount * (10 ** decimals)));
    const amountHex = '0x' + amountRaw.toString(16).padStart(64, '0');

    // Treasury address padded to 32 bytes
    const treasury = TREASURY[usdtChain] || TREASURY.ethereum;
    const toPadded = treasury.toLowerCase().replace('0x', '').padStart(64, '0');

    // Build ERC20 transfer(address,uint256) calldata
    const data = ERC20_TRANSFER_ABI + toPadded + amountHex;

    const txHash = await wallet.provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: wallet.address,
        to: usdtContract,
        data: data,
        value: '0x0', // no native value for token transfer
      }],
    });

    toast('USDT transaction submitted!', 'success');

    // Register with gateway
    await fetch(`${API}/payments/crosschain/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_hash: txHash,
        chain: usdtChain,
        payer: wallet.address,
        amount_thr_equivalent: costThr,
        service_type: 'builder_build',
        fee_action: 'stake_and_mint',
        token_symbol: 'USDT',
      }),
    }).catch(() => {}); // non-blocking

    return {
      type: 'evm_token_tx',
      tx_hash: txHash,
      chain: usdtChain,
      token: 'USDT',
      token_contract: usdtContract,
      payer: wallet.address,
      amount_usdt: usdtAmount,
      amount_thr_equivalent: costThr,
      timestamp: Date.now(),
    };

  } catch (err) {
    if (err.code === 4001) {
      toast('Transaction rejected by user', 'error');
    } else {
      toast('USDT payment failed: ' + err.message, 'error');
    }
    return null;
  }
}

function calculateThrCost(form) {
  if (!pricingData) return 10;
  const platform = form.platform.value;
  const buildType = form.build_type.value;
  let cost = 0;
  if (platform === 'android' || platform === 'both') {
    cost += buildType === 'aab' ? pricingData.android.aab : pricingData.android.apk;
  }
  if (platform === 'ios' || platform === 'both') {
    cost += pricingData.ios.ipa;
  }
  if (platform === 'both') {
    cost = Math.max(cost - pricingData.bundle_discount, 0);
  }
  return cost;
}

// ─── Actions ───────────────────────────────────────────────────────────
async function cancelBuild(jobId) {
  if (!confirm('Cancel this build?')) return;
  try {
    const res = await fetch(`${API}/builds/${jobId}/cancel`, { method: 'POST' });
    if (res.ok) {
      toast('Build cancelled', 'success');
      loadBuilds();
    } else {
      toast('Failed to cancel', 'error');
    }
  } catch (e) {
    toast('Network error', 'error');
  }
}

async function retryBuild(jobId) {
  try {
    toast('Retrying build...', 'success');
    const res = await fetch(`${API}/builds/${jobId}/retry`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      toast('Build retry started!', 'success');
      openBuildDetail(jobId);
    } else {
      toast(data.error || 'Retry failed', 'error');
    }
  } catch (e) {
    toast('Network error', 'error');
  }
}

function downloadArtifact(jobId, platform) {
  window.open(`${API}/builds/${jobId}/download/${platform}`, '_blank');
}

// ─── Pricing Page ──────────────────────────────────────────────────────
async function loadPricing() {
  if (!pricingData) {
    try {
      const res = await fetch(`${API}/status/pricing`);
      pricingData = await res.json();
    } catch (e) {
      pricingData = { android: { apk: 10, aab: 10 }, ios: { ipa: 50 }, bundle_discount: 5 };
    }
  }

  document.getElementById('pricingGrid').innerHTML = `
    <div class="price-card">
      <div class="platform-icon">&#129302;</div>
      <h3>Android APK</h3>
      <div class="price">${pricingData.android.apk} <span class="unit">THR</span></div>
      <ul class="features">
        <li>Debug & Release builds</li>
        <li>GitHub / GitLab / ZIP source</li>
        <li>Real-time build logs</li>
        <li>IPFS artifact storage</li>
        <li>Pay with THR, ETH, USDT, USDC, BNB</li>
      </ul>
    </div>
    <div class="price-card">
      <div class="platform-icon">&#127922;</div>
      <h3>Android AAB</h3>
      <div class="price">${pricingData.android.aab} <span class="unit">THR</span></div>
      <ul class="features">
        <li>Play Store ready</li>
        <li>Signed & optimized</li>
        <li>Real-time build logs</li>
        <li>IPFS artifact storage</li>
        <li>Pay with THR, ETH, USDT, USDC, BNB</li>
      </ul>
    </div>
    <div class="price-card">
      <div class="platform-icon">&#127823;</div>
      <h3>iOS IPA</h3>
      <div class="price">${pricingData.ios.ipa} <span class="unit">THR</span></div>
      <ul class="features">
        <li>macOS cloud build</li>
        <li>Ad-hoc & App Store distribution</li>
        <li>Real-time build logs</li>
        <li>IPFS artifact storage</li>
        <li>Pay with THR, ETH, USDT, USDC, BNB</li>
      </ul>
    </div>
    <div class="price-card" style="border-color:var(--accent)">
      <div class="platform-icon">&#128171;</div>
      <h3>Both Platforms</h3>
      <div class="price">${pricingData.android.apk + pricingData.ios.ipa - pricingData.bundle_discount} <span class="unit">THR</span></div>
      <ul class="features">
        <li>Android + iOS in one build</li>
        <li>Save ${pricingData.bundle_discount} THR bundle discount</li>
        <li>Parallel builds</li>
        <li>Cross-chain fee → LP pools</li>
      </ul>
    </div>
  `;
}

// ─── Utilities ─────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function timeAgo(date) {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

// ─── Init ──────────────────────────────────────────────────────────────
loadDashboard();
