/* Tampilan: Kompetitor, Tren pencarian, Content Planner, Next steps */
App.mounts = {};
const WL_STATUS = { belum_dicek: ['Belum dicek', 'neutral'], tersedia: ['Tersedia', 'good'], tidak_tersedia: ['Tidak tersedia lewat API', 'low'] };

App.views.kompetitor = function () {
  const d = App.state.d, wl = d.watchlist, live = d.meta.status === 'connected';
  const rows = wl.map((w) => {
    const st = WL_STATUS[w.status] || WL_STATUS.belum_dicek;
    const rec = (w.recent || []).slice(0, 3).map((r) => '<div class="small">' + (r.date ? fDate(r.date) : '') + ': ' + fN(r.likes) + ' likes, ' + fN(r.comments) + ' komentar' + (safeUrl(r.url) ? ' · <a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">Buka</a>' : '') + '</div>').join('');
    return '<tr><td><b>@' + esc(w.username) + '</b>' + (w.note ? '<div class="small muted">' + esc(w.note) + '</div>' : '') + '</td><td><span class="chip ' + st[1] + '">' + st[0] + '</span>' + (w.status_detail ? '<div class="small muted">' + esc(w.status_detail) + '</div>' : '') + (w.checked_at ? '<div class="small muted">Dicek ' + esc(fDateTime(w.checked_at)) + '</div>' : '') + '</td><td class="n">' + fN(w.followers) + '</td><td class="n">' + fN(w.media_count) + '</td><td>' + (rec || NA) + '</td><td><button class="btn small danger" data-act="wl-del" data-id="' + w.id + '">Hapus</button></td></tr>';
  }).join('');
  return pageHead('Aktivitas kompetitor', 'Pantau akun Instagram pembanding dari watchlist.', false) + modeNotice() +
    '<div class="panel"><div class="ph"><h2>Watchlist Instagram</h2><button class="btn" data-act="wl-refresh"' + (live ? '' : ' disabled title="Butuh koneksi Meta aktif"') + '>Cek ulang lewat API</button></div>' +
    '<form class="toolbar" id="wlform"><input name="username" placeholder="username tanpa @" aria-label="Username kompetitor" required><input name="note" placeholder="Catatan (opsional)" aria-label="Catatan"><button class="btn primary" type="submit">Tambah akun</button></form>' +
    '<p class="small muted" style="margin:8px 0">Data kompetitor memakai Business Discovery dari Instagram API: hanya akun Professional (Business/Creator) yang bisa ditarik, dan butuh koneksi Meta yang aktif. ' + (live ? '' : 'Saat ini Meta belum tersambung, jadi status akun tetap "Belum dicek".') + ' Akun yang tidak tersedia akan diberi status, bukan dihapus.</p>' +
    (wl.length ? '<div class="tablewrap"><table><thead><tr><th>Akun</th><th>Status</th><th class="n">Followers</th><th class="n">Posting</th><th>Aktivitas terbaru</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty">Watchlist masih kosong. Tambahkan username akun yang mau dipantau.</div>') + '</div>';
};

