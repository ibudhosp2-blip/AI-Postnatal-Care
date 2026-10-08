// Blink-based liveness check (pure logic, unit-testable). Eye Aspect Ratio from the 6 landmark points of an eye.
(function (root) {
  function eyeAspectRatio(p) {            // p: 6 points [{x,y}] in face-api order (corner, top, top, corner, bottom, bottom)
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    return (d(p[1], p[5]) + d(p[2], p[4])) / (2 * d(p[0], p[3]));
  }
  // stages: baseline (see open eyes) -> closing (wait for a dip) -> opening (wait for reopen) -> done
  // Reference = highest EAR in the last `window` frames (so a slow/low-FPS camera or glasses don't break calibration).
  function createBlinkDetector({ baselineFrames = 3, closeRatio = 0.78, openRatio = 0.88, minOpenEar = 0.15, window = 24, openingTimeout = 30 } = {}) {
    const hist = []; let good = 0, ref = 0, stage = 'baseline', openingFor = 0;
    return {
      get stage() { return stage; }, get baseline() { return ref; },
      update(ear) {
        if (!Number.isFinite(ear)) return stage;
        hist.push(ear); if (hist.length > window) hist.shift();
        if (stage === 'baseline') {
          if (ear > minOpenEar) good++; else good = 0;                       // closed/squinting: restart calibration
          if (good >= baselineFrames) { ref = Math.max(...hist); stage = 'closing'; }
        } else if (stage === 'closing') {
          ref = Math.max(...hist.slice(0, -1), ref * 0.98);                  // rolling open-eye reference
          if (ear < ref * closeRatio) { stage = 'opening'; openingFor = 0; }
        } else if (stage === 'opening') {
          if (ear > ref * openRatio) stage = 'done';
          else if (++openingFor > openingTimeout) { stage = 'closing'; hist.length = 0; hist.push(ear); ref = ear; stage = 'baseline'; good = 0; }   // eyes just stayed shut: recalibrate
        }
        return stage;
      },
      eyesOpen(ear) { return ref > 0 && ear > ref * openRatio; },
    };
  }
  const api = { eyeAspectRatio, createBlinkDetector };
  root.PNC = Object.assign(root.PNC || {}, { liveness: api });
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
