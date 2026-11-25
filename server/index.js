const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { encrypt, decrypt } = require('./crypto');
const Meta = require('./meta');
const Instagram = require('./instagram');
const demo = require('./demo');
const Calc = require('../shared/calc');
try { require('node:process').loadEnvFile(path.join(__dirname, '..', '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => new HttpError(400, m);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Header keamanan ----------
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '3mb' }));

// ---------- Auth ----------
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const attempts = new Map();
function throttle(req) {
  const k = req.ip, now = Date.now();
  const a = (attempts.get(k) || []).filter((t) => now - t < 15 * 60000);
  if (a.length >= 10) throw new HttpError(429, 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.');
  a.push(now); attempts.set(k, a);
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.run('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', sha(token), userId, Date.now() + 30 * 86400000);
  const secure = process.env.COOKIE_SECURE === 'true' || req.secure;
  res.setHeader('Set-Cookie', 'sid=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000' + (secure ? '; Secure' : ''));
}
function sessionUser(req) {
  const t = cookies(req).sid;
  if (!t) return null;
  const s = db.get('SELECT s.user_id, s.expires_at, u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?', sha(t));
  if (!s) return null;
  if (s.expires_at < Date.now()) { db.run('DELETE FROM sessions WHERE token_hash=?', sha(t)); return null; }
  return { id: s.user_id, email: s.email };
}
const auth = (req, res, next) => {
  const u = sessionUser(req);
  if (!u) return next(new HttpError(401, 'Silakan masuk dulu.'));
  req.user = u; next();
};
// Perlindungan CSRF tambahan: permintaan yang mengubah data harus berupa JSON.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && !req.is('application/json') && req.headers['content-length'] !== '0' && Number(req.headers['content-length'] || 0) > 0) {
    return next(new HttpError(415, 'Permintaan harus berformat JSON.'));
  }
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.headers['x-requested-with'] !== 'fetch') {
    return next(new HttpError(403, 'Permintaan ditolak.'));
  }
  next();
});

const DEFAULT_KEYWORDS = ['paket umroh', 'umroh murah', 'umroh plus turki', 'wisata halal', 'visa umroh', 'manasik umroh', 'haji', 'wisata muslim'];
function createProject(userId, p) {
  const r = db.run(
    'INSERT INTO projects (user_id,dashboard_name,brand,ig_username,niche,audience,timezone,whatsapp_number,keywords,data_mode,last_sync) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    userId, p.dashboard_name, p.brand, p.ig_username, p.niche, p.audience, p.timezone, p.whatsapp_number, JSON.stringify(p.keywords || DEFAULT_KEYWORDS), 'demo', '{}');
  const id = Number(r.lastInsertRowid);
  db.run('INSERT INTO meta_conn (project_id) VALUES (?)', id);
  demo.seed(id, Calc.todayIn(p.timezone));
  setSync(id, 'demo');
  return id;
}
function setSync(pid, mode) {
  const row = db.get('SELECT last_sync FROM projects WHERE id=?', pid);
  let m = {}; try { m = JSON.parse(row.last_sync || '{}'); } catch (e) { /* kosong */ }
  m[mode] = new Date().toISOString();
  db.run('UPDATE projects SET last_sync=? WHERE id=?', JSON.stringify(m), pid);
}
function cleanProject(b, old) {
  const s = (v, max, fb) => (typeof v === 'string' ? v.trim().slice(0, max) : fb);
  const o = {
    dashboard_name: s(b.dashboard_name, 80, old && old.dashboard_name) || 'Sosmed Konsultan Ventour',
    brand: s(b.brand, 80, old && old.brand) || 'Konsultan Ventour',
    ig_username: String(s(b.ig_username, 40, old ? old.ig_username : '') || '').replace(/^@/, ''),
    niche: s(b.niche, 120, old ? old.niche : ''), audience: s(b.audience, 120, old ? old.audience : ''),
    timezone: s(b.timezone, 50, old ? old.timezone : '') || 'Asia/Jakarta',
    whatsapp_number: String(s(b.whatsapp_number, 20, old ? old.whatsapp_number : '') || '').replace(/[^\d]/g, '')
  };
  if (o.ig_username && !/^[A-Za-z0-9._]{1,30}$/.test(o.ig_username)) throw bad('Username Instagram hanya boleh huruf, angka, titik, dan garis bawah.');
  try { new Date().toLocaleDateString('en-CA', { timeZone: o.timezone }); } catch (e) { throw bad('Zona waktu tidak dikenal. Contoh: Asia/Jakarta.'); }
  if (o.whatsapp_number && !/^[1-9]\d{7,14}$/.test(o.whatsapp_number)) throw bad('Nomor WhatsApp harus format internasional tanpa 0 di depan, contoh 6281234567890.');
  if (Array.isArray(b.keywords)) o.keywords = b.keywords.map((k) => String(k).trim().toLowerCase().slice(0, 60)).filter(Boolean).slice(0, 30);
  return o;
}

app.get('/api/me', (req, res) => {
  const u = sessionUser(req);
  const n = db.get('SELECT COUNT(*) c FROM users').c;
  res.json({ user: u ? { email: u.email } : null, hasUsers: n > 0, canRegister: n === 0 || process.env.ALLOW_REGISTER === 'true' });
});
app.post('/api/register', wrap(async (req, res) => {
  throttle(req);
  const n = db.get('SELECT COUNT(*) c FROM users').c;
  if (n > 0 && process.env.ALLOW_REGISTER !== 'true') throw new HttpError(403, 'Pendaftaran ditutup. Minta pemilik aplikasi mengaktifkan ALLOW_REGISTER.');
  const email = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Email tidak valid.');
  if (pw.length < 10) throw bad('Kata sandi minimal 10 karakter.');
  if (db.get('SELECT 1 x FROM users WHERE email=?', email)) throw bad('Email sudah terdaftar.');
  const salt = crypto.randomBytes(16).toString('hex');
  const r = db.run('INSERT INTO users (email,pass_hash,salt) VALUES (?,?,?)', email, hashPw(pw, salt), salt);
  const uid = Number(r.lastInsertRowid);
  createProject(uid, { dashboard_name: 'Sosmed Konsultan Ventour', brand: 'Konsultan Ventour', ig_username: 'konsultanventour.toro',
    niche: 'Umroh dan Wisata Muslim', audience: 'Umur 35+', timezone: 'Asia/Jakarta', whatsapp_number: '' });
  startSession(req, res, uid);
  res.json({ ok: true });
}));
app.post('/api/login', wrap(async (req, res) => {
  throttle(req);
  const email = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  const u = db.get('SELECT * FROM users WHERE email=?', email);
  const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));
  if (!ok) throw new HttpError(401, 'Email atau kata sandi salah.');
  attempts.delete(req.ip);
  startSession(req, res, u.id);
  res.json({ ok: true });
}));
app.post('/api/logout', (req, res) => {
  const t = cookies(req).sid; if (t) db.run('DELETE FROM sessions WHERE token_hash=?', sha(t));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/template.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template-posting.csv"');
  res.send('\uFEFF' + Calc.TEMPLATE_CSV);
});

