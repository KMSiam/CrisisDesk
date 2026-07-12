// CrisisDeskAI Frontend Application Logic
const API_BASE_URL = 'https://crisisdesk-ai-emqh.onrender.com/api';

// State Variables
let currentTab = 'citizen';
let adminToken = localStorage.getItem('admin_token') || null;
let adminName = localStorage.getItem('admin_name') || null;

// Triage Table Pagination State
let currentPage = 1;
const limitPerPage = 10;
let totalPagesCount = 1;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  checkAdminSession();
  
  // Event Listeners
  document.getElementById('citizen-report-form').addEventListener('submit', handleReportSubmission);
  document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin);
  document.getElementById('btn-admin-logout').addEventListener('click', handleAdminLogout);
  
  // Filter and Search Listeners
  document.getElementById('triage-search').addEventListener('input', debounce(reloadTriageData, 400));
  document.getElementById('filter-urgency').addEventListener('change', reloadTriageData);
  document.getElementById('filter-category').addEventListener('change', reloadTriageData);

  // Pagination Listeners
  document.getElementById('btn-prev-page').addEventListener('click', () => navigatePage(-1));
  document.getElementById('btn-next-page').addEventListener('click', () => navigatePage(1));
  
  // Load initial statistics
  loadAnalytics();
});

// ==========================================
// 📱 TAB MANAGEMENT
// ==========================================
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  // Update nav buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // Update sections
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.getAttribute('id') === `tab-${tabId}`);
  });

  currentTab = tabId;

  // Run tab-specific hooks
  if (tabId === 'analytics') {
    loadAnalytics();
  } else if (tabId === 'dispatcher') {
    if (adminToken) {
      loadTriageReports();
    }
  }
}

// ==========================================
// 📢 CITIZEN SUBMISSION PORTAL
// ==========================================
async function handleReportSubmission(e) {
  e.preventDefault();
  
  const form = e.target;
  const submitBtn = document.getElementById('btn-submit-report');
  const triageResultBox = document.getElementById('triage-result-section');
  
  const name = document.getElementById('report-name').value.trim();
  const contact = document.getElementById('report-contact').value.trim();
  const location = document.getElementById('report-location').value.trim();
  const description = document.getElementById('report-description').value.trim();

  // Validate form
  if (!name || !contact || !location || !description) return;

  // Toggle UI state to loading
  submitBtn.disabled = true;
  submitBtn.querySelector('.btn-text').innerText = 'Processing Triage...';
  triageResultBox.className = 'triage-result-card glass-panel loading';

  try {
    const response = await fetch(`${API_BASE_URL}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contact, location, description })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to process report triage.');
    }

    // Populate Results
    const data = result.data;
    document.getElementById('res-category').innerText = data.category;
    document.getElementById('res-urgency').innerText = data.urgency;
    
    // Add urgency color classes
    const urgencyBadge = document.getElementById('res-urgency');
    urgencyBadge.className = `urgency-badge ${data.urgency}`;
    
    document.getElementById('res-lang').innerText = data.language.toUpperCase();
    document.getElementById('res-translation').innerText = data.description; // Translated text
    document.getElementById('res-summary').innerText = data.summary;
    document.getElementById('res-action').innerText = data.suggestedAction;

    // Handle Duplicate Warning Display
    const dupBlock = document.getElementById('res-duplicate-block');
    if (data.possibleDuplicate) {
      dupBlock.style.display = 'flex';
      document.getElementById('res-duplicate-id').innerText = `#${data.matchedReportId.substring(0, 8)}...`;
    } else {
      dupBlock.style.display = 'none';
    }

    // Show Results Panel
    triageResultBox.className = 'triage-result-card glass-panel ready';
    form.reset();

  } catch (error) {
    alert(`Submission Error: ${error.message}`);
    triageResultBox.className = 'triage-result-card glass-panel empty';
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector('.btn-text').innerText = 'Submit Report';
  }
}

