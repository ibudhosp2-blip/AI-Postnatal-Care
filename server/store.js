'use strict';
// JSON-file datastore (single process). Atomic writes. Suitable for a prototype / small clinic — swap for a real DB before scale.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sec = require('./security');

const DEFAULT_PASSWORD = 'admin1234';

const DEFAULT_SYSTEM_PROMPT = 'คุณคือ "น้องหมอท้อง" ผู้ช่วยให้ข้อมูลทั่วไปแก่มารดาหลังคลอด ตอบเป็นภาษาไทย สั้น กระชับ อบอุ่น';

function emptyDb() {
  return {
    users: [], patients: [], assessments: [], messages: [], audit: [], places: [],
    settings: {
      openrouter: { keyEnc: '', model: 'openai/gpt-4o-mini', enabled: false, systemPrompt: DEFAULT_SYSTEM_PROMPT },
      his: { url: '', tokenEnc: '', enabled: false },
      line: { tokenEnc: '' },
      face: { threshold: 0.5 },
      testMode: { enabled: false },
      inpatient: { vaginalHours: 48, cesareanHours: 72 },
    },
    knowledge: { herbs: [], myths: [], library: [] },
  };
}

async function open(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'photos'), { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, 'db.json');
  const cipher = sec.makeCipher(sec.loadKey(dataDir));
  let db = emptyDb();
  if (fs.existsSync(file)) {
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    db = { ...db, ...loaded, settings: { ...db.settings, ...loaded.settings }, knowledge: { ...db.knowledge, ...loaded.knowledge } };
  }
  const save = () => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  // seed the two staff accounts — default password must be changed at first login
  for (const [username, role, name] of [['admin1', 'admin1', 'ผู้ดูแลระบบ'], ['admin2', 'admin2', 'เจ้าหน้าที่']]) {
    if (!db.users.some(u => u.username === username))
      db.users.push({ id: crypto.randomUUID(), username, role, name, passHash: await sec.hashPassword(DEFAULT_PASSWORD), mustChange: true });
  }
  save();

  const photoFile = (id) => path.join(dataDir, 'photos', id + '.bin');
  return {
    db, save, cipher, DEFAULT_PASSWORD,
    audit(who, action, detail = '') { db.audit.push({ at: new Date().toISOString(), who, action, detail }); if (db.audit.length > 2000) db.audit.splice(0, 500); save(); },
    savePhoto(id, buf) { fs.writeFileSync(photoFile(id), cipher.enc(buf), { mode: 0o600 }); },
    readPhoto(id) { try { return cipher.dec(fs.readFileSync(photoFile(id))); } catch { return null; } },
    deletePhoto(id) { try { fs.unlinkSync(photoFile(id)); } catch { /* none */ } },
  };
}

module.exports = { open, DEFAULT_PASSWORD, DEFAULT_SYSTEM_PROMPT };