// ---------- Project ----------
app.get('/api/projects', auth, (req, res) => {
  res.json(db.all('SELECT id, dashboard_name, brand FROM projects WHERE user_id=? ORDER BY id', req.user.id));
});
app.post('/api/projects', auth, wrap(async (req, res) => {
  const p = cleanProject(req.body || {});
  if (!req.body.brand) throw bad('Nama brand wajib diisi.');
  res.json({ id: createProject(req.user.id, p) });
}));
function owned(req, res, next) {
  const p = db.get('SELECT * FROM projects WHERE id=? AND user_id=?', Number(req.params.pid), req.user.id);
  if (!p) return next(new HttpError(404, 'Project tidak ditemukan.'));
  req.project = p; next();
}
const P = '/api/projects/:pid';
const pub = (p) => ({ id: p.id, dashboard_name: p.dashboard_name, brand: p.brand, ig_username: p.ig_username, niche: p.niche, audience: p.audience,
  timezone: p.timezone, whatsapp_number: p.whatsapp_number, keywords: JSON.parse(p.keywords || '[]'), data_mode: p.data_mode, last_sync: JSON.parse(p.last_sync || '{}') });
function connPublic(pid) {
  const c = db.get('SELECT * FROM meta_conn WHERE project_id=?', pid) || {};
  return { hasToken: !!c.token_enc, provider: c.auth_provider || 'facebook_login', tokenExpiresAt: c.token_expires_at || null, status: c.status || 'belum', errorKind: c.error_kind || null, errorMessage: c.error_message || null,
    advice: c.error_kind ? Meta.advice(c.error_kind) : null, pageName: c.page_name || null, igUsername: c.ig_username || null,
    permissions: c.permissions ? JSON.parse(c.permissions) : [], checkedAt: c.checked_at || null, requiredPermissions: Meta.REQUIRED_PERMS };
}
const J = (s, fb) => { try { return JSON.parse(s); } catch (e) { return fb; } };

