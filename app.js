// ============================================================
// app.js — HomeBase SPA (orchestrator)
// ============================================================

import {
  auth, db,
  doc, setDoc, getDoc, updateDoc, collection, query, where, orderBy, onSnapshot, serverTimestamp,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, fbSignOut,
  onAuthStateChanged, browserLocalPersistence, setPersistence
} from './firebase.js';
import { state } from './state.js';
import { el, esc, showLoading } from './utils.js';
import { showModal, hideModal } from './modal.js';
import { dashboardView } from './views/dashboard.js';
import { areasView } from './views/areas.js';
import { issuesView } from './views/tasks.js';
import { projectsView } from './views/projects.js';
import { projectView } from './views/project-detail.js';
import { refreshSupplyList } from './views/supplies.js';

// ── Theme ─────────────────────────────────────────────────────
(function() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = saved;
})();

window.toggleTheme = function() {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
};

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
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/invalid-credential':   'Invalid email or password.',
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/too-many-requests':    'Too many attempts. Please try again later.',
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
    ...(address   && { address }),
    ...(yearBuilt && { yearBuilt: parseInt(yearBuilt, 10) })
  };
  await setDoc(doc(db, 'houses', uid), data);
  state.house = { id: uid, ...data };
}

async function updateHouse(name, address, yearBuilt) {
  const uid  = state.user.uid;
  const data = {
    name,
    ...(address   !== undefined && { address }),
    ...(yearBuilt !== undefined && { yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) : null })
  };
  await updateDoc(doc(db, 'houses', uid), data);
  state.house = { ...state.house, ...data };
  el('page-title').textContent = name || 'Dashboard';
}

el('house-setup-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name      = el('house-name-input').value.trim();
  const address   = el('house-address-input').value.trim();
  const yearBuilt = el('house-year-input').value;
  const errEl     = el('house-setup-error');
  const btn       = el('house-setup-btn');

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

  const areasQ = query(collection(db, 'areas'), where('houseId', '==', houseId), orderBy('createdAt', 'asc'));
  state.unsubscribers.push(onSnapshot(areasQ, snap => {
    state.areas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  }));

  const issuesQ = query(collection(db, 'issues'), where('houseId', '==', houseId), orderBy('createdAt', 'desc'));
  state.unsubscribers.push(onSnapshot(issuesQ, snap => {
    state.issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  }));

  const projectsQ = query(collection(db, 'projects'), where('houseId', '==', houseId), orderBy('createdAt', 'desc'));
  state.unsubscribers.push(onSnapshot(projectsQ, snap => {
    state.projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  }));

  const suppliesQ = query(collection(db, 'supplies'), where('houseId', '==', houseId));
  state.unsubscribers.push(onSnapshot(suppliesQ, snap => {
    state.supplies = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
    refreshSupplyList();
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

  document.querySelectorAll('#bottom-nav .nav-btn, #sidebar .nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

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
      issues:    'Tasks',
      projects:  'Projects'
    };
    title.textContent = labels[view] || '';
  }

  renderView();
};

window.handleBack = function() {
  navigate('projects');
};

window.navigateIssuesByStatus = function(status) {
  state.issueFilters.status = status === 'all' ? [] : [status];
  navigate('issues');
};

window.navigateIssuesByArea = function(areaId) {
  state.issueFilters.area = areaId === 'all' ? [] : [areaId];
  navigate('issues');
};

window.clearFilter = function(key, event) {
  event.stopPropagation();
  state.issueFilters[key] = [];
  renderView();
};

window.clearAllFilters = function() {
  state.issueFilters = { status: [], area: [], type: [] };
  renderView();
};

// ── View Router ───────────────────────────────────────────────
function renderView() {
  const content = el('main-content');
  switch (state.currentView) {
    case 'dashboard': content.innerHTML = dashboardView(); break;
    case 'areas':     content.innerHTML = areasView();     break;
    case 'issues':    content.innerHTML = issuesView();    break;
    case 'projects':  content.innerHTML = projectsView();  break;
    case 'project':   content.innerHTML = projectView();   break;
    default:          content.innerHTML = dashboardView();
  }
  attachFilterListeners();
}

let openFilterDropdown = null;

function attachFilterListeners() {
  // Re-open the dropdown that was open before re-render
  if (openFilterDropdown) {
    const panel = document.getElementById(`fdp-${openFilterDropdown}`);
    if (panel) panel.classList.add('open');
  }

  // Checkbox changes — toggle value in the array
  document.querySelectorAll('.filter-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const { filterKey, filterVal } = cb.dataset;
      const arr = state.issueFilters[filterKey];
      state.issueFilters[filterKey] = cb.checked
        ? [...arr, filterVal]
        : arr.filter(v => v !== filterVal);
      renderView();
    });
  });

  // Dropdown button toggles
  document.querySelectorAll('[data-fd]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key   = btn.dataset.fd;
      const panel = document.getElementById(`fdp-${key}`);
      const isOpen = panel.classList.contains('open');
      document.querySelectorAll('.filter-dropdown-panel.open').forEach(p => p.classList.remove('open'));
      openFilterDropdown = null;
      if (!isOpen) {
        panel.classList.add('open');
        openFilterDropdown = key;
      }
    });
  });
}

// Close all filter dropdowns when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.filter-dropdown-panel.open').forEach(p => p.classList.remove('open'));
  openFilterDropdown = null;
});

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
        <label for="settings-address">Address</label>
        <input type="text" id="settings-address" value="${esc(h.address || '')}" maxlength="200">
      </div>
      <div class="form-group">
        <label for="settings-year">Year Built</label>
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
      unsubscribeAll();
      state.user     = null;
      state.house    = null;
      state.areas    = [];
      state.issues   = [];
      state.projects = [];
      state.supplies = [];
      hideModal();
      showScreen('auth-screen');
      showLoading(false);
    }
  });
}

initApp();
