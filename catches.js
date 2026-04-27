const CATCH_KEY = 'rfa.catches';

function loadCatches() {
  try { return JSON.parse(localStorage.getItem(CATCH_KEY) || '[]'); }
  catch { return []; }
}
function saveCatches(arr) {
  localStorage.setItem(CATCH_KEY, JSON.stringify(arr));
}
function addCatch(c) {
  const arr = loadCatches();
  arr.unshift(c);
  saveCatches(arr);
}
function deleteCatch(id) {
  saveCatches(loadCatches().filter(c => c.id !== id));
}

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    if (!file) return res(null);
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function renderCatchList(filter = '') {
  const list = document.getElementById('catchList');
  const q = filter.trim().toLowerCase();
  const items = loadCatches().filter(c => {
    if (!q) return true;
    return (c.species || '').toLowerCase().includes(q)
      || (c.spotName || '').toLowerCase().includes(q);
  });
  if (!items.length) {
    list.innerHTML = `<div class="empty">
      <div class="em-glyph">🎣</div>
      <div>No catches yet — land one and log it.</div>
    </div>`;
    return;
  }
  list.innerHTML = items.map(c => {
    const date = new Date(c.at).toLocaleDateString([], { day: 'numeric', month: 'short' })
      + ' · ' + new Date(c.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const len = c.length ? `${c.length} cm` : '';
    const wt = c.weight ? `${c.weight} kg` : '';
    const size = [len, wt].filter(Boolean).join(' · ');
    const cond = c.conditions
      ? `Safety ${c.conditions.score}/100 · Swell ${(c.conditions.swellHeight??0).toFixed(1)}m · Wind ${(c.conditions.windSpeed??0).toFixed(0)}km/h`
      : '';
    const img = c.photo
      ? `<img src="${c.photo}" alt="" />`
      : `<div class="ph">🐟</div>`;
    return `<div class="catch-item">
      ${img}
      <div>
        <div class="species">${escapeHtml(c.species)}${size ? ' · ' + size : ''}</div>
        <div class="meta">${escapeHtml(c.spotName)} · ${date}</div>
        ${c.bait ? `<div class="meta">Bait: ${escapeHtml(c.bait)}</div>` : ''}
        ${c.notes ? `<div class="meta">${escapeHtml(c.notes)}</div>` : ''}
        ${cond ? `<div class="meta">${cond}</div>` : ''}
      </div>
      <button class="del" data-del="${c.id}" aria-label="Delete">✕</button>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => {
      if (confirm('Delete this catch?')) {
        deleteCatch(btn.dataset.del);
        renderCatchList(document.getElementById('catchFilter').value);
      }
    };
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