app.get(P + '/bootstrap', auth, owned, (req, res) => {
  const p = req.project, pid = p.id, mode = p.data_mode;
  const counts = {};
  for (const r of db.all('SELECT source, COUNT(*) c FROM posts WHERE project_id=? GROUP BY source', pid)) counts[r.source] = r.c;
  res.json({
    project: pub(p), counts,
    posts: db.all('SELECT id,title,type,date,url,views,reach,likes,comments,saves,shares,interactions FROM posts WHERE project_id=? AND source=? ORDER BY date DESC, id DESC', pid, mode),
    snapshots: db.all('SELECT date,followers FROM snapshots WHERE project_id=? AND source=? ORDER BY date', pid, mode),
    ideas: db.all('SELECT * FROM ideas WHERE project_id=? ORDER BY id DESC', pid),
    experiments: db.all('SELECT * FROM experiments WHERE project_id=? ORDER BY id DESC', pid).map((e) => ({ ...e, a: J(e.a, {}), b: J(e.b, {}) })),
    watchlist: db.all('SELECT * FROM watchlist WHERE project_id=? ORDER BY id', pid).map((w) => ({ ...w, recent: J(w.recent, []) })),
    campaigns: db.all('SELECT * FROM campaigns WHERE project_id=? ORDER BY id DESC', pid),
    inquiries: db.all('SELECT * FROM inquiries WHERE project_id=? ORDER BY date DESC, id DESC', pid),
    meta: connPublic(pid)
  });
});
app.put(P, auth, owned, wrap(async (req, res) => {
  const o = cleanProject(req.body || {}, req.project);
  const kw = o.keywords ? JSON.stringify(o.keywords) : req.project.keywords;
  db.run('UPDATE projects SET dashboard_name=?,brand=?,ig_username=?,niche=?,audience=?,timezone=?,whatsapp_number=?,keywords=? WHERE id=?',
    o.dashboard_name, o.brand, o.ig_username, o.niche, o.audience, o.timezone, o.whatsapp_number, kw, req.project.id);
  res.json({ ok: true });
}));
app.delete(P, auth, owned, (req, res) => {
  if (db.get('SELECT COUNT(*) c FROM projects WHERE user_id=?', req.user.id).c < 2) throw bad('Tidak bisa menghapus project terakhir.');
  db.run('DELETE FROM projects WHERE id=?', req.project.id); res.json({ ok: true });
});

app.post(P + '/mode', auth, owned, wrap(async (req, res) => {
  const mode = req.body.mode;
  if (!['demo', 'csv', 'meta'].includes(mode)) throw bad('Mode tidak dikenal.');
  if (mode === 'meta' && connPublic(req.project.id).status !== 'connected') throw bad('Meta belum tersambung. Sambungkan dan tes token dulu di menu Sumber data.');
  if (mode === 'demo' && !db.get("SELECT 1 x FROM posts WHERE project_id=? AND source='demo'", req.project.id)) demo.seed(req.project.id, Calc.todayIn(req.project.timezone));
  db.run('UPDATE projects SET data_mode=? WHERE id=?', mode, req.project.id);
  res.json({ ok: true });
}));
app.post(P + '/snapshot', auth, owned, wrap(async (req, res) => {
  if (req.project.data_mode === 'meta') throw bad('Pada mode Meta, snapshot followers diambil otomatis saat sinkron.');
  const date = req.body.date, f = req.body.followers;
  if (!Calc.validDate(date)) throw bad('Tanggal harus berformat YYYY-MM-DD.');
  if (!Number.isInteger(f) || f < 0) throw bad('Followers harus angka bulat 0 atau lebih.');
  db.run('INSERT INTO snapshots (project_id,source,date,followers) VALUES (?,?,?,?) ON CONFLICT(project_id,source,date) DO UPDATE SET followers=excluded.followers', req.project.id, req.project.data_mode, date, f);
  res.json({ ok: true });
}));
app.post(P + '/demo/reset', auth, owned, (req, res) => { demo.seed(req.project.id, Calc.todayIn(req.project.timezone)); setSync(req.project.id, 'demo'); res.json({ ok: true }); });

