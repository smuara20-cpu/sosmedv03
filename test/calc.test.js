const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../shared/calc');

test('Total Engagements: prioritaskan interactions, fallback ke 4 komponen, null jika tidak lengkap', () => {
  assert.equal(C.totalEng({ interactions: 50, likes: 1, comments: 1, shares: 1, saves: 1 }), 50);
  assert.equal(C.totalEng({ interactions: null, likes: 10, comments: 2, shares: 0, saves: 3 }), 15);
  assert.equal(C.totalEng({ interactions: null, likes: 10, comments: 2, shares: null, saves: 3 }), null);
  assert.equal(C.totalEng({ interactions: 0, likes: 5, comments: 5, shares: 5, saves: 5 }), 0); // nol valid, bukan kosong
});

test('ER berbobot hanya dari posting dengan engagement dan reach > 0', () => {
  const posts = [
    { reach: 1000, interactions: 100 }, { reach: 3000, interactions: 100 },
    { reach: 0, interactions: 10 }, { reach: null, interactions: 10 }, { reach: 500, interactions: null }
  ];
  const r = C.weightedER(posts);
  assert.equal(r.count, 2); assert.equal(r.total, 5);
  assert.ok(Math.abs(r.value - 5) < 1e-9); // 200 / 4000 * 100
  assert.equal(C.weightedER([{ reach: null }]).value, null);
  assert.equal(C.postER({ reach: 100, interactions: 0 }), 0);
});

test('sumMetric membedakan nol dan kosong', () => {
  assert.equal(C.sumMetric([{ views: null }, { views: null }], 'views').value, null);
  assert.equal(C.sumMetric([{ views: 0 }, { views: null }], 'views').value, 0);
  assert.equal(C.sumMetric([{ views: 5 }, { views: 7 }], 'views').count, 2);
});

test('periode dan periode sebelumnya sama panjang', () => {
  const r = C.periodRange('2026-11-24', 7), p = C.previousRange('2026-11-24', 7);
  assert.deepEqual([r.start, r.end], ['2026-11-18', '2026-11-24']);
  assert.deepEqual([p.start, p.end], ['2026-11-11', '2026-11-17']);
});

test('perbandingan periode: selisih ER dalam poin persentase dan cakupan parsial', () => {
  const posts = [
    { date: '2026-11-20', reach: 1000, interactions: 100, views: 10 },
    { date: '2026-11-13', reach: 1000, interactions: 50, views: 5 }
  ];
  const c = C.comparePeriods(posts, '2026-11-24', 7);
  const er = c.rows.find((x) => x.key === 'er');
  assert.ok(Math.abs(er.changePp - 5) < 1e-9);
  assert.equal(c.rows.find((x) => x.key === 'views').changePct, 100);
  assert.equal(c.coverage.state, 'partial'); // data mulai 13 Nov, periode lama mulai 11 Nov
  assert.equal(C.postCoverage([], C.periodRange('2026-11-24', 7)).state, 'empty');
});

test('snapshot followers: perubahan dari snapshot tersedia', () => {
  const snaps = [{ date: '2026-11-01', followers: 100 }, { date: '2026-11-20', followers: 130 }];
  const f = C.followerSummary(snaps, C.periodRange('2026-11-24', 30));
  assert.equal(f.value, 130); assert.equal(f.change, 30);
  assert.equal(C.followerSummary([], C.periodRange('2026-11-24', 7)).state, 'empty');
  assert.equal(C.followerSummary([{ date: '2026-11-20', followers: 5 }], C.periodRange('2026-11-24', 7)).change, null);
});

test('groupByDate: total per tanggal, null jika semua data kosong', () => {
  const g = C.groupByDate([{ date: 'a', views: 1 }, { date: 'a', views: 2 }, { date: 'b', views: null }], 'views');
  assert.equal(g[0].value, 3); assert.equal(g[1].value, null);
});

test('insight: butuh minimal 3 pembanding, bedakan reach rendah dan perform', () => {
  const mk = (id, reach, eng) => ({ id, type: 'Reel', date: '2026-11-0' + id, reach, interactions: eng });
  const base = [mk(1, 1000, 50), mk(2, 1000, 50), mk(3, 1000, 50), mk(4, 1000, 50)];
  const low = { id: 9, type: 'Reel', date: '2026-11-05', reach: 300, interactions: 15 };
  const high = { id: 10, type: 'Reel', date: '2026-11-05', reach: 2000, interactions: 200 };
  assert.equal(C.insightFor(low, base.concat(low), '2026-11-24').status, 'reach_rendah');
  assert.equal(C.insightFor(high, base.concat(high), '2026-11-24').status, 'perform');
  assert.equal(C.insightFor(base[0], [base[0], base[1]], '2026-11-24').status, 'belum_cukup');
  assert.equal(C.insightFor({ id: 11, type: 'Reel', date: '2026-11-23', reach: 1 }, base, '2026-11-24').status, 'baru');
});

test('eksperimen: nol dihitung sebagai hasil valid', () => {
  const a = { reach: 1000, interactions: 100, saves: 0 }, b = { reach: 1000, interactions: 150, saves: 0 };
  const r = C.compareVariants(a, b);
  assert.ok(r.ready); assert.ok(Math.abs(r.erDiffPp - 5) < 1e-9);
  assert.equal(r.metrics.find((m) => m.key === 'saves').diff, 0);
  assert.equal(C.compareVariants({ reach: 0 }, {}).ready, false);
  assert.equal(C.compareVariants({ reach: 0 }, { reach: 0 }).ready, true);
});

test('CSV: template valid, sel kosong = null, nol = 0, tanggal diperiksa', () => {
  const r = C.parseCsv(C.TEMPLATE_CSV);
  assert.ok(r.ok, r.message); assert.equal(r.rows.length, 4);
  assert.equal(r.rows[2].reach, null); assert.equal(r.rows[3].comments, 0);
});
test('CSV: pesan jelas untuk file salah format', () => {
  assert.match(C.parseCsv('').message, /kosong/i);
  assert.match(C.parseCsv('nama,umur\nA,3').message, /kolom wajib/i);
  assert.match(C.parseCsv('title,date\nA,2026-11-01').message, /kolom metrik/i);
  const bad = C.parseCsv('title,type,date,views\nA,Reel,01/11/2026,abc');
  assert.equal(bad.ok, false); assert.match(bad.errors[0], /YYYY-MM-DD/); assert.match(bad.errors[0], /views/);
  assert.match(C.parseCsv('PK\u0003\u0004\u0000\u0000x').message, /bukan CSV/i);
  assert.equal(C.parseCsv('title,type,date,views\nA,Reel,2026-02-30,5').ok, false); // tanggal tidak ada
});
test('CSV: titik koma, tanda kutip, dan ekspor aman dari formula injection', () => {
  const r = C.parseCsv('title;type;date;views;reach\n"Halo; dunia";reels;2026-11-01;10;5');
  assert.ok(r.ok); assert.equal(r.rows[0].title, 'Halo; dunia'); assert.equal(r.rows[0].type, 'Reel');
  const out = C.toCsv([{ title: '=HYPERLINK("x")', type: 'Reel', date: '2026-11-01', views: 0, reach: null }]);
  assert.match(out, /'=HYPERLINK/);
  assert.match(out, /,0,,/); // 0 tetap 0, null tetap kosong
});
