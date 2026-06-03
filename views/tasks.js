import { state } from '../state.js';
import { el, esc, typeBadge, priorityBadge, statusToggleClass, statusToggleIcon, getAreaName, iconTrash, calcScore, scoreBadge } from '../utils.js';
import { showModal, hideModal, showConfirm } from '../modal.js';
import { db, doc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp } from '../firebase.js';
import { suppliesSectionHtml, attachSupplyListeners, issueOutstandingCost, formatCurrency } from './supplies.js';

const chevron  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6,9 12,15 18,9"/></svg>`;
const gripIcon  = `<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="3" cy="2" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="3" cy="14" r="1.5"/><circle cx="7" cy="2" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="7" cy="14" r="1.5"/></svg>`;

function filterDropdown(key, label, selected, options) {
  const active = selected.length > 0;
  return `
    <div class="filter-dropdown" id="fd-${key}">
      <button class="filter-dropdown-btn ${active ? 'has-filter' : ''}" data-fd="${key}">
        ${label} ${chevron}
      </button>
      <div class="filter-dropdown-panel" id="fdp-${key}">
        ${options.map(opt => `
          <label class="filter-check-label">
            <input type="checkbox" class="filter-check"
                   data-filter-key="${key}" data-filter-val="${esc(opt.value)}"
                   ${selected.includes(opt.value) ? 'checked' : ''}>
            ${esc(opt.label)}
          </label>`).join('')}
        ${active ? `
          <div class="filter-panel-footer">
            <button class="filter-clear-btn" onclick="clearFilter('${key}', event)">Clear</button>
          </div>` : ''}
      </div>
    </div>`;
}

export function issuesView() {
  const { status, area, type } = state.issueFilters;

  let filtered = [...state.issues];
  if (status.length > 0) filtered = filtered.filter(i => status.includes(i.status));
  if (area.length   > 0) filtered = filtered.filter(i => i.areaIds && area.some(a => i.areaIds.includes(a)));
  if (type.length   > 0) filtered = filtered.filter(i => type.includes(i.type));
  filtered.sort((a, b) => calcScore(b) - calcScore(a));

  const hasFilters  = status.length + area.length + type.length > 0;
  const statusLabel = status.length === 0 ? 'Status'
    : status.length === 1 ? `Status: ${status[0]}` : `Status (${status.length})`;
  const areaLabel   = area.length === 0 ? 'Area'
    : area.length === 1 ? `Area: ${esc(state.areas.find(a => a.id === area[0])?.name || '')}` : `Area (${area.length})`;
  const typeLabel   = type.length === 0 ? 'Type'
    : type.length === 1 ? `Type: ${type[0]}` : `Type (${type.length})`;

  const statusOpts = ['Open','In Progress','Done'].map(s => ({ value: s, label: s }));
  const typeOpts   = ['Fix','Clean','Replace','Build','Improve','Other'].map(t => ({ value: t, label: t }));
  const areaOpts   = state.areas.map(a => ({ value: a.id, label: a.name }));

  const countLabel = hasFilters && filtered.length !== state.issues.length
    ? `${filtered.length} of ${state.issues.length}`
    : state.issues.length;

  return `
    <div class="view-content">
      <div class="section-header">
        <h3>Tasks <span class="count-pill">${countLabel}</span></h3>
        <button class="btn btn-sm btn-primary" onclick="showIssueModal()">+ Add Task</button>
      </div>

      <div class="filter-row">
        ${filterDropdown('status', statusLabel, status, statusOpts)}
        ${state.areas.length > 0 ? filterDropdown('area', areaLabel, area, areaOpts) : ''}
        ${filterDropdown('type', typeLabel, type, typeOpts)}
        ${hasFilters ? `<button class="filter-clear-all" onclick="clearAllFilters()">Clear all</button>` : ''}
      </div>

      ${filtered.length === 0 ? `
        <div class="empty-state">
          <p>${state.issues.length === 0 ? 'No tasks yet. Add one to get started.' : 'No tasks match the selected filters.'}</p>
          ${state.issues.length === 0 ? `<button class="btn btn-primary" onclick="showIssueModal()">Add a Task</button>` : ''}
        </div>
      ` : `
        <div class="issue-list">
          ${filtered.map(i => issueCard(i)).join('')}
        </div>
      `}
    </div>`;
}