// ---------- Impor CSV ----------
app.post(P + '/import-csv', auth, owned, wrap(async (req, res) => {
  const text = req.body.csv;
  if (typeof text !== 'string') throw bad('File tidak terbaca.');
  const parsed = Calc.parseCsv(text);
  if (!parsed.ok) return res.status(422).json({ error: parsed.message, details: parsed.errors });
  const pid = req.project.id;
  db.tx(() => {
    if (req.body.replace) db.run("DELETE FROM posts WHERE project_id=? AND source='csv'", pid);
    for (const r of parsed.rows) {
      db.run(`INSERT INTO posts (project_id,source,ext_id,title,type,date,url,views,reach,likes,comments,saves,shares,interactions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(project_id,source,ext_id) DO UPDATE SET title=excluded.title,type=excluded.type,url=excluded.url,views=excluded.views,reach=excluded.reach,
        likes=excluded.likes,comments=excluded.comments,saves=excluded.saves,shares=excluded.shares,interactions=excluded.interactions`,
      pid, 'csv', r.date + '|' + r.title.toLowerCase(), r.title, r.type, r.date, r.url, r.views, r.reach, r.likes, r.comments, r.saves, r.shares, r.interactions);
    }
    db.run('UPDATE projects SET data_mode=? WHERE id=?', 'csv', pid);
  });
  setSync(pid, 'csv');
  res.json({ ok: true, imported: parsed.rows.length, duplicates: parsed.duplicates });
}));
app.delete(P + '/posts', auth, owned, (req, res) => {
  const src = req.query.source;
  if (src !== 'csv') throw bad('Hanya data CSV yang boleh dihapus lewat jalur ini.');
  db.run("DELETE FROM posts WHERE project_id=? AND source='csv'", req.project.id); res.json({ ok: true });
});

