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
  thronos:  { name: 'ThronosChain', symbol: 'THR',  color: '#7c3aed' },
  ethereum: { name: 'Ethereum',     symbol: 'ETH',  color: '#627eea' },
  solana:   { name: 'Solana',       symbol: 'SOL',  color: '#9945FF' },
  bsc:      { name: 'BSC',          symbol: 'BNB',  color: '#F3BA2F' },
};

// ─── Utilities ────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4000);
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.navbar-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === name);
  });
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
}

function setWalletConnected(address, type, chain) {
  wallet = { address, type, chain };
  const btn = document.getElementById('connectWallet');
  const badge = document.getElementById('chainBadge');
  const short = address.length > 12 ? address.slice(0, 8) + '...' + address.slice(-4) : address;
  btn.textContent = short;
  btn.classList.add('connected');
  if (badge) {
    badge.textContent = chain || type;
    badge.style.display = 'inline-flex';
  }
  closeWalletModal();
}

function getThrAuth() {
  try {
    const raw = sessionStorage.getItem('thr_auth');
    if (!raw) return null;
    const data = JSON.parse(atob(raw));
    if (Date.now() - data.t > 30 * 60 * 1000) { sessionStorage.removeItem('thr_auth'); return null; }
    return { address: data.a, secret: data.s };
  } catch { return null; }
}

// ─── API helpers ──────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function preflightCheck(address, platform, buildType, paymentMethod) {
  try {
    const res = await fetch(`${API}/builds/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address, platform, build_type: buildType, payment_method: paymentMethod }),
    });
    return await res.json();
  } catch { return { error: 'Network error during preflight check' }; }
}

// ─── Pricing ──────────────────────────────────────────────────────────
async function loadPricing() {
  try {
    const { ok, data } = await apiFetch('/status/pricing');
    if (ok && data) { pricingData = data; renderPricingPage(); }
  } catch (_) {}
}

function calcCost(platform, buildType) {
  const p = getSafePricing(pricingData);
  const bt = normalizeBuildType(buildType);
  if (platform === 'both') return (p.android[bt] || p.android.apk) + p.ios.ipa - p.bundle_discount;
  if (platform === 'ios')  return p.ios.ipa;
  return p.android[bt] || p.android.apk;
}

async function updateCost() {
  const form    = document.getElementById('buildForm');
  const preview = document.getElementById('costPreview');
  const feeInfo = document.getElementById('feeInfo');
  const floorNotice = document.getElementById('floorNotice');
  if (!form || !preview) return;

  const paymentMethod = form.payment_method.value;
  const platform      = form.platform.value;
  const buildType     = form.build_type.value;

  if (paymentMethod === 'thr' || paymentMethod === 'thronos') {
    const cost = calcCost(platform, buildType);
    preview.textContent = `${cost} THR`;
    if (feeInfo) feeInfo.style.display = 'none';
    if (floorNotice) floorNotice.style.display = 'none';
    currentQuote = { native_cost_thr: cost };
    return;
  }

  // Cross-chain: fetch a live quote from the backend
  try {
    preview.textContent = 'Fetching price...';
    const body = { payment_method: paymentMethod, platform, build_type: buildType };
    if (paymentMethod === 'usdt_evm') {
      const chain = form.usdt_chain?.value || 'ethereum';
      body.payment_chain = chain;
    }
    const res = await fetch(`${API}/builds/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Pricing unavailable');

    currentQuote = data;
    const symbol = data.payment_token || paymentMethod.toUpperCase();
    const amount = data.external_amount || data.quoted_amount || '?';
    const floor  = data.floor_applied || false;
    preview.textContent = `${amount} ${symbol}`;
    if (feeInfo) { feeInfo.style.display = 'block'; }
    if (floorNotice) floorNotice.style.display = floor ? 'block' : 'none';
  } catch (e) {
    preview.textContent = 'Price unavailable';
    currentQuote = null;
    if (feeInfo) feeInfo.style.display = 'none';
  }
}

