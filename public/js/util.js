/* Util klien: helper tampilan, API, modal, grafik. Semua teks dari luar HARUS lewat esc(). */
const App = { state: { user: null, canRegister: false, projects: [], pid: null, d: null, period: 30, view: 'ringkasan', ui: { content: { q: '', fmt: '', sort: 'date', dir: 'desc' }, metric: 'engagements', month: null, ideaQ: '', ideaStatus: '' } }, acts: {}, ins: {}, views: {} };
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NA = '<span class="na" title="Data belum tersedia">–</span>';
const nf = new Intl.NumberFormat('id-ID');
const fN = (v) => (v === null || v === undefined ? NA : nf.format(v));
const fPct = (v, d) => (v === null || v === undefined ? NA : v.toFixed(d === undefined ? 1 : d).replace('.', ',') + '%');
const fPp = (v) => (v === null || v === undefined ? NA : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') + ' poin');
const fChg = (v) => (v === null || v === undefined ? NA : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') + '%');
const fDiff = (v) => (v === null || v === undefined ? NA : (v > 0 ? '+' : v < 0 ? '−' : '') + nf.format(Math.abs(v)));
const fDate = (s) => { if (!s || !Calc.validDate(s)) return NA; const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const fDateTime = (iso) => { if (!iso) return null; const tz = (App.state.d && App.state.d.project.timezone) || 'Asia/Jakarta'; try { return new Date(iso).toLocaleString('id-ID', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + (tz === 'Asia/Jakarta' ? ' WIB' : ''); } catch (e) { return iso; } };
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
const modeLabel = { demo: 'Demo', csv: 'CSV', meta: 'Meta Insights' };
const modeChip = (m) => '<span class="chip ' + m + '">' + modeLabel[m] + '</span>';
const P = () => App.state.d.project;
const today = () => Calc.todayIn(P().timezone);

async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, credentials: 'same-origin', headers: Object.assign({ 'X-Requested-With': 'fetch' }, body !== undefined ? { 'Content-Type': 'application/json' } : {}), body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) { throw Object.assign(new Error('Tidak bisa terhubung ke server. Pastikan aplikasi masih berjalan.'), { network: true }); }
  let data = null; try { data = await res.json(); } catch (e) { /* kosong */ }
  if (res.status === 401 && url.indexOf('/api/login') === -1 && url.indexOf('/api/register') === -1) { App.state.user = null; App.renderApp(); throw new Error('Sesi berakhir. Masuk lagi.'); }
  if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Permintaan gagal (' + res.status + ').'), { data, status: res.status });
  return data;
}
const pj = (suffix) => '/api/projects/' + App.state.pid + (suffix || '');

let toastTimer;
function toast(msg, err) {
  let t = $('#toast'); if (t) t.remove();
  t = document.createElement('div'); t.id = 'toast'; t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', err ? 'alert' : 'status'); t.textContent = msg;
  document.body.appendChild(t); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), err ? 7000 : 3500);
}

function dialog(title, html) {
  const d = document.createElement('dialog');
  d.innerHTML = '<div class="dh"><h2>' + esc(title) + '</h2><button class="btn small" data-close type="button" aria-label="Tutup">Tutup</button></div><div class="db">' + html + '</div>';
  d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
  d.addEventListener('close', () => d.remove());
  document.body.appendChild(d); d.showModal(); return d;
}

// Form modal serbaguna. fields: {name,label,type,options,required,hint,rows,half}
function formModal(o) {
  const v = o.values || {};
  const fieldHtml = (f) => {
    if (f.type === 'section') return '<div class="field sec">' + esc(f.label) + '</div>';
    const id = 'f_' + f.name, val = v[f.name] === null || v[f.name] === undefined ? '' : v[f.name];
    let inp;
    if (f.type === 'select') inp = '<select id="' + id + '" name="' + f.name + '">' + f.options.map((op) => { const [ov, ol] = Array.isArray(op) ? op : [op, op]; return '<option value="' + esc(ov) + '"' + (String(ov) === String(val) ? ' selected' : '') + '>' + esc(ol === '' ? '(kosong)' : ol) + '</option>'; }).join('') + '</select>';
    else if (f.type === 'textarea') inp = '<textarea id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 3) + '">' + esc(val) + '</textarea>';
    else inp = '<input id="' + id + '" name="' + f.name + '" type="' + (f.type || 'text') + '"' + (f.type === 'number' ? ' min="0" step="1" inputmode="numeric"' : '') + ' value="' + esc(val) + '"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (f.type === 'password' ? ' autocomplete="off"' : '') + '>';
    return '<div class="field"><label for="' + id + '">' + esc(f.label) + (f.required ? ' *' : '') + '</label>' + inp + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</div>';
  };
  // kelompokkan field setengah lebar
  let body = '', buf = [];
  const flush = () => { if (buf.length) { body += '<div class="two">' + buf.join('') + '</div>'; buf = []; } };
  for (const f of o.fields) { if (f.half) { buf.push(fieldHtml(f)); if (buf.length === 2) flush(); } else { flush(); body += fieldHtml(f); } }
  flush();
  const d = dialog(o.title, '<form class="form" novalidate>' + (o.intro ? '<p class="muted">' + esc(o.intro) + '</p>' : '') + body + '<div class="formerr" hidden role="alert"></div><div class="df">' +
    (o.onDelete ? '<button class="btn danger" type="button" data-del style="margin-right:auto">Hapus</button>' : '') + '<button class="btn" type="button" data-close>Batal</button><button class="btn primary" type="submit">' + esc(o.submitLabel || 'Simpan') + '</button></div></form>');
  const form = $('form', d), err = $('.formerr', d);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    const out = {};
    for (const f of o.fields) {
      if (f.type === 'section') continue;
      const raw = form.elements[f.name].value;
      out[f.name] = f.type === 'number' ? (raw.trim() === '' ? null : Number(raw)) : raw;
      if (f.required && String(raw).trim() === '') { err.textContent = f.label + ' wajib diisi.'; err.hidden = false; form.elements[f.name].focus(); return; }
      if (f.type === 'number' && out[f.name] !== null && (!Number.isInteger(out[f.name]) || out[f.name] < 0)) { err.textContent = f.label + ' harus angka bulat 0 atau lebih.'; err.hidden = false; return; }
    }
    const btn = $('[type=submit]', form); btn.disabled = true;
    try { await o.onSubmit(out); d.close(); } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  });
  if (o.onDelete) $('[data-del]', d).addEventListener('click', async () => { if (!confirm('Hapus data ini? Tindakan ini tidak bisa dibatalkan.')) return; try { await o.onDelete(); d.close(); } catch (ex) { err.textContent = ex.message; err.hidden = false; } });
  const first = form.querySelector('input,select,textarea'); if (first) first.focus();
  return d;
}