// ==========================================
// 📊 ANALYTICS HUB
// ==========================================
async function loadAnalytics() {
  try {
    const response = await fetch(`${API_BASE_URL}/reports/stats/summary`);
    const result = await response.json();

    if (!response.ok) throw new Error(result.message);

    const stats = result.data;

    // Set KPI numbers
    document.getElementById('kpi-total').innerText = stats.totalReports;
    document.getElementById('kpi-critical').innerText = stats.criticalReports;
    document.getElementById('kpi-pending').innerText = stats.pendingReports;
    document.getElementById('kpi-resolved').innerText = stats.resolvedReports;

    // Draw Urgency Distribution Chart
    const urgencyBox = document.getElementById('urgency-chart-box');
    urgencyBox.innerHTML = '';
    const urgencies = ['critical', 'high', 'medium', 'low'];
    const urgencyColors = { critical: 'red', high: 'orange', medium: 'blue', low: 'green' };

    urgencies.forEach(key => {
      const count = stats.urgencyBreakdown[key] || 0;
      const pct = stats.totalReports > 0 ? (count / stats.totalReports) * 100 : 0;
      urgencyBox.appendChild(createChartRow(key, count, pct, urgencyColors[key]));
    });

    // Draw Category Breakdown Chart
    const categoryBox = document.getElementById('category-chart-box');
    categoryBox.innerHTML = '';
    
    // Sort categories by count descending
    const categoriesSorted = Object.keys(stats.categoryBreakdown).sort((a, b) => 
      stats.categoryBreakdown[b] - stats.categoryBreakdown[a]
    );

    categoriesSorted.forEach(key => {
      const count = stats.categoryBreakdown[key] || 0;
      const pct = stats.totalReports > 0 ? (count / stats.totalReports) * 100 : 0;
      categoryBox.appendChild(createChartRow(key.replace('_', ' '), count, pct, 'purple'));
    });

  } catch (error) {
    console.error('Failed to load dashboard statistics:', error);
  }
}

function createChartRow(label, count, percentage, colorClass) {
  const row = document.createElement('div');
  row.className = 'chart-bar-row';
  row.innerHTML = `
    <div class="chart-label">${label}</div>
    <div class="chart-bar-bg">
      <div class="chart-bar-fill ${colorClass}" style="width: 0%"></div>
    </div>
    <div class="chart-value">${count}</div>
  `;
  
  // Set width on timer to animate slide transition
  setTimeout(() => {
    row.querySelector('.chart-bar-fill').style.width = `${percentage}%`;
  }, 50);

  return row;
}

// ==========================================
// 🛡️ ADMIN AUTHENTICATION
// ==========================================
function checkAdminSession() {
  const userBadge = document.getElementById('admin-user-badge');
  const loginBox = document.getElementById('admin-login-box');
  const triagePanel = document.getElementById('admin-triage-panel');

  if (adminToken) {
    userBadge.innerHTML = `<span class="badge-admin"><i class="fa-solid fa-user-shield"></i> Supervisor: ${adminName}</span>`;
    loginBox.classList.add('hidden');
    triagePanel.classList.remove('hidden');
  } else {
    userBadge.innerHTML = `<span class="badge-guest"><i class="fa-solid fa-user"></i> Public Session</span>`;
    loginBox.classList.remove('hidden');
    triagePanel.classList.add('hidden');
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Login credentials invalid.');

    // Save tokens
    adminToken = result.data.token;
    adminName = result.data.admin.name;
    localStorage.setItem('admin_token', adminToken);
    localStorage.setItem('admin_name', adminName);

    checkAdminSession();
    loadTriageReports();

  } catch (error) {
    alert(`Authentication Failed: ${error.message}`);
  }
}

function handleAdminLogout() {
  adminToken = null;
  adminName = null;
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_name');
  
  checkAdminSession();
}

// ==========================================
// 📋 DISPATCHER TRIAGE PANEL CONTROL
// ==========================================
async function loadTriageReports() {
  if (!adminToken) return;

  const tbody = document.getElementById('triage-table-body');
  const emptyState = document.getElementById('triage-table-empty');
  
  const search = document.getElementById('triage-search').value.trim();
  const category = document.getElementById('filter-category').value;
  const urgency = document.getElementById('filter-urgency').value;

  // Build Query params
  const params = new URLSearchParams({
    page: currentPage,
    limit: limitPerPage
  });
  if (search) params.append('search', search);
  if (category) params.append('category', category);
  if (urgency) params.append('urgency', urgency);

  try {
    const response = await fetch(`${API_BASE_URL}/reports?${params.toString()}`);
    const result = await response.json();

    if (!response.ok) throw new Error(result.message);

    const reports = result.data.reports;
    const pagination = result.data.pagination;

    tbody.innerHTML = '';
    
    if (reports.length === 0) {
      emptyState.classList.remove('hidden');
      document.getElementById('btn-prev-page').disabled = true;
      document.getElementById('btn-next-page').disabled = true;
      document.getElementById('txt-page-info').innerText = 'Page 1 of 1';
      return;
    }

    emptyState.classList.add('hidden');
    reports.forEach(report => {
      tbody.appendChild(createReportRow(report));
    });

    // Handle Pagination Details
    totalPagesCount = pagination.totalPages;
    document.getElementById('txt-page-info').innerText = `Page ${pagination.page} of ${pagination.totalPages}`;
    document.getElementById('btn-prev-page').disabled = pagination.page <= 1;
    document.getElementById('btn-next-page').disabled = pagination.page >= pagination.totalPages;

  } catch (error) {
    console.error('Failed to load reports:', error);
  }
}

