/* Tampilan: login, Ringkasan, Performa konten */
App.views.login = function (reg) {
  const s = App.state;
  return '<div class="login"><div class="panel"><h1>Sosmed Konsultan Ventour</h1><p class="muted">' + (reg ? 'Buat akun pertama untuk dashboard ini.' : 'Masuk untuk membuka dashboard.') + '</p>' +
    '<form id="loginform" class="form" data-reg="' + (reg ? 1 : 0) + '" novalidate><div class="field"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="username" required></div>' +
    '<div class="field"><label for="pw">Kata sandi' + (reg ? ' (minimal 10 karakter)' : '') + '</label><input id="pw" name="password" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" required></div>' +
    '<div class="formerr" id="lerr" hidden role="alert"></div><button class="btn primary" type="submit">' + (reg ? 'Buat akun' : 'Masuk') + '</button></form>' +
    (s.canRegister && !reg ? '<p class="small" style="margin-top:12px"><button class="linkbtn" data-act="showreg">Belum punya akun? Daftar</button></p>' : '') +
    (reg ? '<p class="small" style="margin-top:12px"><button class="linkbtn" data-act="showlogin">Sudah punya akun? Masuk</button></p>' : '') + '</div></div>';
};

function modeNotice() {
  const d = App.state.d, p = d.project, m = p.data_mode, t = fDateTime(p.last_sync[m]);
  if (m === 'demo') return '<div class="notice warn"><b>Mode Demo.</b> Semua angka di sini adalah data contoh, bukan data akun Instagram lo. Ganti ke CSV atau Meta di <a href="#/sumber">Sumber data</a>.</div>';
  if (m === 'csv') return '<div class="notice"><b>Mode CSV.</b> Angka berasal dari file yang lo impor' + (t ? ' (terakhir ' + esc(t) + ')' : '') + '. Followers hanya muncul kalau lo mencatat snapshot manual.</div>';
  const c = d.meta;
  if (c.status === 'error') return '<div class="notice bad"><b>Koneksi Meta bermasalah.</b> ' + esc(c.errorMessage || '') + ' ' + esc(c.advice || '') + ' <a href="#/sumber">Buka Sumber data</a></div>';
  return '<div class="notice ok"><b>Mode Meta Insights.</b> Data dari @' + esc(c.igUsername || p.ig_username) + ' lewat Instagram API with Facebook Login' + (t ? '. Sinkron terakhir ' + esc(t) : '') + '.</div>';
}
function coverageNotice(cov, what) {
  if (cov.state === 'empty') return '<div class="notice warn">Belum ada ' + what + ' pada mode ini. Impor CSV atau sinkronkan data dulu.</div>';
  if (cov.state === 'partial') return '<div class="notice warn">Cakupan data: ' + what + ' tersimpan mulai ' + esc(fDate(cov.from)) + ', jadi periode ' + cov.days + ' hari baru terisi ' + cov.covered + ' hari.</div>';
  return '';
}
function pageHead(title, sub, withPeriod) {
  const s = App.state, p = P(), m = p.data_mode;
  const t = fDateTime(p.last_sync[m]);
  return '<div class="pagehead"><div><h1>' + esc(title) + '</h1><p>' + esc(sub) + '</p></div><div class="toolbar noprint">' +
    (withPeriod ? '<div class="seg" role="group" aria-label="Periode">' + [7, 30, 90].map((n) => '<button type="button" data-act="period" data-v="' + n + '" aria-pressed="' + (s.period === n) + '">' + n + ' hari</button>').join('') + '</div>' : '') +
    modeChip(m) + '<button class="btn primary" data-act="sync" id="syncbtn">Sinkron data</button><span class="small muted">Sinkron terakhir: ' + (t ? esc(t) : 'belum pernah') + '</span></div></div>';
}

const METRICS = [['followers', 'Followers'], ['engagements', 'Total Engagements'], ['views', 'Views'], ['likes', 'Likes'], ['comments', 'Komentar'], ['shares', 'Shares'], ['saves', 'Saves']];