// ---------- Tren ----------
const trendUrl = (q) => 'https://trends.google.com/trends/explore?date=today%203-m&geo=ID&q=' + encodeURIComponent(q);
App.openTrend = function (q) {
  q = (q || '').trim(); if (!q) { toast('Isi kata kunci dulu.', true); return; }
  const url = trendUrl(q); const w = window.open(url, '_blank', 'noopener');
  const box = $('#trendlink'); if (box) box.innerHTML = '<div class="notice">Hasil Google Trends Indonesia (90 hari) untuk <b>' + esc(q) + '</b>. ' + (w ? 'Kalau tab tidak terbuka, ' : '') + '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">buka link ini</a>.</div>';
};
App.views.tren = function () {
  const p = P(), t = App.state.ui.trends || { state: 'loading' }, kws = p.keywords;
  let feed;
  if (t.state === 'loading') feed = '<div class="empty">Memuat feed Trending Now…</div>';
  else if (t.state === 'fail') feed = '<div class="notice warn">' + esc(t.error) + '</div>';
  else {
    const items = App.state.ui.trendMatch ? t.items.filter((i) => i.matches.length) : t.items;
    feed = (t.items.length ? '' : '<div class="empty">Feed berhasil dibuka tetapi tidak berisi topik saat ini.</div>') +
      '<div class="list">' + items.map((i, k) => '<div class="item"><div class="row"><div><b>' + esc(i.title) + '</b> ' + (i.traffic ? '<span class="chip neutral">' + esc(i.traffic) + ' pencarian</span> ' : '') + i.matches.map((m) => '<span class="chip good">cocok: ' + esc(m) + '</span>').join(' ') + '</div><div class="toolbar"><button class="btn small" data-act="trend-open" data-k="' + t.items.indexOf(i) + '">Telusuri</button><button class="btn small" data-act="trend-idea" data-k="' + t.items.indexOf(i) + '">Simpan sebagai ide</button></div></div>' +
        (i.news.length ? '<div class="small muted" style="margin-top:4px">' + i.news.map((n) => '<a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">' + esc(n.title || n.source || 'Berita') + '</a>').join(' · ') + '</div>' : '') + '</div>').join('') + '</div>' +
      (App.state.ui.trendMatch && !items.length && t.items.length ? '<div class="empty">Tidak ada topik trending yang cocok dengan kata kunci niche saat ini.</div>' : '') +
      '<p class="small muted" style="margin-top:8px">Sumber: feed RSS Google Trends (Trending Now, Indonesia), diambil ' + esc(fDateTime(t.fetchedAt)) + '. Kecocokan memakai kata kunci niche di Pengaturan.</p>';
  }
  return pageHead('Tren pencarian', 'Cari tahu apa yang sedang dicari orang Indonesia.', false) +
    '<div class="panel"><div class="ph"><h2>Riset kata kunci</h2></div><form class="toolbar" id="trendform"><input name="q" id="trendq" placeholder="Contoh: paket umroh 2027" aria-label="Kata kunci" style="flex:1;min-width:200px"><button class="btn primary" type="submit">Telusuri</button></form>' +
    '<div class="toolbar" style="margin-top:8px">' + kws.map((k) => '<button class="btn small" data-act="kw" data-k="' + esc(k) + '">' + esc(k) + '</button>').join('') + '</div><div id="trendlink" style="margin-top:10px"></div>' +
    '<p class="small muted">Telusuri membuka Google Trends Indonesia untuk 90 hari terakhir di tab baru. Dashboard tidak menampilkan grafik atau volume pencarian sendiri karena tidak ada sumber API terverifikasi yang tersambung.</p></div>' +
    '<div class="panel"><div class="ph"><h2>Sedang trending di Indonesia</h2><div class="toolbar"><label class="small"><input type="checkbox" data-in="trendmatch"' + (App.state.ui.trendMatch ? ' checked' : '') + '> Hanya yang cocok niche</label><button class="btn small" data-act="trend-reload">Muat ulang</button></div></div>' + feed + '</div>';
};
App.mounts.tren = async function (force) {
  const u = App.state.ui;
  if (u.trendBusy) return;
  if (u.trends && u.trends.state !== 'loading' && !force) return;
  u.trendBusy = true; u.trends = { state: 'loading' };
  try {
    const r = await api('GET', '/api/trending?pid=' + App.state.pid);
    u.trends = r.ok ? { state: 'ok', items: r.items, fetchedAt: r.fetchedAt } : { state: 'fail', error: r.error };
  } catch (e) { u.trends = { state: 'fail', error: e.message }; }
  u.trendBusy = false;
  if (App.state.view === 'tren') { const q = $('#trendq') && $('#trendq').value; App.render(true); if (q) $('#trendq').value = q; }
};

