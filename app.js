// ============================================================
// app.js — HomeBase SPA
// ============================================================

// ── Imports ──────────────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// ── Firebase Init ─────────────────────────────────────────────
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db   = getFirestore(firebaseApp);

// ── State ────────────────────────────────────────────────────
const state = {
  user:             null,
  house:            null,
  areas:            [],
  issues:           [],
  projects:         [],
  currentView:      'dashboard',
  currentProjectId: null,
  authMode:         'signin',
  issueFilters:     { status: 'all', area: 'all', type: 'all' },
  unsubscribers:    []
};

// ── DOM Helpers ──────────────────────────────────────────────
const el = id => document.getElementById(id);

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showLoading(show) {
  el('loading-overlay').style.display = show ? 'flex' : 'none';
}

// ── Screen Management ─────────────────────────────────────────
function showScreen(id) {
  ['auth-screen', 'main-app'].forEach(s =>
    el(s).classList.toggle('hidden', s !== id)
  );
}

// ── Auth ─────────────────────────────────────────────────────
window.switchAuthTab = function(mode) {
  state.authMode = mode;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el(`tab-${mode}`).classList.add('active');
  el('auth-btn').textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
  el('auth-error').classList.add('hidden');
};

el('auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email    = el('auth-email').value.trim();
  const password = el('auth-password').value;
  const errEl    = el('auth-error');
  const btn      = el('auth-btn');

  errEl.classList.add('hidden');
  btn.disabled    = true;
  btn.textContent = '…';

  try {
    if (state.authMode === 'signin') {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    errEl.textContent = friendlyAuthError(err.code);
    errEl.classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = state.authMode === 'signin' ? 'Sign In' : 'Create Account';
  }
});

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':      'No account found with this email.',
    'auth/wrong-password':      'Incorrect password.',
    'auth/invalid-credential':  'Invalid email or password.',
    'auth/email-already-in-use':'An account already exists for this email.',
    'auth/weak-password':       'Password must be at least 6 characters.',
    'auth/invalid-email':       'Please enter a valid email address.',
    'auth/too-many-requests':   'Too many attempts. Please try again later.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

window.handleSignOut = async function() {
  hideModal();
  await fbSignOut(auth);
};

// ── House ─────────────────────────────────────────────────────
async function loadHouse(uid) {
  const snap = await getDoc(doc(db, 'houses', uid));
  if (snap.exists()) {
    state.house = { id: snap.id, ...snap.data() };
    return true;
  }
  return false;
}

async function createHouse(name, address, yearBuilt) {
  const uid  = state.user.uid;
  const data = {
    name,
    ownerId:   uid,
    createdAt: serverTimestamp(),
    ...(address  && { address }),
    ...(yearBuilt && { yearBuilt: parseInt(yearBuilt, 10) })
  };
  await setDoc(doc(db, 'houses', uid), data);
  state.house = { id: uid, ...data };
}

async function updateHouse(name, address, yearBuilt) {
  const uid  = state.user.uid;
  const data = {
    name,
    ...(address  !== undefined && { address }),
    ...(yearBuilt !== undefined && { yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) : null })
  };
  await updateDoc(doc(db, 'houses', uid), data);
  state.house = { ...state.house, ...data };
  el('page-title').textContent = name || 'Dashboard';
}

// House setup form (first-run)
el('house-setup-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name     = el('house-name-input').value.trim();
  const address  = el('house-address-input').value.trim();
  const yearBuilt = el('house-year-input').value;
  const errEl    = el('house-setup-error');
  const btn      = el('house-setup-btn');

  if (!name) {
    errEl.textContent = 'Please enter a name for your home.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Saving…';
  errEl.classList.add('hidden');

  try {
    await createHouse(name, address, yearBuilt);
    el('house-setup-overlay').classList.add('hidden');
    subscribeToData();
    navigate('dashboard');
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Failed to save. Please try again.';
    errEl.classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = 'Get Started';
  }
});