// ---------- CRUD generik ----------
const IDEA_STATUS = ['Ide', 'Brief', 'Produksi', 'Review', 'Terjadwal', 'Tayang'];
const FORMATS = ['', 'Reel', 'Carousel', 'Image', 'Story', 'Video', 'Lainnya'];
const INQ_STATUS = ['Inquiry', 'Qualified', 'Booked', 'Closed'];
const VARS = ['Hook', 'Cover', 'CTA', 'Format', 'Lainnya'];
const str = (v, max, req, label) => { const s = typeof v === 'string' ? v.trim() : ''; if (req && !s) throw bad(label + ' wajib diisi.'); if (s.length > max) throw bad(label + ' terlalu panjang (maks ' + max + ' karakter).'); return s; };
const optDate = (v, label) => { if (v === null || v === undefined || v === '') return null; if (!Calc.validDate(v)) throw bad(label + ' harus berformat YYYY-MM-DD.'); return v; };
const optUrl = (v, label) => { const s = typeof v === 'string' ? v.trim() : ''; if (s && !/^https?:\/\/\S+$/i.test(s)) throw bad(label + ' harus diawali http:// atau https://'); return s.slice(0, 500); };
const oneOf = (v, list, label) => { if (!list.includes(v)) throw bad(label + ' tidak valid.'); return v; };
function variant(v, label) {
  v = v || {};
  const o = { label: str(v.label || '', 120, false, 'Nama ' + label), date: optDate(v.date, 'Tanggal tayang ' + label), url: optUrl(v.url, 'Link ' + label) };
  for (const k of Calc.NUM_FIELDS) {
    const x = v[k];
    if (x === null || x === undefined || x === '') { o[k] = null; continue; }
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || !Number.isInteger(x)) throw bad(k + ' pada ' + label + ' harus angka bulat 0 atau lebih.');
    o[k] = x;
  }
  return o;
}
function phone(v) {
  const s = String(v || '').replace(/[^\d]/g, '');
  if (s && !/^[1-9]\d{7,14}$/.test(s)) throw bad('Nomor WhatsApp harus format internasional tanpa 0 di depan, contoh 6281234567890.');
  return s;
}
const RES = {
  ideas: {
    cols: ['title', 'hook', 'format', 'cta', 'date', 'source', 'ref_link', 'brief', 'status'],
    validate: (b) => ({ title: str(b.title, 200, true, 'Judul'), hook: str(b.hook, 400, false, 'Hook'), format: oneOf(b.format || '', FORMATS, 'Format'),
      cta: str(b.cta, 300, false, 'CTA'), date: optDate(b.date, 'Tanggal tayang'), source: str(b.source, 100, false, 'Sumber'),
      ref_link: optUrl(b.ref_link, 'Link referensi'), brief: str(b.brief, 4000, false, 'Brief'), status: oneOf(b.status || 'Ide', IDEA_STATUS, 'Status') })
  },
  experiments: {
    cols: ['hypothesis', 'variable', 'a', 'b'],
    validate: (b) => ({ hypothesis: str(b.hypothesis, 500, true, 'Hipotesis'), variable: oneOf(b.variable, VARS, 'Variabel yang dites'),
      a: JSON.stringify(variant(b.a, 'versi awal')), b: JSON.stringify(variant(b.b, 'variasi')) })
  },
  watchlist: {
    cols: ['username', 'note'],
    validate: (b) => { const u = String(b.username || '').trim().replace(/^@/, ''); if (!/^[A-Za-z0-9._]{1,30}$/.test(u)) throw bad('Username hanya boleh huruf, angka, titik, dan garis bawah (maks 30).'); return { username: u.toLowerCase(), note: str(b.note, 200, false, 'Catatan') }; }
  },
  campaigns: {
    cols: ['name', 'code', 'message', 'phone'],
    validate: (b, pid, id) => {
      const name = str(b.name, 120, true, 'Nama kampanye');
      let code = String(b.code || '').trim().toUpperCase();
      if (!code) code = 'KV-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      if (!/^[A-Z0-9-]{3,20}$/.test(code)) throw bad('Kode kampanye 3-20 karakter: huruf, angka, atau tanda hubung.');
      const dup = db.get('SELECT id FROM campaigns WHERE project_id=? AND code=?', pid, code);
      if (dup && dup.id !== id) throw bad('Kode kampanye sudah dipakai. Pilih kode lain.');
      let message = str(b.message, 500, false, 'Pesan pembuka') || 'Halo, saya tertarik dengan info ' + name + '.';
      if (!message.toUpperCase().includes(code)) message += ' (Kode: ' + code + ')';
      return { name, code, message, phone: phone(b.phone) };
    }
  },
  inquiries: {
    cols: ['campaign_id', 'date', 'contact', 'note', 'status'],
    validate: (b, pid) => {
      let cid = b.campaign_id === '' || b.campaign_id == null ? null : Number(b.campaign_id);
      if (cid !== null && !db.get('SELECT 1 x FROM campaigns WHERE id=? AND project_id=?', cid, pid)) throw bad('Kampanye tidak ditemukan.');
      const date = optDate(b.date, 'Tanggal'); if (!date) throw bad('Tanggal wajib diisi.');
      return { campaign_id: cid, date, contact: str(b.contact, 100, false, 'Kontak'), note: str(b.note, 1000, false, 'Catatan'), status: oneOf(b.status || 'Inquiry', INQ_STATUS, 'Status') };
    }
  }
};
function serialize(name, row) {
  if (name === 'experiments') return { ...row, a: J(row.a, {}), b: J(row.b, {}) };
  return row;
}
app.post(P + '/:res', auth, owned, wrap(async (req, res, next) => {
  const r = RES[req.params.res]; if (!r) return next();
  const pid = req.project.id, v = r.validate(req.body || {}, pid, null);
  if (req.params.res === 'watchlist' && db.get('SELECT 1 x FROM watchlist WHERE project_id=? AND username=?', pid, v.username)) throw bad('Akun ini sudah ada di watchlist.');
  const cols = r.cols;
  const ins = db.run('INSERT INTO ' + req.params.res + ' (project_id,' + cols.join(',') + ') VALUES (?,' + cols.map(() => '?').join(',') + ')', pid, ...cols.map((c) => v[c]));
  res.json(serialize(req.params.res, db.get('SELECT * FROM ' + req.params.res + ' WHERE id=?', Number(ins.lastInsertRowid))));
}));
app.put(P + '/:res/:id', auth, owned, wrap(async (req, res, next) => {
  const r = RES[req.params.res]; if (!r) return next();
  const pid = req.project.id, id = Number(req.params.id);
  if (!db.get('SELECT 1 x FROM ' + req.params.res + ' WHERE id=? AND project_id=?', id, pid)) throw new HttpError(404, 'Data tidak ditemukan.');
  const v = r.validate(req.body || {}, pid, id);
  db.run('UPDATE ' + req.params.res + ' SET ' + r.cols.map((c) => c + '=?').join(',') + ' WHERE id=? AND project_id=?', ...r.cols.map((c) => v[c]), id, pid);
  res.json(serialize(req.params.res, db.get('SELECT * FROM ' + req.params.res + ' WHERE id=?', id)));
}));
app.delete(P + '/:res/:id', auth, owned, wrap(async (req, res, next) => {
  if (!RES[req.params.res]) return next();
  const out = db.run('DELETE FROM ' + req.params.res + ' WHERE id=? AND project_id=?', Number(req.params.id), req.project.id);
  if (!out.changes) throw new HttpError(404, 'Data tidak ditemukan.');
  res.json({ ok: true });
}));