// ---------- Grafik SVG ----------
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function chartFrame(W, H, L, R, T, B, ymin, ymax, fmt) {
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const y = T + ((H - T - B) * i) / 4, val = ymax - ((ymax - ymin) * i) / 4;
    g += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="tick" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(fmt(val)) + '</text>';
  }
  return g;
}
const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' jt' : n >= 1e4 ? Math.round(n / 1e3) + ' rb' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.', ',') + ' rb' : String(Math.round(n)));
function xLabels(range, W, L, R, H, B) {
  const n = range.days, step = n <= 7 ? 1 : n <= 30 ? 7 : 15; let g = '';
  for (let i = 0; i < n; i += step) {
    const d = Calc.addDays(range.start, i), x = L + ((W - L - R) * (n === 1 ? 0.5 : i / (n - 1)));
    g += '<text class="tick" x="' + x + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(d.slice(8) + '/' + d.slice(5, 7)) + '</text>';
  }
  return g;
}
function barChart(groups, range, label) {
  const W = 720, H = 260, L = 46, R = 10, T = 10, B = 28, n = range.days;
  const vals = groups.map((g) => g.value).filter((v) => v !== null);
  const ymax = niceMax(vals.length ? Math.max.apply(null, vals) : 1);
  let g = chartFrame(W, H, L, R, T, B, 0, ymax, short) + xLabels(range, W, L, R, H, B);
  const bw = Math.max(4, Math.min(22, ((W - L - R) / n) * 0.7));
  for (const it of groups) {
    const i = Calc.diffDays(it.date, range.start), x = L + ((W - L - R) * (n === 1 ? 0.5 : i / (n - 1))) - bw / 2;
    if (it.value === null) g += '<rect class="bar na" x="' + x + '" y="' + (H - B - 4) + '" width="' + bw + '" height="4"><title>' + esc(fDate(it.date).replace(/<[^>]+>/g, '') + ': data ' + label + ' belum tersedia') + '</title></rect>';
    else { const h = Math.max(it.value > 0 ? 2 : 0, ((H - T - B) * it.value) / ymax); g += '<rect class="bar" x="' + x + '" y="' + (H - B - h) + '" width="' + bw + '" height="' + h + '" rx="2"><title>' + esc(fDate(it.date).replace(/<[^>]+>/g, '') + ': ' + nf.format(it.value) + ' ' + label + ' (' + it.count + ' posting)') + '</title></rect>'; }
  }
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grafik ' + esc(label) + ' per tanggal posting">' + g + '</svg>';
}
function lineChart(points, range) {
  const W = 720, H = 260, L = 56, R = 14, T = 12, B = 28, n = range.days;
  if (!points.length) return '';
  const vs = points.map((p) => p.followers), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
  const pad = Math.max(1, Math.round((hi - lo) * 0.2) || Math.round(hi * 0.01) || 1), ymin = Math.max(0, lo - pad), ymax = hi + pad;
  const X = (d) => L + ((W - L - R) * (n === 1 ? 0.5 : Math.max(0, Math.min(1, Calc.diffDays(d, range.start) / (n - 1)))));
  const Y = (v) => T + (H - T - B) * (1 - (v - ymin) / (ymax - ymin));
  let g = chartFrame(W, H, L, R, T, B, ymin, ymax, (v) => nf.format(Math.round(v))) + xLabels(range, W, L, R, H, B);
  g += '<polyline class="line" points="' + points.map((p) => X(p.date) + ',' + Y(p.followers)).join(' ') + '"/>';
  for (const p of points) g += '<circle class="dot" cx="' + X(p.date) + '" cy="' + Y(p.followers) + '" r="4"><title>' + esc(fDate(p.date).replace(/<[^>]+>/g, '') + ': ' + nf.format(p.followers) + ' followers') + '</title></circle>';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grafik followers dari snapshot">' + g + '</svg>';
}

function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Tersalin.'); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Tersalin.'); } catch (x) { toast('Gagal menyalin. Salin manual dari kolom.', true); } ta.remove(); }
}
