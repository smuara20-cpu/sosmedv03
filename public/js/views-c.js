/* Tampilan: Report, Experiment, Lead tracker, Sumber data, Pengaturan */
const plain = (h) => String(h).replace(/<[^>]+>/g, '');

// ---------- Report ----------
App.views.report = function () {
  const s = App.state, d = s.d, p = d.project, days = s.period, t = today();
  const cmp = Calc.comparePeriods(d.posts, t, days), cur = cmp.cur, prev = cmp.prev;
  const m = p.data_mode, covCur = Calc.postCoverage(d.posts, cur), covPrev = cmp.coverage;
  const fol = Calc.followerSummary(d.snapshots, cur);
  const top = cmp.curPosts.map((x) => ({ p: x, eng: Calc.totalEng(x), er: Calc.postER(x) })).filter((x) => x.eng !== null).sort((a, b) => b.eng - a.eng).slice(0, 5);
  const ns = Calc.nextSteps(d.posts, t, days);
  const rows = cmp.rows.map((r) => {
    const fmt = r.key === 'er' ? fPct : fN;
    const chg = r.key === 'er' ? fPp(r.changePp) : fChg(r.changePct);
    return '<tr><td>' + esc(r.label) + '</td><td class="n">' + fmt(r.cur) + '</td><td class="n">' + fmt(r.prev) + '</td><td class="n">' + chg + '</td></tr>';
  }).join('');
  const recs = [];
  ns.repeat.slice(0, 2).forEach((x) => recs.push('<b>Ulangi:</b> ' + esc(x.p.title) + ' (' + esc(x.p.type) + ', ER ' + plain(fPct(x.er)) + ').'));
  ns.fix.slice(0, 2).forEach((x) => recs.push('<b>Perbaiki:</b> ' + esc(x.p.title) + ' (' + esc(x.ins.label.toLowerCase()) + '). Hipotesis awal: ' + esc(x.ins.hypotheses[0] || '-')));
  ns.tests.slice(0, 2).forEach((x) => recs.push('<b>Tes:</b> ' + esc(x)));
  recs.push('Cek performa konten baru 3 hari setelah diposting; catat reach, ER, saves, dan shares.');
  const sumber = modeLabel[m] + (m === 'demo' ? ' (data contoh, bukan data akun asli)' : m === 'csv' ? ' (file CSV yang diimpor)' : ' (Instagram API with Facebook Login)') + (p.last_sync[m] ? ', pembaruan terakhir ' + fDateTime(p.last_sync[m]) : '');
  return pageHead('Report Generator', 'Laporan siap cetak atau simpan sebagai PDF.', true) + modeNotice() +
    '<div class="toolbar noprint" style="margin-bottom:10px"><button class="btn primary" data-act="print">Cetak / simpan PDF</button><span class="small muted">Di jendela cetak, pilih "Simpan sebagai PDF".</span></div>' +
    '<article class="report"><h1>Laporan Performa Instagram</h1><div class="meta"><b>' + esc(p.brand) + '</b>' + (p.ig_username ? ' · @' + esc(p.ig_username) : '') + '<br>Sumber data: ' + esc(sumber) + '<br>Rentang laporan: ' + plain(fDate(cur.start)) + ' – ' + plain(fDate(cur.end)) + ' (' + days + ' hari)<br>Periode pembanding: ' + plain(fDate(prev.start)) + ' – ' + plain(fDate(prev.end)) + ' (' + days + ' hari, sama panjang)<br>Dibuat: ' + plain(fDate(t)) + '</div>' +
    (covCur.state === 'empty' ? '<div class="notice warn" style="margin-top:12px">Belum ada posting pada mode ini, jadi laporan masih kosong.</div>' : '') +
    (covCur.state === 'partial' ? '<div class="notice warn" style="margin-top:12px">Cakupan data: posting tersimpan mulai ' + plain(fDate(covCur.from)) + ', jadi periode laporan baru terisi ' + covCur.covered + ' dari ' + days + ' hari.</div>' : '') +
    '<h2>Perbandingan dengan periode sebelumnya</h2><table><thead><tr><th>Metrik</th><th class="n">Periode ini</th><th class="n">Periode sebelumnya</th><th class="n">Perubahan</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="small meta" style="margin-top:6px">Posting dikelompokkan menurut tanggal tayang. Angka yang dibandingkan adalah total terakhir dari posting yang terbit di masing-masing periode, bukan pertambahan harian. Perubahan ER ditampilkan sebagai selisih poin persentase.</p>' +
    (covPrev.state === 'partial' ? '<div class="notice warn">Data periode sebelumnya belum lengkap: posting tersimpan mulai ' + plain(fDate(covPrev.from)) + ' (terisi ' + covPrev.covered + ' dari ' + days + ' hari), jadi perbandingan bisa terlihat lebih rendah dari kenyataan.</div>' : '') +
    (covPrev.state === 'empty' ? '<div class="notice warn">Tidak ada data periode sebelumnya.</div>' : '') +
    '<p class="small">Followers: ' + fN(fol.value) + (fol.change !== null ? ' (' + plain(fDiff(fol.change)) + ' sejak snapshot ' + plain(fDate(fol.baselineDate)) + ')' : ' (belum ada dua snapshot untuk membandingkan)') + '</p>' +
    '<h2>Posting terbaik (berdasarkan Total Engagements)</h2>' + (top.length ? '<table><thead><tr><th>Posting</th><th>Tanggal</th><th>Format</th><th class="n">Reach</th><th class="n">Total Eng.</th><th class="n">ER</th></tr></thead><tbody>' + top.map((x) => '<tr><td>' + esc(x.p.title) + '</td><td>' + fDate(x.p.date) + '</td><td>' + esc(x.p.type) + '</td><td class="n">' + fN(x.p.reach) + '</td><td class="n">' + fN(x.eng) + '</td><td class="n">' + fPct(x.er) + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">Belum ada posting dengan data engagement pada periode ini.</p>') +
    '<h2>Rekomendasi periode berikutnya</h2><ul>' + recs.map((x) => '<li>' + x + '</li>').join('') + '</ul><p class="small meta">Penyebab yang disebut sebagai hipotesis belum terbukti; uji lewat eksperimen sebelum mengubah strategi.</p></article>';
};

// ---------- Experiments ----------
const EXP_VARS = ['Hook', 'Cover', 'CTA', 'Format', 'Lainnya'];
function expFields() {
  const f = [{ name: 'hypothesis', label: 'Hipotesis', type: 'textarea', rows: 2, required: true, hint: 'Contoh: Hook berupa pertanyaan menaikkan saves dibanding hook pernyataan.' }, { name: 'variable', label: 'Satu variabel yang dites', type: 'select', options: EXP_VARS }];
  for (const [k, lbl] of [['a', 'Versi awal'], ['b', 'Variasi']]) {
    f.push({ type: 'section', label: lbl }, { name: k + '_label', label: 'Nama/judul konten', half: true }, { name: k + '_date', label: 'Tanggal tayang', type: 'date', half: true }, { name: k + '_url', label: 'Link posting', type: 'url', placeholder: 'https://' });
    f.push({ type: 'section', label: 'Hasil ' + lbl.toLowerCase() + ' (isi setelah tayang 3 hari; 0 dihitung sebagai hasil valid)' });
    for (const [mk, ml] of [['reach', 'Reach'], ['views', 'Views'], ['likes', 'Likes'], ['comments', 'Komentar'], ['saves', 'Saves'], ['shares', 'Shares'], ['interactions', 'Total Engagements']]) f.push({ name: k + '_' + mk, label: ml, type: 'number', half: true });
  }
  return f;
}
App.expForm = function (e) {
  const v = e ? { hypothesis: e.hypothesis, variable: e.variable } : { variable: 'Hook' };
  if (e) for (const k of ['a', 'b']) for (const key of Object.keys(e[k] || {})) v[k + '_' + key] = e[k][key];
  formModal({
    title: e ? 'Edit eksperimen / isi hasil' : 'Eksperimen baru', values: v, fields: expFields(),
    onSubmit: async (o) => {
      const body = { hypothesis: o.hypothesis, variable: o.variable, a: {}, b: {} };
      for (const k of ['a', 'b']) for (const key of ['label', 'date', 'url', ...Calc.NUM_FIELDS]) body[k][key] = o[k + '_' + key] === '' ? null : o[k + '_' + key];
      await api(e ? 'PUT' : 'POST', pj('/experiments' + (e ? '/' + e.id : '')), body); await App.reload(); toast('Eksperimen disimpan.');
    },
    onDelete: e ? async () => { await api('DELETE', pj('/experiments/' + e.id)); await App.reload(); } : null
  });
};
function variantCell(v) {
  v = v || {};
  return '<b>' + esc(v.label || '(tanpa nama)') + '</b><div class="small muted">Tayang ' + (v.date ? fDate(v.date) : NA) + (safeUrl(v.url) ? ' · <a href="' + esc(v.url) + '" target="_blank" rel="noopener noreferrer">Buka posting</a>' : '') + '</div>';
}
App.views.eksperimen = function () {
  const exps = App.state.d.experiments;
  const cards = exps.map((e) => {
    const c = Calc.compareVariants(e.a, e.b), lastDate = [e.a.date, e.b.date].filter(Boolean).sort().pop(), evalDate = lastDate ? Calc.addDays(lastDate, 3) : null;
    const rowFor = (label, k) => '<tr><td>' + label + '</td><td class="n">' + fN(Calc.isNum(e.a[k]) ? e.a[k] : null) + '</td><td class="n">' + fN(Calc.isNum(e.b[k]) ? e.b[k] : null) + '</td><td class="n">' + (c.ready ? fDiff(((c.metrics.find((x) => x.key === k) || {}).diff) ?? null) : NA) + '</td></tr>';
    const sa = Calc.variantStats(e.a), sb = Calc.variantStats(e.b);
    return '<div class="panel"><div class="ph"><div><h2>' + esc(e.hypothesis) + '</h2><span class="chip neutral">Variabel: ' + esc(e.variable) + '</span> ' + (c.ready ? '<span class="chip good">Hasil lengkap</span>' : '<span class="chip">Menunggu hasil</span>') + '</div><button class="btn small" data-act="exp-edit" data-id="' + e.id + '">Edit / isi hasil</button></div>' +
      '<div class="cols2e"><div class="item">' + variantCell(e.a).replace('<b>', '<b>Versi awal: ') + '</div><div class="item">' + variantCell(e.b).replace('<b>', '<b>Variasi: ') + '</div></div>' +
      '<p class="small muted" style="margin:8px 0">Tanggal evaluasi: ' + (evalDate ? '<b>' + plain(fDate(evalDate)) + '</b> (3 hari setelah konten terakhir tayang)' : 'isi tanggal tayang dulu') + '.</p>' +
      '<div class="tablewrap"><table><thead><tr><th>Metrik</th><th class="n">Versi awal</th><th class="n">Variasi</th><th class="n">Selisih</th></tr></thead><tbody>' + rowFor('Reach', 'reach') + rowFor('Views', 'views') + rowFor('Likes', 'likes') + rowFor('Komentar', 'comments') + rowFor('Saves', 'saves') + rowFor('Shares', 'shares') +
      '<tr><td>Total Engagements</td><td class="n">' + fN(sa.eng) + '</td><td class="n">' + fN(sb.eng) + '</td><td class="n">' + (c.ready ? fDiff(c.engDiff) : NA) + '</td></tr><tr><td>ER</td><td class="n">' + fPct(sa.er) + '</td><td class="n">' + fPct(sb.er) + '</td><td class="n">' + (c.ready ? fPp(c.erDiffPp) : NA) + '</td></tr></tbody></table></div>' +
      (c.ready ? '<p class="small" style="margin-top:6px">Selisih = variasi dikurangi versi awal. ' + (c.erDiffPp === null ? 'ER belum bisa dibandingkan karena reach atau engagement salah satu konten belum diisi.' : c.erDiffPp > 0 ? 'Variasi punya ER lebih tinggi ' + plain(fPp(c.erDiffPp)) + '.' : c.erDiffPp < 0 ? 'Variasi punya ER lebih rendah ' + plain(fPp(c.erDiffPp)) + '.' : 'ER sama.') + ' Satu pasang konten hanya memberi indikasi, bukan bukti; ulangi tes sebelum mengambil kesimpulan besar.</p>' : '<p class="small muted" style="margin-top:6px">Selisih muncul setelah hasil kedua konten diisi.</p>') + '</div>';
  }).join('');
  return pageHead('Experiment Tracker', 'Catat apa yang dites dan hasilnya. Satu eksperimen, satu variabel.', false) + modeNotice() +
    '<div class="toolbar" style="margin-bottom:10px"><button class="btn primary" data-act="exp-new">Eksperimen baru</button></div>' + (cards || '<div class="panel empty">Belum ada eksperimen. Mulai dari hipotesis sederhana, misalnya dua hook berbeda untuk topik yang sama.</div>');
};

// ---------- Leads ----------
const INQ_STATUS = ['Inquiry', 'Qualified', 'Booked', 'Closed'];
App.waLink = function (c) {
  const ph = c.phone || P().whatsapp_number; if (!ph) return null;
  return 'https://wa.me/' + ph + '?text=' + encodeURIComponent(c.message);
};
App.campForm = function (c) {
  formModal({
    title: c ? 'Edit kampanye' : 'Kampanye WhatsApp baru', values: c || { phone: '' }, submitLabel: 'Simpan',
    fields: [{ name: 'name', label: 'Nama kampanye', required: true, placeholder: 'Contoh: Reel manasik November' }, { name: 'code', label: 'Kode kampanye', hint: 'Kosongkan untuk dibuat otomatis (contoh KV-1A2B3C). Kode ikut masuk ke pesan pembuka.', half: true }, { name: 'phone', label: 'Nomor WhatsApp', hint: 'Format internasional tanpa 0 dan tanpa +. Kosong = pakai nomor di Pengaturan.', half: true }, { name: 'message', label: 'Pesan pembuka', type: 'textarea', rows: 3 }],
    onSubmit: async (o) => { await api(c ? 'PUT' : 'POST', pj('/campaigns' + (c ? '/' + c.id : '')), o); await App.reload(); toast('Kampanye disimpan.'); },
    onDelete: c ? async () => { await api('DELETE', pj('/campaigns/' + c.id)); await App.reload(); } : null
  });
};
App.inqForm = function (i) {
  const camps = App.state.d.campaigns;
  formModal({
    title: i ? 'Edit inquiry' : 'Catat inquiry', values: i || { date: today(), status: 'Inquiry', campaign_id: '' }, submitLabel: 'Simpan',
    fields: [{ name: 'campaign_id', label: 'Kampanye', type: 'select', options: [['', 'Tanpa kampanye']].concat(camps.map((c) => [c.id, c.name + ' (' + c.code + ')'])) }, { name: 'date', label: 'Tanggal masuk', type: 'date', required: true, half: true }, { name: 'status', label: 'Status', type: 'select', options: INQ_STATUS, half: true }, { name: 'contact', label: 'Nama/kontak' }, { name: 'note', label: 'Catatan', type: 'textarea', rows: 3 }],
    onSubmit: async (o) => { await api(i ? 'PUT' : 'POST', pj('/inquiries' + (i ? '/' + i.id : '')), o); await App.reload(); toast('Inquiry dicatat.'); },
    onDelete: i ? async () => { await api('DELETE', pj('/inquiries/' + i.id)); await App.reload(); } : null
  });
};
App.views.leads = function () {
  const d = App.state.d, camps = d.campaigns, inqs = d.inquiries, ph = !!P().whatsapp_number;
  const cnt = (cid, st) => inqs.filter((i) => (cid === null ? i.campaign_id === null : i.campaign_id === cid) && (!st || i.status === st)).length;
  const campHtml = camps.map((c) => {
    const link = App.waLink(c);
    return '<div class="item"><div class="row"><div><b>' + esc(c.name) + '</b> <span class="chip neutral">' + esc(c.code) + '</span></div><button class="btn small" data-act="camp-edit" data-id="' + c.id + '">Edit</button></div>' +
      (link ? '<div class="small" style="margin:6px 0"><code>' + esc(link) + '</code></div><div class="toolbar"><button class="btn small" data-act="camp-copy" data-id="' + c.id + '">Salin link</button><a class="btn small" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Coba buka</a></div>' : '<div class="notice warn" style="margin-top:6px">Belum ada nomor WhatsApp. Isi di Pengaturan atau di kampanye ini.</div>') + '</div>';
  }).join('');
  const sumRows = camps.map((c) => '<tr><td>' + esc(c.name) + ' <span class="chip neutral">' + esc(c.code) + '</span></td><td class="n">' + cnt(c.id) + '</td><td class="n">' + cnt(c.id, 'Qualified') + '</td><td class="n">' + cnt(c.id, 'Booked') + '</td><td class="n">' + cnt(c.id, 'Closed') + '</td></tr>').join('') +
    (cnt(null) ? '<tr><td>Tanpa kampanye</td><td class="n">' + cnt(null) + '</td><td class="n">' + cnt(null, 'Qualified') + '</td><td class="n">' + cnt(null, 'Booked') + '</td><td class="n">' + cnt(null, 'Closed') + '</td></tr>' : '');
  const cname = (id) => { const c = camps.find((x) => x.id === id); return c ? esc(c.name) : '<span class="muted">Tanpa kampanye</span>'; };
  return pageHead('Lead Tracker', 'Catat kampanye WhatsApp dan inquiry yang masuk.', false) + modeNotice() +
    (ph ? '' : '<div class="notice warn">Nomor WhatsApp belum diisi. Isi di <a href="#/pengaturan">Pengaturan</a> supaya link kampanye bisa dibuat.</div>') +
    '<div class="cols2e"><div class="panel"><div class="ph"><h2>Kampanye WhatsApp</h2><button class="btn primary" data-act="camp-new">Buat kampanye</button></div>' + (camps.length ? '<div class="list">' + campHtml + '</div>' : '<div class="empty">Belum ada kampanye. Buat satu untuk mendapat link dengan kode unik.</div>') + '</div>' +
    '<div class="panel"><div class="ph"><h2>Hasil per kampanye</h2></div>' + (sumRows ? '<div class="tablewrap"><table><thead><tr><th>Kampanye</th><th class="n">Inquiry</th><th class="n">Qualified</th><th class="n">Booking</th><th class="n">Closed</th></tr></thead><tbody>' + sumRows + '</tbody></table></div><p class="small muted" style="margin-top:6px">Inquiry = semua yang tercatat. Booking = status Booked. Closed dihitung terpisah.</p>' : '<div class="empty">Belum ada inquiry tercatat.</div>') + '</div></div>' +
    '<div class="panel"><div class="ph"><h2>Inquiry masuk</h2><button class="btn primary" data-act="inq-new">Catat inquiry</button></div>' + (inqs.length ? '<div class="tablewrap"><table><thead><tr><th>Tanggal</th><th>Kampanye</th><th>Kontak</th><th>Catatan</th><th>Status</th><th></th></tr></thead><tbody>' + inqs.map((i) => '<tr><td>' + fDate(i.date) + '</td><td>' + cname(i.campaign_id) + '</td><td>' + esc(i.contact) + '</td><td>' + esc(i.note) + '</td><td><span class="chip ' + (i.status === 'Booked' || i.status === 'Closed' ? 'good' : 'neutral') + '">' + esc(i.status) + '</span></td><td><button class="btn small" data-act="inq-edit" data-id="' + i.id + '">Edit</button></td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">Belum ada inquiry. Catat manual setiap ada chat masuk.</div>') + '</div>';
};

// ---------- Sumber data ----------
const KIND = { expired: 'Token kedaluwarsa', invalid_token: 'Token tidak valid', permission: 'Izin kurang', page_not_found: 'Facebook Page tidak ditemukan', ig_not_found: 'Akun Instagram tidak ditemukan', rate_limit: 'Batas panggilan tercapai', unreachable: 'Meta API gagal dihubungi', api: 'Meta API error' };
App.metaErr = function (e) {
  const dd = e.data || {};
  return '<div class="notice bad"><div><b>' + esc(KIND[dd.kind] || 'Gagal') + '.</b> ' + esc(e.message) + (dd.missing ? ' Izin kurang: ' + esc(dd.missing.join(', ')) + '.' : '') + '<br>' + esc(dd.advice || '') + '</div></div>';
};
App.views.sumber = function () {
  const d = App.state.d, p = d.project, m = p.data_mode, c = d.meta, cn = d.counts;
  const sw = (mode) => m === mode ? '<span class="chip good">Sedang dipakai</span>' : '<button class="btn small" data-act="mode" data-v="' + mode + '">Pakai mode ini</button>';
  const status = c.status === 'connected' ? '<div class="notice ok"><div><b>Tersambung.</b> Page: ' + esc(c.pageName) + ', Instagram: @' + esc(c.igUsername) + '. Dites ' + esc(fDateTime(c.checkedAt) || '-') + '.<br><span class="small">Izin diberikan: ' + esc((c.permissions || []).join(', ')) + '</span></div></div>' :
    c.status === 'error' ? '<div class="notice bad"><div><b>' + esc(KIND[c.errorKind] || 'Koneksi bermasalah') + '.</b> ' + esc(c.errorMessage || '') + '<br>' + esc(c.advice || '') + '</div></div>' : '<div class="notice">Meta belum tersambung. Dashboard tetap bisa dipakai dengan mode Demo atau CSV.</div>';
  return pageHead('Sumber data', 'Pilih asal angka: data contoh, file CSV, atau Meta Insights.', false) + modeNotice() +
    '<div class="cols2e"><div class="panel"><div class="ph"><h2>Demo ' + modeChip('demo') + '</h2>' + sw('demo') + '</div><p class="small">Data contoh (' + (cn.demo || 0) + ' posting) untuk mencoba semua fitur. Semua angka fiktif.</p><button class="btn small" data-act="demo-reset">Reset data contoh</button></div>' +
    '<div class="panel"><div class="ph"><h2>Impor CSV ' + modeChip('csv') + '</h2>' + sw('csv') + '</div><p class="small">' + (cn.csv || 0) + ' posting dari CSV tersimpan. Kolom: <code>' + esc(Calc.TEMPLATE_COLS.join(',')) + '</code> (opsional <code>url</code>). Tanggal YYYY-MM-DD. Sel kosong = data belum tersedia; 0 = nol.</p>' +
    '<div class="toolbar"><input type="file" id="csvfile" accept=".csv,text/csv" aria-label="Pilih file CSV"><button class="btn primary" data-act="csv-import">Impor</button></div><label class="small"><input type="checkbox" id="csvreplace"> Ganti semua data CSV sebelumnya</label><div id="importmsg" style="margin-top:8px"></div>' +
    '<div class="toolbar" style="margin-top:8px"><a class="btn small" href="/api/template.csv">Unduh template CSV</a>' + (cn.csv ? '<button class="btn small danger" data-act="csv-clear">Hapus data CSV</button>' : '') + '</div></div></div>' +
    '<div class="panel"><div class="ph"><h2>Instagram Insights ' + modeChip('meta') + '</h2>' + (c.status === 'connected' ? sw('meta') : '') + '</div>' + status +
    '<form id="tokenform" class="form" style="max-width:560px"><div class="field"><label for="tok">Facebook User Access Token</label><input id="tok" name="token" type="password" autocomplete="off" spellcheck="false" placeholder="Tempel token dari Graph API Explorer"><div class="hint">Token dikirim ke server, dienkripsi (AES-256-GCM), dan tidak pernah dikembalikan ke browser. Jangan tempel token di chat atau file CSV.</div></div><div id="tokmsg"></div>' +
    '<div class="toolbar"><button class="btn primary" type="submit">' + (c.hasToken ? 'Sambungkan ulang dengan token baru' : 'Simpan dan tes koneksi') + '</button>' + (c.hasToken ? '<button class="btn" type="button" data-act="meta-test">Tes koneksi</button><button class="btn danger" type="button" data-act="meta-del">Hapus token</button>' : '') + '</div></form>' +
    '<p class="small muted" style="margin-top:8px">Dashboard ini mencari akun <b>@' + esc(p.ig_username || '(isi di Pengaturan)') + '</b> di Page yang terlihat oleh token.</p></div>' +
    '<div class="panel"><div class="ph"><h2>Panduan setup Meta</h2></div>' + guide() + '</div>' +
    '<div class="panel"><div class="ph"><h2>Di mana data disimpan</h2></div><ul class="small"><li><b>Di server (database SQLite, per akun login):</b> posting, snapshot followers, watchlist, bank ide, kalender, eksperimen, kampanye, inquiry, dan token Meta terenkripsi.</li><li><b>Hanya di browser:</b> tidak ada data bisnis. Browser hanya menyimpan cookie sesi login dan pilihan project terakhir.</li><li>Pilihan mode dan pengaturan project juga tersimpan di server.</li></ul></div>';
};
function guide() {
  const g = (t, body) => '<details class="guide"><summary>' + t + '</summary>' + body + '</details>';
  return g('1. Siapkan akun Instagram Professional dan Facebook Page', '<ol><li>Pastikan akun Instagram berjenis Professional (Business atau Creator).</li><li>Hubungkan ke Facebook Page lewat pengaturan Page (Linked accounts) atau lewat Edit profile di Instagram.</li><li>Akun Facebook yang membuat token harus punya akses ke Page tersebut. Kalau aksesnya lewat Business Manager, izin tambahan <code>ads_read</code> atau <code>ads_management</code> bisa diperlukan.</li></ol>') +
    g('2. Siapkan Meta App', '<ol><li>Buka developers.facebook.com, masuk, lalu buat App baru dan tambahkan produk Instagram API (jalur Facebook Login).</li><li>Untuk akun milik lo sendiri, pastikan akun Facebook lo berperan Admin/Developer/Tester di App itu.</li><li>Nama menu di dashboard Meta sering berubah. Cek dokumentasi resmi terbaru, bukan hanya panduan ini.</li></ol>') +
    g('3. Buat User Access Token di Graph API Explorer', '<ol><li>Buka Graph API Explorer (<a href="https://developers.facebook.com/docs/graph-api/guides/explorer/" target="_blank" rel="noopener noreferrer">dokumentasi</a>), pilih App lo.</li><li>Pilih jenis token <b>User Token</b>, lalu tambahkan izin: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>instagram_basic</code>, <code>instagram_manage_insights</code>.</li><li>Klik Generate Access Token, setujui, dan pilih Page serta akun Instagram yang dituju.</li><li>Salin token, tempel di kolom di atas, klik <b>Simpan dan tes koneksi</b>.</li><li>Token dari Explorer biasanya berumur pendek. Untuk token yang lebih awet, tukar menjadi long-lived token sesuai dokumentasi Meta (butuh App Secret, jadi lakukan di luar dashboard ini). Saat kedaluwarsa, dashboard akan menampilkan "Token kedaluwarsa" dan lo tinggal pakai "Sambungkan ulang".</li></ol>') +
    g('4. Batas akses: akun sendiri vs akun orang lain', '<ul><li><b>Development / Standard Access:</b> cukup kalau App hanya melayani akun yang lo miliki atau kelola dan sudah ditambahkan ke App (role di Dashboard App). Tidak perlu App Review untuk pemakaian pribadi seperti ini.</li><li><b>Advanced Access:</b> baru dibutuhkan kalau suatu saat App melayani akun Instagram milik orang lain. Itu melibatkan App Review dan verifikasi bisnis, dan sebaiknya dibahas terpisah saat waktunya tiba.</li></ul>') +
    g('5. Referensi resmi', '<ul><li><a href="https://developers.facebook.com/documentation/instagram-platform/insights" target="_blank" rel="noopener noreferrer">Instagram Platform: Insights</a></li><li><a href="https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery/" target="_blank" rel="noopener noreferrer">Business Discovery</a></li><li><a href="https://developers.facebook.com/docs/graph-api/guides/explorer/" target="_blank" rel="noopener noreferrer">Graph API Explorer</a></li></ul><p class="small muted">Nama izin dan metrik bisa berubah. Verifikasi ke dokumentasi di atas sebelum mengandalkan angka.</p>');
}

// ---------- Pengaturan ----------
App.views.pengaturan = function () {
  const p = P(), s = App.state;
  return pageHead('Pengaturan', 'Identitas brand dan data contoh yang bisa lo ganti kapan saja.', false) +
    '<div class="panel" style="max-width:720px"><form id="setform" class="form" novalidate>' +
    [['dashboard_name', 'Nama dashboard'], ['brand', 'Nama brand'], ['ig_username', 'Username Instagram Professional (tanpa @)'], ['niche', 'Niche'], ['audience', 'Target audiens'], ['timezone', 'Zona waktu (IANA)'], ['whatsapp_number', 'Nomor WhatsApp (format internasional, contoh 6281234567890)']].map((f) => '<div class="field"><label for="s_' + f[0] + '">' + f[1] + '</label><input id="s_' + f[0] + '" name="' + f[0] + '" value="' + esc(p[f[0]]) + '"></div>').join('') +
    '<div class="field"><label for="s_keywords">Kata kunci niche (pisahkan koma)</label><textarea id="s_keywords" name="keywords" rows="3">' + esc(p.keywords.join(', ')) + '</textarea><div class="hint">Dipakai untuk contoh riset dan pencocokan di Trending Now.</div></div>' +
    '<div class="formerr" id="seterr" hidden role="alert"></div><div class="toolbar"><button class="btn primary" type="submit">Simpan pengaturan</button></div></form></div>' +
    '<div class="panel" style="max-width:720px"><div class="ph"><h2>Project / brand lain</h2></div><p class="small muted">Satu akun login bisa mengelola beberapa project. Tiap project punya data, koneksi Meta, dan token sendiri.</p><div class="toolbar"><button class="btn" data-act="proj-new">Tambah project</button>' + (s.projects.length > 1 ? '<button class="btn danger" data-act="proj-del">Hapus project ini</button>' : '') + '</div></div>';
};