// ---------- Meta ----------
function getToken(pid) {
  const c = db.get('SELECT * FROM meta_conn WHERE project_id=?', pid);
  if (!c || !c.token_enc) throw new HttpError(400, 'Token Meta belum disimpan. Masukkan token di menu Sumber data.');
  return { token: decrypt(c.token_enc), conn: c };
}
function failConn(pid, e) {
  db.run("UPDATE meta_conn SET status='error', error_kind=?, error_message=?, checked_at=? WHERE project_id=?", e.kind, e.message, new Date().toISOString(), pid);
}
function metaFail(res, e, token) {
  const status = e.kind === 'unreachable' ? 502 : 400;
  return res.status(status).json({ error: e.message, kind: e.kind, advice: Meta.advice(e.kind), missing: e.missing || undefined });
}
async function verifyAndStore(project, token, saveToken) {
  const v = await Meta.verify(token, project.ig_username);
  db.run("UPDATE meta_conn SET token_enc=?, status='connected', error_kind=NULL, error_message=NULL, page_id=?, page_name=?, ig_id=?, ig_username=?, permissions=?, checked_at=? WHERE project_id=?",
    saveToken ? encrypt(token) : db.get('SELECT token_enc FROM meta_conn WHERE project_id=?', project.id).token_enc,
    v.pageId, v.pageName, v.igId, v.igUsername, JSON.stringify(v.granted), new Date().toISOString(), project.id);
}
/* INSTAGRAM_OAUTH_CONNECT_ROUTE */
app.get(P + '/instagram/connect', auth, owned, wrap(async (req, res) => {
  const sid = cookies(req).sid;
  if (!sid) throw new HttpError(401, 'Sesi login tidak ditemukan. Silakan login ulang.');

  const state = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000;

  db.run(
    'DELETE FROM instagram_oauth_states WHERE expires_at < ?',
    Date.now()
  );

  db.run(
    'INSERT INTO instagram_oauth_states (state_hash,session_hash,user_id,project_id,expires_at) VALUES (?,?,?,?,?)',
    sha(state), sha(sid), req.user.id, req.project.id, expiresAt
  );

  let target;
  try {
    target = Instagram.authorizeUrl(state);
  } catch (e) {
    db.run('DELETE FROM instagram_oauth_states WHERE state_hash=?', sha(state));
    throw bad(e.message || 'Konfigurasi Instagram belum siap.');
  }

  res.redirect(302, target);
}));
app.post(P + '/meta/token', auth, owned, wrap(async (req, res) => {
  const token = String(req.body.token || '').trim();
  if (token.length < 20 || /\s/.test(token)) throw bad('Token tidak terlihat valid. Tempel User Access Token utuh dari Graph API Explorer.');
  try { await verifyAndStore(req.project, token, true); res.json({ ok: true, meta: connPublic(req.project.id) }); }
  catch (e) { if (!(e instanceof Meta.MetaError)) throw e; metaFail(res, e, token); }
}));
app.post(P + '/meta/test', auth, owned, wrap(async (req, res) => {
  const current = db.get('SELECT auth_provider FROM meta_conn WHERE project_id=?', req.project.id);
  if (current && current.auth_provider === 'instagram_login') throw bad('Koneksi menggunakan Instagram Login. Gunakan status koneksi Instagram, bukan tes Facebook Login.');
  const { token } = getToken(req.project.id);
  try { await verifyAndStore(req.project, token, false); res.json({ ok: true, meta: connPublic(req.project.id) }); }
  catch (e) { if (!(e instanceof Meta.MetaError)) throw e; failConn(req.project.id, e); metaFail(res, e, token); }
}));
/* INSTAGRAM_OAUTH_DISCONNECT_ROUTE */
app.delete(P + '/instagram', auth, owned, (req, res) => {
  db.run(
    `UPDATE meta_conn
     SET token_enc=NULL, status='belum',
         auth_provider='facebook_login', token_expires_at=NULL,
         error_kind=NULL, error_message=NULL,
         page_id=NULL, page_name=NULL, ig_id=NULL,
         ig_username=NULL, permissions=NULL, checked_at=NULL
     WHERE project_id=?`,
    req.project.id
  );

  db.run('DELETE FROM instagram_oauth_states WHERE project_id=?', req.project.id);

  if (req.project.data_mode === 'meta') {
    db.run("UPDATE projects SET data_mode='demo' WHERE id=?", req.project.id);
  }

  res.json({ ok: true });
});
app.delete(P + '/meta', auth, owned, (req, res) => {
  db.run("UPDATE meta_conn SET token_enc=NULL,status='belum',error_kind=NULL,error_message=NULL,page_id=NULL,page_name=NULL,ig_id=NULL,ig_username=NULL,permissions=NULL,checked_at=NULL WHERE project_id=?", req.project.id);
  if (req.project.data_mode === 'meta') db.run("UPDATE projects SET data_mode='demo' WHERE id=?", req.project.id);
  res.json({ ok: true });
});