App.views.ringkasan = function () {
  const s = App.state, d = s.d, p = d.project, days = s.period, t = today(), range = Calc.periodRange(t, days);
  const posts = Calc.inRange(d.posts, range), cov = Calc.postCoverage(d.posts, range);
  const fol = Calc.followerSummary(d.snapshots, range);
  const eng = Calc.sumMetric(posts, 'engagements'), views = Calc.sumMetric(posts, 'views'), er = Calc.weightedER(posts);
  const sub = (x, what) => (x.value === null ? (posts.length ? 'Belum ada data ' + what + ' pada ' + posts.length + ' posting' : 'Tidak ada posting di periode ini') : x.count + ' dari ' + x.total + ' posting punya data');
  let folSub;
  if (fol.state === 'empty') folSub = 'Belum ada snapshot followers';
  else if (fol.state === 'single') folSub = 'Baru 1 snapshot (' + fDate(fol.date).replace(/<[^>]+>/g, '') + '), belum bisa hitung perubahan';
  else folSub = (fol.change > 0 ? '+' : fol.change < 0 ? '−' : '') + nf.format(Math.abs(fol.change)) + ' sejak snapshot ' + fDate(fol.baselineDate).replace(/<[^>]+>/g, '') + (fol.state === 'partial' ? ' (snapshot paling awal, periode belum penuh)' : '');
  const metric = s.ui.metric, mLabel = METRICS.find((m) => m[0] === metric)[1];
  let chart, note;
  if (metric === 'followers') {
    const pts = d.snapshots.filter((x) => x.followers !== null && x.date >= range.start && x.date <= range.end);
    chart = pts.length ? lineChart(pts, range) : '<div class="empty">Belum ada snapshot followers pada rentang ini. Sinkron (Demo/Meta) menyimpan satu snapshot per hari' + (p.data_mode === 'csv' ? ', atau catat manual dengan tombol di bawah' : '') + '.</div>';
    note = 'Garis dibuat dari snapshot bertanggal yang tersimpan di dashboard. Perubahan dihitung dari snapshot yang tersedia, bukan dari riwayat Instagram.' + (p.data_mode === 'csv' ? ' <button class="linkbtn" data-act="snap">Catat followers</button>' : '');
  } else {
    const g = Calc.groupByDate(posts, metric);
    chart = g.length ? barChart(g, range, mLabel) : '<div class="empty">Tidak ada posting pada periode ini.</div>';
    note = 'Posting dikelompokkan menurut tanggal tayang. Tinggi batang = total terakhir ' + mLabel + ' dari semua posting yang terbit pada tanggal itu (bukan pertambahan per hari). Batang abu-abu pendek = posting ada, tetapi datanya belum tersedia.';
  }
  const ns = Calc.nextSteps(d.posts, t, days), pri = [];
  ns.repeat.slice(0, 1).forEach((x) => pri.push(['Ulangi', x.p.title, 'ER ' + fPct(x.er).replace(/<[^>]+>/g, '')]));
  ns.fix.slice(0, 2).forEach((x) => pri.push(['Perbaiki', x.p.title, x.ins.label]));
  if (ns.tests[0]) pri.push(['Tes', ns.tests[0], '']);
  return pageHead('Ringkasan Instagram', 'Pantau hasil konten ' + p.brand + (p.ig_username ? ' (@' + p.ig_username + ')' : '') + ' tanpa buka banyak tab.', true) + modeNotice() + coverageNotice(cov, 'posting') +
    '<div class="cards"><div class="card"><div class="label">Followers</div><div class="val">' + fN(fol.value) + '</div><div class="sub">' + esc(folSub) + '</div></div>' +
    '<div class="card"><div class="label">Total Engagements</div><div class="val">' + fN(eng.value) + '</div><div class="sub">' + esc(sub(eng, 'engagement')) + '</div></div>' +
    '<div class="card"><div class="label">Total Views</div><div class="val">' + fN(views.value) + '</div><div class="sub">' + esc(sub(views, 'views')) + '</div></div>' +
    '<div class="card"><div class="label">ER (berbobot)</div><div class="val">' + fPct(er.value) + '</div><div class="sub">' + (er.count ? er.count + ' dari ' + er.total + ' posting punya engagement dan reach' : 'Butuh engagement dan reach di atas nol') + '</div></div></div>' +
    '<div class="cols2"><div class="panel"><div class="ph"><h2>Grafik performa</h2><select data-in="metric" aria-label="Metrik grafik">' + METRICS.map((m) => '<option value="' + m[0] + '"' + (m[0] === metric ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select></div>' +
    '<div class="chartbox">' + chart + '</div><div class="chartnote">' + note + '</div></div>' +
    '<div class="panel"><div class="ph"><h2>Prioritas minggu ini</h2></div>' + (pri.length ? '<div class="list">' + pri.map((x) => '<div class="item"><span class="chip neutral">' + x[0] + '</span> ' + esc(x[1]) + (x[2] ? '<div class="small muted">' + esc(x[2]) + '</div>' : '') + '</div>').join('') + '</div>' : '<div class="empty">Belum cukup data untuk saran.</div>') +
    '<p class="small" style="margin-top:10px"><a href="#/next-steps">Lihat semua next steps</a></p></div></div>' +
    '<p class="small muted">ER = total engagements ÷ total reach × 100, dihitung dari posting yang punya kedua angka dan reach di atas nol. Tanda "–" berarti data belum tersedia; angka 0 berarti memang nol.</p>';
};

// ---------- Performa konten ----------
const SORTS = { date: 'Tanggal', reach: 'Reach', views: 'Views', likes: 'Likes', comments: 'Komentar', shares: 'Shares', saves: 'Saves', eng: 'Total Engagements', er: 'ER' };
function contentRows() {
  const d = App.state.d, u = App.state.ui.content, q = u.q.trim().toLowerCase();
  let rows = d.posts.filter((p) => (!u.fmt || p.type === u.fmt) && (!q || p.title.toLowerCase().includes(q)));
  const val = (p) => (u.sort === 'date' ? p.date : u.sort === 'eng' ? Calc.totalEng(p) : u.sort === 'er' ? Calc.postER(p) : p[u.sort]);
  const dir = u.dir === 'asc' ? 1 : -1;
  rows = rows.slice().sort((a, b) => { const x = val(a), y = val(b); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return x < y ? -dir : x > y ? dir : 0; });
  return rows;
}
function contentTable() {
  const d = App.state.d, t = today(), rows = contentRows();
  if (!d.posts.length) return '<div class="empty">Belum ada posting pada mode ' + esc(modeLabel[d.project.data_mode]) + '. <a href="#/sumber">Impor CSV</a> atau sinkronkan data.</div>';
  if (!rows.length) return '<div class="empty">Tidak ada posting yang cocok dengan pencarian atau filter.</div>';
  const chipFor = { perform: 'good', reach_rendah: 'low', engagement_rendah: 'low' };
  return '<div class="tablewrap"><table><thead><tr><th>Posting</th><th>Tanggal</th><th>Format</th><th class="n">Reach</th><th class="n">Views</th><th class="n">Likes</th><th class="n">Komentar</th><th class="n">Shares</th><th class="n">Saves</th><th class="n">Total Eng.</th><th class="n">ER</th><th>Status</th><th>Link</th></tr></thead><tbody>' +
    rows.map((p) => { const ins = Calc.insightFor(p, d.posts, t), u = safeUrl(p.url);
      return '<tr class="click" data-act="post" data-id="' + p.id + '" tabindex="0"><td class="title">' + esc(p.title) + '</td><td>' + fDate(p.date) + '</td><td>' + esc(p.type) + '</td><td class="n">' + fN(p.reach) + '</td><td class="n">' + fN(p.views) + '</td><td class="n">' + fN(p.likes) + '</td><td class="n">' + fN(p.comments) + '</td><td class="n">' + fN(p.shares) + '</td><td class="n">' + fN(p.saves) + '</td><td class="n">' + fN(Calc.totalEng(p)) + '</td><td class="n">' + fPct(Calc.postER(p)) + '</td><td><span class="chip ' + (chipFor[ins.status] || 'neutral') + '">' + esc(ins.label) + '</span></td><td>' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" data-stop>Buka</a>' : NA) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="small muted" style="margin-top:6px">' + rows.length + ' dari ' + d.posts.length + ' posting. Klik baris untuk detail.</p>';
}
App.views.konten = function () {
  const d = App.state.d, u = App.state.ui.content;
  const types = [...new Set(d.posts.map((p) => p.type))].sort();
  return pageHead('Performa konten', 'Tabel posting, filter, dan detail analisis per posting.', false) + modeNotice() +
    '<div class="toolbar" style="margin-bottom:10px"><input type="search" placeholder="Cari judul atau caption" value="' + esc(u.q) + '" data-in="cq" aria-label="Cari posting">' +
    '<select data-in="cfmt" aria-label="Filter format"><option value="">Semua format</option>' + types.map((t) => '<option' + (t === u.fmt ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>' +
    '<select data-in="csort" aria-label="Urutkan">' + Object.keys(SORTS).map((k) => '<option value="' + k + '"' + (k === u.sort ? ' selected' : '') + '>Urut: ' + SORTS[k] + '</option>').join('') + '</select>' +
    '<button class="btn" data-act="cdir" aria-label="Arah urutan">' + (u.dir === 'asc' ? '↑ Naik' : '↓ Turun') + '</button>' +
    '<span style="flex:1"></span><a class="btn" href="/api/template.csv">Unduh template CSV</a><a class="btn" href="#/sumber">Impor CSV</a><button class="btn" data-act="export">Ekspor hasil filter</button></div>' +
    '<div id="tbl">' + contentTable() + '</div>';
};
App.postDetail = function (id) {
  const d = App.state.d, p = d.posts.find((x) => x.id === Number(id)); if (!p) return;
  const ins = Calc.insightFor(p, d.posts, today()), b = ins.base, u = safeUrl(p.url);
  let insHtml = '<div class="item"><span class="chip ' + (ins.status === 'perform' ? 'good' : ins.status === 'reach_rendah' || ins.status === 'engagement_rendah' ? 'low' : 'neutral') + '">' + esc(ins.label) + '</span> ' + esc(ins.text);
  if (b.comparables) insHtml += '<div class="small muted" style="margin-top:6px">Pembanding: ' + b.comparables + ' posting ' + esc(p.type) + ' dengan umur tayang ±' + Calc.AGE_WINDOW + ' hari dari ' + b.age + ' hari. Median reach ' + (b.reachMedian === null ? '–' : nf.format(Math.round(b.reachMedian))) + ' (dari ' + b.reachN + ' data), median ER ' + (b.erMedian === null ? '–' : b.erMedian.toFixed(1).replace('.', ',') + '%') + ' (dari ' + b.erN + ' data).</div>';
  insHtml += '</div>';
  if (ins.hypotheses.length) insHtml += '<h3 style="margin:12px 0 4px">Kemungkinan penyebab (hipotesis, belum terbukti)</h3><ul>' + ins.hypotheses.map((h) => '<li>' + esc(h) + '</li>').join('') + '</ul><p class="small muted">Uji dulu lewat Experiment Tracker sebelum mengubah strategi.</p>';
  const dlg = dialog('Detail posting', '<h2 style="margin-bottom:8px">' + esc(p.title) + '</h2><dl class="kv"><dt>Tanggal tayang</dt><dd>' + fDate(p.date) + ' (umur ' + b.age + ' hari)</dd><dt>Format</dt><dd>' + esc(p.type) + '</dd><dt>Reach</dt><dd>' + fN(p.reach) + '</dd><dt>Views</dt><dd>' + fN(p.views) + '</dd><dt>Likes</dt><dd>' + fN(p.likes) + '</dd><dt>Komentar</dt><dd>' + fN(p.comments) + '</dd><dt>Shares</dt><dd>' + fN(p.shares) + '</dd><dt>Saves</dt><dd>' + fN(p.saves) + '</dd><dt>Total Engagements</dt><dd>' + fN(Calc.totalEng(p)) + (p.interactions === null && Calc.totalEng(p) !== null ? ' <span class="small muted">(dijumlah dari likes + komentar + shares + saves)</span>' : '') + '</dd><dt>ER</dt><dd>' + fPct(Calc.postER(p)) + '</dd></dl>' +
    '<h3 style="margin:14px 0 6px">Analisis</h3>' + insHtml + '<div class="df" style="margin-top:14px">' + (u ? '<a class="btn" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">Buka posting</a>' : '') + '<button class="btn primary" data-save>Simpan sebagai ide</button></div>');
  $('[data-save]', dlg).addEventListener('click', () => { dlg.close(); App.ideaForm(null, { title: p.title, ref_link: p.url || '', source: 'Detail posting' }); });
};