function renderPricingPage() {
  const grid = document.getElementById('pricingGrid');
  if (!grid) return;
  const p = getSafePricing(pricingData);
  const plans = [
    { name: 'Android APK', icon: '&#9650;', price: p.android.apk, features: ['Debug or Release APK','Flutter, React Native, Expo','Capacitor, Gradle, Unity','7-day artifact retention'] },
    { name: 'Android AAB', icon: '&#9670;', price: p.android.aab, features: ['Play Store bundle','Optimized delivery','Flutter, React Native, Expo','7-day artifact retention'] },
    { name: 'iOS IPA', icon: '&#9651;', price: p.ios.ipa, features: ['Ad-Hoc / Enterprise IPA','Requires signing config','React Native, Expo, Flutter','7-day artifact retention'] },
    { name: 'Android + iOS', icon: '&#9632;', price: p.android.apk + p.ios.ipa - p.bundle_discount, features: [`Android APK + iOS IPA in one build`, `Save ${p.bundle_discount} THR bundle discount`, 'All frameworks', '7-day artifact retention'] },
  ];
  grid.innerHTML = plans.map(pl => `
    <div class="pricing-card">
      <div class="pc-icon">${pl.icon}</div>
      <h3>${pl.name}</h3>
      <div class="pc-price">${pl.price} <span class="pc-unit">THR</span></div>
      <ul>${pl.features.map(f => `<li>${f}</li>`).join('')}</ul>
      <button class="btn btn-primary" onclick="openNewBuild()">Build Now</button>
    </div>
  `).join('');
}

// ─── Stats ────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const { ok, data } = await apiFetch('/status/stats');
    if (!ok) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '-'; };
    set('statTotal',   data.total_builds   ?? data.builds_total   ?? '-');
    set('statSuccess', data.builds_success ?? data.successful     ?? '-');
    set('statBuilding',data.builds_running ?? data.in_progress    ?? '-');
    set('statSpent',   data.total_thr_spent ?? '-');
  } catch (_) {}
}

// ─── Builds List ──────────────────────────────────────────────────────
async function loadBuilds() {
  try {
    const { ok, data } = await apiFetch('/builds');
    if (!ok) return;
    renderBuilds(Array.isArray(data) ? data : (data.builds || []));
  } catch (_) {}
}

