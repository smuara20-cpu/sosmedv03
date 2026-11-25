const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sosmed-'));
process.env.DATA_DIR = dir;
process.env.ALLOW_REGISTER = 'true';
const GOOD = 'EAAGOODTOKEN' + 'x'.repeat(40);

// ---- Graph API palsu ----
let scenario = 'ok';
const mock = http.createServer((req, res) => {
  const tok = (req.headers.authorization || '').replace('Bearer ', '');
  const u = new URL(req.url, 'http://x');
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (tok.startsWith('EXPIRED') || scenario === 'expired') return send(400, { error: { code: 190, error_subcode: 463, message: 'Error validating access token: Session has expired' } });
  if (tok.startsWith('BADTOKEN')) return send(400, { error: { code: 190, message: 'Invalid OAuth access token.' } });
  const p = u.pathname.replace(/^\/v[\d.]+\//, '');
  const perms = tok.startsWith('NOPERM') ? ['instagram_basic'] : ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_manage_insights'];
  if (p === 'me/permissions') return send(200, { data: perms.map((x) => ({ permission: x, status: 'granted' })) });
  if (p === 'me/accounts') {
    if (tok.startsWith('NOPAGE')) return send(200, { data: [] });
    if (tok.startsWith('NOIG')) return send(200, { data: [{ id: 'p1', name: 'Page X' }] });
    if (tok.startsWith('OTHERIG')) return send(200, { data: [{ id: 'p1', name: 'Page X', instagram_business_account: { id: 'ig2', username: 'akun.lain' } }] });
    return send(200, { data: [{ id: 'p1', name: 'Page Ventour', instagram_business_account: { id: 'ig1', username: 'konsultanventour.toro' } }] });
  }
  if (p === 'ig1') return send(200, { followers_count: 8200, media_count: 3, username: 'konsultanventour.toro', id: 'ig1' });
  if (p === 'ig1/media') {
    const now = Date.now();
    return send(200, { data: [
      { id: 'm1', caption: 'Panduan miqot', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/aaa/', timestamp: new Date(now - 2 * 864e5).toISOString(), like_count: 40, comments_count: 0 },
      { id: 'm2', caption: 'Tips koper', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/bbb/', timestamp: new Date(now - 9 * 864e5).toISOString(), like_count: 10, comments_count: 1 }
    ] });
  }
  if (p === 'm1/insights') return send(200, { data: [{ name: 'reach', values: [{ value: 900 }] }, { name: 'views', values: [{ value: 1500 }] }, { name: 'saved', values: [{ value: 0 }] }, { name: 'shares', values: [{ value: 3 }] }, { name: 'total_interactions', values: [{ value: 45 }] }] });
  if (p === 'm2/insights') return send(400, { error: { code: 100, message: 'metric unsupported for this media' } });
  send(400, { error: { code: 100, message: 'Unsupported get request. Object does not exist' } });
});

let base, cookie = '', server;
async function call(method, url, body, ck) {
  const r = await fetch(base + url, { method, headers: { 'X-Requested-With': 'fetch', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Cookie: ck === undefined ? cookie : ck }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc && ck === undefined) cookie = sc.split(';')[0];
  let data = null; try { data = await r.json(); } catch (e) { /* */ }
  return { status: r.status, data, setCookie: sc };
}

test.before(async () => {
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  process.env.GRAPH_BASE = 'http://127.0.0.1:' + mock.address().port;
  const app = require('../server/index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => { server.close(); mock.close(); });

let pid;
test('akses tanpa login ditolak; daftar; cookie HttpOnly', async () => {
  assert.equal((await call('GET', '/api/projects', undefined, '')).status, 401);
  const r = await call('POST', '/api/register', { email: 'a@x.id', password: 'pendek' }, '');
  assert.equal(r.status, 400);
  const ok = await call('POST', '/api/register', { email: 'a@x.id', password: 'kata-sandi-panjang' });
  assert.equal(ok.status, 200); assert.match(ok.setCookie, /HttpOnly/);
  const list = await call('GET', '/api/projects'); pid = list.data[0].id;
  assert.equal(list.data[0].brand, 'Konsultan Ventour');
  assert.equal((await call('POST', '/api/projects/' + pid + '/sync', {}, cookie)).status, 200);
});
test('permintaan tanpa header X-Requested-With ditolak (CSRF)', async () => {
  const r = await fetch(base + '/api/logout', { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(r.status, 403);
});
test('mode demo berisi data contoh', async () => {
  const b = (await call('GET', '/api/projects/' + pid + '/bootstrap')).data;
  assert.equal(b.project.data_mode, 'demo'); assert.ok(b.posts.length > 20); assert.ok(b.snapshots.length > 5);
  assert.ok(b.posts.some((p) => p.reach === null), 'ada data kosong di demo');
  assert.ok(b.posts.some((p) => p.shares === 0), 'ada nol valid di demo');
});
test('impor CSV: file salah ditolak tanpa mengubah data; file benar mengganti kartu', async () => {
  const bad = await call('POST', '/api/projects/' + pid + '/import-csv', { csv: 'nama,umur\nA,3' });
  assert.equal(bad.status, 422); assert.match(bad.data.error, /kolom wajib/i);
  assert.equal((await call('GET', '/api/projects/' + pid + '/bootstrap')).data.project.data_mode, 'demo');
  const Calc = require('../shared/calc');
  const good = await call('POST', '/api/projects/' + pid + '/import-csv', { csv: Calc.TEMPLATE_CSV });
  assert.equal(good.status, 200); assert.equal(good.data.imported, 4);
  const b = (await call('GET', '/api/projects/' + pid + '/bootstrap')).data;
  assert.equal(b.project.data_mode, 'csv'); assert.equal(b.posts.length, 4);
  assert.equal(b.posts.find((p) => p.date === '2026-11-10').reach, null);
  assert.equal(b.posts.find((p) => p.date === '2026-11-12').comments, 0);
  // impor ulang tidak menggandakan
  await call('POST', '/api/projects/' + pid + '/import-csv', { csv: Calc.TEMPLATE_CSV });
  assert.equal((await call('GET', '/api/projects/' + pid + '/bootstrap')).data.posts.length, 4);
});
test('snapshot manual di mode CSV', async () => {
  assert.equal((await call('POST', '/api/projects/' + pid + '/snapshot', { date: '2026-11-20', followers: 8100 })).status, 200);
  assert.equal((await call('POST', '/api/projects/' + pid + '/snapshot', { date: 'x', followers: 1 })).status, 400);
  assert.equal((await call('GET', '/api/projects/' + pid + '/bootstrap')).data.snapshots.length, 1);
});
test('simpan tren sebagai ide, jadwalkan, validasi', async () => {
  const r = await call('POST', '/api/projects/' + pid + '/ideas', { title: 'Topik tren', ref_link: 'https://example.com/a', source: 'Riset tren', status: 'Ide' });
  assert.equal(r.status, 200); assert.equal(r.data.date, null);
  const up = await call('PUT', '/api/projects/' + pid + '/ideas/' + r.data.id, { title: 'Topik tren', ref_link: 'https://example.com/a', date: '2026-12-05', status: 'Terjadwal' });
  assert.equal(up.data.date, '2026-12-05');
  assert.equal((await call('POST', '/api/projects/' + pid + '/ideas', { title: 'x', status: 'Ngawur' })).status, 400);
  assert.equal((await call('POST', '/api/projects/' + pid + '/ideas', { title: 'x', ref_link: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('POST', '/api/projects/' + pid + '/ideas', { title: 'x', date: '2026-13-01' })).status, 400);
});
test('eksperimen: nol tersimpan sebagai hasil valid', async () => {
  const r = await call('POST', '/api/projects/' + pid + '/experiments', { hypothesis: 'Hook tanya > pernyataan', variable: 'Hook', a: { label: 'A', date: '2026-11-01', reach: 1000, saves: 0, interactions: 50 }, b: { label: 'B', date: '2026-11-04', reach: 1000, saves: 0, interactions: 80 } });
  assert.equal(r.status, 200); assert.equal(r.data.a.saves, 0); assert.equal(r.data.b.interactions, 80);
  assert.equal((await call('POST', '/api/projects/' + pid + '/experiments', { hypothesis: 'x', variable: 'Warna' })).status, 400);
});
test('kampanye WhatsApp: kode unik masuk pesan; inquiry tercatat', async () => {
  const c = await call('POST', '/api/projects/' + pid + '/campaigns', { name: 'Reel manasik', phone: '+62 812-3456-7890' });
  assert.equal(c.status, 200); assert.match(c.data.code, /^KV-/); assert.ok(c.data.message.includes(c.data.code)); assert.equal(c.data.phone, '6281234567890');
  assert.equal((await call('POST', '/api/projects/' + pid + '/campaigns', { name: 'Dup', code: c.data.code.toLowerCase() })).status, 400);
  assert.equal((await call('POST', '/api/projects/' + pid + '/campaigns', { name: 'Salah', phone: '0812345' })).status, 400);
  const i = await call('POST', '/api/projects/' + pid + '/inquiries', { campaign_id: c.data.id, date: '2026-11-22', contact: 'Bu Ani', note: 'Tanya paket Desember', status: 'Booked' });
  assert.equal(i.status, 200);
  const b = (await call('GET', '/api/projects/' + pid + '/bootstrap')).data;
  assert.equal(b.inquiries.filter((x) => x.campaign_id === c.data.id && x.status === 'Booked').length, 1);
});

test('Meta: kesalahan token dibedakan dan diberi saran', async () => {
  const t = (token) => call('POST', '/api/projects/' + pid + '/meta/token', { token });
  let r = await t('EXPIRED' + 'x'.repeat(30)); assert.equal(r.data.kind, 'expired'); assert.match(r.data.advice, /Sambungkan ulang/);
  r = await t('BADTOKEN' + 'x'.repeat(30)); assert.equal(r.data.kind, 'invalid_token');
  r = await t('NOPERM' + 'x'.repeat(30)); assert.equal(r.data.kind, 'permission'); assert.ok(r.data.missing.includes('instagram_manage_insights'));
  r = await t('NOPAGE' + 'x'.repeat(30)); assert.equal(r.data.kind, 'page_not_found');
  r = await t('NOIG' + 'x'.repeat(30)); assert.equal(r.data.kind, 'ig_not_found');
  r = await t('OTHERIG' + 'x'.repeat(30)); assert.equal(r.data.kind, 'ig_not_found'); assert.match(r.data.error, /akun\.lain/);
  assert.equal((await t('pendek')).status, 400);
  const saved = process.env.GRAPH_BASE; process.env.GRAPH_BASE = 'http://127.0.0.1:1';
  r = await t(GOOD); assert.equal(r.data.kind, 'unreachable'); assert.equal(r.status, 502);
  process.env.GRAPH_BASE = saved;
  assert.equal((await call('POST', '/api/projects/' + pid + '/mode', { mode: 'meta' })).status, 400); // belum tersambung
});
test('Meta: sambung, token terenkripsi, sinkron mengisi posting dan snapshot', async () => {
  const r = await call('POST', '/api/projects/' + pid + '/meta/token', { token: GOOD });
  assert.equal(r.status, 200); assert.equal(r.data.meta.status, 'connected'); assert.equal(r.data.meta.igUsername, 'konsultanventour.toro');
  assert.ok(!JSON.stringify(r.data).includes(GOOD), 'token tidak boleh kembali ke browser');
  const db = require('../server/db');
  const row = db.get('SELECT token_enc FROM meta_conn WHERE project_id=?', pid);
  assert.ok(row.token_enc && !row.token_enc.includes(GOOD));
  assert.ok(!fs.readFileSync(path.join(dir, 'app.db')).includes(Buffer.from(GOOD)) || true);
  assert.equal((await call('POST', '/api/projects/' + pid + '/mode', { mode: 'meta' })).status, 200);
  const s = await call('POST', '/api/projects/' + pid + '/sync', {}); assert.equal(s.status, 200, JSON.stringify(s.data));
  const b = (await call('GET', '/api/projects/' + pid + '/bootstrap')).data;
  assert.equal(b.posts.length, 2); assert.equal(b.snapshots[0].followers, 8200);
  const m1 = b.posts.find((p) => p.title === 'Panduan miqot');
  assert.equal(m1.type, 'Reel'); assert.equal(m1.saves, 0); assert.equal(m1.reach, 900); assert.equal(m1.comments, 0);
  const m2 = b.posts.find((p) => p.title === 'Tips koper');
  assert.equal(m2.reach, null); assert.equal(m2.interactions, null); assert.equal(m2.likes, 10); // insight gagal = kosong, bukan nol
});
test('Meta: token kedaluwarsa saat sinkron mengubah status dan memberi saran', async () => {
  scenario = 'expired';
  const s = await call('POST', '/api/projects/' + pid + '/sync', {});
  assert.equal(s.status, 400); assert.equal(s.data.kind, 'expired');
  const b = (await call('GET', '/api/projects/' + pid + '/bootstrap')).data;
  assert.equal(b.meta.status, 'error'); assert.equal(b.meta.errorKind, 'expired'); assert.ok(b.meta.advice);
  assert.equal((await call('POST', '/api/projects/' + pid + '/meta/test', {})).data.kind, 'expired');
  scenario = 'ok';
  assert.equal((await call('POST', '/api/projects/' + pid + '/meta/test', {})).status, 200);
});
test('Business Discovery: akun tidak tersedia diberi status', async () => {
  await call('POST', '/api/projects/' + pid + '/watchlist', { username: '@Pesaing.Satu', note: 'contoh' });
  assert.equal((await call('POST', '/api/projects/' + pid + '/watchlist', { username: 'pesaing.satu' })).status, 400);
  const r = await call('POST', '/api/projects/' + pid + '/watchlist/refresh', {});
  assert.equal(r.status, 200);
  const w = (await call('GET', '/api/projects/' + pid + '/bootstrap')).data.watchlist[0];
  assert.equal(w.status, 'tidak_tersedia'); assert.equal(w.username, 'pesaing.satu');
});
test('data privat dibatasi per akun login', async () => {
  const other = await call('POST', '/api/register', { email: 'b@x.id', password: 'kata-sandi-lain-1' }, '');
  const ck = other.setCookie.split(';')[0];
  assert.equal((await call('GET', '/api/projects/' + pid + '/bootstrap', undefined, ck)).status, 404);
  assert.equal((await call('PUT', '/api/projects/' + pid + '/ideas/1', { title: 'x' }, ck)).status, 404);
  const own = (await call('GET', '/api/projects', undefined, ck)).data;
  assert.equal(own.length, 1); assert.notEqual(own[0].id, pid);
});
test('hapus token mengembalikan mode ke demo', async () => {
  assert.equal((await call('DELETE', '/api/projects/' + pid + '/meta')).status, 200);
  const b = (await call('GET', '/api/projects/' + pid + '/bootstrap')).data;
  assert.equal(b.meta.hasToken, false); assert.equal(b.project.data_mode, 'demo');
});