export function issueCard(issue, { draggable = false } = {}) {
  const toggleCls   = statusToggleClass(issue.status);
  const icon        = statusToggleIcon(issue.status);
  const areaNames   = (issue.areaIds || [])
    .map(id => getAreaName(id))
    .filter(Boolean)
    .join(', ');
  const outstanding = issueOutstandingCost(issue.id);

  return `
    <div class="issue-card" data-id="${esc(issue.id)}">
      ${draggable ? `<span class="drag-handle" title="Drag to reorder">${gripIcon}</span>` : ''}
      <button class="status-toggle ${toggleCls}"
              onclick="cycleIssueStatus('${esc(issue.id)}','${esc(issue.status)}')"
              title="Toggle status">${icon}</button>
      <div class="issue-body" onclick="showIssueModalById('${esc(issue.id)}')">
        <div class="issue-name">${esc(issue.name)}</div>
        <div class="issue-meta">
          ${typeBadge(issue.type)}
          ${issue.priority ? priorityBadge(issue.priority) : ''}
          ${areaNames ? `<span class="text-muted" style="font-size:0.78rem">${esc(areaNames)}</span>` : ''}
          ${outstanding > 0 ? `<span class="supply-badge-needed">${formatCurrency(outstanding)} needed</span>` : ''}
        </div>
      </div>
      ${scoreBadge(issue)}
      <div class="issue-actions">
        <button class="icon-btn sm danger" onclick="confirmDeleteIssue('${esc(issue.id)}','${esc(issue.name)}')" title="Delete">
          ${iconTrash()}
        </button>
      </div>
    </div>`;
}

