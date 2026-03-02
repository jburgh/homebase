import { state } from '../state.js';
import { el, esc, iconEdit, iconTrash } from '../utils.js';
import { showModal, hideModal, showConfirm } from '../modal.js';
import { db, doc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp } from '../firebase.js';

export function areasView() {
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
          <p>No areas yet.<br>Add rooms and spaces to organise your tasks.</p>
          <button class="btn btn-primary" onclick="showAreaModal()">Add an Area</button>
        </div>
      ` : `
        <div class="list">
          ${state.areas.map(a => {
            const count = state.issues.filter(i => i.areaIds && i.areaIds.includes(a.id)).length;
            return `
              <div class="list-item">
                <div class="list-item-main clickable" onclick="navigateIssuesByArea('${esc(a.id)}')">
                  <div class="list-item-title">${esc(a.name)}</div>
                  ${a.description ? `<div class="list-item-subtitle">${esc(a.description)}</div>` : ''}
                  <div class="list-item-meta">${count} task${count !== 1 ? 's' : ''}</div>
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

window.showAreaModal = function(area = null) {
  const isEdit   = !!area;
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
  window.showAreaModal(state.areas.find(a => a.id === id) || null);
};

async function handleAreaSave(id) {
  const name  = el('area-name').value.trim();
  const desc  = el('area-desc').value.trim();
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
    if (id) {
      await updateDoc(doc(db, 'areas', id), { name, description: desc });
    } else {
      await addDoc(collection(db, 'areas'), {
        name, houseId: state.user.uid,
        ...(desc && { description: desc }),
        createdAt: serverTimestamp()
      });
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
  showConfirm('Delete this area? Tasks in this area will not be deleted.', name, async () => {
    try {
      await deleteDoc(doc(db, 'areas', id));
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
