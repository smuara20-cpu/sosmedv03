// Klien Instagram API with Facebook Login (graph.facebook.com). Semua panggilan hanya dari server.
// Token dikirim lewat header Authorization (bukan di URL) supaya tidak muncul di log.
const BASE = () => process.env.GRAPH_BASE || 'https://graph.facebook.com';
const VER = () => process.env.GRAPH_VERSION || 'v23.0';
const REQUIRED_PERMS = ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_manage_insights'];

class MetaError extends Error {
  constructor(kind, message, extra) { super(message); this.kind = kind; Object.assign(this, extra || {}); }
}

const ADVICE = {
  expired: 'Token kedaluwarsa. Buat User Access Token baru di Graph API Explorer, lalu pakai "Sambungkan ulang".',
  invalid_token: 'Token tidak valid atau sudah dicabut (misalnya password Facebook diganti). Buat token baru di Graph API Explorer.',
  permission: 'Izin belum lengkap. Saat membuat token di Graph API Explorer, centang: ' + REQUIRED_PERMS.join(', ') + '. Kalau akun lo dapat akses Page lewat Business Manager, tambahkan juga ads_read atau ads_management.',
  page_not_found: 'Token ini tidak melihat Facebook Page mana pun. Pastikan akun Facebook pemilik token adalah admin Page, dan saat membuat token Page-nya ikut dipilih.',
  ig_not_found: 'Akun Instagram Professional yang cocok tidak ditemukan di Page. Pastikan akun IG berjenis Professional (Business/Creator), sudah terhubung ke Page, dan username di Pengaturan sama persis.',
  rate_limit: 'Meta membatasi jumlah panggilan untuk sementara. Tunggu beberapa menit lalu coba lagi.',
  unreachable: 'Server tidak bisa menghubungi Meta API. Cek koneksi internet server/hosting lalu coba lagi.',
  api: 'Meta API mengembalikan error. Coba lagi nanti; kalau berulang, cek status Meta dan dokumentasi API.'
};
const advice = (kind) => ADVICE[kind] || ADVICE.api;

function scrub(msg, token) {
  let s = String(msg || '');
  if (token) s = s.split(token).join('[token]');
  return s.replace(/EA[A-Za-z0-9]{40,}/g, '[token]').slice(0, 300);
}

function classify(err, status, token) {
  const code = err && err.code, sub = err && err.error_subcode, msg = (err && err.message) || '';
  if (code === 190) {
    if (sub === 463 || sub === 467 || /expired|session has expired/i.test(msg)) return new MetaError('expired', 'Token kedaluwarsa.');
    return new MetaError('invalid_token', 'Token tidak valid.');
  }
  if (code === 10 || (code >= 200 && code <= 299)) return new MetaError('permission', 'Izin token kurang: ' + scrub(msg, token));
  if (code === 4 || code === 17 || code === 32 || code === 613) return new MetaError('rate_limit', 'Batas panggilan Meta tercapai.');
  if (code === 100 && /does not exist|cannot be loaded|Unsupported (get|post) request|invalid user id/i.test(msg)) {
    return new MetaError('not_found', scrub(msg, token), { apiCode: code });
  }
  return new MetaError('api', 'Meta API error' + (code ? ' (' + code + ')' : status ? ' (HTTP ' + status + ')' : '') + ': ' + scrub(msg, token), { apiCode: code });
}

