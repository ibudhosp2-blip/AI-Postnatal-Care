// Face recognition in the browser (face-api, vendored under /vendor/face-api). Nothing but a 128-number descriptor leaves the device.
//  - liveScan(): real-time camera + blink liveness check (used for patient login and admin enrolment)
//  - scan(file): descriptor from a photo file (admin fallback only)
// NOTE: liveness runs on the client. It stops casual photo attempts but cannot, by itself, defeat someone who forges requests.
(function () {
  let ready = null;
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('โหลดไลบรารีสแกนใบหน้าไม่สำเร็จ')); document.head.appendChild(s); }); }
  function init() {
    if (ready) return ready;
    ready = (async () => {
      if (!window.faceapi) await loadScript('/vendor/face-api/face-api.js');
      const f = window.faceapi, M = '/vendor/face-api/model';
      try { await f.tf.setBackend('webgl'); } catch { await f.tf.setBackend('cpu'); }
      await f.tf.ready();
      await Promise.all([f.nets.tinyFaceDetector.loadFromUri(M), f.nets.faceLandmark68Net.loadFromUri(M), f.nets.faceRecognitionNet.loadFromUri(M)]);
      return f;
    })().catch(e => { ready = null; throw e; });
    return ready;
  }
  const frameToJpeg = (src, w, h, max = 480) => {
    const k = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  };

  // ---- photo file (fallback for admin) ----
  async function scan(file) {
    if (!file) throw new Error('กรุณาเลือกรูปใบหน้า');
    const [f, bmp] = await Promise.all([init(), createImageBitmap(file)]);
    const k = Math.min(1, 480 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const found = await f.detectAllFaces(c, new f.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptors();
    if (found.length === 0) throw new Error('ไม่พบใบหน้าในภาพ กรุณาถ่ายให้เห็นหน้าชัดเจนและมีแสงเพียงพอ');
    if (found.length > 1) throw new Error('พบหลายใบหน้าในภาพ กรุณาถ่ายเฉพาะใบหน้าของตัวเอง');
    return { descriptor: Array.from(found[0].descriptor), photo: c.toDataURL('image/jpeg', 0.85) };
  }

  // ---- real-time camera scan with blink liveness ----
  function injectStyle() {
    if (document.getElementById('pnc-cam-style')) return;
    const st = document.createElement('style'); st.id = 'pnc-cam-style';
    st.textContent = `.pnc-cam{position:relative;width:100%;max-width:340px;aspect-ratio:3/4;margin:0 auto;border-radius:24px;overflow:hidden;background:#2a1a20;border:3px solid #f1d98a}
.pnc-cam video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.pnc-cam .oval{position:absolute;inset:8% 14% 14%;border:3px dashed rgba(255,255,255,.85);border-radius:50%;box-shadow:0 0 0 999px rgba(42,26,32,.35);transition:border-color .2s}
.pnc-cam.ok .oval{border-color:#4caf7a;border-style:solid}.pnc-cam.go .oval{border-color:#f0607a}
.pnc-stat{text-align:center;font-weight:500;margin:10px 0 4px;min-height:1.6em}.pnc-stat.err{color:#d62b45}`;
    document.head.appendChild(st);
  }
  const cameraError = (e) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'เบราว์เซอร์นี้ใช้กล้องไม่ได้ (ต้องเปิดผ่าน https หรือ localhost)';
    if (e && e.name === 'NotAllowedError') return 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณากดอนุญาตการเข้าถึงกล้องแล้วลองใหม่';
    if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) return 'ไม่พบกล้องในอุปกรณ์นี้';
    return (e && e.message) || 'เปิดกล้องไม่สำเร็จ';
  };

  // returns { promise, cancel }. Builds the camera UI inside `container`.
  function liveScan(container, { liveness = true, timeoutMs = 45000 } = {}) {
    injectStyle();
    container.innerHTML = '<div class="pnc-cam"><video playsinline muted autoplay></video><div class="oval"></div></div><div class="pnc-stat" role="status" aria-live="polite">กำลังเปิดกล้อง...</div>';
    const box = container.querySelector('.pnc-cam'), video = container.querySelector('video'), stat = container.querySelector('.pnc-stat');
    const say = (t, cls = '') => { stat.textContent = t; stat.className = 'pnc-stat ' + cls; };
    let stopped = false, stream = null, finish;
    const cleanup = () => { stopped = true; if (stream) stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
    const promise = new Promise((resolve, reject) => {
      finish = { resolve: (v) => { cleanup(); resolve(v); }, reject: (e) => { cleanup(); say(e.message, 'err'); reject(e); } };
      (async () => {
        let f;
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error();
          [f, stream] = await Promise.all([init(), navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })]);
        } catch (e) { return finish.reject(new Error(e && e.message === 'โหลดไลบรารีสแกนใบหน้าไม่สำเร็จ' ? e.message : cameraError(e))); }
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream; await video.play().catch(() => {});
        const opts = new f.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
        const det = window.PNC.liveness.createBlinkDetector();
        const t0 = Date.now(); let steady = 0;
        const ear = (lm) => (window.PNC.liveness.eyeAspectRatio(lm.getLeftEye()) + window.PNC.liveness.eyeAspectRatio(lm.getRightEye())) / 2;
        while (!stopped) {
          if (Date.now() - t0 > timeoutMs) return finish.reject(new Error('หมดเวลาสแกน กรุณากดลองอีกครั้ง'));
          if (video.readyState < 2 || !video.videoWidth) { await new Promise(r => setTimeout(r, 60)); continue; }
          const faces = await f.detectAllFaces(video, opts).withFaceLandmarks();
          if (stopped) return;
          if (faces.length === 0) { steady = 0; box.className = 'pnc-cam'; say('ไม่พบใบหน้า — มองตรงที่กล้องและให้มีแสงเพียงพอ'); }
          else if (faces.length > 1) { steady = 0; box.className = 'pnc-cam'; say('พบหลายใบหน้า — ให้อยู่ในกรอบเฉพาะคุณ'); }
          else {
            const b = faces[0].detection.box, vw = video.videoWidth, vh = video.videoHeight;
            const cx = (b.x + b.width / 2) / vw, cy = (b.y + b.height / 2) / vh;
            if (b.width / vw < 0.28) { steady = 0; box.className = 'pnc-cam'; say('เข้าใกล้กล้องอีกนิด'); }
            else if (b.width / vw > 0.85) { steady = 0; box.className = 'pnc-cam'; say('ถอยห่างจากกล้องอีกนิด'); }
            else if (cx < 0.28 || cx > 0.72 || cy < 0.2 || cy > 0.8) { steady = 0; box.className = 'pnc-cam'; say('ขยับใบหน้าให้อยู่กลางกรอบ'); }
            else {
              steady++; const e = ear(faces[0].landmarks);
              if (liveness) {
                const stage = det.update(e);
                if (stage === 'baseline') { box.className = 'pnc-cam ok'; say('มองตรงที่กล้อง...'); }
                else if (stage === 'closing' || stage === 'opening') { box.className = 'pnc-cam go'; say('กะพริบตา 1 ครั้ง 👁'); }
              } else { box.className = 'pnc-cam ok'; say('นิ่งไว้สักครู่...'); }
              const live = liveness ? det.stage === 'done' && det.eyesOpen(e) : steady >= 4;
              if (live) {
                say('กำลังยืนยันใบหน้า...');
                const one = await f.detectSingleFace(video, opts).withFaceLandmarks().withFaceDescriptor();
                if (stopped) return;
                if (one && (!liveness || det.eyesOpen(ear(one.landmarks)))) {
                  return finish.resolve({ descriptor: Array.from(one.descriptor), photo: frameToJpeg(video, vw, vh) });
                }
              }
            }
          }
          await new Promise(r => setTimeout(r, 30));
        }
      })().catch(e => finish.reject(new Error(e && e.message ? e.message : 'สแกนไม่สำเร็จ')));
    });
    return { promise, cancel() { if (!stopped) { cleanup(); } } };
  }
  // ---- โหมดสาธิต (mockup): เปิดกล้อง + แสดงขั้นตอนสแกน แล้ว "ผ่าน" เสมอ — ไม่โหลดโมเดล ไม่ส่งภาพ ไม่ล้มเหลว ----
  function mockScan(container, { ms = 2800 } = {}) {
    injectStyle();
    container.innerHTML = '<div class="pnc-cam"><video playsinline muted autoplay></video><div class="oval"></div></div><div class="pnc-stat" role="status" aria-live="polite">กำลังเปิดกล้อง...</div>';
    const box = container.querySelector('.pnc-cam'), video = container.querySelector('video'), stat = container.querySelector('.pnc-stat');
    let stream = null, dead = false, timers = [];
    const later = (fn, t) => timers.push(setTimeout(() => { if (!dead) fn(); }, t));
    const cleanup = () => { dead = true; timers.forEach(clearTimeout); if (stream) stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
    const promise = new Promise((resolve) => {
      (async () => {
        let cam = true;
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }); if (dead) { stream.getTracks().forEach(t => t.stop()); return; } video.srcObject = stream; await video.play().catch(() => {}); }
        catch { cam = false; }
        box.className = 'pnc-cam go'; stat.textContent = cam ? 'กำลังสแกนใบหน้า...' : 'ไม่พบกล้อง — ข้ามการสแกน (โหมดสาธิต)';
        later(() => { box.className = 'pnc-cam ok'; stat.textContent = '✓ สแกนผ่าน (โหมดสาธิต)'; }, ms * 0.7);
        later(() => { cleanup(); resolve({ descriptor: null, photo: null, mock: true }); }, ms);
      })();
    });
    return { promise, cancel: cleanup };
  }
  window.PNCFace = { init, scan, liveScan, mockScan };
})();