function renderBuilds(builds) {
  const list  = document.getElementById('buildsList');
  const empty = document.getElementById('emptyState');
  if (!list) return;
  if (!builds.length) { if (empty) empty.style.display = 'flex'; return; }
  if (empty) empty.style.display = 'none';
  list.innerHTML = builds.map(b => {
    const statusClass = { completed: 'success', failed: 'error', building: 'building', queued: 'queued' }[b.status] || '';
    const time = b.created_at ? new Date(b.created_at).toLocaleString() : '-';
    return `
      <div class="build-card" onclick="openBuildDetail('${b.job_id}')">
        <div class="bc-header">
          <span class="bc-name">${b.project_name || b.job_id}</span>
          <span class="badge badge-${statusClass}">${b.status}</span>
        </div>
        <div class="bc-meta">
          <span>${b.platform || '-'} / ${b.build_type || '-'}</span>
          <span>${time}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Build Detail ─────────────────────────────────────────────────────
async function openBuildDetail(jobId) {
  showPage('detail');
  document.getElementById('detailTitle').textContent = jobId;
  const console_ = document.getElementById('buildConsole');
  console_.innerHTML = '<div class="log-line">Loading...</div>';

  try {
    const { ok, data } = await apiFetch(`/builds/${jobId}`);
    if (!ok) throw new Error(data.error || 'Failed to load build');
    document.getElementById('detailTitle').textContent = data.project_name || jobId;
    const statusClass = { completed: 'success', failed: 'error', building: 'building', queued: 'queued' }[data.status] || '';
    document.getElementById('detailBadge').className = `badge badge-${statusClass}`;
    document.getElementById('detailBadge').textContent = data.status;
    renderDetailGrid(data);
    renderDetailActions(data);
    streamLogs(jobId, data.status);
  } catch (e) { toast(e.message, 'error'); }
}

function renderDetailGrid(b) {
  const grid = document.getElementById('detailGrid');
  if (!grid) return;
  const rows = [
    ['Platform', b.platform], ['Build Type', b.build_type],
    ['Payment', b.payment_method], ['Cost', b.cost_thr ? `${b.cost_thr} THR` : '-'],
    ['Created', b.created_at ? new Date(b.created_at).toLocaleString() : '-'],
    ['Completed', b.completed_at ? new Date(b.completed_at).toLocaleString() : '-'],
  ];
  grid.innerHTML = rows.map(([k, v]) => `<div class="detail-row"><span class="dr-key">${k}</span><span class="dr-val">${v || '-'}</span></div>`).join('');
}

function renderDetailActions(b) {
  const el = document.getElementById('detailActions');
  if (!el) return;
  const btns = [];
  if (b.status === 'completed') {
    if (b.platform === 'android' || b.platform === 'both') btns.push(`<a class="btn btn-primary" href="${API}/builds/${b.job_id}/download/android">Download APK</a>`);
    if (b.platform === 'ios'     || b.platform === 'both') btns.push(`<a class="btn btn-primary" href="${API}/builds/${b.job_id}/download/ios">Download IPA</a>`);
  }
  if (b.status === 'failed') btns.push(`<button class="btn btn-secondary" onclick="retryBuild('${b.job_id}')">Retry</button>`);
  if (['queued','building'].includes(b.status)) btns.push(`<button class="btn btn-danger" onclick="cancelBuild('${b.job_id}')">Cancel</button>`);
  el.innerHTML = btns.join(' ');
}

async function retryBuild(jobId) {
  const { ok, data } = await apiFetch(`/builds/${jobId}/retry`, { method: 'POST' });
  if (ok) { toast('Build retried', 'success'); openBuildDetail(jobId); }
  else toast(data.error || 'Retry failed', 'error');
}

async function cancelBuild(jobId) {
  const { ok, data } = await apiFetch(`/builds/${jobId}/cancel`, { method: 'POST' });
  if (ok) { toast('Build cancelled', 'success'); openBuildDetail(jobId); }
  else toast(data.error || 'Cancel failed', 'error');
}

function streamLogs(jobId, status) {
  const console_ = document.getElementById('buildConsole');
  const live      = document.getElementById('liveIndicator');
  if (currentWs) { currentWs.close(); currentWs = null; }

  if (['completed','failed','cancelled'].includes(status)) {
    if (live) live.style.display = 'none';
    apiFetch(`/builds/${jobId}/logs`).then(({ ok, data }) => {
      if (!ok) return;
      const logs = Array.isArray(data) ? data : (data.logs || []);
      console_.innerHTML = logs.map(l => `<div class="log-line">${escHtml(l)}</div>`).join('') || '<div class="log-line">No logs available.</div>';
    });
    return;
  }

  if (live) live.style.display = 'inline-flex';
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1/builds/${jobId}/logs/ws`;
  try {
    const ws = new WebSocket(wsUrl);
    currentWs = ws;
    console_.innerHTML = '';
    ws.onmessage = e => {
      const line = document.createElement('div');
      line.className = 'log-line';
      line.textContent = e.data;
      console_.appendChild(line);
      console_.scrollTop = console_.scrollHeight;
    };
    ws.onclose = () => {
      if (live) live.style.display = 'none';
      currentWs = null;
    };
    ws.onerror = () => ws.close();
  } catch (_) { if (live) live.style.display = 'none'; }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── New Build Modal ──────────────────────────────────────────────────
function openNewBuild() {
  document.getElementById('newBuildModal').classList.add('active');
  updateCost();
}
function closeNewBuild() {
  document.getElementById('newBuildModal').classList.remove('active');
  document.getElementById('buildForm').reset();
  currentQuote = null;
  toggleZipMode(false);
}

function toggleZipMode(isZip) {
  document.getElementById('sourceUrlGroup').style.display  = isZip ? 'none' : '';
  document.getElementById('zipFileGroup').style.display    = isZip ? ''     : 'none';
  document.getElementById('zipMetaGroup').style.display    = isZip ? ''     : 'none';
  document.getElementById('branchGroup').style.display     = isZip ? 'none' : '';
  const urlInput = document.getElementById('sourceUrlInput');
  if (urlInput) urlInput.required = !isZip;
}

// ─── ZIP Upload ───────────────────────────────────────────────────────
async function uploadZip(file, paymentBody) {
  const fd = new FormData();
  fd.append('file', file);
  Object.entries(paymentBody).forEach(([k, v]) => v != null && fd.append(k, v));
  const res  = await fetch(`${API}/uploads/project-zip`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.detail || 'Upload failed');
  return data; // { zip_id, ... }
}

// ─── Payment helpers ──────────────────────────────────────────────────
async function _attachThrPayment(body, paymentMethod) {
  if (paymentMethod !== 'thr' && paymentMethod !== 'thronos') return;

  const bridge = window.ThronosBuilderWallet;

  if (bridge && bridge.isConnected()) {
    const to = currentQuote?.treasury_address || '';
    const amount = currentQuote?.native_cost_thr || 0;
    try {
      const payResult = await bridge.pay({ to, amount });
      if (payResult.ok && payResult.tx_id) {
        body.tx_id = payResult.tx_id;
        body.payment_method = 'thr';
        return;
      }
      if (payResult.ok && payResult.auth_secret) {
        body.auth_secret = payResult.auth_secret;
        return;
      }
    } catch (_) { /* fall through to legacy */ }
  }

  // Fallback: legacy sessionStorage
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_btc: btcAmount, quote_id: currentQuote.quote_id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'BTC bridge prep failed');
    const confirmed = confirm(`Send exactly ${btcAmount} BTC to:\n${data.deposit_address}\n\nClick OK after your transaction is confirmed.`);
    if (!confirmed) return null;
    return { tx_id: data.pending_tx_id || null, deposit_address: data.deposit_address };
  } catch (e) { toast(e.message, 'error'); return null; }
}

async function processPhantomPayment(form) {
  if (!window.solana?.isPhantom) { toast('Phantom wallet not detected', 'error'); return null; }
  if (!currentQuote) { toast('No pricing quote available', 'error'); return null; }
  try {
    const provider = window.solana;
    if (!provider.isConnected) await provider.connect();
    const solAddress = provider.publicKey?.toString();
    if (!solAddress) throw new Error('Phantom not connected');
    const quoteId  = currentQuote.quote_id;
    const amount   = currentQuote.external_amount;
    const toAddr   = currentQuote.payment_address;
    if (!toAddr) throw new Error('No payment address in quote');
    const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = window.solanaWeb3 || {};
    if (!Connection) throw new Error('solana/web3.js not loaded');
    const conn    = new Connection('https://api.mainnet-beta.solana.com');
    const fromPK  = new PublicKey(solAddress);
    const toPK    = new PublicKey(toAddr);
    const lamports = Math.round(amount * LAMPORTS_PER_SOL);
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: fromPK, toPubkey: toPK, lamports }));
    tx.feePayer  = fromPK;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    const signed = await provider.signTransaction(tx);
    const txId   = await conn.sendRawTransaction(signed.serialize());
    return { tx_id: txId, quote_id: quoteId };
  } catch (e) { toast(e.message || 'Phantom payment failed', 'error'); return null; }
}