app.post(P + '/sync', auth, owned, wrap(async (req, res) => {
  const p = req.project, mode = p.data_mode;
  if (mode === 'demo') { setSync(p.id, 'demo'); return res.json({ ok: true, message: 'Mode Demo memakai data contoh, jadi tidak ada yang diambil dari Instagram.' }); }
  if (mode === 'csv') return res.json({ ok: true, message: 'Mode CSV tidak sinkron otomatis. Impor file CSV terbaru di menu Sumber data.' });
  const { token, conn } = getToken(p.id);
  if (!conn.ig_id) throw bad('Koneksi belum dites. Buka Sumber data lalu tes koneksi.');
  try {
    const data = await Meta.fetchAccount(token, conn.ig_id, 100);
    db.tx(() => {
      for (const r of data.posts) {
        db.run(`INSERT INTO posts (project_id,source,ext_id,title,type,date,url,views,reach,likes,comments,saves,shares,interactions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(project_id,source,ext_id) DO UPDATE SET title=excluded.title,type=excluded.type,date=excluded.date,url=excluded.url,views=excluded.views,reach=excluded.reach,
          likes=excluded.likes,comments=excluded.comments,saves=excluded.saves,shares=excluded.shares,interactions=excluded.interactions`,
        p.id, 'meta', r.ext_id, r.title, r.type, r.date, r.url, r.views, r.reach, r.likes, r.comments, r.saves, r.shares, r.interactions);
      }
      if (data.followers !== null) db.run('INSERT INTO snapshots (project_id,source,date,followers) VALUES (?,?,?,?) ON CONFLICT(project_id,source,date) DO UPDATE SET followers=excluded.followers',
        p.id, 'meta', Calc.todayIn(p.timezone), data.followers);
      db.run("UPDATE meta_conn SET status='connected', error_kind=NULL, error_message=NULL, checked_at=? WHERE project_id=?", new Date().toISOString(), p.id);
    });
    setSync(p.id, 'meta');
    res.json({ ok: true, message: 'Sinkron selesai: ' + data.posts.length + ' posting diperbarui.' });
  } catch (e) { if (!(e instanceof Meta.MetaError)) throw e; failConn(p.id, e); metaFail(res, e, token); }
}));

app.post(P + '/watchlist/refresh', auth, owned, wrap(async (req, res) => {
  const p = req.project, list = db.all('SELECT * FROM watchlist WHERE project_id=?', p.id);
  const conn = db.get('SELECT * FROM meta_conn WHERE project_id=?', p.id);
  if (!conn || conn.status !== 'connected' || !conn.ig_id) throw bad('Business Discovery butuh koneksi Meta yang aktif. Sambungkan Meta dulu di menu Sumber data.');
  const { token } = getToken(p.id);
  try {
    for (const w of list) {
      const r = await Meta.discover(token, conn.ig_id, w.username);
      db.run('UPDATE watchlist SET status=?, status_detail=?, followers=?, media_count=?, recent=?, checked_at=? WHERE id=?',
        r.status, r.detail || '', r.followers ?? null, r.media_count ?? null, JSON.stringify(r.recent || []), new Date().toISOString(), w.id);
    }
    res.json({ ok: true });
  } catch (e) { if (!(e instanceof Meta.MetaError)) throw e; failConn(p.id, e); metaFail(res, e, token); }
}));

