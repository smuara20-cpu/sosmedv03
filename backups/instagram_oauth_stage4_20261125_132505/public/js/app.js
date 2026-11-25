/* Boot, routing, dan aksi */
const ROUTES = { ringkasan: 'ringkasan', konten: 'konten', kompetitor: 'kompetitor', tren: 'tren', planner: 'planner', 'next-steps': 'nextsteps', report: 'report', eksperimen: 'eksperimen', leads: 'leads', sumber: 'sumber', pengaturan: 'pengaturan' };
const NAV = [['ringkasan', 'Ringkasan'], ['konten', 'Performa konten'], ['kompetitor', 'Kompetitor'], ['tren', 'Tren pencarian'], ['planner', 'Content Planner'], ['next-steps', 'Next steps'], ['report', 'Report Generator'], ['eksperimen', 'Experiment Tracker'], ['leads', 'Lead Tracker'], ['sumber', 'Sumber data'], ['pengaturan', 'Pengaturan']];

function routeFromHash() { const k = (location.hash || '').replace(/^#\/?/, '').split('?')[0]; return ROUTES[k] ? k : 'ringkasan'; }

App.renderApp = function () {
  const s = App.state, root = $('#app');
  if (!s.user) { root.innerHTML = App.views.login(s.regMode); document.title = 'Masuk · Sosmed Konsultan Ventour'; return; }
  const p = s.d && s.d.project;
  document.title = (p ? p.dashboard_name : 'Dashboard');
  root.innerHTML = '<div class="layout"><aside class="side" id="side" aria-label="Menu utama"><div class="brand"><b>' + esc(p ? p.dashboard_name : '') + '</b><small>' + esc(p ? p.brand : '') + '</small></div>' +
    '<select id="projsel" data-in="proj" aria-label="Pilih project">' + s.projects.map((x) => '<option value="' + x.id + '"' + (x.id === s.pid ? ' selected' : '') + '>' + esc(x.brand) + '</option>').join('') + '</select>' +
    '<nav class="nav">' + NAV.map((n) => '<a href="#/' + n[0] + '" data-nav="' + n[0] + '">' + n[1] + '</a>').join('') + '</nav><div class="foot">' + esc(s.user.email) + '<br><button class="linkbtn" data-act="logout">Keluar</button></div></aside><main class="main" id="main" tabindex="-1"></main></div>';
  App.render();
};
App.render = function (keep) {
  const s = App.state; const main = $('#main'); if (!main || !s.d) return;
  const key = routeFromHash(); s.view = ROUTES[key]; s.navKey = key;
  main.innerHTML = '<button class="btn menu-btn noprint" data-act="menu">Menu</button>' + App.views[s.view]();
  $$('.nav a').forEach((a) => { if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#side').classList.remove('open');
  if (App.mounts[s.view]) App.mounts[s.view]();
  if (!keep) window.scrollTo(0, 0);
};
App.reload = async function () {
  App.state.d = await api('GET', pj('/bootstrap'));
  App.renderApp();
};
async function loadProjects(pick) {
  const s = App.state;
  s.projects = await api('GET', '/api/projects');
  const saved = Number(localStorage.getItem('pid'));
  s.pid = pick || (s.projects.find((x) => x.id === saved) || s.projects[0]).id;
  localStorage.setItem('pid', s.pid);
  s.ui.trends = null;
  await App.reload();
}
async function boot() {
  try {
    const me = await api('GET', '/api/me');
    App.state.user = me.user; App.state.canRegister = me.canRegister; App.state.regMode = !me.user && me.canRegister && !me.hasUsers;
    if (me.user) await loadProjects(); else App.renderApp();
  } catch (e) { $('#app').innerHTML = '<div class="login"><div class="panel"><h1>Tidak bisa memuat</h1><p>' + esc(e.message) + '</p></div></div>'; }
}
window.addEventListener('hashchange', () => { if (App.state.user && App.state.d) App.render(); });

// ---------- Event delegation ----------
document.addEventListener('click', async (ev) => {
  if (ev.target.closest('[data-stop]')) return;
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const fn = App.acts[el.dataset.act]; if (!fn) return;
  ev.preventDefault();
  try { await fn(el, ev); } catch (e) { toast(e.message, true); }
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('tr.click')) ev.target.click(); });
['input', 'change'].forEach((t) => document.addEventListener(t, (ev) => {
  const el = ev.target.closest && ev.target.closest('[data-in]'); if (!el) return;
  const textual = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'checkbox');
  if (textual ? t !== 'input' : t !== 'change') return;
  const fn = App.ins[el.dataset.in]; if (fn) Promise.resolve(fn(el, ev)).catch((e) => toast(e.message, true));
}));
document.addEventListener('submit', async (ev) => {
  const f = ev.target, id = f.id; const h = App.forms[id]; if (!h) return;
  ev.preventDefault();
  try { await h(f); } catch (e) { toast(e.message, true); }
});

App.ins.metric = (el) => { App.state.ui.metric = el.value; App.render(true); };
App.ins.cq = (el) => { App.state.ui.content.q = el.value; $('#tbl').innerHTML = contentTable(); };
App.ins.cfmt = (el) => { App.state.ui.content.fmt = el.value; $('#tbl').innerHTML = contentTable(); };
App.ins.csort = (el) => { App.state.ui.content.sort = el.value; $('#tbl').innerHTML = contentTable(); };
App.ins.ideaq = (el) => { App.state.ui.ideaQ = el.value; $('#bank').innerHTML = App.bankList(); };
App.ins.ideastatus = (el) => { App.state.ui.ideaStatus = el.value; $('#bank').innerHTML = App.bankList(); };
App.ins.trendmatch = (el) => { App.state.ui.trendMatch = el.checked; App.render(true); };
App.ins.proj = async (el) => { App.state.pid = Number(el.value); localStorage.setItem('pid', el.value); App.state.ui.trends = null; await App.reload(); };

const A = App.acts;
A.menu = () => $('#side').classList.toggle('open');
A.showreg = () => { App.state.regMode = true; App.renderApp(); };
A.showlogin = () => { App.state.regMode = false; App.renderApp(); };
A.logout = async () => { await api('POST', '/api/logout', {}); App.state.user = null; App.state.d = null; App.renderApp(); };
A.period = (el) => { App.state.period = Number(el.dataset.v); App.render(true); };
A.sync = async (el) => {
  el.disabled = true; el.textContent = 'Menyinkronkan…';
  try { const r = await api('POST', pj('/sync'), {}); toast(r.message); await App.reload(); }
  catch (e) { toast(e.message + (e.data && e.data.advice ? ' ' + e.data.advice : ''), true); await App.reload(); }
};
A.snap = () => formModal({ title: 'Catat followers', values: { date: today() }, fields: [{ name: 'date', label: 'Tanggal snapshot', type: 'date', required: true }, { name: 'followers', label: 'Jumlah followers', type: 'number', required: true }], onSubmit: async (o) => { await api('POST', pj('/snapshot'), o); await App.reload(); toast('Snapshot disimpan.'); } });
A.post = (el) => App.postDetail(el.dataset.id);
A.cdir = () => { const u = App.state.ui.content; u.dir = u.dir === 'asc' ? 'desc' : 'asc'; App.render(true); };
A.export = () => { const rows = contentRows(); if (!rows.length) { toast('Tidak ada baris untuk diekspor.', true); return; } download('posting-' + today() + '.csv', '\uFEFF' + Calc.toCsv(rows)); toast(rows.length + ' baris diekspor.'); };
A['wl-del'] = async (el) => { if (!confirm('Hapus akun dari watchlist?')) return; await api('DELETE', pj('/watchlist/' + el.dataset.id)); await App.reload(); };
A['wl-refresh'] = async (el) => { el.disabled = true; try { await api('POST', pj('/watchlist/refresh'), {}); toast('Watchlist diperbarui.'); } catch (e) { toast(e.message + (e.data && e.data.advice ? ' ' + e.data.advice : ''), true); } await App.reload(); };
A.kw = (el) => { $('#trendq').value = el.dataset.k; $('#trendq').focus(); };
A['trend-open'] = (el) => App.openTrend(App.state.ui.trends.items[el.dataset.k].title);
A['trend-reload'] = () => App.mounts.tren(true);
A['trend-idea'] = (el) => { const i = App.state.ui.trends.items[el.dataset.k]; App.ideaForm(null, { title: i.title, ref_link: (i.news[0] && i.news[0].url) || trendUrl(i.title), source: 'Riset tren' }); };
A['idea-new'] = (el) => App.ideaForm(null, el.dataset.date ? { date: el.dataset.date } : null);
A['idea-edit'] = (el) => App.ideaForm(App.state.d.ideas.find((i) => i.id === Number(el.dataset.id)));
A.month = (el) => {
  const u = App.state.ui, d = Number(el.dataset.d); if (d === 0) { u.month = today().slice(0, 7); } else { let [y, m] = u.month.split('-').map(Number); m += d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } u.month = y + '-' + String(m).padStart(2, '0'); }
  App.render(true);
};
A['exp-new'] = () => App.expForm(null);
A['exp-edit'] = (el) => App.expForm(App.state.d.experiments.find((e) => e.id === Number(el.dataset.id)));
A['camp-new'] = () => App.campForm(null);
A['camp-edit'] = (el) => App.campForm(App.state.d.campaigns.find((c) => c.id === Number(el.dataset.id)));
A['camp-copy'] = (el) => copyText(App.waLink(App.state.d.campaigns.find((c) => c.id === Number(el.dataset.id))));
A['inq-new'] = () => App.inqForm(null);
A['inq-edit'] = (el) => App.inqForm(App.state.d.inquiries.find((i) => i.id === Number(el.dataset.id)));
A.print = () => window.print();
A.mode = async (el) => { await api('POST', pj('/mode'), { mode: el.dataset.v }); await App.reload(); toast('Mode diganti ke ' + modeLabel[el.dataset.v] + '.'); };
A['demo-reset'] = async () => { await api('POST', pj('/demo/reset'), {}); await App.reload(); toast('Data contoh direset.'); };
A['csv-clear'] = async () => { if (!confirm('Hapus semua data posting hasil impor CSV untuk project ini?')) return; await api('DELETE', pj('/posts?source=csv')); await App.reload(); toast('Data CSV dihapus.'); };
A['csv-import'] = async () => {
  const f = $('#csvfile').files[0], box = $('#importmsg');
  if (!f) { box.innerHTML = '<div class="formerr">Pilih file CSV dulu.</div>'; return; }
  if (f.size > 3 * 1024 * 1024) { box.innerHTML = '<div class="formerr">File terlalu besar (maksimal 3 MB).</div>'; return; }
  let text; try { text = await f.text(); } catch (e) { box.innerHTML = '<div class="formerr">File tidak bisa dibaca.</div>'; return; }
  try {
    const r = await api('POST', pj('/import-csv'), { csv: text, replace: $('#csvreplace').checked });
    await App.reload(); toast(r.imported + ' posting diimpor' + (r.duplicates ? ' (' + r.duplicates + ' duplikat dalam file diabaikan)' : '') + '. Mode CSV aktif.');
  } catch (e) {
    box.innerHTML = '<div class="formerr">' + esc(e.message) + (e.data && e.data.details && e.data.details.length ? '\n• ' + e.data.details.map(esc).join('\n• ') : '') + '</div>';
  }
};
A['meta-test'] = async () => {
  const box = $('#tokmsg');
  try { await api('POST', pj('/meta/test'), {}); await App.reload(); toast('Koneksi berhasil dites.'); }
  catch (e) { await App.reload(); const b = $('#tokmsg'); if (b) b.innerHTML = App.metaErr(e); }
};
A['meta-del'] = async () => { if (!confirm('Hapus token Meta yang tersimpan? Mode Meta akan dinonaktifkan.')) return; await api('DELETE', pj('/meta')); await App.reload(); toast('Token dihapus.'); };
A['proj-new'] = () => formModal({ title: 'Tambah project', fields: [{ name: 'brand', label: 'Nama brand', required: true }, { name: 'ig_username', label: 'Username Instagram (tanpa @)' }, { name: 'niche', label: 'Niche' }, { name: 'audience', label: 'Target audiens' }, { name: 'whatsapp_number', label: 'Nomor WhatsApp (opsional)' }], onSubmit: async (o) => { o.dashboard_name = 'Sosmed ' + o.brand; const r = await api('POST', '/api/projects', o); await loadProjects(r.id); toast('Project dibuat dengan data contoh.'); } });
A['proj-del'] = async () => { if (!confirm('Hapus project ini beserta semua datanya? Tindakan ini tidak bisa dibatalkan.')) return; await api('DELETE', pj('')); await loadProjects(); toast('Project dihapus.'); };

App.forms = {
  loginform: async (f) => {
    const err = $('#lerr'); err.hidden = true; const reg = f.dataset.reg === '1';
    try { await api('POST', reg ? '/api/register' : '/api/login', { email: f.email.value, password: f.password.value }); const me = await api('GET', '/api/me'); App.state.user = me.user; await loadProjects(); }
    catch (e) { err.textContent = e.message; err.hidden = false; }
  },
  wlform: async (f) => { await api('POST', pj('/watchlist'), { username: f.username.value, note: f.note.value }); await App.reload(); toast('Akun ditambahkan.'); },
  trendform: async (f) => App.openTrend(f.q.value),
  tokenform: async (f) => {
    const box = $('#tokmsg'), tok = f.token.value; box.innerHTML = '';
    if (!tok.trim()) { box.innerHTML = '<div class="formerr">Tempel token dulu.</div>'; return; }
    const btn = $('[type=submit]', f); btn.disabled = true; btn.textContent = 'Mengetes…';
    try { await api('POST', pj('/meta/token'), { token: tok }); f.token.value = ''; await App.reload(); toast('Token tersimpan dan koneksi berhasil.'); }
    catch (e) { f.token.value = ''; btn.disabled = false; btn.textContent = 'Simpan dan tes koneksi'; box.innerHTML = App.metaErr(e); }
  },
  setform: async (f) => {
    const err = $('#seterr'); err.hidden = true;
    const body = { keywords: f.keywords.value.split(',').map((x) => x.trim()).filter(Boolean) };
    ['dashboard_name', 'brand', 'ig_username', 'niche', 'audience', 'timezone', 'whatsapp_number'].forEach((k) => { body[k] = f[k].value; });
    try { await api('PUT', pj(''), body); await loadProjects(App.state.pid); toast('Pengaturan disimpan.'); } catch (e) { err.textContent = e.message; err.hidden = false; }
  }
};
boot();
