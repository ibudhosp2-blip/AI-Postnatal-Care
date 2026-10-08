'use strict';
// Password hashing, secret encryption at rest, sessions and rate limiting — Node built-ins only.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), 64);
  const want = Buffer.from(keyHex, 'hex');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}

// ---- encryption at rest (AES-256-GCM) — key from APP_SECRET or data/secret.key (0600) ----
function loadKey(dataDir) {
  if (process.env.APP_SECRET) return crypto.createHash('sha256').update(process.env.APP_SECRET).digest();
  const f = path.join(dataDir, 'secret.key');
  if (fs.existsSync(f)) return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex');
  const k = crypto.randomBytes(32);
  fs.writeFileSync(f, k.toString('hex'), { mode: 0o600 });
  return k;
}
function makeCipher(key) {
  return {
    enc(buf) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(buf), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]);
    },
    dec(buf) {
      const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
    },
    encStr(s) { return s ? this.enc(Buffer.from(s, 'utf8')).toString('base64') : ''; },
    decStr(s) { return s ? this.dec(Buffer.from(s, 'base64')).toString('utf8') : ''; },
  };
}

// ---- sessions (in memory) ----
const sessions = new Map();
function createSession(data, ttlMs, sliding = true) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { ...data, expires: Date.now() + ttlMs, ttlMs, sliding });
  return token;
}
function getSession(token) {
  const s = token && sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  if (s.sliding) s.expires = Date.now() + s.ttlMs;
  return s;
}
function destroySession(token) { sessions.delete(token); }
function destroyUserSessions(userId) { for (const [t, s] of sessions) if (s.userId === userId) sessions.delete(t); }

// ---- rate limiter: max `limit` hits per `windowMs` per key ----
const buckets = new Map();
function hit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  return { blocked: b.n > limit, retryAfter: Math.ceil((b.reset - now) / 1000) };
}
function isBlocked(key, limit) { const b = buckets.get(key); return !!b && b.reset > Date.now() && b.n >= limit; }
function clearKey(key) { buckets.delete(key); }
setInterval(() => { const n = Date.now(); for (const [k, b] of buckets) if (b.reset < n) buckets.delete(k); for (const [k, s] of sessions) if (s.expires < n) sessions.delete(k); }, 60_000).unref();

module.exports = { hashPassword, verifyPassword, loadKey, makeCipher, createSession, getSession, destroySession, destroyUserSessions, hit, isBlocked, clearKey };
