// Blink-based liveness check (pure logic, unit-testable). Eye Aspect Ratio from the 6 landmark points of an eye.
(function (root) {
  function eyeAspectRatio(p) {            // p: 6 points [{x,y}] in face-api order (corner, top, top, corner, bottom, bottom)
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    return (d(p[1], p[5]) + d(p[2], p[4])) / (2 * d(p[0], p[3]));
  }
  // stages: baseline (collect open-eye EAR) -> closing (wait for eyes to close) -> opening (wait for reopen) -> done
  function createBlinkDetector({ baselineFrames = 4, closeRatio = 0.72, openRatio = 0.88, minOpenEar = 0.2 } = {}) {
    const samples = []; let baseline = 0, stage = 'baseline';
    return {
      get stage() { return stage; }, get baseline() { return baseline; },
      update(ear) {
        if (!Number.isFinite(ear)) return stage;
        if (stage === 'baseline') {
          if (ear > minOpenEar) samples.push(ear); else samples.length = 0;     // squinting/closed: restart baseline
          if (samples.length >= baselineFrames) { const s = [...samples].sort((a, b) => a - b); baseline = s[s.length >> 1]; stage = 'closing'; }
        } else if (stage === 'closing') { if (ear < baseline * closeRatio) stage = 'opening'; }
        else if (stage === 'opening') { if (ear > baseline * openRatio) stage = 'done'; }
        return stage;
      },
      eyesOpen(ear) { return baseline > 0 && ear > baseline * openRatio; },
    };
  }
  const api = { eyeAspectRatio, createBlinkDetector };
  root.PNC = Object.assign(root.PNC || {}, { liveness: api });
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
