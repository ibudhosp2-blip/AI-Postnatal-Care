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
.pnc-cam .oval{position:absolute;inset:8% 14% 14%;border:3px dashed rgba(255,255,255,.85);border-radius:50%;box-shadow:0 0 0 999px rgba(42,26,32,.35);transition:border-color .25s}
.pnc-cam.ok .oval{border-color:#f1d98a;border-style:solid}.pnc-cam.go .oval{border-color:#ff7e95;border-style:solid;animation:pncp 1s infinite}.pnc-cam.done .oval{border-color:#4caf7a;border-style:solid;border-width:5px}
@keyframes pncp{50%{border-width:6px}}
.pnc-stat{text-align:center;font-weight:500;margin:10px 0 4px;min-height:1.6em}.pnc-stat.err{color:#d62b45}
.pnc-steps{display:flex;gap:6px;justify-content:center;margin:6px 0;font-size:.78rem;color:#8d7079;flex-wrap:wrap}
.pnc-steps span{padding:2px 10px;border-radius:999px;background:#f7e6ea}.pnc-steps span.on{background:#ffd6de;color:#e0476a;font-weight:600}.pnc-steps span.ok{background:#d8f0e2;color:#2e7d4f;font-weight:600}
.pnc-bar{height:6px;border-radius:3px;background:#f7e6ea;max-width:340px;margin:6px auto;overflow:hidden}.pnc-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff7e95,#e0476a);transition:width .2s linear}
.pnc-hint{text-align:center;color:#8d7079;font-size:.8rem;min-height:1.2em}`;
    document.head.appendChild(st);
  }
  const STEPS = ['① พบใบหน้า', '② กะพริบตา', '③ ยืนยัน'];
  const markup = (liveness) => `<div class="pnc-cam"><video playsinline muted autoplay></video><div class="oval"></div></div><div class="pnc-steps">${STEPS.filter((_, i) => liveness || i !== 1).map((t, i) => `<span data-s="${liveness ? i : (i ? 2 : 0)}">${liveness ? t : t.replace(/^[①②③]/, ['①', '②'][i])}</span>`).join('')}</div><div class="pnc-bar"><i></i></div><div class="pnc-stat" role="status" aria-live="polite">กำลังเปิดกล้อง...</div><div class="pnc-hint"></div>`;
  const cameraError = (e) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'เบราว์เซอร์นี้ใช้กล้องไม่ได้ (ต้องเปิดผ่าน https หรือ localhost)';
    if (e && e.name === 'NotAllowedError') return 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณากดอนุญาตการเข้าถึงกล้องแล้วลองใหม่';
    if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) return 'ไม่พบกล้องในอุปกรณ์นี้';
    return (e && e.message) || 'เปิดกล้องไม่สำเร็จ';
  };

  // returns { promise, cancel }. Builds the camera UI inside `container`.
  function liveScan(container, { liveness = true, timeoutMs = 45000 } = {}) {
    injectStyle();
    container.innerHTML = markup(liveness);
    const box = container.querySelector('.pnc-cam'), video = container.querySelector('video'), stat = container.querySelector('.pnc-stat'), hint = container.querySelector('.pnc-hint'), bar = container.querySelector('.pnc-bar i');
    const say = (t, cls = '') => { stat.textContent = t; stat.className = 'pnc-stat ' + cls; };
    const step = (n) => container.querySelectorAll('.pnc-steps span').forEach(el => { const i = +el.dataset.s; el.className = i < n ? 'ok' : i === n ? 'on' : ''; });
    step(0);
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
        const t0 = Date.now(); let steady = 0, frames = 0;
        const ear = (lm) => (window.PNC.liveness.eyeAspectRatio(lm.getLeftEye()) + window.PNC.liveness.eyeAspectRatio(lm.getRightEye())) / 2;
        while (!stopped) {
          const el = Date.now() - t0;
          if (el > timeoutMs) return finish.reject(new Error('หมดเวลาสแกน กรุณากดลองอีกครั้ง (ลองให้แสงสว่างขึ้น ถอดแว่น และมองตรงที่กล้อง)'));
          bar.style.width = Math.min(100, el / timeoutMs * 100) + '%';
          frames++; if (el > 4000) { const fps = frames / (el / 1000); hint.textContent = fps < 3 ? 'เครื่องประมวลผลช้า — อยู่นิ่ง ๆ แล้วกะพริบตาช้า ๆ ให้ชัด' : (det.stage === 'closing' || det.stage === 'opening') && el > 12000 ? 'กะพริบตาช้า ๆ ให้ชัด 1 ครั้ง · ถอดแว่น/หลบแสงจ้าด้านหลัง' : ''; }
          if (video.readyState < 2 || !video.videoWidth) { await new Promise(r => setTimeout(r, 60)); continue; }
          const faces = await f.detectAllFaces(video, opts).withFaceLandmarks();
          if (stopped) return;
          if (faces.length === 0) { steady = 0; box.className = 'pnc-cam'; step(0); say('ไม่พบใบหน้า — มองตรงที่กล้องและให้มีแสงเพียงพอ'); }
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
                if (stage === 'baseline') { box.className = 'pnc-cam ok'; step(0); say('พบใบหน้าแล้ว — มองตรงที่กล้อง...'); }
                else if (stage === 'closing' || stage === 'opening') { box.className = 'pnc-cam go'; step(1); say('กะพริบตา 1 ครั้ง 👁'); }
              } else { box.className = 'pnc-cam ok'; step(0); say('พบใบหน้าแล้ว — นิ่งไว้สักครู่...'); }
              const live = liveness ? det.stage === 'done' && det.eyesOpen(e) : steady >= 4;
              if (live) {
                step(2); say('กำลังยืนยันใบหน้า...');
                const one = await f.detectSingleFace(video, opts).withFaceLandmarks().withFaceDescriptor();
                if (stopped) return;
                if (one && (!liveness || det.eyesOpen(ear(one.landmarks)))) {
                  box.className = 'pnc-cam done'; bar.style.width = '100%'; container.querySelectorAll('.pnc-steps span').forEach(x => { x.className = 'ok'; }); say('✓ สแกนสำเร็จ');
                  const out = { descriptor: Array.from(one.descriptor), photo: frameToJpeg(video, vw, vh) };
                  await new Promise(r => setTimeout(r, 600));            // ให้เห็นสีเขียว/ติ๊กครบก่อนเข้าสู่ระบบ
                  return finish.resolve(out);
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
  function mockScan(container, { ms = 3600 } = {}) {
    injectStyle();
    container.innerHTML = markup(true);
    const box = container.querySelector('.pnc-cam'), video = container.querySelector('video'), stat = container.querySelector('.pnc-stat'), bar = container.querySelector('.pnc-bar i');
    const chips = [...container.querySelectorAll('.pnc-steps span')];
    let stream = null, dead = false, timers = [];
    const later = (fn, t) => timers.push(setTimeout(() => { if (!dead) fn(); }, t));
    const mark = (n) => chips.forEach((el, i) => { el.className = i < n ? 'ok' : i === n ? 'on' : ''; });
    const cleanup = () => { dead = true; timers.forEach(clearTimeout); if (stream) stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
    const promise = new Promise((resolve) => {
      (async () => {
        let cam = true;
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }); if (dead) { stream.getTracks().forEach(t => t.stop()); return; } video.srcObject = stream; await video.play().catch(() => {}); }
        catch { cam = false; }
        box.className = 'pnc-cam ok'; mark(0); stat.textContent = cam ? 'พบใบหน้า — กำลังสแกน...' : 'ไม่พบกล้อง — ข้ามการสแกน (โหมดสาธิต)';
        bar.style.transitionDuration = ms + 'ms'; requestAnimationFrame(() => { bar.style.width = '100%'; });
        later(() => { box.className = 'pnc-cam go'; mark(1); stat.textContent = 'ตรวจการเคลื่อนไหว...'; }, ms * 0.35);
        later(() => { mark(2); stat.textContent = 'กำลังยืนยันใบหน้า...'; }, ms * 0.7);
        later(() => { box.className = 'pnc-cam done'; chips.forEach(el => { el.className = 'ok'; }); stat.textContent = '✓ สแกนผ่าน (โหมดสาธิต)'; }, ms * 0.9);
        later(() => { cleanup(); resolve({ descriptor: null, photo: null, mock: true }); }, ms);
      })();
    });
    return { promise, cancel: cleanup };
  }
  window.PNCFace = { init, scan, liveScan, mockScan };
})();