async function processUsdtPayment(form) {
  const chain = form.usdt_chain?.value || 'ethereum';
  return await processEVMPayment('usdt', form, chain);
}

async function processEVMPayment(method, form, chain) {
  if (!window.ethereum) { toast('MetaMask not detected', 'error'); return null; }
  if (!currentQuote)    { toast('No pricing quote available', 'error'); return null; }
  try {
    const accounts  = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const from      = accounts[0];
    const to        = currentQuote.payment_address;
    const amount    = currentQuote.external_amount;
    const quoteId   = currentQuote.quote_id;
    if (!to) throw new Error('No payment address in quote');
    const { ethers } = window;
    if (!ethers) throw new Error('ethers.js not loaded');
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    let tx;
    if (method === 'usdt') {
      const USDT_ADDR = currentQuote.token_contract;
      if (!USDT_ADDR) throw new Error('USDT contract address not in quote');
      const erc20 = new ethers.Contract(USDT_ADDR, ['function transfer(address,uint256) returns(bool)'], signer);
      const decimals = 6;
      const amt = ethers.parseUnits(String(amount), decimals);
      tx = await erc20.transfer(to, amt);
    } else {
      tx = await signer.sendTransaction({ to, value: ethers.parseEther(String(amount)) });
    }
    return { tx_id: tx.hash, quote_id: quoteId };
  } catch (e) { toast(e.message || 'EVM payment failed', 'error'); return null; }
}

