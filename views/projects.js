import { state } from '../state.js';
import { el, esc, projStatusBadge, getProjectIssueCounts } from '../utils.js';
import { showModal, hideModal, showConfirm } from '../modal.js';
import { db, doc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp } from '../firebase.js';

export function projectsView() {
  const groups = [
    { label: 'In Progress', items: state.projects.filter(p => p.status === 'In Progress') },
    { label: 'Planning',    items: state.projects.filter(p => p.status === 'Planning') },
    { label: 'Complete',    items: state.projects.filter(p => p.status === 'Complete') },
  ].filter(g => g.items.length > 0);

  return `
    <div class="view-content">
      <div class="section-header">
        <h3>Projects (${state.projects.length})</h3>
        <button class="btn btn-sm btn-primary" onclick="showProjectModal()">+ Add</button>
      </div>

      ${state.projects.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
            </svg>
          </div>
          <p>No projects yet.<br>Create one to get started.</p>
          <button class="btn btn-primary" onclick="showProjectModal()">Create Project</button>
        </div>
      ` : groups.map(g => `
        <div class="section-header mt-4">
          <h3>${g.label}</h3>
        </div>
        <div class="list">
          ${g.items.map(p => {
            const c = getProjectIssueCounts(p.id);
            return `
              <div class="list-item clickable" onclick="navigate('project', {projectId:'${esc(p.id)}'})">
                <div class="list-item-main">
                  <div class="list-item-title">${esc(p.name)}</div>
                  ${p.description ? `<div class="list-item-subtitle">${esc(p.description)}</div>` : ''}
                  <div class="list-item-meta">${c.total} task${c.total !== 1 ? 's' : ''}${c.done > 0 ? ` · ${c.done} done` : ''}${c.inProgress > 0 ? ` · ${c.inProgress} in progress` : ''}</div>
                </div>
                ${projStatusBadge(p.status)}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
              </div>`;
          }).join('')}
        </div>
      `).join('')}
    </div>`;
}

window.showProjectModal = function(idOrNull = null) {
  const project = typeof idOrNull === 'string'
    ? state.projects.find(p => p.id === idOrNull)
    : null;
  const isEdit = !!project;

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
          ${['Planning','In Progress','Complete'].map(s =>
            `<option value="${s}" ${(project?.status || 'Planning') === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="proj-desc">Description</label>
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
      if (state.currentView === 'project' && state.currentProjectId === id) {
        el('page-title').textContent = name;
      }
    } else {
      data.houseId   = state.user.uid;
      data.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, 'projects'), data);
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
    'Delete this project? Associated tasks will remain but be unlinked.',
    name,
    async () => {
      try {
        await deleteDoc(doc(db, 'projects', id));
        const linked = state.issues.filter(i => i.projectId === id);
        await Promise.all(linked.map(i =>
          updateDoc(doc(db, 'issues', i.id), { projectId: null })
        ));
        navigate('projects');
      } catch (e) { console.error(e); }
    }
  );
};