async function graph(token, path, params) {
  const url = new URL(BASE() + '/' + VER() + '/' + path.replace(/^\//, ''));
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new MetaError('unreachable', 'Tidak bisa menghubungi Meta API.');
  }
  let body = null;
  try { body = await res.json(); } catch (e) { /* bukan JSON */ }
  if (!res.ok || (body && body.error)) throw classify(body && body.error, res.status, token);
  return body || {};
}

const clean = (u) => String(u || '').trim().replace(/^@/, '').toLowerCase();

// Cek token: izin, Page, dan akun IG Professional yang benar.
async function verify(token, expectedUsername) {
  let granted = [];
  const perms = await graph(token, 'me/permissions');
  granted = (perms.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
  const missing = REQUIRED_PERMS.filter((p) => granted.indexOf(p) === -1);
  if (missing.length) throw new MetaError('permission', 'Izin yang belum diberikan: ' + missing.join(', ') + '.', { missing, granted });

  const acc = await graph(token, 'me/accounts', { fields: 'id,name,instagram_business_account{id,username}', limit: 100 });
  const pages = acc.data || [];
  if (!pages.length) throw new MetaError('page_not_found', 'Token tidak melihat Facebook Page mana pun.', { granted });
  const linked = pages.filter((p) => p.instagram_business_account);
  if (!linked.length) throw new MetaError('ig_not_found', 'Page ditemukan (' + pages.map((p) => p.name).join(', ') + '), tetapi tidak ada akun Instagram Professional yang terhubung.', { granted });
  const want = clean(expectedUsername);
  const hit = want ? linked.find((p) => clean(p.instagram_business_account.username) === want) : linked[0];
  if (!hit) {
    throw new MetaError('ig_not_found', 'Akun @' + want + ' tidak ditemukan. Akun IG yang terlihat: ' +
      linked.map((p) => '@' + p.instagram_business_account.username).join(', ') + '.', { granted });
  }
  return { pageId: hit.id, pageName: hit.name, igId: hit.instagram_business_account.id, igUsername: hit.instagram_business_account.username, granted };
}

function mapType(m) {
  if (m.media_product_type === 'REELS') return 'Reel';
  if (m.media_product_type === 'STORY') return 'Story';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'Carousel';
  if (m.media_type === 'IMAGE') return 'Image';
  if (m.media_type === 'VIDEO') return 'Video';
  return 'Lainnya';
}
const jakartaDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const FATAL = ['expired', 'invalid_token', 'permission', 'rate_limit', 'unreachable'];

async function mediaInsights(token, mediaId) {
  // Daftar metrik berbeda antar jenis media/versi API, jadi dicoba dari yang terlengkap.
  const sets = ['reach,views,saved,shares,total_interactions', 'reach,saved,shares,total_interactions', 'reach,total_interactions', 'reach'];
  for (const metric of sets) {
    try {
      const r = await graph(token, mediaId + '/insights', { metric });
      const out = {};
      for (const m of r.data || []) {
        const v = m.values && m.values[0] ? m.values[0].value : m.total_value ? m.total_value.value : null;
        if (typeof v === 'number') out[m.name] = v;
      }
      return out;
    } catch (e) {
      if (FATAL.indexOf(e.kind) !== -1) throw e;
    }
  }
  return {};
}

// Ambil profil + posting + insight per posting. Mengembalikan data siap simpan.
async function fetchAccount(token, igId, maxDays) {
  const info = await graph(token, igId, { fields: 'followers_count,media_count,username' });
  const cutoff = new Date(Date.now() - (maxDays || 100) * 86400000).toISOString();
  const media = [];
  let after = null;
  for (let page = 0; page < 12; page++) {
    const r = await graph(token, igId + '/media', {
      fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count', limit: 50, after
    });
    const items = r.data || [];
    media.push(...items);
    after = r.paging && r.paging.cursors && r.paging.next ? r.paging.cursors.after : null;
    if (!after || !items.length || items[items.length - 1].timestamp < cutoff) break;
  }
  const recent = media.filter((m) => m.timestamp >= cutoff);
  const posts = [];
  const queue = recent.slice();
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const m = queue.shift();
      const ins = await mediaInsights(token, m.id);
      const cap = (m.caption || '').replace(/\s+/g, ' ').trim();
      posts.push({
        ext_id: m.id, title: (cap || '(tanpa caption)').slice(0, 120), type: mapType(m), date: jakartaDate(m.timestamp), url: m.permalink || null,
        views: ins.views ?? null, reach: ins.reach ?? null,
        likes: typeof m.like_count === 'number' ? m.like_count : null, comments: typeof m.comments_count === 'number' ? m.comments_count : null,
        saves: ins.saved ?? null, shares: ins.shares ?? null, interactions: ins.total_interactions ?? null
      });
    }
  });
  await Promise.all(workers);
  return { followers: typeof info.followers_count === 'number' ? info.followers_count : null, posts };
}

// Business Discovery: data publik akun Professional lain.
async function discover(token, igId, username) {
  const u = clean(username);
  const fields = 'business_discovery.username(' + u + '){username,followers_count,media_count,media.limit(6){caption,like_count,comments_count,timestamp,permalink}}';
  try {
    const r = await graph(token, igId, { fields });
    const b = r.business_discovery;
    if (!b) return { status: 'tidak_tersedia', detail: 'Meta tidak mengembalikan data akun ini lewat Business Discovery (bukan akun Professional atau tidak bisa diakses).' };
    const media = ((b.media && b.media.data) || []).map((m) => ({
      caption: (m.caption || '').replace(/\s+/g, ' ').slice(0, 100), likes: m.like_count ?? null, comments: m.comments_count ?? null,
      date: m.timestamp ? jakartaDate(m.timestamp) : null, url: m.permalink || null
    }));
    return { status: 'tersedia', followers: b.followers_count ?? null, media_count: b.media_count ?? null, recent: media };
  } catch (e) {
    if (e.kind === 'not_found' || (e.kind === 'api' && /business|professional|private|cannot be found/i.test(e.message))) {
      return { status: 'tidak_tersedia', detail: 'Akun tidak ditemukan lewat API: bukan akun Professional, username salah, atau akun tidak bisa diakses.' };
    }
    throw e;
  }
}

module.exports = { verify, fetchAccount, discover, MetaError, advice, REQUIRED_PERMS, scrub };