// ── Data Subscriptions ────────────────────────────────────────
function subscribeToData() {
  unsubscribeAll();
  const houseId = state.user.uid;

  const areasQ = query(
    collection(db, 'areas'),
    where('houseId', '==', houseId),
    orderBy('createdAt', 'asc')
  );
  state.unsubscribers.push(onSnapshot(areasQ, snap => {
    state.areas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  }));

  const issuesQ = query(
    collection(db, 'issues'),
    where('houseId', '==', houseId),
    orderBy('createdAt', 'desc')
  );
  state.unsubscribers.push(onSnapshot(issuesQ, snap => {
    state.issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  }));

  const projectsQ = query(
    collection(db, 'projects'),
    where('houseId', '==', houseId),
    orderBy('createdAt', 'desc')
  );
  state.unsubscribers.push(onSnapshot(projectsQ, snap => {
    state.projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  }));
}

function unsubscribeAll() {
  state.unsubscribers.forEach(fn => fn());
  state.unsubscribers = [];
}

// ── Navigation ────────────────────────────────────────────────
window.navigate = function(view, params = {}) {
  state.currentView = view;
  if (params.projectId !== undefined) state.currentProjectId = params.projectId;

  // Bottom nav active state (only for top-level views)
  document.querySelectorAll('#bottom-nav .nav-btn, #sidebar .nav-btn').forEach(btn => {
    const btnView = btn.dataset.view;
    btn.classList.toggle('active', btnView === view);
  });

  // Header
  const backBtn = el('back-btn');
  const title   = el('page-title');
  if (view === 'project') {
    backBtn.classList.remove('hidden');
    const proj = state.projects.find(p => p.id === state.currentProjectId);
    title.textContent = proj ? proj.name : 'Project';
  } else {
    backBtn.classList.add('hidden');
    const labels = {
      dashboard: state.house?.name || 'Dashboard',
      areas:     'Areas',
      issues:    'Issues'
    };
    title.textContent = labels[view] || '';
  }

  renderView();
};

window.handleBack = function() {
  navigate('dashboard');
};

// ── View Router ───────────────────────────────────────────────
function renderView() {
  const content = el('main-content');
  switch (state.currentView) {
    case 'dashboard': content.innerHTML = dashboardView(); break;
    case 'areas':     content.innerHTML = areasView();     break;
    case 'issues':    content.innerHTML = issuesView();    break;
    case 'project':   content.innerHTML = projectView();   break;
    default:          content.innerHTML = dashboardView();
  }
  attachFilterListeners();
}

function attachFilterListeners() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const { filterKey, filterVal } = chip.dataset;
      state.issueFilters[filterKey] = filterVal;
      renderView();
    });
  });
}

// ── Badge Helpers ─────────────────────────────────────────────
function statusBadge(s) {
  const cls = { 'Open': 's-open', 'In Progress': 's-inprogress', 'Done': 's-done' };
  return `<span class="badge ${cls[s] || ''}">${esc(s)}</span>`;
}

function typeBadge(t) {
  const cls = {
    'Fix': 't-fix', 'Clean': 't-clean', 'Replace': 't-replace',
    'Build': 't-build', 'Improve': 't-improve', 'Other': 't-other'
  };
  return `<span class="badge ${cls[t] || 't-other'}">${esc(t)}</span>`;
}

function projStatusBadge(s) {
  const cls = { 'Planning': 'ps-planning', 'Active': 'ps-active', 'Complete': 'ps-complete' };
  return `<span class="badge ${cls[s] || ''}">${esc(s)}</span>`;
}

function priorityBadge(p) {
  if (!p) return '';
  const cls = { 'Low': 'p-low', 'Medium': 'p-medium', 'High': 'p-high', 'Critical': 'p-critical' };
  return `<span class="badge ${cls[p] || ''}">${esc(p)}</span>`;
}

function statusToggleClass(s) {
  const cls = { 'Open': 's-open', 'In Progress': 's-inprogress', 'Done': 's-done' };
  return cls[s] || 's-open';
}