// ---------- Planner ----------
const IDEA_STATUS = ['Ide', 'Brief', 'Produksi', 'Review', 'Terjadwal', 'Tayang'], FORMATS = ['', 'Reel', 'Carousel', 'Image', 'Story', 'Video', 'Lainnya'];
App.ideaForm = function (idea, prefill) {
  const v = Object.assign({ status: 'Ide', format: '' }, prefill || {}, idea || {});
  formModal({
    title: idea ? 'Edit ide' : 'Tambah ide konten', values: v, submitLabel: 'Simpan', intro: prefill && !idea ? 'Judul dan link referensi sudah diisi. Edit dulu kalau perlu, lalu simpan.' : '',
    fields: [{ name: 'title', label: 'Judul', required: true }, { name: 'hook', label: 'Hook (kalimat pembuka)', type: 'textarea', rows: 2 }, { name: 'format', label: 'Format', type: 'select', options: FORMATS, half: true }, { name: 'status', label: 'Status', type: 'select', options: IDEA_STATUS, half: true },
      { name: 'cta', label: 'CTA' }, { name: 'date', label: 'Tanggal tayang', type: 'date', hint: 'Kosongkan kalau belum dijadwalkan; ide tetap ada di bank ide.', half: true }, { name: 'source', label: 'Sumber ide', half: true },
      { name: 'ref_link', label: 'Link referensi', type: 'url', placeholder: 'https://' }, { name: 'brief', label: 'Brief', type: 'textarea', rows: 4 }],
    onSubmit: async (out) => { await api(idea ? 'PUT' : 'POST', pj('/ideas' + (idea ? '/' + idea.id : '')), out); await App.reload(); toast('Ide disimpan.'); },
    onDelete: idea ? async () => { await api('DELETE', pj('/ideas/' + idea.id)); await App.reload(); toast('Ide dihapus.'); } : null
  });
};
function monthCells(ym) {
  const [y, m] = ym.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)), lead = (first.getUTCDay() + 6) % 7, dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((lead + dim) / 7) * 7, cells = [];
  for (let i = 0; i < total; i++) { const dt = new Date(Date.UTC(y, m - 1, 1 - lead + i)); cells.push({ date: dt.toISOString().slice(0, 10), inMonth: dt.getUTCMonth() === m - 1 }); }
  return cells;
}
function bankList() {
  const u = App.state.ui, q = u.ideaQ.trim().toLowerCase();
  const list = App.state.d.ideas.filter((i) => (!u.ideaStatus || i.status === u.ideaStatus) && (!q || (i.title + ' ' + i.hook + ' ' + i.brief).toLowerCase().includes(q)));
  if (!App.state.d.ideas.length) return '<div class="empty">Bank ide masih kosong. Tambah ide, atau simpan dari detail posting dan riset tren.</div>';
  if (!list.length) return '<div class="empty">Tidak ada ide yang cocok.</div>';
  return '<div class="list">' + list.map((i) => '<div class="item"><div class="row"><div><b>' + esc(i.title) + '</b> <span class="chip neutral">' + esc(i.status) + '</span>' + (i.format ? ' <span class="chip neutral">' + esc(i.format) + '</span>' : '') +
    '<div class="small muted">' + (i.date ? 'Tayang ' + fDate(i.date) : 'Belum dijadwalkan') + (i.source ? ' · Sumber: ' + esc(i.source) : '') + '</div>' + (i.hook ? '<div class="small">Hook: ' + esc(i.hook) + '</div>' : '') + (safeUrl(i.ref_link) ? '<div class="small"><a href="' + esc(i.ref_link) + '" target="_blank" rel="noopener noreferrer">Link referensi</a></div>' : '') +
    '</div><button class="btn small" data-act="idea-edit" data-id="' + i.id + '">Edit</button></div></div>').join('') + '</div>';
}
App.views.planner = function () {
  const s = App.state, t = today(); if (!s.ui.month) s.ui.month = t.slice(0, 7);
  const ym = s.ui.month, [y, m] = ym.split('-').map(Number), title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cells = monthCells(ym);
  const cal = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => '<div class="dow">' + d + '</div>').join('') + cells.map((c) => {
    const evs = s.d.ideas.filter((i) => i.date === c.date);
    return '<div class="day' + (c.inMonth ? '' : ' out') + (c.date === t ? ' today' : '') + '"><button class="add" data-act="idea-new" data-date="' + c.date + '" aria-label="Tambah ide tanggal ' + c.date + '">+</button>' + Number(c.date.slice(8)) + evs.map((e) => '<button class="ev" data-act="idea-edit" data-id="' + e.id + '" title="' + esc(e.title) + ' (' + esc(e.status) + ')">' + esc(e.title) + '</button>').join('') + '</div>';
  }).join('');
  const undated = s.d.ideas.filter((i) => !i.date).length;
  return pageHead('Content Planner', 'Susun ide, brief, dan jadwal tayang dalam satu tempat.', false) +
    '<div class="panel"><div class="ph"><h2>Kalender konten · ' + esc(title) + '</h2><div class="toolbar"><button class="btn small" data-act="month" data-d="-1" aria-label="Bulan sebelumnya">‹</button><button class="btn small" data-act="month" data-d="0">Hari ini</button><button class="btn small" data-act="month" data-d="1" aria-label="Bulan berikutnya">›</button><button class="btn primary" data-act="idea-new">Tambah ide</button></div></div><div class="cal">' + cal + '</div><p class="small muted" style="margin-top:6px">Ide bertanggal tampil di kalender. ' + undated + ' ide belum bertanggal ada di bank ide.</p></div>' +
    '<div class="panel"><div class="ph"><h2>Bank ide</h2><div class="toolbar"><input type="search" placeholder="Cari ide" value="' + esc(s.ui.ideaQ) + '" data-in="ideaq" aria-label="Cari ide"><select data-in="ideastatus" aria-label="Filter status"><option value="">Semua status</option>' + IDEA_STATUS.map((x) => '<option' + (x === s.ui.ideaStatus ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div></div><div id="bank">' + bankList() + '</div></div>';
};
App.bankList = bankList;

// ---------- Next steps ----------
App.views.nextsteps = function () {
  const s = App.state, t = today(), ns = Calc.nextSteps(s.d.posts, t, s.period);
  const row = (x, extra) => '<div class="item"><b>' + esc(x.p.title) + '</b> <span class="chip neutral">' + esc(x.p.type) + '</span><div class="small muted">' + fDate(x.p.date) + ' · reach ' + plain(fN(x.p.reach)) + ' · ER ' + (x.er === null ? '–' : x.er.toFixed(1).replace('.', ',') + '%') + '</div>' + extra + '</div>';
  const sec = (title, desc, body, emptyMsg) => '<div class="panel"><div class="ph"><h2>' + title + '</h2></div><p class="small muted">' + desc + '</p>' + (body || '<div class="empty">' + emptyMsg + '</div>') + '</div>';
  return pageHead('Next steps', 'Saran dari data posting: apa yang diulang, diperbaiki, dan dites.', true) + modeNotice() +
    (ns.hasData ? '' : '<div class="notice warn">Tidak ada posting pada ' + s.period + ' hari terakhir, jadi saran berbasis data belum bisa dibuat.</div>') +
    '<div class="cols2e"><div>' +
    sec('Ulangi', 'Konten yang berada di atas median pembanding (format dan umur tayang mirip).', ns.repeat.length ? '<div class="list">' + ns.repeat.map((x) => row(x, '<div class="small">Pertimbangkan membuat versi lanjutan dengan topik atau hook serupa. ' + esc(x.ins.text) + '</div>')).join('') + '</div>' : '', 'Belum ada konten yang jelas di atas pembanding.') +
    sec('Perbaiki', 'Konten dengan reach atau engagement jauh di bawah pembanding. Penyebabnya masih hipotesis.', ns.fix.length ? '<div class="list">' + ns.fix.map((x) => row(x, '<div class="small"><span class="chip low">' + esc(x.ins.label) + '</span> ' + esc(x.ins.text) + '</div><div class="small muted">Hipotesis: ' + esc(x.ins.hypotheses[0] || '') + '</div>')).join('') + '</div>' : '', 'Belum ada konten yang jelas di bawah pembanding, atau pembandingnya belum cukup.') +
    '</div><div>' +
    sec('Tes', 'Ubah satu variabel per tes, lalu catat hasilnya di Experiment Tracker.', '<div class="list">' + ns.tests.map((x) => '<div class="item">' + esc(x) + '</div>').join('') + '</div>', '') +
    '<div class="panel"><div class="ph"><h2>Untuk konten baru</h2></div><div class="notice ok" style="margin-bottom:8px"><b>Cek performa konten 3 hari setelah diposting.</b></div><p class="small">Catat metrik ini: <b>reach</b>, <b>ER</b>, <b>saves</b>, dan <b>shares</b> (tambah views, likes, dan komentar kalau sempat).</p>' +
    (ns.fresh.length ? '<div class="list">' + ns.fresh.map((x) => '<div class="item"><b>' + esc(x.p.title) + '</b><div class="small muted">Tayang ' + fDate(x.p.date) + '. Cek pada ' + fDate(Calc.addDays(x.p.date, 3)) + '.</div></div>').join('') + '</div>' : '<p class="small muted">Tidak ada posting yang masih berumur kurang dari 3 hari.</p>') + '</div></div></div>';
};
