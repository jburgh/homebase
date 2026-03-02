import { el, esc } from './utils.js';

export function showModal(title, bodyHtml, footerHtml = '') {
  el('modal-title').textContent = title;
  el('modal-body').innerHTML    = bodyHtml;
  el('modal-footer').innerHTML  = footerHtml;
  el('modal-overlay').classList.remove('hidden');
  requestAnimationFrame(() => {
    const first = el('modal-body').querySelector('input, textarea, select');
    if (first) first.focus();
  });
}

export function hideModal() {
  el('modal-overlay').classList.add('hidden');
  el('modal-body').innerHTML   = '';
  el('modal-footer').innerHTML = '';
}
window.hideModal = hideModal;

window.handleModalOverlayClick = function(e) {
  if (e.target === el('modal-overlay')) hideModal();
};

export function showConfirm(message, name, onConfirm) {
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
