import { state } from '../state.js';
import { el, esc, typeBadge, priorityBadge, statusToggleClass, statusToggleIcon, getAreaName, iconTrash } from '../utils.js';
import { showModal, hideModal, showConfirm } from '../modal.js';
import { db, doc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp } from '../firebase.js';

const chevron = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6,9 12,15 18,9"/></svg>`;

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

export function issueCard(issue) {
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

window.showIssueModal = function(issue = null, defaultProjectId = null) {
  const isEdit     = !!issue;
  const areaChecks = state.areas.map(a => {
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
    isEdit ? 'Edit Task' : 'Add Task',
    bodyHtml,
    `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
     <button class="btn btn-primary" id="issue-save-btn">${isEdit ? 'Save Changes' : 'Add Task'}</button>`
  );

  el('issue-save-btn').addEventListener('click', () => handleIssueSave(issue?.id || null));
  el('issue-form').addEventListener('submit', e => { e.preventDefault(); handleIssueSave(issue?.id || null); });
};

window.showIssueModalById = function(id) {
  window.showIssueModal(state.issues.find(i => i.id === id) || null);
};

async function handleIssueSave(id) {
  const name      = el('issue-name').value.trim();
  const type      = el('issue-type').value;
  const status    = el('issue-status').value;
  const priority  = el('issue-priority')?.value || '';
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
      houseId:     state.user.uid,
      areaIds,
      projectId:   projectId || null,
      description: desc  || null,
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
  showConfirm('Delete this task permanently?', name, async () => {
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
