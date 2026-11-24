/* Modul perhitungan bersama (server + browser).
 * Aturan utama:
 *  - null = data belum tersedia, 0 = angka nol yang valid. Jangan pernah dicampur.
 *  - ER berbobot = total engagements / total reach x 100, hanya untuk posting yang punya
 *    kedua angka dan reach > 0.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const NUM_FIELDS = ['views', 'reach', 'likes', 'comments', 'saves', 'shares', 'interactions'];

  // ---------- Tanggal (semua YYYY-MM-DD, tanpa efek zona waktu) ----------
  const DAY = 86400000;
  function dayNum(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY;
  }
  function validDate(s) {
    const n = dayNum(s);
    return Number.isFinite(n) && addDays(s, 0) === s;
  }
  function fromDayNum(n) {
    return new Date(n * DAY).toISOString().slice(0, 10);
  }
  function addDays(s, n) { return fromDayNum(dayNum(s) + n); }
  function diffDays(a, b) { return dayNum(a) - dayNum(b); } // a - b
  function todayIn(tz) {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: tz || 'Asia/Jakarta' });
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }
  function periodRange(today, days) {
    return { start: addDays(today, -(days - 1)), end: today, days };
  }
  function previousRange(today, days) {
    const cur = periodRange(today, days);
    const end = addDays(cur.start, -1);
    return { start: addDays(end, -(days - 1)), end, days };
  }
  function inRange(posts, r) {
    return posts.filter((p) => p.date >= r.start && p.date <= r.end);
  }

  // ---------- Metrik ----------
  function totalEng(p) {
    if (isNum(p.interactions)) return p.interactions;
    if (isNum(p.likes) && isNum(p.comments) && isNum(p.shares) && isNum(p.saves)) {
      return p.likes + p.comments + p.shares + p.saves;
    }
    return null;
  }
  function postER(p) {
    const e = totalEng(p);
    if (e === null || !isNum(p.reach) || p.reach <= 0) return null;
    return (e / p.reach) * 100;
  }
  function metricValue(p, key) {
    if (key === 'engagements') return totalEng(p);
    if (key === 'er') return postER(p);
    return isNum(p[key]) ? p[key] : null;
  }
  // Jumlahkan metrik; value null jika tidak ada satu pun posting yang punya datanya.
  function sumMetric(posts, key) {
    let sum = 0, count = 0;
    for (const p of posts) {
      const v = metricValue(p, key);
      if (v !== null) { sum += v; count++; }
    }
    return { value: count ? sum : null, count, total: posts.length };
  }
  function weightedER(posts) {
    let e = 0, r = 0, n = 0;
    for (const p of posts) {
      const eng = totalEng(p);
      if (eng !== null && isNum(p.reach) && p.reach > 0) { e += eng; r += p.reach; n++; }
    }
    return { value: n ? (e / r) * 100 : null, count: n, total: posts.length };
  }
  function median(arr) {
    const a = arr.filter(isNum).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  // Cakupan data posting terhadap rentang yang dipilih
  function postCoverage(allPosts, range) {
    if (!allPosts.length) return { state: 'empty' };
    let earliest = allPosts[0].date;
    for (const p of allPosts) if (p.date < earliest) earliest = p.date;
    if (earliest > range.start) {
      const covered = Math.max(0, diffDays(range.end, earliest) + 1);
      return { state: 'partial', from: earliest, covered, days: range.days };
    }
    return { state: 'full', from: earliest };
  }

  // Snapshot followers
  function followerSummary(snaps, range) {
    const s = snaps.filter((x) => isNum(x.followers) && x.date <= range.end).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!s.length) return { value: null, date: null, change: null, baselineDate: null, state: 'empty' };
    const latest = s[s.length - 1];
    let base = null;
    for (const x of s) if (x.date <= range.start) base = x;
    let complete = true;
    if (!base) { base = s.find((x) => x.date > range.start); complete = false; }
    if (!base || base.date === latest.date) {
      return { value: latest.followers, date: latest.date, change: null, baselineDate: null, state: 'single' };
    }
    return {
      value: latest.followers, date: latest.date, change: latest.followers - base.followers,
      baselineDate: base.date, state: complete ? 'full' : 'partial'
    };
  }

  // Kelompokkan metrik per tanggal posting (total terakhir tiap posting).
  function groupByDate(posts, key) {
    const map = new Map();
    for (const p of posts) {
      const v = metricValue(p, key);
      const g = map.get(p.date) || { date: p.date, value: null, count: 0, withData: 0 };
      g.count++;
      if (v !== null) { g.value = (g.value || 0) + v; g.withData++; }
      map.set(p.date, g);
    }
    return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  // Perbandingan periode (posting dikelompokkan menurut tanggal tayang)
  function comparePeriods(posts, today, days) {
    const cur = periodRange(today, days), prev = previousRange(today, days);
    const A = inRange(posts, cur), B = inRange(posts, prev);
    const pct = (a, b) => (a === null || b === null || b === 0 ? null : ((a - b) / b) * 100);
    const row = (label, key) => {
      const a = sumMetric(A, key).value, b = sumMetric(B, key).value;
      return { label, key, cur: a, prev: b, changePct: pct(a, b) };
    };
    const erA = weightedER(A).value, erB = weightedER(B).value;
    return {
      cur, prev, curPosts: A, prevPosts: B,
      rows: [
        { label: 'Jumlah posting', key: 'count', cur: A.length, prev: B.length, changePct: pct(A.length, B.length) },
        row('Views', 'views'), row('Reach', 'reach'), row('Total Engagements', 'engagements'),
        { label: 'ER (berbobot)', key: 'er', cur: erA, prev: erB, changePp: erA !== null && erB !== null ? erA - erB : null }
      ],
      coverage: postCoverage(posts, prev)
    };
  }

  // ---------- Insight per posting ----------
  const AGE_WINDOW = 7;   // hari selisih umur tayang yang dianggap mirip
  const MIN_COMP = 3;     // minimal pembanding
  function insightFor(post, posts, today) {
    const age = diffDays(today, post.date);
    const er = postER(post);
    const comps = posts.filter((p) => p !== post && p.id !== post.id && p.type === post.type &&
      Math.abs(diffDays(today, p.date) - age) <= AGE_WINDOW);
    const reachVals = comps.map((p) => p.reach).filter(isNum);
    const erVals = comps.map(postER).filter(isNum);
    const base = {
      age, comparables: comps.length,
      reachMedian: median(reachVals), erMedian: median(erVals),
      reachN: reachVals.length, erN: erVals.length, own: { reach: isNum(post.reach) ? post.reach : null, er }
    };
    if (age < 3) {
      return { status: 'baru', label: 'Masih baru', base,
        text: 'Posting ini belum 3 hari tayang. Cek performa pada ' + addDays(post.date, 3) + '.', hypotheses: [] };
    }
    const reachOk = base.own.reach !== null && reachVals.length >= MIN_COMP;
    const erOk = er !== null && erVals.length >= MIN_COMP;
    if (!reachOk && !erOk) {
      return { status: 'belum_cukup', label: 'Pembanding belum cukup', base,
        text: 'Belum ada cukup posting dengan format dan umur tayang mirip (minimal ' + MIN_COMP + ' dengan data) untuk dibandingkan.', hypotheses: [] };
    }
    if (reachOk && base.own.reach < 0.7 * base.reachMedian) {
      return { status: 'reach_rendah', label: 'Reach rendah', base,
        text: 'Reach ' + base.own.reach + ' lebih rendah dari median pembanding ' + Math.round(base.reachMedian) + '.',
        hypotheses: ['Hook 3 detik pertama atau cover kurang menarik bagi audiens 35+.', 'Jam atau hari tayang kurang pas dengan waktu audiens aktif.', 'Topik kurang dekat dengan hal yang sedang dicari audiens.'] };
    }
    if (erOk && er < 0.7 * base.erMedian) {
      return { status: 'engagement_rendah', label: 'Engagement rendah', base,
        text: 'ER ' + er.toFixed(1) + '% lebih rendah dari median pembanding ' + base.erMedian.toFixed(1) + '%.',
        hypotheses: ['Konten terlihat orang, tetapi pesan atau CTA belum mendorong aksi.', 'Isi kurang terasa berguna untuk disimpan atau dibagikan.', 'Topik kurang relevan dengan calon jamaah.'] };
    }
    if ((reachOk && base.own.reach >= 1.2 * base.reachMedian) || (erOk && er >= 1.2 * base.erMedian)) {
      return { status: 'perform', label: 'Perform', base,
        text: 'Di atas median pembanding' + (reachOk ? ' (reach ' + base.own.reach + ' vs ' + Math.round(base.reachMedian) + ')' : '') + (erOk ? ' (ER ' + er.toFixed(1) + '% vs ' + base.erMedian.toFixed(1) + '%)' : '') + '.',
        hypotheses: ['Hook atau topik cocok dengan minat audiens.', 'Format dan waktu tayang mendukung distribusi.', 'Isi cukup berguna sehingga mendorong simpan atau bagikan.'] };
    }
    return { status: 'standar', label: 'Sesuai pembanding', base,
      text: 'Hasilnya berada di kisaran konten pembanding.', hypotheses: [] };
  }

  // ---------- Next steps ----------
  function nextSteps(posts, today, days) {
    const A = inRange(posts, periodRange(today, days));
    const withIns = A.map((p) => ({ p, ins: insightFor(p, posts, today), er: postER(p) }));
    const repeat = withIns.filter((x) => x.ins.status === 'perform').sort((a, b) => (b.er || 0) - (a.er || 0)).slice(0, 3);
    const fix = withIns.filter((x) => x.ins.status === 'reach_rendah' || x.ins.status === 'engagement_rendah')
      .sort((a, b) => (a.er === null ? 1 : b.er === null ? -1 : a.er - b.er)).slice(0, 3);
    const fresh = withIns.filter((x) => x.ins.status === 'baru');
    // tes format: bandingkan ER berbobot antar format
    const byType = {};
    for (const p of A) (byType[p.type] = byType[p.type] || []).push(p);
    const types = Object.keys(byType).map((t) => ({ type: t, er: weightedER(byType[t]) })).filter((x) => x.er.count >= 3)
      .sort((a, b) => b.er.value - a.er.value);
    const tests = [];
    if (types.length >= 2) {
      const best = types[0], worst = types[types.length - 1];
      tests.push('Tes format: ' + best.type + ' (ER ' + best.er.value.toFixed(1) + '%) vs ' + worst.type + ' (ER ' + worst.er.value.toFixed(1) + '%) dengan topik yang sama.');
    }
    tests.push('Tes hook: buat dua versi hook untuk topik yang sama, ubah hanya kalimat pembukanya.');
    tests.push('Tes CTA: bandingkan ajakan simpan dengan ajakan kirim ke keluarga (ubah satu variabel saja).');
    return { repeat, fix, fresh, tests, hasData: A.length > 0 };
  }

  // ---------- Experiment ----------
  function variantStats(v) {
    v = v || {};
    return { eng: totalEng(v), er: postER(v), reach: isNum(v.reach) ? v.reach : null };
  }
  function hasResult(v) { return !!v && NUM_FIELDS.some((k) => isNum(v[k])); }
  function compareVariants(a, b) {
    if (!hasResult(a) || !hasResult(b)) return { ready: false };
    const A = variantStats(a), B = variantStats(b);
    const d = (x, y) => (x === null || y === null ? null : y - x);
    const dp = (x, y) => (x === null || y === null || x === 0 ? null : ((y - x) / x) * 100);
    const metrics = ['reach', 'views', 'likes', 'comments', 'saves', 'shares'].map((k) => ({
      key: k, a: isNum(a[k]) ? a[k] : null, b: isNum(b[k]) ? b[k] : null,
      diff: d(isNum(a[k]) ? a[k] : null, isNum(b[k]) ? b[k] : null), pct: dp(isNum(a[k]) ? a[k] : null, isNum(b[k]) ? b[k] : null)
    }));
    return { ready: true, a: A, b: B, erDiffPp: d(A.er, B.er), engDiff: d(A.eng, B.eng), metrics };
  }

  // ---------- CSV ----------
  const REQUIRED_COLS = ['title', 'date'];
  const TEMPLATE_COLS = ['title', 'type', 'date', 'views', 'reach', 'likes', 'comments', 'saves', 'shares', 'interactions'];
  const KNOWN_TYPES = { reel: 'Reel', reels: 'Reel', carousel: 'Carousel', carousel_album: 'Carousel', image: 'Image', photo: 'Image', foto: 'Image', video: 'Video', story: 'Story' };

  function splitCsv(text, delim) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((x) => x.trim() !== '')) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur);
    if (row.some((x) => x.trim() !== '')) rows.push(row);
    return rows;
  }

  function parseCsv(input) {
    const fail = (message, errors) => ({ ok: false, message, errors: errors || [], rows: [] });
    let text = String(input == null ? '' : input).replace(/^\uFEFF/, '');
    if (!text.trim()) return fail('File kosong. Unduh template CSV dan isi datanya.');
    if (text.indexOf('\u0000') !== -1) return fail('File ini bukan CSV teks (kemungkinan file Excel .xlsx). Simpan dulu sebagai CSV (UTF-8), lalu impor lagi.');
    const first = text.split(/\r?\n/, 1)[0];
    const delim = (first.split(';').length > first.split(',').length) ? ';' : ',';
    const table = splitCsv(text, delim);
    const headers = table[0].map((h) => h.trim().toLowerCase());
    const missing = REQUIRED_COLS.filter((c) => headers.indexOf(c) === -1);
    if (missing.length) {
      return fail('Format file salah: kolom wajib tidak ditemukan (' + missing.join(', ') + '). Kolom yang terbaca: ' + headers.join(', ') + '. Gunakan header: ' + TEMPLATE_COLS.join(',') + '.');
    }
    if (!headers.some((h) => NUM_FIELDS.indexOf(h) !== -1)) {
      return fail('Format file salah: tidak ada kolom metrik (views, reach, likes, comments, saves, shares, atau interactions).');
    }
    const idx = {}; headers.forEach((h, i) => { if (!(h in idx)) idx[h] = i; });
    if (table.length < 2) return fail('File hanya berisi header, belum ada baris data.');
    if (table.length > 5001) return fail('Terlalu banyak baris (maksimal 5.000 posting per impor).');
    const rows = [], errors = [];
    const seen = new Set(); let dup = 0;
    for (let r = 1; r < table.length; r++) {
      const line = r + 1, cells = table[r], errs = [];
      const get = (k) => (k in idx && cells[idx[k]] !== undefined ? cells[idx[k]].trim() : '');
      const title = get('title');
      const date = get('date');
      if (!title) errs.push('title kosong');
      if (!validDate(date)) errs.push('date "' + date + '" harus format YYYY-MM-DD');
      const o = { title: title.slice(0, 300), date, url: null, type: 'Lainnya' };
      const t = get('type');
      if (t) o.type = KNOWN_TYPES[t.toLowerCase()] || t.slice(0, 30);
      const u = get('url') || get('link');
      if (u) { if (/^https?:\/\//i.test(u)) o.url = u.slice(0, 500); else errs.push('url harus diawali http:// atau https://'); }
      for (const k of NUM_FIELDS) {
        const raw = get(k);
        if (raw === '') { o[k] = null; continue; }
        if (!/^\d+(\.0+)?$/.test(raw)) { errs.push(k + ' "' + raw + '" bukan angka bulat tanpa tanda pemisah'); o[k] = null; continue; }
        o[k] = Math.round(Number(raw));
      }
      if (errs.length) { errors.push('Baris ' + line + ': ' + errs.join('; ')); continue; }
      const key = o.date + '|' + o.title.toLowerCase();
      if (seen.has(key)) { dup++; continue; }
      seen.add(key); rows.push(o);
    }
    if (errors.length) {
      const shown = errors.slice(0, 8);
      if (errors.length > 8) shown.push('... dan ' + (errors.length - 8) + ' baris bermasalah lain.');
      return { ok: false, message: 'Ada ' + errors.length + ' baris yang tidak valid. Tidak ada data yang diimpor. Perbaiki file lalu coba lagi.', errors: shown, rows: [] };
    }
    return { ok: true, rows, errors: [], duplicates: dup, message: '' };
  }

  function csvCell(v, textual) {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (textual && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // cegah formula injection di Excel
    return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(posts) {
    const lines = [TEMPLATE_COLS.concat(['url']).join(',')];
    for (const p of posts) {
      lines.push([csvCell(p.title, true), csvCell(p.type, true), p.date, csvCell(p.views), csvCell(p.reach), csvCell(p.likes),
        csvCell(p.comments), csvCell(p.saves), csvCell(p.shares), csvCell(p.interactions), csvCell(p.url, true)].join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }
  const TEMPLATE_CSV = TEMPLATE_COLS.join(',') + '\r\n' +
    'Tips memilih paket umroh untuk orang tua,Carousel,2026-11-03,5200,3100,180,12,64,28,284\r\n' +
    'Urutan manasik umroh hari pertama,Reel,2026-11-07,14800,8900,410,35,150,92,687\r\n' +
    'Contoh data kosong (reach belum tersedia),Image,2026-11-10,,,,,,,\r\n' +
    'Contoh nilai nol yang valid,Image,2026-11-12,900,700,21,0,3,0,24\r\n';

  return {
    isNum, NUM_FIELDS, TEMPLATE_COLS, TEMPLATE_CSV, MIN_COMP, AGE_WINDOW,
    dayNum, validDate, addDays, diffDays, todayIn, periodRange, previousRange, inRange,
    totalEng, postER, metricValue, sumMetric, weightedER, median, postCoverage, followerSummary,
    groupByDate, comparePeriods, insightFor, nextSteps, variantStats, hasResult, compareVariants,
    parseCsv, toCsv
  };
});