window.showIssueModal = function(issue = null, defaultProjectId = null) {
  const isEdit     = !!issue;
  const areaChecks = state.areas.map(a => {
    const checked = issue?.areaIds?.includes(a.id) ? 'checked' : '';
    return `<label class="checkbox-label">
      <input type="checkbox" value="${esc(a.id)}" ${checked}>
      ${esc(a.name)}
    </label>`;
  }).join('');

  const selectedAreaNames = (issue?.areaIds || [])
    .map(id => state.areas.find(a => a.id === id)?.name).filter(Boolean);
  const areasLabel = selectedAreaNames.length === 0 ? 'None'
    : selectedAreaNames.length === 1 ? selectedAreaNames[0]
    : `${selectedAreaNames.length} selected`;

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
        <label for="issue-priority">Priority</label>
        <select id="issue-priority">
          <option value="">None</option>
          ${['Low','Medium','High','Critical'].map(p =>
            `<option value="${p}" ${(issue?.priority || '') === p ? 'selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="issue-effort">Effort</label>
          <select id="issue-effort">
            <option value="">Unknown</option>
            ${['Novice','Apprentice','Expert','Pro'].map(e =>
              `<option value="${e}" ${(issue?.effort || '') === e ? 'selected' : ''}>${e}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="issue-cost">Cost Tier</label>
          <select id="issue-cost">
            <option value="">Unknown</option>
            ${['Free','$','$$','$$$'].map(c =>
              `<option value="${c}" ${(issue?.costTier || '') === c ? 'selected' : ''}>${c}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      ${state.areas.length > 0 ? `
        <div class="form-group">
          <label>Areas</label>
          <div class="modal-multiselect" id="modal-areas-ms">
            <button type="button" class="modal-multiselect-btn"
                    onclick="toggleModalMultiselect('modal-areas-ms', event)">
              <span id="modal-areas-label">${areasLabel}</span>
              ${chevron}
            </button>
            <div class="modal-multiselect-panel hidden">
              <div class="checkbox-group">${areaChecks}</div>
            </div>
          </div>
        </div>
      ` : ''}
      ${state.projects.length > 0 ? `
        <div class="form-group">
          <label for="issue-project">Project</label>
          <select id="issue-project">
            <option value="">None</option>
            ${projOptions}
          </select>
        </div>
      ` : ''}
      <div class="form-group">
        <label for="issue-desc">Description</label>
        <textarea id="issue-desc" rows="2" maxlength="500"
                  placeholder="More details…">${esc(issue?.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label for="issue-notes">Notes</label>
        <textarea id="issue-notes" rows="2" maxlength="500"
                  placeholder="Any additional notes…">${esc(issue?.notes || '')}</textarea>
      </div>
      <p id="issue-error" class="error-msg hidden"></p>
    </form>
    ${isEdit ? suppliesSectionHtml(issue.id) : ''}`;

  showModal(
    isEdit ? 'Edit Task' : 'Add Task',
    bodyHtml,
    `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
     <button class="btn btn-primary" id="issue-save-btn">${isEdit ? 'Save Changes' : 'Add Task'}</button>`
  );

  el('issue-save-btn').addEventListener('click', () => handleIssueSave(issue?.id || null));
  el('issue-form').addEventListener('submit', e => { e.preventDefault(); handleIssueSave(issue?.id || null); });
  if (isEdit) attachSupplyListeners();

  // Areas multiselect: update label on change, close on outside click
  const areasGroup = document.querySelector('#modal-areas-ms .checkbox-group');
  if (areasGroup) {
    areasGroup.addEventListener('change', () => {
      const checked = areasGroup.querySelectorAll('input:checked');
      const labelEl = document.getElementById('modal-areas-label');
      if (!labelEl) return;
      labelEl.textContent = checked.length === 0 ? 'None'
        : checked.length === 1 ? (checked[0].closest('label')?.textContent.trim() || '1 selected')
        : `${checked.length} selected`;
    });
  }
  document.addEventListener('click', function closeAreasMs(e) {
    const ms = document.getElementById('modal-areas-ms');
    if (!ms) { document.removeEventListener('click', closeAreasMs); return; }
    if (!ms.contains(e.target)) {
      ms.querySelector('.modal-multiselect-panel')?.classList.add('hidden');
    }
  });
};

window.showIssueModalById = function(id) {
  window.showIssueModal(state.issues.find(i => i.id === id) || null);
};

async function handleIssueSave(id) {
  const name      = el('issue-name').value.trim();
  const type      = el('issue-type').value;
  const status    = el('issue-status').value;
  const priority  = el('issue-priority')?.value || '';
  const effort    = el('issue-effort')?.value || '';
  const costTier  = el('issue-cost')?.value || '';
  const desc      = el('issue-desc').value.trim();
  const notes     = el('issue-notes').value.trim();
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
      name, type, status,
      houseId:     state.house.id,
      areaIds,
      projectId:   projectId || null,
      description: desc      || null,
      notes:       notes     || null,
      priority:    priority  || null,
      effort:      effort    || null,
      costTier:    costTier  || null,
      updatedAt:   serverTimestamp()
    };
    if (id) {
      const oldIssue = state.issues.find(i => i.id === id);
      await updateDoc(doc(db, 'issues', id), data);
      if (oldIssue?.projectId && oldIssue.projectId !== (projectId || null)) {
        await syncProjectStatus(oldIssue.projectId, id, null);
      }
      await syncProjectStatus(projectId || null, id, status);
    } else {
      data.createdAt = serverTimestamp();
      data.sortOrder = Date.now();
      const ref = await addDoc(collection(db, 'issues'), data);
      await syncProjectStatus(projectId || null, ref.id, status);
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
  showConfirm('Delete this task permanently?', name, async () => {
    try { await deleteDoc(doc(db, 'issues', id)); } catch (e) { console.error(e); }
  });
};

window.toggleModalMultiselect = function(id, event) {
  if (event) event.stopPropagation();
  const ms = document.getElementById(id);
  if (!ms) return;
  ms.querySelector('.modal-multiselect-panel')?.classList.toggle('hidden');
};

window.cycleIssueStatus = async function(id, current) {
  const next      = { 'Open': 'In Progress', 'In Progress': 'Done', 'Done': 'Open' };
  const newStatus = next[current] || 'Open';
  try {
    await updateDoc(doc(db, 'issues', id), { status: newStatus, updatedAt: serverTimestamp() });
    const issue = state.issues.find(i => i.id === id);
    await syncProjectStatus(issue?.projectId, id, newStatus);
  } catch (e) { console.error(e); }
};

async function syncProjectStatus(projectId, changedIssueId, newStatus) {
  if (!projectId) return;
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;

  // Build virtual issues list: existing project issues with the changed one swapped in
  const others = state.issues.filter(i => i.projectId === projectId && i.id !== changedIssueId);
  const issues  = newStatus != null ? [...others, { status: newStatus }] : others;
  if (issues.length === 0) return;

  const allDone   = issues.every(i => i.status === 'Done');
  const anyActive = issues.some(i => i.status === 'In Progress' || i.status === 'Done');

  let newProjectStatus;
  if (allDone && (project.status === 'Planning' || project.status === 'In Progress')) {
    newProjectStatus = 'Complete';
  } else if (anyActive && project.status === 'Planning') {
    newProjectStatus = 'In Progress';
  }

  if (newProjectStatus) {
    await updateDoc(doc(db, 'projects', projectId), { status: newProjectStatus, updatedAt: serverTimestamp() });
  }
}