function createReportRow(report) {
  const tr = document.createElement('tr');
  const dateStr = new Date(report.createdAt).toLocaleString();
  
  // Format duplicates connection warning text
  let duplicateMeta = '';
  if (report.possibleDuplicate) {
    duplicateMeta = `
      <div class="duplicate-alert" style="margin-top:4px; padding: 6px 10px; font-size:11px;">
        <i class="fa-solid fa-clone" style="font-size:12px;"></i>
        <span>Linked to Original ID: #${report.matchedReportId.substring(0,8)}...</span>
      </div>`;
  }

  tr.innerHTML = `
    <td>
      <strong>${escapeHtml(report.name)}</strong>
      <div class="cell-meta"><i class="fa-solid fa-phone"></i> ${escapeHtml(report.contact)}</div>
      <div class="cell-meta"><i class="fa-solid fa-clock"></i> ${dateStr}</div>
      <div class="cell-meta">ID: #${report.id.substring(0,8)}...</div>
    </td>
    <td>
      <span class="badge-status ${report.status}">${report.status.replace('_', ' ')}</span>
      <div class="cell-meta" style="margin-top:8px;">Urgency: <strong style="color:var(--color-${report.urgency})">${report.urgency.toUpperCase()}</strong></div>
      <div class="cell-meta">Category: <strong>${report.category.toUpperCase()}</strong></div>
    </td>
    <td>
      <span class="badge-lang">${report.language}</span>
      <strong>${escapeHtml(report.location)}</strong>
      <div class="cell-meta" style="margin-top: 6px; font-style: italic; border-left: 2px solid var(--accent-purple); padding-left:6px;">
        "${escapeHtml(report.description)}"
      </div>
    </td>
    <td>
      <div style="font-size:12.5px; line-height:1.4;">
        <strong>AI Summary:</strong> ${escapeHtml(report.summary)}
      </div>
      <div style="font-size:12.5px; line-height:1.4; margin-top:8px;">
        <strong>Action:</strong> ${escapeHtml(report.suggestedAction)}
      </div>
      ${duplicateMeta}
    </td>
    <td class="actions-cell">
      <select class="status-select" data-id="${report.id}">
        <option value="pending" ${report.status === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="in_review" ${report.status === 'in_review' ? 'selected' : ''}>In Review</option>
        <option value="assigned" ${report.status === 'assigned' ? 'selected' : ''}>Assigned</option>
        <option value="resolved" ${report.status === 'resolved' ? 'selected' : ''}>Resolved</option>
        <option value="rejected" ${report.status === 'rejected' ? 'selected' : ''}>Rejected</option>
      </select>
      <button class="delete-action-btn" data-id="${report.id}">
        <i class="fa-solid fa-trash-can"></i> Delete Report
      </button>
    </td>
  `;

  // Bind dropdown action listener
  tr.querySelector('.status-select').addEventListener('change', (e) => {
    updateStatus(e.target.getAttribute('data-id'), e.target.value);
  });

  // Bind delete button listener
  tr.querySelector('.delete-action-btn').addEventListener('click', (e) => {
    const id = e.currentTarget.getAttribute('data-id');
    if (confirm('Are you sure you want to permanently delete this report? This will delete all connected duplicate reports as well.')) {
      deleteReport(id);
    }
  });

  return tr;
}

// ==========================================
// 🛠️ OPERATIONAL DB MUTATION REQUESTS
// ==========================================
async function updateStatus(id, newStatus) {
  if (!adminToken) return;

  try {
    const response = await fetch(`${API_BASE_URL}/reports/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: newStatus })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Status transition denied.');

    loadTriageReports(); // Refresh table view

  } catch (error) {
    alert(`Operation Failed: ${error.message}`);
    loadTriageReports(); // Revert table state
  }
}

async function deleteReport(id) {
  if (!adminToken) return;

  try {
    const response = await fetch(`${API_BASE_URL}/reports/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Delete operation denied.');

    // Adjust page count if row counts decrease
    if (currentPage > 1 && document.querySelectorAll('#triage-table-body tr').length === 1) {
      currentPage--;
    }

    loadTriageReports(); // Refresh view
    loadAnalytics();    // Refresh KPI counts

  } catch (error) {
    alert(`Operation Failed: ${error.message}`);
  }
}

// ==========================================
// ⚙️ UTILITIES & HELPER FUNCTIONS
// ==========================================
function reloadTriageData() {
  currentPage = 1;
  loadTriageReports();
}

function navigatePage(direction) {
  currentPage += direction;
  loadTriageReports();
}

// Prevent typing triggers from flooding endpoints
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Sanitize inputs
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
