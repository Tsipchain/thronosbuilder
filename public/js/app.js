/* ─── ThronosBuild Dashboard ─────────────────────────────────────────── */

const API = '/api/v1';
let walletAddress = null;
let pricingData = null;
let currentWs = null;

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

  // Hide other pages
  document.querySelectorAll('.page').forEach(p => {
    if (p.id !== 'page-' + page) p.style.display = 'none';
  });

  if (page === 'dashboard') loadDashboard();
  if (page === 'pricing') loadPricing();
}

// Initialize
document.querySelectorAll('.page').forEach(p => {
  if (!p.classList.contains('active')) p.style.display = 'none';
});

// ─── Wallet Connection ─────────────────────────────────────────────────
document.getElementById('connectWallet').addEventListener('click', connectWallet);

async function connectWallet() {
  if (walletAddress) {
    walletAddress = null;
    document.getElementById('connectWallet').textContent = 'Connect Wallet';
    document.getElementById('connectWallet').classList.remove('connected');
    toast('Wallet disconnected');
    return;
  }

  if (typeof window.ethereum !== 'undefined') {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      walletAddress = accounts[0];
      const short = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
      document.getElementById('connectWallet').textContent = short;
      document.getElementById('connectWallet').classList.add('connected');
      toast('Wallet connected!', 'success');
      loadDashboard();
    } catch (err) {
      toast('Connection rejected', 'error');
    }
  } else {
    // Demo mode — prompt for address
    const addr = prompt('Enter your wallet address (or leave empty for demo):');
    if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
      walletAddress = addr;
    } else {
      walletAddress = '0x' + 'demo'.padStart(40, '0');
    }
    const short = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
    document.getElementById('connectWallet').textContent = short;
    document.getElementById('connectWallet').classList.add('connected');
    toast('Wallet connected (demo mode)', 'success');
    loadDashboard();
  }
}

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
  if (!walletAddress) return;

  try {
    const res = await fetch(`${API}/builds?wallet_address=${encodeURIComponent(walletAddress)}`);
    if (!res.ok) {
      // API may not support listing yet — show empty
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
        <div class="progress-bar"><div class="fill" style="width:${b.progress}%"></div></div>
        <div class="progress-text">${b.progress}%</div>
      </div>
      <div class="build-actions">
        ${b.status === 'success' ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); downloadArtifact('${b.job_id}', '${b.platform}')">Download</button>` : ''}
        ${b.status === 'building' || b.status === 'pending' ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); cancelBuild('${b.job_id}')">Cancel</button>` : ''}
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
        <div class="value">${b.cost_thron} THRON</div>
      </div>
      <div class="detail-field">
        <div class="label">Progress</div>
        <div class="value">
          <div class="progress-bar" style="margin-top:4px"><div class="fill" style="width:${b.progress}%"></div></div>
          <span style="font-size:12px; color:var(--text-secondary)">${b.progress}%</span>
        </div>
      </div>
      <div class="detail-field">
        <div class="label">Payment</div>
        <div class="value">${b.payment_status}</div>
      </div>
    `;

    // Actions
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

    // Load logs
    loadBuildLogs(jobId);

    // Connect WebSocket for live logs
    if (b.status === 'building' || b.status === 'pending') {
      connectBuildWs(jobId);
    }
  } catch (e) {
    toast('Failed to load build details', 'error');
    showPage('dashboard');
  }
}

async function loadBuildLogs(jobId) {
  const console_el = document.getElementById('buildConsole');
  try {
    const res = await fetch(`${API}/builds/${jobId}/logs`);
    const data = await res.json();

    if (data.logs && data.logs.length) {
      console_el.innerHTML = data.logs.map(l =>
        `<div class="log-line ${l.type || ''}">${escapeHtml(l.line)}</div>`
      ).join('');
      console_el.scrollTop = console_el.scrollHeight;
    } else {
      console_el.innerHTML = '<div class="log-line">No logs yet...</div>';
    }
  } catch (e) {
    console_el.innerHTML = '<div class="log-line error">Failed to load logs</div>';
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
      const console_el = document.getElementById('buildConsole');

      if (msg.event === 'log') {
        const div = document.createElement('div');
        div.className = `log-line ${msg.data.type || ''}`;
        div.textContent = msg.data.line;
        console_el.appendChild(div);
        console_el.scrollTop = console_el.scrollHeight;
      }

      if (msg.event === 'progress') {
        // Update progress in detail view
        const fills = document.querySelectorAll('.fill');
        fills.forEach(f => f.style.width = msg.data.progress + '%');
      }

      if (msg.event === 'complete') {
        document.getElementById('liveIndicator').style.display = 'none';
        document.getElementById('detailBadge').className = `badge badge-${msg.data.status}`;
        document.getElementById('detailBadge').textContent = msg.data.status;
        toast(`Build ${msg.data.status}!`, msg.data.status === 'success' ? 'success' : 'error');
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
  if (!walletAddress) {
    toast('Please connect your wallet first', 'error');
    return;
  }
  document.getElementById('newBuildModal').classList.add('active');
  updateCost();
}

function closeNewBuild() {
  document.getElementById('newBuildModal').classList.remove('active');
  document.getElementById('buildForm').reset();
}

// Close modal on overlay click
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

  document.getElementById('costPreview').textContent = `${cost} THRON`;
}

async function submitBuild(e) {
  e.preventDefault();

  const form = document.getElementById('buildForm');
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  const body = {
    wallet_address: walletAddress,
    project_name: form.project_name.value,
    source_type: form.source_type.value,
    source_url: form.source_url.value,
    branch: form.branch.value || 'main',
    platform: form.platform.value,
    build_type: form.build_type.value,
  };

  try {
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
      toast(data.error || 'Submission failed', 'error');
    }
  } catch (err) {
    toast('Network error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Build';
  }
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
      <div class="price">${pricingData.android.apk} <span class="unit">THRON</span></div>
      <ul class="features">
        <li>Debug & Release builds</li>
        <li>GitHub / GitLab / ZIP source</li>
        <li>Real-time build logs</li>
        <li>IPFS artifact storage</li>
      </ul>
    </div>
    <div class="price-card">
      <div class="platform-icon">&#127922;</div>
      <h3>Android AAB</h3>
      <div class="price">${pricingData.android.aab} <span class="unit">THRON</span></div>
      <ul class="features">
        <li>Play Store ready</li>
        <li>Signed & optimized</li>
        <li>Real-time build logs</li>
        <li>IPFS artifact storage</li>
      </ul>
    </div>
    <div class="price-card">
      <div class="platform-icon">&#127823;</div>
      <h3>iOS IPA</h3>
      <div class="price">${pricingData.ios.ipa} <span class="unit">THRON</span></div>
      <ul class="features">
        <li>macOS cloud build</li>
        <li>Ad-hoc & App Store distribution</li>
        <li>Real-time build logs</li>
        <li>IPFS artifact storage</li>
      </ul>
    </div>
    <div class="price-card" style="border-color:var(--accent)">
      <div class="platform-icon">&#128171;</div>
      <h3>Both Platforms</h3>
      <div class="price">${pricingData.android.apk + pricingData.ios.ipa - pricingData.bundle_discount} <span class="unit">THRON</span></div>
      <ul class="features">
        <li>Android + iOS in one build</li>
        <li>Save ${pricingData.bundle_discount} THRON bundle discount</li>
        <li>Parallel builds</li>
        <li>IPFS artifact storage</li>
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