function statusToggleIcon(s) {
  if (s === 'Done') {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>`;
  }
  if (s === 'In Progress') {
    return `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>`;
  }
  return '';
}

function getAreaName(id) {
  const a = state.areas.find(a => a.id === id);
  return a ? a.name : '';
}

function getProjectIssueCounts(projectId) {
  const list = state.issues.filter(i => i.projectId === projectId);
  return {
    total:      list.length,
    open:       list.filter(i => i.status === 'Open').length,
    inProgress: list.filter(i => i.status === 'In Progress').length,
    done:       list.filter(i => i.status === 'Done').length
  };
}

// ── Dashboard View ────────────────────────────────────────────
function dashboardView() {
  const active       = state.projects.filter(p => p.status === 'Active');
  const other        = state.projects.filter(p => p.status !== 'Active');
  const openCount    = state.issues.filter(i => i.status === 'Open').length;
  const progCount    = state.issues.filter(i => i.status === 'In Progress').length;
  const doneCount    = state.issues.filter(i => i.status === 'Done').length;

  return `
    <div class="view-content">
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-value">${openCount}</span>
          <span class="stat-label">Open</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${progCount}</span>
          <span class="stat-label">In Progress</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${doneCount}</span>
          <span class="stat-label">Done</span>
        </div>
      </div>

      <div class="section-header">
        <h3>Active Projects</h3>
        <button class="btn btn-sm btn-primary" onclick="showProjectModal()">+ Add</button>
      </div>

      ${active.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
            </svg>
          </div>
          <p>No active projects yet.<br>Create one to get started.</p>
          <button class="btn btn-primary" onclick="showProjectModal()">Create Project</button>
        </div>
      ` : `
        <div class="project-grid">
          ${active.map(p => projectCard(p)).join('')}
        </div>
      `}

      ${other.length > 0 ? `
        <div class="section-header mt-4">
          <h3>Other Projects</h3>
        </div>
        <div class="list">
          ${other.map(p => `
            <div class="list-item clickable" onclick="navigate('project', {projectId:'${esc(p.id)}'})">
              <div class="list-item-main">
                <div class="list-item-title">${esc(p.name)}</div>
                ${p.description ? `<div class="list-item-subtitle">${esc(p.description)}</div>` : ''}
              </div>
              ${projStatusBadge(p.status)}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>`;
}

function projectCard(p) {
  const c = getProjectIssueCounts(p.id);
  return `
    <div class="project-card" onclick="navigate('project', {projectId:'${esc(p.id)}'})">
      <div class="project-card-header">
        <h4>${esc(p.name)}</h4>
        ${projStatusBadge(p.status)}
      </div>
      ${p.description ? `<p class="project-card-desc">${esc(p.description)}</p>` : ''}
      <div class="project-card-stats">
        <span>${c.total} issue${c.total !== 1 ? 's' : ''}</span>
        ${c.done > 0 ? `<span>${c.done} done</span>` : ''}
        ${c.inProgress > 0 ? `<span>${c.inProgress} in progress</span>` : ''}
      </div>
    </div>`;
}

// ── Areas View ────────────────────────────────────────────────
function areasView() {
  return `
    <div class="view-content">
      <div class="section-header">
        <h3>Areas (${state.areas.length})</h3>
        <button class="btn btn-sm btn-primary" onclick="showAreaModal()">+ Add Area</button>
      </div>

      ${state.areas.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </div>
          <p>No areas yet.<br>Add rooms and spaces to organise your issues.</p>
          <button class="btn btn-primary" onclick="showAreaModal()">Add an Area</button>
        </div>
      ` : `
        <div class="list">
          ${state.areas.map(a => {
            const count = state.issues.filter(i => i.areaIds && i.areaIds.includes(a.id)).length;
            return `
              <div class="list-item">
                <div class="list-item-main">
                  <div class="list-item-title">${esc(a.name)}</div>
                  ${a.description ? `<div class="list-item-subtitle">${esc(a.description)}</div>` : ''}
                  <div class="list-item-meta">${count} issue${count !== 1 ? 's' : ''}</div>
                </div>
                <div class="list-item-actions">
                  <button class="icon-btn sm" onclick="showAreaModalById('${esc(a.id)}')" title="Edit area">
                    ${iconEdit()}
                  </button>
                  <button class="icon-btn sm danger" onclick="confirmDeleteArea('${esc(a.id)}','${esc(a.name)}')" title="Delete area">
                    ${iconTrash()}
                  </button>
                </div>
              </div>`;
          }).join('')}
        </div>
      `}
    </div>`;
}

// ── Issues View ───────────────────────────────────────────────
function issuesView() {
  const { status, area, type } = state.issueFilters;

  let filtered = [...state.issues];
  if (status !== 'all') filtered = filtered.filter(i => i.status === status);
  if (area   !== 'all') filtered = filtered.filter(i => i.areaIds && i.areaIds.includes(area));
  if (type   !== 'all') filtered = filtered.filter(i => i.type === type);

  const statusOptions = ['all', 'Open', 'In Progress', 'Done'];
  const typeOptions   = ['all', 'Fix', 'Clean', 'Replace', 'Build', 'Improve', 'Other'];

  return `
    <div class="view-content">
      <div class="section-header">
        <h3>Issues (${state.issues.length})</h3>
        <button class="btn btn-sm btn-primary" onclick="showIssueModal()">+ Add Issue</button>
      </div>

      <div class="filter-section">
        <div class="filter-section-label">Status</div>
        <div class="filter-bar">
          ${statusOptions.map(s => `
            <button class="filter-chip ${status === s ? 'active' : ''}"
                    data-filter-key="status" data-filter-val="${esc(s)}">
              ${s === 'all' ? 'All' : esc(s)}
            </button>`).join('')}
        </div>
        ${state.areas.length > 0 ? `
          <div class="filter-section-label">Area</div>
          <div class="filter-bar">
            <button class="filter-chip ${area === 'all' ? 'active' : ''}"
                    data-filter-key="area" data-filter-val="all">All</button>
            ${state.areas.map(a => `
              <button class="filter-chip ${area === a.id ? 'active' : ''}"
                      data-filter-key="area" data-filter-val="${esc(a.id)}">${esc(a.name)}</button>
            `).join('')}
          </div>
        ` : ''}
        <div class="filter-section-label">Type</div>
        <div class="filter-bar">
          ${typeOptions.map(t => `
            <button class="filter-chip ${type === t ? 'active' : ''}"
                    data-filter-key="type" data-filter-val="${esc(t)}">
              ${t === 'all' ? 'All' : esc(t)}
            </button>`).join('')}
        </div>
      </div>

      ${filtered.length === 0 ? `
        <div class="empty-state">
          <p>${state.issues.length === 0 ? 'No issues yet. Add one to get started.' : 'No issues match the selected filters.'}</p>
          ${state.issues.length === 0 ? `<button class="btn btn-primary" onclick="showIssueModal()">Add an Issue</button>` : ''}
        </div>
      ` : `
        <div class="issue-list">
          ${filtered.map(i => issueCard(i)).join('')}
        </div>
      `}
    </div>`;
}

function issueCard(issue) {
  const toggleCls = statusToggleClass(issue.status);
  const icon      = statusToggleIcon(issue.status);
  const areaNames = (issue.areaIds || [])
    .map(id => getAreaName(id))
    .filter(Boolean)
    .join(', ');

  return `
    <div class="issue-card">
      <button class="status-toggle ${toggleCls}"
              onclick="cycleIssueStatus('${esc(issue.id)}','${esc(issue.status)}')"
              title="Toggle status">${icon}</button>
      <div class="issue-body" onclick="showIssueModalById('${esc(issue.id)}')">
        <div class="issue-name">${esc(issue.name)}</div>
        <div class="issue-meta">
          ${typeBadge(issue.type)}
          ${issue.priority ? priorityBadge(issue.priority) : ''}
          ${areaNames ? `<span class="text-muted" style="font-size:0.78rem">${esc(areaNames)}</span>` : ''}
        </div>
      </div>
      <div class="issue-actions">
        <button class="icon-btn sm danger" onclick="confirmDeleteIssue('${esc(issue.id)}','${esc(issue.name)}')" title="Delete">
          ${iconTrash()}
        </button>
      </div>
    </div>`;
}

// ── Project Detail View ───────────────────────────────────────
function projectView() {
  const project = state.projects.find(p => p.id === state.currentProjectId);
  if (!project) return `<div class="view-content"><p class="text-muted">Project not found.</p></div>`;

  const projIssues = state.issues.filter(i => i.projectId === project.id);
  const open       = projIssues.filter(i => i.status === 'Open').length;
  const inProg     = projIssues.filter(i => i.status === 'In Progress').length;
  const done       = projIssues.filter(i => i.status === 'Done').length;

  return `
    <div class="view-content">
      <div class="project-detail-card">
        <div class="project-detail-header">
          <h3>${esc(project.name)}</h3>
          ${projStatusBadge(project.status)}
        </div>
        ${project.description ? `<p class="project-detail-desc">${esc(project.description)}</p>` : ''}
        <div class="project-card-stats mt-2">
          <span>${projIssues.length} issue${projIssues.length !== 1 ? 's' : ''}</span>
          ${open > 0 ? `<span>${open} open</span>` : ''}
          ${inProg > 0 ? `<span>${inProg} in progress</span>` : ''}
          ${done > 0 ? `<span>${done} done</span>` : ''}
        </div>
        <div class="project-detail-actions">
          <button class="btn btn-sm btn-secondary" onclick="showProjectModal('${esc(project.id)}')">Edit Project</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDeleteProject('${esc(project.id)}','${esc(project.name)}')">Delete</button>
        </div>
      </div>

      <div class="section-header">
        <h3>Issues</h3>
        <button class="btn btn-sm btn-primary"
                onclick="showIssueModal(null,'${esc(project.id)}')">+ Add Issue</button>
      </div>

      ${projIssues.length === 0 ? `
        <div class="empty-state">
          <p>No issues linked to this project yet.</p>
          <button class="btn btn-primary" onclick="showIssueModal(null,'${esc(project.id)}')">Add an Issue</button>
        </div>
      ` : `
        <div class="issue-list">
          ${projIssues.map(i => issueCard(i)).join('')}
        </div>
      `}
    </div>`;
}

// ── Inline SVG Icons ──────────────────────────────────────────
function iconEdit() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`;
}
function iconTrash() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="3,6 5,6 21,6"/>
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>`;
}

// ── Modal System ──────────────────────────────────────────────
function showModal(title, bodyHtml, footerHtml = '') {
  el('modal-title').textContent = title;
  el('modal-body').innerHTML    = bodyHtml;
  el('modal-footer').innerHTML  = footerHtml;
  el('modal-overlay').classList.remove('hidden');
  // Focus first input
  requestAnimationFrame(() => {
    const first = el('modal-body').querySelector('input, textarea, select');
    if (first) first.focus();
  });
}

function hideModal() {
  el('modal-overlay').classList.add('hidden');
  el('modal-body').innerHTML   = '';
  el('modal-footer').innerHTML = '';
}

window.handleModalOverlayClick = function(e) {
  if (e.target === el('modal-overlay')) hideModal();
};

// ── Confirm Dialog ────────────────────────────────────────────
function showConfirm(message, name, onConfirm) {
  showModal(
    'Confirm Delete',
    `<p class="confirm-msg">${esc(message)}</p>
     ${name ? `<p class="confirm-name">${esc(name)}</p>` : ''}`,
    `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
     <button class="btn btn-danger" id="confirm-ok-btn">Delete</button>`
  );
  el('confirm-ok-btn').addEventListener('click', async () => {
    hideModal();
    await onConfirm();
  });
}

// ── Area CRUD ─────────────────────────────────────────────────
window.showAreaModal = function(area = null) {
  const isEdit  = !!area;
  const bodyHtml = `
    <form id="area-form">
      <div class="form-group">
        <label for="area-name">Name <span class="req">*</span></label>
        <input type="text" id="area-name" value="${esc(area?.name || '')}"
               placeholder="e.g. Kitchen, Garage, Backyard" required maxlength="80">
      </div>
      <div class="form-group">
        <label for="area-desc">Description <span class="opt">(optional)</span></label>
        <textarea id="area-desc" rows="2" maxlength="300"
                  placeholder="Any notes about this area">${esc(area?.description || '')}</textarea>
      </div>
      <p id="area-error" class="error-msg hidden"></p>
    </form>`;

  showModal(
    isEdit ? 'Edit Area' : 'Add Area',
    bodyHtml,
    `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
     <button class="btn btn-primary" id="area-save-btn">${isEdit ? 'Save Changes' : 'Add Area'}</button>`
  );

  el('area-save-btn').addEventListener('click', () => handleAreaSave(area?.id || null));
  el('area-form').addEventListener('submit', e => { e.preventDefault(); handleAreaSave(area?.id || null); });
};

window.showAreaModalById = function(id) {
  showAreaModal(state.areas.find(a => a.id === id) || null);
};

async function handleAreaSave(id) {
  const name = el('area-name').value.trim();
  const desc = el('area-desc').value.trim();
  const errEl = el('area-error');

  if (!name) {
    errEl.textContent = 'Name is required.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = el('area-save-btn');
  btn.disabled = true;
  errEl.classList.add('hidden');

  try {
    const data = {
      name,
      houseId: state.user.uid,
      ...(desc && { description: desc }),
    };
    if (id) {
      await updateDoc(doc(db, 'areas', id), { name, description: desc });
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'areas'), data);
    }
    hideModal();
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Failed to save. Please try again.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
  }
}

window.confirmDeleteArea = function(id, name) {
  showConfirm('Delete this area? Issues in this area will not be deleted.', name, async () => {
    try {
      await deleteDoc(doc(db, 'areas', id));
      // Remove areaId from any issues that reference it
      const affected = state.issues.filter(i => i.areaIds && i.areaIds.includes(id));
      await Promise.all(affected.map(i =>
        updateDoc(doc(db, 'issues', i.id), {
          areaIds: (i.areaIds || []).filter(a => a !== id)
        })
      ));
    } catch (err) {
      console.error(err);
    }
  });
};

// ── Issue CRUD ────────────────────────────────────────────────
window.showIssueModal = function(issue = null, defaultProjectId = null) {
  const isEdit      = !!issue;
  const areaChecks  = state.areas.map(a => {
    const checked = issue?.areaIds?.includes(a.id) ? 'checked' : '';
    return `<label class="checkbox-label">
      <input type="checkbox" value="${esc(a.id)}" ${checked}>
      ${esc(a.name)}
    </label>`;
  }).join('');

  const projOptions = state.projects.map(p => {
    const sel = (issue?.projectId === p.id || defaultProjectId === p.id) ? 'selected' : '';
    return `<option value="${esc(p.id)}" ${sel}>${esc(p.name)}</option>`;
  }).join('');

  const bodyHtml = `
    <form id="issue-form">
      <div class="form-group">
        <label for="issue-name">Name <span class="req">*</span></label>
        <input type="text" id="issue-name" value="${esc(issue?.name || '')}"
               placeholder="What needs to be done?" required maxlength="120">
      </div>
      <div class="form-group">
        <label for="issue-type">Type</label>
        <select id="issue-type">
          ${['Fix','Clean','Replace','Build','Improve','Other'].map(t =>
            `<option value="${t}" ${(issue?.type || 'Fix') === t ? 'selected' : ''}>${t}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="issue-status">Status</label>
        <select id="issue-status">
          ${['Open','In Progress','Done'].map(s =>
            `<option value="${s}" ${(issue?.status || 'Open') === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="issue-priority">Priority <span class="opt">(optional)</span></label>
        <select id="issue-priority">
          <option value="">None</option>
          ${['Low','Medium','High','Critical'].map(p =>
            `<option value="${p}" ${(issue?.priority || '') === p ? 'selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </div>
      ${state.areas.length > 0 ? `
        <div class="form-group">
          <label>Areas <span class="opt">(optional)</span></label>
          <div class="checkbox-group">${areaChecks}</div>
        </div>
      ` : ''}
      ${state.projects.length > 0 ? `
        <div class="form-group">
          <label for="issue-project">Project <span class="opt">(optional)</span></label>
          <select id="issue-project">
            <option value="">None</option>
            ${projOptions}
          </select>
        </div>
      ` : ''}
      <div class="form-group">
        <label for="issue-desc">Description <span class="opt">(optional)</span></label>
        <textarea id="issue-desc" rows="2" maxlength="500"
                  placeholder="More details…">${esc(issue?.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label for="issue-notes">Notes <span class="opt">(optional)</span></label>
        <textarea id="issue-notes" rows="2" maxlength="500"
                  placeholder="Any additional notes…">${esc(issue?.notes || '')}</textarea>
      </div>
      <p id="issue-error" class="error-msg hidden"></p>
    </form>`;

  showModal(
    isEdit ? 'Edit Issue' : 'Add Issue',
    bodyHtml,
    `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
     <button class="btn btn-primary" id="issue-save-btn">${isEdit ? 'Save Changes' : 'Add Issue'}</button>`
  );

  el('issue-save-btn').addEventListener('click', () => handleIssueSave(issue?.id || null));
  el('issue-form').addEventListener('submit', e => { e.preventDefault(); handleIssueSave(issue?.id || null); });
};

window.showIssueModalById = function(id) {
  showIssueModal(state.issues.find(i => i.id === id) || null);
};

async function handleIssueSave(id) {
  const name    = el('issue-name').value.trim();
  const type    = el('issue-type').value;
  const status  = el('issue-status').value;
  const priority = el('issue-priority')?.value || '';
  const desc    = el('issue-desc').value.trim();
  const notes   = el('issue-notes').value.trim();
  const projectEl = el('issue-project');
  const projectId = projectEl ? projectEl.value : '';

  const areaChecks = el('modal-body').querySelectorAll('.checkbox-group input[type="checkbox"]:checked');
  const areaIds    = Array.from(areaChecks).map(c => c.value);

  const errEl = el('issue-error');
  if (!name) {
    errEl.textContent = 'Name is required.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = el('issue-save-btn');
  btn.disabled = true;
  errEl.classList.add('hidden');

  try {
    const data = {
      name,
      type,
      status,
      houseId:   state.user.uid,
      areaIds,
      projectId: projectId || null,
      description: desc || null,
      notes:       notes || null,
      priority:    priority || null,
      updatedAt:   serverTimestamp()
    };
    if (id) {
      await updateDoc(doc(db, 'issues', id), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'issues'), data);
    }
    hideModal();
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Failed to save. Please try again.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
  }
}

window.confirmDeleteIssue = function(id, name) {
  showConfirm('Delete this issue permanently?', name, async () => {
    try { await deleteDoc(doc(db, 'issues', id)); } catch (e) { console.error(e); }
  });
};

window.cycleIssueStatus = async function(id, current) {
  const next = { 'Open': 'In Progress', 'In Progress': 'Done', 'Done': 'Open' };
  try {
    await updateDoc(doc(db, 'issues', id), {
      status:    next[current] || 'Open',
      updatedAt: serverTimestamp()
    });
  } catch (e) { console.error(e); }
};

// ── Project CRUD ──────────────────────────────────────────────
window.showProjectModal = function(idOrNull = null) {
  const project = typeof idOrNull === 'string'
    ? state.projects.find(p => p.id === idOrNull)
    : null;
  const isEdit  = !!project;

  const bodyHtml = `
    <form id="project-form">
      <div class="form-group">
        <label for="proj-name">Name <span class="req">*</span></label>
        <input type="text" id="proj-name" value="${esc(project?.name || '')}"
               placeholder="e.g. Kitchen Renovation" required maxlength="100">
      </div>
      <div class="form-group">
        <label for="proj-status">Status</label>
        <select id="proj-status">
          ${['Planning','Active','Complete'].map(s =>
            `<option value="${s}" ${(project?.status || 'Planning') === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="proj-desc">Description <span class="opt">(optional)</span></label>
        <textarea id="proj-desc" rows="2" maxlength="400"
                  placeholder="What is this project about?">${esc(project?.description || '')}</textarea>
      </div>
      <p id="proj-error" class="error-msg hidden"></p>
    </form>`;

  showModal(
    isEdit ? 'Edit Project' : 'Add Project',
    bodyHtml,
    `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
     <button class="btn btn-primary" id="proj-save-btn">${isEdit ? 'Save Changes' : 'Add Project'}</button>`
  );

  el('proj-save-btn').addEventListener('click', () => handleProjectSave(project?.id || null));
  el('project-form').addEventListener('submit', e => { e.preventDefault(); handleProjectSave(project?.id || null); });
};

async function handleProjectSave(id) {
  const name   = el('proj-name').value.trim();
  const status = el('proj-status').value;
  const desc   = el('proj-desc').value.trim();
  const errEl  = el('proj-error');

  if (!name) {
    errEl.textContent = 'Name is required.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = el('proj-save-btn');
  btn.disabled = true;
  errEl.classList.add('hidden');

  try {
    const data = { name, status, description: desc || null, updatedAt: serverTimestamp() };
    if (id) {
      await updateDoc(doc(db, 'projects', id), data);
      // Update header if we're on the project view
      if (state.currentView === 'project' && state.currentProjectId === id) {
        el('page-title').textContent = name;
      }
    } else {
      data.houseId   = state.user.uid;
      data.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, 'projects'), data);
      // Navigate to the new project
      hideModal();
      navigate('project', { projectId: ref.id });
      return;
    }
    hideModal();
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Failed to save. Please try again.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
  }
}

window.confirmDeleteProject = function(id, name) {
  showConfirm(
    'Delete this project? Associated issues will remain but be unlinked.',
    name,
    async () => {
      try {
        await deleteDoc(doc(db, 'projects', id));
        // Unlink issues
        const linked = state.issues.filter(i => i.projectId === id);
        await Promise.all(linked.map(i =>
          updateDoc(doc(db, 'issues', i.id), { projectId: null })
        ));
        navigate('dashboard');
      } catch (e) { console.error(e); }
    }
  );
};

// ── Settings Modal ────────────────────────────────────────────
window.showSettingsModal = function() {
  const h = state.house || {};
  showModal(
    'Settings',
    `<form id="settings-form">
      <div class="form-group">
        <label for="settings-name">Home Name <span class="req">*</span></label>
        <input type="text" id="settings-name" value="${esc(h.name || '')}" required maxlength="100">
      </div>
      <div class="form-group">
        <label for="settings-address">Address <span class="opt">(optional)</span></label>
        <input type="text" id="settings-address" value="${esc(h.address || '')}" maxlength="200">
      </div>
      <div class="form-group">
        <label for="settings-year">Year Built <span class="opt">(optional)</span></label>
        <input type="number" id="settings-year" value="${esc(h.yearBuilt || '')}" min="1800" max="2030">
      </div>
      <p id="settings-error" class="error-msg hidden"></p>
    </form>
    <div class="divider"></div>
    <p class="text-muted" style="margin-bottom:6px">Signed in as ${esc(state.user?.email || '')}</p>`,
    `<button class="btn btn-ghost" onclick="handleSignOut()">Sign Out</button>
     <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
     <button class="btn btn-primary" id="settings-save-btn">Save</button>`
  );

  el('settings-save-btn').addEventListener('click', handleSettingsSave);
  el('settings-form').addEventListener('submit', e => { e.preventDefault(); handleSettingsSave(); });
};

async function handleSettingsSave() {
  const name    = el('settings-name').value.trim();
  const address = el('settings-address').value.trim();
  const year    = el('settings-year').value;
  const errEl   = el('settings-error');

  if (!name) {
    errEl.textContent = 'Home name is required.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = el('settings-save-btn');
  btn.disabled = true;
  errEl.classList.add('hidden');

  try {
    await updateHouse(name, address, year);
    hideModal();
    // Refresh page title if on dashboard
    if (state.currentView === 'dashboard') {
      el('page-title').textContent = name;
    }
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Failed to save. Please try again.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
  }
}

// ── App Init ──────────────────────────────────────────────────
async function initApp() {
  await setPersistence(auth, browserLocalPersistence);

  onAuthStateChanged(auth, async user => {
    if (user) {
      state.user = user;
      showLoading(true);

      try {
        const hasHouse = await loadHouse(user.uid);
        showScreen('main-app');

        if (!hasHouse) {
          // First login — show house setup
          el('house-setup-overlay').classList.remove('hidden');
          el('page-title').textContent = 'Welcome';
          el('main-content').innerHTML = '';
        } else {
          subscribeToData();
          navigate('dashboard');
        }
      } catch (err) {
        console.error('Init error:', err);
      } finally {
        showLoading(false);
      }
    } else {
      // Signed out
      unsubscribeAll();
      state.user    = null;
      state.house   = null;
      state.areas   = [];
      state.issues  = [];
      state.projects = [];
      hideModal();
      showScreen('auth-screen');
      showLoading(false);
    }
  });
}

initApp();
