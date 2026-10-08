const test = require('node:test');
const assert = require('node:assert');
const { createBlinkDetector, eyeAspectRatio } = require('../web/liveness.js');
const run = (seq, opts) => { const d = createBlinkDetector(opts); for (const e of seq) d.update(e); return d; };
const open = (n, v = 0.30) => Array(n).fill(v);

test('a real blink (open → closed → open) completes liveness', () => assert.strictEqual(run([...open(6), 0.12, 0.10, 0.28, 0.30]).stage, 'done'));
test('a still photo (constant eyes) never passes', () => assert.notStrictEqual(run(open(300)).stage, 'done'));
test('slight eye movement / noise is not a blink', () => assert.notStrictEqual(run([...open(6), 0.27, 0.29, 0.26, 0.30, 0.28, 0.25]).stage, 'done'));
test('eyes closing and staying closed is not a completed blink', () => assert.strictEqual(run([...open(6), 0.1, 0.1, 0.1, 0.1]).stage, 'opening'));
test('tolerates a low frame-rate blink (single closed frame) and a slightly dim/narrow-eyed face', () => {
  assert.strictEqual(run([0.18, 0.19, 0.2, 0.19, 0.08, 0.19]).stage, 'done');
  assert.strictEqual(run([...open(3, 0.16), 0.1, 0.16]).stage, 'done');
});
test('a drifting reference does not create a false blink (slow gradual change)', () => {
  const slow = Array.from({ length: 60 }, (_, i) => 0.30 - i * 0.002);      // 0.30 → 0.18 slowly (tiredness, not blink)
  assert.notStrictEqual(run(slow).stage, 'done');
});
test('eyes shut for a long time recalibrate instead of getting stuck', () => {
  const d = run([...open(5), ...open(40, 0.05)]); assert.notStrictEqual(d.stage, 'done');
  for (const e of [...open(4), 0.1, 0.3]) d.update(e); assert.strictEqual(d.stage, 'done');
});
test('baseline restarts if eyes are closed/squinting during calibration', () => {
  const d = run([0.30, 0.30, 0.10, 0.30, 0.30]); assert.strictEqual(d.stage, 'baseline');      // only 2 clean frames after reset
  assert.strictEqual(run([0.30, 0.30, 0.10, ...open(4), 0.1, 0.3]).stage, 'done');
});
test('works for people with naturally narrow eyes (relative thresholds)', () => assert.strictEqual(run([...open(5, 0.22), 0.1, 0.21]).stage, 'done'));
test('ignores non-finite readings', () => assert.strictEqual(run([...open(5), NaN, undefined, 0.1, 0.3]).stage, 'done'));
test('eyeAspectRatio: open eye ≈ 0.3, closed ≈ 0', () => {
  const eye = (h) => [{ x: 0, y: 0 }, { x: 1, y: -h }, { x: 2, y: -h }, { x: 3, y: 0 }, { x: 2, y: h }, { x: 1, y: h }];
  assert.ok(Math.abs(eyeAspectRatio(eye(0.45)) - 0.3) < 0.01); assert.ok(eyeAspectRatio(eye(0.02)) < 0.03);
});
