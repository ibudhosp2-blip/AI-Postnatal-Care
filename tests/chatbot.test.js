const test = require('node:test');
const assert = require('node:assert');
const { answer } = require('../server/chatbot.js');

const kb = {
  herbs: [{ name: 'ขิง', aliases: ['ginger'], note: 'ระดับอาหาร', baseline: 'ok' }],
  myths: [{ title: 'ห้ามสระผมหลังคลอด', verdict: 'false', body: 'สระผมได้ตามปกติ' }],
  library: [{ title: 'ท่าอุ้มให้นมแม่', category: 'นมแม่', body: 'อุ้มให้ท้องลูกแนบท้องแม่' }],
};
const src = (m, k = kb) => answer(m, k).source;

test('common phrasings reach the right built-in topic', () => {
  const topic = (m) => answer(m, {}).reply.split('\n')[0];
  for (const m of ['ปวดหลังมากเลย', 'เมื่อยไหล่', 'หลังปวดจัง']) assert.match(topic(m), /ปวดหลัง/, m);
  for (const m of ['น้ำนมไม่ค่อยมี', 'นมไม่พอ', 'นมน้อยทำไงดี', 'อยากเพิ่มน้ำนม', 'น้ำนมหาย']) assert.match(topic(m), /น้ำนมน้อย/, m);
  for (const m of ['เต้านมคัดมาก', 'นมตึงเจ็บ', 'ปวดเต้านม']) assert.match(topic(m), /คัดตึง/, m);
  for (const m of ['นอนไม่หลับ', 'เหนื่อยมาก']) assert.match(topic(m), /นอนไม่พอ/, m);
  for (const m of ['แผลผ่าคลอดเจ็บ', 'แผลเย็บแห้งยัง']) assert.match(topic(m), /ดูแลแผล/, m);
  assert.match(topic('น้ำคาวปลาสีอะไร'), /น้ำคาวปลา/);
});
test('knowledge-base entries win and generic words do not create false matches', () => {
  assert.strictEqual(src('กินขิงได้ไหม'), 'kb');
  assert.strictEqual(src('สระผมได้ไหม'), 'kb');
  assert.strictEqual(src('ท่าอุ้มให้นมทำยังไง'), 'kb');
  assert.notStrictEqual(src('ปวดหลังมากเลย'), 'kb');          // "หลัง" alone must not hit "สระผมหลังคลอด"
});
test('unrelated text gets a helpful fallback with suggestions, never an empty reply', () => {
  const r = answer('วันนี้อากาศดีนะ', kb);
  assert.strictEqual(r.source, 'none'); assert.ok(r.suggest.length >= 4); assert.ok(r.reply.length > 20);
  assert.ok(answer('', {}).reply);
});
test('answers always carry the not-a-diagnosis disclaimer', () => assert.match(answer('ปวดหลัง', {}).reply, /ไม่ใช่การวินิจฉัย/));
