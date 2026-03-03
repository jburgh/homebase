import { state } from '../state.js';
import { esc, iconTrash, iconEdit } from '../utils.js';
import { db, doc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp } from '../firebase.js';

// ── Cost helpers (exported for project-detail and dashboard) ───
export function issueSupplyCost(issueId) {
  return state.supplies
    .filter(s => s.issueId === issueId)
    .reduce((sum, s) => sum + (Number(s.quantity) || 0) * (Number(s.unitPrice) || 0), 0);
}

export function issueOutstandingCost(issueId) {
  return state.supplies
    .filter(s => s.issueId === issueId && !s.purchased)
    .reduce((sum, s) => sum + (Number(s.quantity) || 0) * (Number(s.unitPrice) || 0), 0);
}

export function projectSupplyCost(projectId) {
  return state.issues
    .filter(i => i.projectId === projectId)
    .reduce((sum, i) => sum + issueSupplyCost(i.id), 0);
}

export function projectOutstandingCost(projectId) {
  return state.issues
    .filter(i => i.projectId === projectId)
    .reduce((sum, i) => sum + issueOutstandingCost(i.id), 0);
}

export function formatCurrency(n) {
  if (!n) return '—';
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Rendering helpers ──────────────────────────────────────────
function supplyRowHtml(s) {
  const qty       = Number(s.quantity) || 1;
  const price     = Number(s.unitPrice) || 0;
  const lineTotal = qty * price;
  const purchased = !!s.purchased;
  const thumb     = s.imageUrl
    ? `<img src="${esc(s.imageUrl)}" alt="" class="supply-img" loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const placeholder = `<div class="supply-img-placeholder" ${s.imageUrl ? 'style="display:none"' : ''}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    </div>`;

  return `
    <div class="supply-row${purchased ? ' purchased' : ''}">
      <div class="supply-thumb">${thumb}${placeholder}</div>
      <div class="supply-info">
        ${s.url
          ? `<a class="supply-name" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`
          : `<span class="supply-name">${esc(s.name)}</span>`}
      </div>
      <div class="supply-qty">${qty}&times;</div>
      <div class="supply-price">${price ? formatCurrency(price) : '—'}</div>
      <div class="supply-total">${lineTotal > 0 ? formatCurrency(lineTotal) : ''}</div>
      <button type="button"
              class="supply-status-pill ${purchased ? 'purchased' : 'needed'}"
              onclick="toggleSupplyPurchased('${esc(s.id)}')"
              title="${purchased ? 'Mark as needed' : 'Mark as purchased'}">
        ${purchased ? 'Purchased' : 'Needed'}
      </button>
      <button type="button" class="icon-btn sm"
              onclick="editSupply('${esc(s.id)}')"
              title="Edit">${iconEdit()}</button>
      <button type="button" class="icon-btn sm danger"
              onclick="deleteSupply('${esc(s.id)}')"
              title="Remove">${iconTrash()}</button>
    </div>`;
}

function supplyListHtml(issueId) {
  const list = state.supplies
    .filter(s => s.issueId === issueId)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  if (list.length === 0) {
    return `<p class="supply-empty-msg">No supplies added yet.</p>`;
  }
  return list.map(supplyRowHtml).join('');
}

function supplyTotalContent(issueId) {
  const total       = issueSupplyCost(issueId);
  const outstanding = issueOutstandingCost(issueId);
  if (total === 0) return '';
  const parts = [];
  if (outstanding > 0) parts.push(`<span class="supply-outstanding">${formatCurrency(outstanding)} needed</span>`);
  parts.push(`<span class="supply-total-cost">${formatCurrency(total)} total</span>`);
  return parts.join('<span class="supply-cost-sep"> · </span>');
}

// ── Section HTML (injected into task modal) ────────────────────
export function suppliesSectionHtml(issueId) {
  return `
    <div class="divider"></div>
    <div class="supplies-section" id="supplies-section" data-issue-id="${esc(issueId)}">
      <div class="supplies-header">
        <div class="supplies-title">
          Supplies &amp; Materials
          <span class="supplies-cost-total" id="supplies-cost-total">${supplyTotalContent(issueId)}</span>
        </div>
        <button type="button" class="btn btn-sm btn-secondary"
                onclick="toggleAddSupplyForm()">+ Add Supply</button>
      </div>

      <div id="supplies-list">${supplyListHtml(issueId)}</div>

      <div id="supply-add-form" class="supply-add-form hidden">
        <input type="hidden" id="supply-edit-id">
        <div class="form-group">
          <label for="supply-url">Product URL</label>
          <div class="supply-url-wrap">
            <input type="url" id="supply-url" placeholder="https://www.amazon.com/…" autocomplete="off">
            <span id="supply-url-loading" class="supply-fetch-indicator hidden">fetching…</span>
          </div>
        </div>

        <!-- Image picker — shown after Microlink fetch -->
        <div id="supply-img-picker" class="supply-img-picker hidden">
          <p class="supply-img-picker-label">Select product image:</p>
          <div class="supply-img-picker-grid" id="supply-img-picker-grid"></div>
        </div>

        <!-- Upload fallback — always visible -->
        <div class="supply-img-upload">
          <label class="supply-upload-btn" for="supply-img-file">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload your own image
          </label>
          <input type="file" id="supply-img-file" accept="image/*" class="hidden">
        </div>

        <!-- Selected image preview -->
        <div id="supply-img-preview-wrap" class="supply-img-preview-wrap hidden">
          <img id="supply-img-preview" src="" alt="" class="supply-img-preview">
          <button type="button" class="supply-img-clear" onclick="clearSupplyImage()">✕ Remove image</button>
        </div>

        <div class="form-group">
          <label for="supply-name-input">Name <span class="req">*</span></label>
          <input type="text" id="supply-name-input" placeholder="Product name" maxlength="120">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="supply-qty">Quantity</label>
            <input type="number" id="supply-qty" value="1" min="0.01" step="any">
          </div>
          <div class="form-group">
            <label for="supply-unit-price">Unit Price ($)</label>
            <input type="number" id="supply-unit-price" placeholder="0.00" min="0" step="0.01">
          </div>
        </div>
        <input type="hidden" id="supply-image-url">
        <p id="supply-error" class="error-msg hidden"></p>
        <div class="supply-form-actions">
          <button type="button" class="btn btn-secondary btn-sm"
                  onclick="toggleAddSupplyForm()">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm"
                  id="supply-save-btn"
                  onclick="saveSupply('${esc(issueId)}')">Add Supply</button>
        </div>
      </div>
    </div>`;
}

// ── Modal refresh (called by app.js onSnapshot) ────────────────
export function refreshSupplyList() {
  const section = document.getElementById('supplies-section');
  if (!section) return;
  const issueId = section.dataset.issueId;
  const listEl  = document.getElementById('supplies-list');
  const totalEl = document.getElementById('supplies-cost-total');
  if (listEl)  listEl.innerHTML = supplyListHtml(issueId);
  if (totalEl) totalEl.innerHTML = supplyTotalContent(issueId);
}

// ── Attach listeners (called by showIssueModal) ────────────────
export function attachSupplyListeners() {
  const urlInput = document.getElementById('supply-url');
  if (urlInput) {
    urlInput.addEventListener('blur', () => {
      const url = urlInput.value.trim();
      if (url.startsWith('http')) fetchMicrolink(url);
    });
  }

  const fileInput = document.getElementById('supply-img-file');
  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      try {
        const dataUrl = await resizeImage(file);
        window.selectSupplyImage(dataUrl);
      } catch (_) {
        // silent fail
      } finally {
        fileInput.value = ''; // allow re-selecting the same file
      }
    });
  }
}

// Resize an image File to max 200×200 and return a JPEG data URL
function resizeImage(file, maxSize = 200) {
  return new Promise((resolve, reject) => {
    const img    = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      const ratio  = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('load failed')); };
    img.src = objUrl;
  });
}

// ── Microlink fetch ────────────────────────────────────────────
// Requests standard og data PLUS retailer-specific CSS selectors in one call.
// All candidates are shown in a picker grid rather than auto-selected.

// Retailer-specific selectors (selector → attribute)
const IMG_SELECTORS = [
  // Amazon
  { sel: '#landingImage',            attr: 'src'           },
  { sel: 'img[data-old-hires]',      attr: 'data-old-hires'},
  { sel: '#imgBlkFront',             attr: 'src'           },
  // Home Depot
  { sel: '.mediafull__image',        attr: 'src'           },
  { sel: '.product-image img',       attr: 'src'           },
  // Lowe's
  { sel: '.pdp-main-image img',      attr: 'src'           },
  { sel: 'img[data-testid="main-product-image"]', attr: 'src' },
  // Generic e-commerce fallbacks
  { sel: 'img[itemprop="image"]',    attr: 'src'           },
  { sel: '.product__image img',      attr: 'src'           },
];

function extractUrl(val) {
  if (!val) return null;
  if (typeof val === 'string' && val.startsWith('http')) return val;
  if (val && typeof val === 'object' && val.url) return val.url;
  return null;
}

async function fetchMicrolink(url) {
  const loadingEl = document.getElementById('supply-url-loading');
  if (loadingEl) loadingEl.classList.remove('hidden');
  try {
    // Build query: standard og metadata + one param per selector
    const params = new URLSearchParams({ url });
    IMG_SELECTORS.forEach(({ sel, attr }, i) => {
      params.set(`data.i${i}.selector`, sel);
      params.set(`data.i${i}.attr`,     attr);
    });

    const res  = await fetch(`https://api.microlink.io/?${params}`);
    const json = await res.json();
    if (json.status !== 'success') return;

    // Auto-fill name if empty
    const nameInput = document.getElementById('supply-name-input');
    if (nameInput && !nameInput.value.trim() && json.data.title) {
      nameInput.value = json.data.title.slice(0, 120);
    }

    // Collect all unique candidate image URLs
    const candidates = [];
    // Custom-selector results
    IMG_SELECTORS.forEach((_, i) => {
      const u = extractUrl(json.data[`i${i}`]);
      if (u) candidates.push(u);
    });
    // Standard og fields (append last — usually lower quality for product pages)
    [json.data.image, json.data.logo].forEach(v => {
      const u = extractUrl(v);
      if (u) candidates.push(u);
    });

    const unique = [...new Set(candidates)];
    if (unique.length > 0) showImagePicker(unique);

  } catch (_) {
    // silent fail — Microlink is best-effort
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

function showImagePicker(urls) {
  const picker     = document.getElementById('supply-img-picker');
  const grid       = document.getElementById('supply-img-picker-grid');
  const currentUrl = document.getElementById('supply-image-url')?.value || '';
  if (!picker || !grid) return;

  grid.innerHTML = urls.map(u => `
    <button type="button"
            class="supply-img-option ${u === currentUrl ? 'selected' : ''}"
            onclick="selectSupplyImage('${esc(u)}')"
            title="${esc(u)}">
      <img src="${esc(u)}" alt="" loading="lazy"
           onerror="this.closest('.supply-img-option').style.display='none'">
    </button>`).join('');

  picker.classList.remove('hidden');
}

// ── Shared form helpers ────────────────────────────────────────
function resetSupplyForm() {
  const fields = { 'supply-edit-id': '', 'supply-url': '', 'supply-name-input': '', 'supply-unit-price': '' };
  Object.entries(fields).forEach(([id, val]) => {
    const inp = document.getElementById(id);
    if (inp) inp.value = val;
  });
  const qtyEl = document.getElementById('supply-qty');
  if (qtyEl) qtyEl.value = '1';
  window.clearSupplyImage();
  const picker = document.getElementById('supply-img-picker');
  if (picker) picker.classList.add('hidden');
  const btn = document.getElementById('supply-save-btn');
  if (btn) btn.textContent = 'Add Supply';
  const errEl = document.getElementById('supply-error');
  if (errEl) errEl.classList.add('hidden');
}

// ── Window globals ─────────────────────────────────────────────
window.selectSupplyImage = function(url) {
  const hiddenInput = document.getElementById('supply-image-url');
  const previewWrap = document.getElementById('supply-img-preview-wrap');
  const previewImg  = document.getElementById('supply-img-preview');
  if (hiddenInput) hiddenInput.value = url;
  if (previewImg) {
    previewImg.src     = url;
    previewImg.onerror = () => {
      if (previewWrap) previewWrap.classList.add('hidden');
      if (hiddenInput) hiddenInput.value = '';
    };
  }
  if (previewWrap) previewWrap.classList.remove('hidden');

  // Highlight selected thumbnail in picker
  document.querySelectorAll('.supply-img-option').forEach(btn => {
    btn.classList.toggle('selected', btn.querySelector('img')?.src === url);
  });
};

window.toggleAddSupplyForm = function() {
  const form = document.getElementById('supply-add-form');
  if (!form) return;
  const willShow = form.classList.contains('hidden');
  if (!willShow) resetSupplyForm();
  form.classList.toggle('hidden');
  if (willShow) {
    setTimeout(() => document.getElementById('supply-url')?.focus(), 50);
  }
};

window.editSupply = function(supplyId) {
  const s = state.supplies.find(s => s.id === supplyId);
  if (!s) return;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  set('supply-edit-id',    supplyId);
  set('supply-url',        s.url       || '');
  set('supply-name-input', s.name      || '');
  set('supply-qty',        s.quantity  || 1);
  set('supply-unit-price', s.unitPrice || '');
  set('supply-image-url',  s.imageUrl  || '');

  // Show current image in picker (single-item grid) and as preview
  const picker = document.getElementById('supply-img-picker');
  if (picker) picker.classList.add('hidden');

  const previewWrap = document.getElementById('supply-img-preview-wrap');
  const previewImg  = document.getElementById('supply-img-preview');
  if (s.imageUrl && previewImg && previewWrap) {
    previewImg.src = s.imageUrl;
    previewWrap.classList.remove('hidden');
  } else if (previewWrap) {
    previewWrap.classList.add('hidden');
  }

  const btn = document.getElementById('supply-save-btn');
  if (btn) btn.textContent = 'Save Changes';

  const form = document.getElementById('supply-add-form');
  if (form) {
    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

window.clearSupplyImage = function() {
  const hiddenInput = document.getElementById('supply-image-url');
  const previewWrap = document.getElementById('supply-img-preview-wrap');
  if (hiddenInput) hiddenInput.value = '';
  if (previewWrap) previewWrap.classList.add('hidden');
  document.querySelectorAll('.supply-img-option').forEach(btn => btn.classList.remove('selected'));
};

window.saveSupply = async function(issueId) {
  const editId    = (document.getElementById('supply-edit-id')?.value    || '').trim();
  const name      = (document.getElementById('supply-name-input')?.value || '').trim();
  const url       = (document.getElementById('supply-url')?.value        || '').trim();
  const imageUrl  = (document.getElementById('supply-image-url')?.value  || '').trim();
  const quantity  = parseFloat(document.getElementById('supply-qty')?.value)        || 1;
  const unitPrice = parseFloat(document.getElementById('supply-unit-price')?.value) || 0;
  const errEl     = document.getElementById('supply-error');

  if (!name) {
    if (errEl) { errEl.textContent = 'Name is required.'; errEl.classList.remove('hidden'); }
    return;
  }
  if (errEl) errEl.classList.add('hidden');

  const btn = document.getElementById('supply-save-btn');
  if (btn) btn.disabled = true;

  try {
    const data = {
      name,
      url:            url      || null,
      imageUrl:       imageUrl || null,
      quantity,
      unitPrice,
      priceUpdatedAt: unitPrice ? serverTimestamp() : null,
    };

    if (editId) {
      await updateDoc(doc(db, 'supplies', editId), data);
    } else {
      await addDoc(collection(db, 'supplies'), {
        ...data,
        houseId:   state.user.uid,
        issueId,
        purchased: false,
        createdAt: serverTimestamp()
      });
    }

    resetSupplyForm();
    const form = document.getElementById('supply-add-form');
    if (form) form.classList.add('hidden');
    refreshSupplyList();
  } catch (err) {
    console.error(err);
    if (errEl) { errEl.textContent = 'Failed to save. Please try again.'; errEl.classList.remove('hidden'); }
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.toggleSupplyPurchased = async function(supplyId) {
  const s = state.supplies.find(s => s.id === supplyId);
  if (!s) return;
  const newVal = !s.purchased;
  s.purchased = newVal;
  refreshSupplyList();
  try {
    await updateDoc(doc(db, 'supplies', supplyId), { purchased: newVal });
  } catch (e) {
    console.error(e);
    s.purchased = !newVal;
    refreshSupplyList();
  }
};

window.deleteSupply = async function(supplyId) {
  state.supplies = state.supplies.filter(s => s.id !== supplyId);
  refreshSupplyList();
  try {
    await deleteDoc(doc(db, 'supplies', supplyId));
  } catch (e) {
    console.error(e);
  }
};