/* INSTAGRAM_OAUTH_CALLBACK_ROUTE */
app.get('/auth/instagram/callback', wrap(async (req, res) => {
  const fail = (message) => res.redirect('/?instagram=error&reason=' + encodeURIComponent(message) + '#/sumber');

  if (req.query.error) {
    return fail('Persetujuan Instagram dibatalkan atau ditolak.');
  }

  const state = String(req.query.state || '');
  const code = String(req.query.code || '');
  if (!/^[a-f0-9]{64}$/i.test(state) || !code) {
    return fail('Callback Instagram tidak lengkap. Silakan ulangi proses koneksi.');
  }

  const sid = cookies(req).sid;
  if (!sid) return fail('Sesi login berakhir. Login kembali lalu hubungkan Instagram.');

  const user = sessionUser(req);
  if (!user) return fail('Sesi login tidak valid. Login kembali.');

  const stateHash = sha(state);
  const sessionHash = sha(sid);

  let record = null;
  db.tx(() => {
    const row = db.get(
      'SELECT * FROM instagram_oauth_states WHERE state_hash=?',
      stateHash
    );

    if (!row) return;
    if (row.session_hash !== sessionHash) return;
    if (row.user_id !== user.id || row.expires_at < Date.now()) return;

    const project = db.get(
      'SELECT id FROM projects WHERE id=? AND user_id=?',
      row.project_id, user.id
    );
    if (!project) return;

    record = row;
    db.run('DELETE FROM instagram_oauth_states WHERE state_hash=?', stateHash);
  });

  if (!record) {
    return fail('State OAuth tidak valid, kedaluwarsa, atau sudah digunakan. Ulangi koneksi.');
  }

  try {
    const exchanged = await Instagram.exchangeCode(code);
    const profile = await Instagram.fetchProfile(exchanged.accessToken);

    const expiry = exchanged.expiresIn
      ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString()
      : null;

    db.run(
      `UPDATE meta_conn
       SET token_enc=?, status='connected',
           auth_provider='instagram_login',
           token_expires_at=?,
           error_kind=NULL, error_message=NULL,
           page_id=NULL, page_name=NULL,
           ig_id=?, ig_username=?, permissions=?, checked_at=?
       WHERE project_id=?`,
      encrypt(exchanged.accessToken),
      expiry,
      profile.id,
      profile.username,
      JSON.stringify(Instagram.config().scopes),
      new Date().toISOString(),
      record.project_id
    );

    res.redirect('/?instagram=connected#/sumber');
  } catch (e) {
    const safeMessage = e instanceof Instagram.InstagramError
      ? e.message
      : 'Instagram gagal menyelesaikan proses OAuth.';

    db.run(
      "UPDATE meta_conn SET status='error', error_kind=?, error_message=?, checked_at=? WHERE project_id=?",
      e.kind || 'oauth',
      safeMessage.slice(0, 500),
      new Date().toISOString(),
      record.project_id
    );

    return fail(safeMessage);
  }
}));
// ---------- Trending Now Indonesia (Google Trends RSS) ----------
let trendCache = { at: 0, items: null };
const decodeXml = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
function parseTrends(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1], pick = (re) => { const x = re.exec(b); return x ? decodeXml(x[1]) : ''; };
    const title = pick(/<title>([\s\S]*?)<\/title>/); if (!title) continue;
    const news = [...b.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].slice(0, 2).map((n) => ({
      title: decodeXml((/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/.exec(n[1]) || [])[1] || ''),
      url: decodeXml((/<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/.exec(n[1]) || [])[1] || ''),
      source: decodeXml((/<ht:news_item_source>([\s\S]*?)<\/ht:news_item_source>/.exec(n[1]) || [])[1] || '')
    })).filter((n) => /^https?:\/\//.test(n.url));
    items.push({ title, traffic: pick(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/), news });
  }
  return items;
}
const SKIP = new Set(['paket', 'murah', 'plus', 'tanpa']);
function matchKeywords(title, keywords) {
  const t = title.toLowerCase(), hits = [];
  for (const k of keywords) {
    const toks = k.split(/\s+/).filter((x) => x.length >= 4 && !SKIP.has(x));
    if (t.includes(k) || toks.some((x) => t.includes(x))) hits.push(k);
  }
  return hits;
}
app.get('/api/trending', auth, wrap(async (req, res) => {
  const p = db.get('SELECT keywords FROM projects WHERE id=? AND user_id=?', Number(req.query.pid), req.user.id);
  const kws = p ? J(p.keywords, []) : DEFAULT_KEYWORDS;
  try {
    if (!trendCache.items || Date.now() - trendCache.at > 15 * 60000) {
      const r = await fetch('https://trends.google.com/trending/rss?geo=ID', { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (SosmedDashboard)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      trendCache = { at: Date.now(), items: parseTrends(await r.text()) };
    }
    const items = trendCache.items.map((i) => ({ ...i, matches: matchKeywords(i.title, kws) }));
    res.json({ ok: true, fetchedAt: new Date(trendCache.at).toISOString(), items });
  } catch (e) {
    res.json({ ok: false, error: 'Feed Google Trends tidak bisa diambil saat ini (' + String(e.message).slice(0, 80) + '). Pakai tombol Telusuri untuk membuka Google Trends langsung.' });
  }
}));

// ---------- Static ----------
app.get('/js/calc.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'shared', 'calc.js')));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File terlalu besar (maksimal 3 MB).' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Data yang dikirim tidak terbaca.' });
  const status = err.status || 500;
  if (status >= 500) console.error('[server]', Meta.scrub(err.stack || err.message));
  res.status(status).json({ error: status >= 500 ? 'Terjadi kesalahan di server.' : err.message });
});

module.exports = app;
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log('Sosmed Konsultan Ventour berjalan di http://localhost:' + port));
}
