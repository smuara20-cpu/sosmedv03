const AUTH_URL = () => process.env.INSTAGRAM_AUTH_URL || 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = () => process.env.INSTAGRAM_TOKEN_URL || 'https://api.instagram.com/oauth/access_token';
const LONG_TOKEN_URL = () => process.env.INSTAGRAM_LONG_TOKEN_URL || 'https://graph.instagram.com/access_token';
const API_BASE = () => (process.env.INSTAGRAM_API_BASE || 'https://graph.instagram.com').replace(/\/+$/, '');

const DEFAULT_SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'];

class InstagramError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = 'InstagramError';
    this.kind = kind;
    this.status = status || null;
  }
}

function config() {
  const appId = (process.env.INSTAGRAM_APP_ID || '').trim();
  const appSecret = (process.env.INSTAGRAM_APP_SECRET || '').trim();
  const redirectUri = (process.env.INSTAGRAM_REDIRECT_URI || '').trim();
  const scopes = (process.env.INSTAGRAM_SCOPES || DEFAULT_SCOPES.join(','))
    .split(',').map(x => x.trim()).filter(Boolean);

  if (!appId || !appSecret || !redirectUri) {
    throw new InstagramError(
      'configuration',
      'Konfigurasi Instagram belum lengkap. Periksa App ID, App Secret, dan Redirect URI di environment server.'
    );
  }

  let callback;
  try { callback = new URL(redirectUri); }
  catch { throw new InstagramError('configuration', 'Redirect URI tidak valid.'); }

  if (callback.protocol !== 'https:' && callback.hostname !== 'localhost' && callback.hostname !== '127.0.0.1') {
    throw new InstagramError('configuration', 'Redirect URI produksi harus menggunakan HTTPS.');
  }

  if (!scopes.length) throw new InstagramError('configuration', 'Instagram scopes belum diisi.');

  return { appId, appSecret, redirectUri, scopes };
}

function authorizeUrl(state) {
  if (typeof state !== 'string' || !/^[a-f0-9]{64,128}$/i.test(state)) {
    throw new InstagramError('state', 'OAuth state tidak valid.');
  }

  const c = config();
  const u = new URL(AUTH_URL());
  u.searchParams.set('client_id', c.appId);
  u.searchParams.set('redirect_uri', c.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', c.scopes.join(','));
  u.searchParams.set('state', state);
  return u.toString();
}

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(20000),
      headers: { Accept: 'application/json', ...(options.headers || {}) }
    });
  } catch {
    throw new InstagramError('unreachable', 'Layanan Instagram tidak dapat dijangkau.');
  }

  let body;
  try { body = await response.json(); }
  catch { throw new InstagramError('invalid_response', 'Respons Instagram tidak dapat dibaca.', response.status); }

  if (!response.ok || body.error) {
    const err = body.error || {};
    const message = typeof err === 'string' ? err : (err.message || body.error_description || 'Permintaan Instagram gagal.');
    const lower = String(message).toLowerCase();
    const kind = /expired|invalid.*token|authorization code/i.test(lower)
      ? 'invalid_token'
      : response.status === 429 ? 'rate_limit' : 'api';
    throw new InstagramError(kind, String(message).slice(0, 300), response.status);
  }
  return body;
}

async function exchangeCode(code) {
  const c = config();
  if (typeof code !== 'string' || code.length < 4 || code.length > 2048 || /[\r\n]/.test(code)) {
    throw new InstagramError('code', 'Authorization code tidak valid.');
  }

  const form = new URLSearchParams({
    client_id: c.appId,
    client_secret: c.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: c.redirectUri,
    code
  });

  const short = await requestJson(TOKEN_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });

  if (!short.access_token) throw new InstagramError('invalid_response', 'Instagram tidak mengembalikan access token.');
  let token = short.access_token;
  let expiresIn = Number(short.expires_in) || null;
  let userId = short.user_id ? String(short.user_id) : null;
  let tokenType = 'short_lived';

  // Instagram long-lived exchange. Jika gagal, token pendek tidak dianggap long-lived.
  try {
    const u = new URL(LONG_TOKEN_URL());
    u.searchParams.set('grant_type', 'ig_exchange_token');
    u.searchParams.set('client_secret', c.appSecret);
    u.searchParams.set('access_token', token);
    const longer = await requestJson(u.toString(), { method: 'GET' });
    if (longer.access_token) {
      token = longer.access_token;
      expiresIn = Number(longer.expires_in) || expiresIn;
      tokenType = 'long_lived';
    }
  } catch (e) {
    if (!(e instanceof InstagramError)) throw e;
    // Tetap gunakan token awal; masa berlaku tetap dicatat sesuai respons awal.
  }

  return {
    accessToken: token,
    userId,
    expiresIn,
    tokenType
  };
}

async function fetchProfile(accessToken) {
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new InstagramError('invalid_token', 'Access token tidak tersedia.');
  }

  const u = new URL(API_BASE() + '/me');
  u.searchParams.set('fields', 'user_id,username');

  const profile = await requestJson(u.toString(), {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + accessToken }
  });

  const id = profile.user_id || profile.id;
  if (!id || !profile.username) {
    throw new InstagramError('invalid_response', 'Identitas akun Instagram tidak lengkap.');
  }

  return { id: String(id), username: String(profile.username) };
}

module.exports = {
  config,
  authorizeUrl,
  exchangeCode,
  fetchProfile,
  InstagramError,
  DEFAULT_SCOPES
};