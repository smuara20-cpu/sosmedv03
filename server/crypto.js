// Enkripsi token Meta (AES-256-GCM). Token tidak pernah dikirim ke browser atau ditulis ke log.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let KEY = null;
function dataDir() { return process.env.DATA_DIR || path.join(__dirname, '..', 'data'); }

function getKey() {
  if (KEY) return KEY;
  let hex = (process.env.APP_SECRET || '').trim();
  if (!hex) {
    const f = path.join(dataDir(), '.secret');
    fs.mkdirSync(dataDir(), { recursive: true });
    if (fs.existsSync(f)) hex = fs.readFileSync(f, 'utf8').trim();
    else {
      hex = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(f, hex, { mode: 0o600 });
    }
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('APP_SECRET harus 64 karakter hex (32 byte).');
  KEY = Buffer.from(hex, 'hex');
  return KEY;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob) {
  const [iv, tag, enc] = blob.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
module.exports = { encrypt, decrypt };