// ─── Build Submission ─────────────────────────────────────────────────
async function submitBuild(event) {
  event.preventDefault();
  const form = event.target;
  const btn  = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const paymentMethod = form.payment_method.value;
    const isZip = form.source_type.value === 'zip';

    // ── ZIP Upload flow ───────────────────────────────────────────────
    if (isZip) {
      const zipFile = form.project_zip?.files?.[0];
      if (!zipFile) { toast('Please select a ZIP file', 'error'); return; }
      btn.textContent = 'Uploading...';

      const payBody = {
        project_name:   form.project_name.value,
        platform:       form.platform.value,
        build_type:     normalizeBuildType(form.build_type.value),
        payment_method: paymentMethod,
        project_type:   form.project_type?.value || 'auto',
        project_path:   form.project_path?.value || '',
        quote_id:       currentQuote?.quote_id || null,
      };
      await _attachThrPayment(payBody, paymentMethod);

      try {
        const uploadData = await uploadZip(zipFile, payBody);
        if (uploadData.job_id) {
          toast('Build submitted!', 'success'); closeNewBuild(); openBuildDetail(uploadData.job_id);
        } else {
          throw new Error(uploadData.error || 'Upload returned no job_id');
        }
      } catch (e) { toast(e.message, 'error'); }
      return;
    }

    // ── THR-native ZIP-less flow (for THR payment via bridge) ──────────
    if ((paymentMethod === 'thr' || paymentMethod === 'thronos') && wallet.type === 'thronos' && !isZip) {
      btn.textContent = 'Processing payment...';
      const body = {
        project_name:  form.project_name.value,
        source_url:    form.source_url?.value || '',
        branch:        form.branch?.value || 'main',
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
        toast(`Insufficient THR balance. Need ${preflight.required_thr}, have ${preflight.balance}.`, 'error');
        return;
      }
    }

    // Process cross-chain payment first
    let crossChainResult = null;
    if (isCrossChain) {
      btn.textContent = 'Processing payment...';
      crossChainResult = await processCrossChainPayment(paymentMethod, form);
      if (!crossChainResult) return; // User cancelled or payment failed
    }

    btn.textContent = 'Submitting build...';
    const body = {
      project_name:  form.project_name.value,
      source_url:    form.source_url?.value || '',
      branch:        form.branch?.value || 'main',
      platform:      form.platform.value,
      build_type:    normalizeBuildType(form.build_type.value),
      payment_method: paymentMethod,
      payment_chain: wallet.chain || null,
      wallet_address: wallet.address || null,
      quote_id:      currentQuote?.quote_id || null,
    };

    if (isCrossChain && crossChainResult) {
      body.tx_id    = crossChainResult.tx_id;
      body.quote_id = crossChainResult.quote_id || body.quote_id;
    } else {
      await _attachThrPayment(body, paymentMethod);
    }

    const res  = await fetch(`${API}/builds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) { toast('Build submitted!', 'success'); closeNewBuild(); openBuildDetail(data.job_id); }
    else toast(data.error || data.detail || 'Submission failed', 'error');

  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Build';
  }
}

// ─── Wallet Connect ───────────────────────────────────────────────────
function openWalletModal() {
  document.getElementById('walletModal').classList.add('active');
}
function closeWalletModal() {
  document.getElementById('walletModal').classList.remove('active');
}

async function connectThronosWallet() {
  const bridge = window.ThronosBuilderWallet;
  if (!bridge) { toast('Thronos Wallet bridge not loaded', 'error'); return; }

  // 1. Try auto-detect (walletSession already present)
  const auto = bridge.autoConnect();
  if (auto.ok) {
    setWalletConnected(auto.address, 'thronos', 'ThronosChain');
    toast('Thronos Wallet connected (auto)', 'success');
    return;
  }

  // 2. Try sessionStorage
  const stored = bridge.getStoredSession();
  if (stored) {
    const r = bridge.connectWithSecret(stored.address, stored.secret);
    if (r.ok) {
      setWalletConnected(r.address, 'thronos', 'ThronosChain');
      toast('Thronos Wallet restored from session', 'success');
      return;
    }
  }

  // 3. Show connect modal
  showThronosConnectModal();
}

function showThronosConnectModal() {
  // Close the wallet picker and show the Thronos-specific connect modal
  closeWalletModal();

  // Build inline modal
  const existing = document.getElementById('thrConnectModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'thrConnectModal';
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal" style="max-width:420px">
      <h2>Connect Thronos Wallet</h2>
      <div class="thr-tabs" style="display:flex;gap:8px;margin-bottom:16px">
        <button id="thrTabSecret" class="btn btn-primary" style="flex:1" onclick="switchThrTab('secret')">Address + Secret</button>
        <button id="thrTabKey" class="btn btn-secondary" style="flex:1" onclick="switchThrTab('key')">Import Signing Key</button>
      </div>

      <div id="thrPanelSecret">
        <div class="form-group">
          <label>THR Address</label>
          <input type="text" id="thrAddress" placeholder="THR..." style="width:100%;box-sizing:border-box">
        </div>
        <div class="form-group">
          <label>Send Secret</label>
          <input type="password" id="thrSecret" placeholder="Your send secret" style="width:100%;box-sizing:border-box">
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('thrConnectModal').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="submitThronosSecret()">Connect</button>
        </div>
      </div>

      <div id="thrPanelKey" style="display:none">
        <div class="form-group">
          <label>Hex Private Key</label>
          <input type="password" id="thrPrivKey" placeholder="64-char hex key (no 0x prefix)" style="width:100%;box-sizing:border-box">
          <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">Key is used to sign the payment locally. It is never sent to ThronosBuild servers.</p>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('thrConnectModal').remove()">Cancel</button>
          <button class="btn btn-primary" id="thrKeyBtn" onclick="submitThronosKeyImport()">Import &amp; Connect</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function switchThrTab(tab) {
  document.getElementById('thrPanelSecret').style.display = tab === 'secret' ? '' : 'none';
  document.getElementById('thrPanelKey').style.display    = tab === 'key'    ? '' : 'none';
  document.getElementById('thrTabSecret').className = tab === 'secret' ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('thrTabKey').className    = tab === 'key'    ? 'btn btn-primary' : 'btn btn-secondary';
}

function submitThronosSecret() {
  const bridge  = window.ThronosBuilderWallet;
  const address = document.getElementById('thrAddress')?.value?.trim();
  const secret  = document.getElementById('thrSecret')?.value?.trim();
  if (!address || !secret) { toast('Address and secret are required', 'error'); return; }
  const r = bridge.connectWithSecret(address, secret);
  if (!r.ok) { toast('Invalid address or secret: ' + r.reason, 'error'); return; }
  bridge.storeSession(address, secret);
  document.getElementById('thrConnectModal')?.remove();
  setWalletConnected(r.address, 'thronos', 'ThronosChain');
  toast('Thronos Wallet connected', 'success');
}

async function submitThronosKeyImport() {
  const bridge = window.ThronosBuilderWallet;
  const hexKey = document.getElementById('thrPrivKey')?.value?.trim();
  if (!hexKey) { toast('Private key required', 'error'); return; }
  const btn = document.getElementById('thrKeyBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Deriving address...'; }
  try {
    const r = await bridge.connectWithPrivateKey(hexKey);
    if (!r.ok) { toast('Key import failed: ' + r.reason, 'error'); return; }
    document.getElementById('thrConnectModal')?.remove();
    setWalletConnected(r.address, 'thronos', 'ThronosChain');
    toast('Signing key imported. Address: ' + r.address, 'success');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Import & Connect'; }
  }
}

async function connectMetaMask() {
  if (!window.ethereum) { toast('MetaMask not detected. Please install it.', 'error'); return; }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts[0]) throw new Error('No account returned');
    setWalletConnected(accounts[0], 'metamask', 'Ethereum');
    wallet.chain = 'ethereum';
    toast('MetaMask connected', 'success');
  } catch (e) { toast(e.message || 'MetaMask connection failed', 'error'); }
}

async function connectPhantom() {
  if (!window.solana?.isPhantom) { toast('Phantom not detected. Please install it.', 'error'); return; }
  try {
    const resp = await window.solana.connect();
    const addr = resp.publicKey.toString();
    setWalletConnected(addr, 'phantom', 'Solana');
    wallet.chain = 'solana';
    toast('Phantom connected', 'success');
  } catch (e) { toast(e.message || 'Phantom connection failed', 'error'); }
}

async function connectManualWallet() {
  const input = document.getElementById('manualWalletInput');
  const addr  = input?.value?.trim();
  if (!addr) { toast('Please enter a wallet address', 'error'); return; }
  let type = 'unknown', chain = 'unknown';
  if (/^THR[0-9a-fA-F]{40}$/.test(addr))        { type = 'thronos'; chain = 'ThronosChain'; }
  else if (/^0x[0-9a-fA-F]{40}$/.test(addr))    { type = 'evm';     chain = 'Ethereum'; }
  else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) { type = 'solana'; chain = 'Solana'; }
  setWalletConnected(addr, type, chain);
  toast(`Wallet connected (${chain})`, 'success');
}

// ─── Payment method UI ────────────────────────────────────────────────
function initPaymentMethodUI() {
  const methods = document.querySelectorAll('.payment-option');
  methods.forEach(opt => {
    opt.addEventListener('click', () => {
      const method = opt.dataset.method;
      if (!method) return;
      document.querySelectorAll('[data-method]').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const usdtSel = document.getElementById('usdtChainSelect');
      if (usdtSel) usdtSel.style.display = method === 'usdt_evm' ? 'block' : 'none';
      updateCost();
    });
  });

  const usdtChains = document.querySelectorAll('[data-usdtchain]');
  usdtChains.forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('[data-usdtchain]').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      updateCost();
    });
  });

  const sourceType = document.getElementById('sourceTypeSelect');
  if (sourceType) {
    sourceType.addEventListener('change', () => toggleZipMode(sourceType.value === 'zip'));
  }
}

// ─── Public config ────────────────────────────────────────────────────
async function loadPublicConfig() {
  try {
    const { ok, data } = await apiFetch('/status/config');
    if (ok && data) publicConfig = data;
  } catch (_) {}
}

// ─── Init ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Nav
  document.querySelectorAll('.navbar-links a').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); showPage(a.dataset.page); });
  });

  // Wallet button
  document.getElementById('connectWallet')?.addEventListener('click', () => {
    if (wallet.address) {
      if (confirm('Disconnect wallet?')) {
        wallet = { address: null, type: null, chain: null, provider: null };
        const btn   = document.getElementById('connectWallet');
        const badge = document.getElementById('chainBadge');
        if (btn)   { btn.textContent = 'Connect Wallet'; btn.classList.remove('connected'); }
        if (badge) badge.style.display = 'none';
        window.ThronosBuilderWallet?.disconnect();
      }
    } else { openWalletModal(); }
  });

  // New Build button
  document.getElementById('newBuildBtn')?.addEventListener('click', openNewBuild);

  // Init UI components
  initPaymentMethodUI();

  // Load data
  await Promise.all([loadPricing(), loadStats(), loadBuilds(), loadPublicConfig()]);

  // Auto-restore Thronos wallet from session storage
  const bridge = window.ThronosBuilderWallet;
  if (bridge) {
    const stored = bridge.getStoredSession();
    if (stored) {
      const r = bridge.connectWithSecret(stored.address, stored.secret);
      if (r.ok) setWalletConnected(r.address, 'thronos', 'ThronosChain');
    }
  }
});
