(function () {
  const { risk, ttm, herbs } = window.PNC;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const badge = (r) => `<span class="badge b-${r.level}">${r.icon} ${r.label} · ${r.th}</span>`;

  let me = null, kb = { herbs: [], myths: [], library: [], aiEnabled: false }, history = [];

  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: { 'x-requested-with': 'fetch', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
    if (!r.ok) { const e = new Error((data && data.error) || 'เกิดข้อผิดพลาด'); e.status = r.status; if (r.status === 401 && !['/api/patient/login', '/api/patient/identify'].includes(url)) showLogin(); throw e; }
    return data;
  }

  // ---------- Router ----------
  const VIEWS = ['home', 'assess', 'chat', 'follow', 'herb', 'history', 'alerts', 'me', 'birth', 'myths', 'library'];
  const NAV = ['home', 'history', 'alerts', 'me'];
  function show(name) {
    if (!VIEWS.includes(name)) name = 'home';
    $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + name));
    $$('#bottom button').forEach(b => b.classList.toggle('on', b.dataset.nav === (NAV.includes(name) ? name : 'home')));
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]'); if (!b || b.classList.contains('soon')) return;
    const to = b.dataset.go;
    if (location.hash.slice(1) === to || (to === 'home' && !location.hash)) show(to); else location.hash = to === 'home' ? '' : to;
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));

  // ---------- Login: step 1 (HN or phone + part of name) → step 2 (live face scan, no upload) ----------
  const login = $('#login'), lform = $('#lform');
  let scanner = null, mockMode = false;
  function showLogin(msg) { stopScan(); me = null; login.hidden = false; $('#bottom').hidden = true; $$('.view').forEach(v => v.classList.remove('on')); stepOne(msg); }
  function stopScan() { if (scanner) { scanner.cancel(); scanner = null; } }
  function stepOne(msg) { stopScan(); login.classList.remove('scanning'); lform.hidden = false; $('#lstep2').hidden = true; $('#lmsg').textContent = msg || ''; $('#lbtn').disabled = false; }
  async function stepTwo() {
    lform.hidden = true; login.classList.add('scanning'); $('#lstep2').hidden = false; $('#lmsg2').textContent = ''; $('#lretry').hidden = true;
    stopScan(); scanner = mockMode ? PNCFace.mockScan($('#camwrap')) : PNCFace.liveScan($('#camwrap'), { liveness: true });
    try {
      const r = await scanner.promise; scanner = null;
      await api('POST', '/api/patient/login', mockMode ? {} : { descriptor: r.descriptor });      // only the 128-number descriptor is sent (never an image)
      lform.reset(); await startApp();
    } catch (er) {
      scanner = null;
      if (er.status === 401 && /ใหม่อีกครั้ง|หมดเวลา/.test(er.message) && !/ใบหน้าไม่ตรง/.test(er.message)) return stepOne(er.message);   // pre-session gone → back to step 1
      if (er.status === 409 || er.status === 429) return stepOne(er.message);
      $('#lmsg2').textContent = er.message; $('#lretry').hidden = false;
    }
  }
  lform.addEventListener('submit', async (e) => {
    e.preventDefault(); $('#lmsg').textContent = ''; $('#lbtn').disabled = true;
    try { const r = await api('POST', '/api/patient/identify', { id: lform.id.value.trim(), namePart: lform.namePart.value.trim() }); mockMode = !!r.mock; await stepTwo(); }
    catch (er) { $('#lmsg').textContent = er.message; } finally { $('#lbtn').disabled = false; }
  });
  $('#lretry').addEventListener('click', stepTwo);
  $('#lback').addEventListener('click', () => stepOne());
  $('#logout').addEventListener('click', async () => { await api('POST', '/api/patient/logout').catch(() => {}); location.hash = ''; showLogin(); });

  // ---------- GPS: สถานพยาบาลใกล้ตัว — ใช้รายการที่เจ้าหน้าที่ตั้งไว้ (เรียงตามระยะทาง) ถ้าไม่มี ใช้ค้นหา Google Maps ----------
  let places = [];
  function googleNearby(kind) {
    const q = kind === 'hospital' ? 'โรงพยาบาล' : 'คลินิกการแพทย์แผนไทย';
    const w = window.open('about:blank', '_blank');                               // เปิดแท็บทันที (กัน popup blocker) แล้วค่อยใส่ตำแหน่ง
    const go = (ll) => {
      const url = ll ? `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${ll.lat},${ll.lng},14z` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + 'ใกล้ฉัน')}`;
      if (w) w.location.href = url; else location.href = url;
    };
    if (!navigator.geolocation) return go(null);
    navigator.geolocation.getCurrentPosition(pos => go({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => go(null), { timeout: 8000, maximumAge: 300000 });
  }
  const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const tel = (v) => String(v || '').replace(/[^0-9+]/g, '');
  function showPlaces(kind, list) {
    const sheet = $('#placesheet'), KT = kind === 'hospital' ? ['🏥', 'โรงพยาบาลใกล้ฉัน'] : ['🌿', 'คลินิกแพทย์แผนไทยใกล้ฉัน'];
    $('#ps-title').textContent = `${KT[0]} ${KT[1]}`; $('#ps-sub').textContent = 'กำลังหาตำแหน่งของคุณ...';
    const render = (me2) => {
      const rows = list.map(p => ({ ...p, d: me2 ? km(me2, p) : null })).sort((a, b) => (a.d ?? 0) - (b.d ?? 0)).slice(0, 5);
      $('#ps-sub').textContent = me2 ? 'เรียงตามระยะทางจากตำแหน่งของคุณ' : 'ไม่ทราบตำแหน่งของคุณ (ยังไม่ได้อนุญาต GPS) — แสดงตามรายการ';
      $('#ps-list').innerHTML = rows.map(p => `<div class="place"><div class="pn"><b>${esc(p.name)}</b>${p.d != null ? `<span class="dist">${p.d < 1 ? Math.round(p.d * 1000) + ' ม.' : p.d.toFixed(1) + ' กม.'}</span>` : ''}</div>
        ${p.address ? `<div class="muted">${esc(p.address)}</div>` : ''}${p.note ? `<div class="muted">${esc(p.note)}</div>` : ''}
        <div class="refbtns" style="margin-top:6px">${tel(p.phone) ? `<a class="mapbtn" href="tel:${tel(p.phone)}">📞 ${esc(p.phone)}</a>` : ''}<a class="mapbtn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">🧭 นำทาง</a></div></div>`).join('');
    };
    render(null); sheet.hidden = false;
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => render({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => {}, { timeout: 8000, maximumAge: 300000 });
    $('#ps-google').onclick = () => googleNearby(kind);
    $('#ps-close').onclick = () => { sheet.hidden = true; };
  }
  function openNearby(kind) {
    const list = places.filter(p => p.kind === kind);
    if (list.length) { $('#msgbox').hidden = true; return showPlaces(kind, list); }
    googleNearby(kind);
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-near]'); if (b) openNearby(b.dataset.near); });
  function referralBox(r) {
    if (r.referral === 'hospital') return `<div class="refbox hospital"><p>🚨 <b>ควรไปพบแพทย์ที่โรงพยาบาลทันที</b> (โทร 1669 หากฉุกเฉิน)</p><div class="refbtns"><button type="button" class="mapbtn h" data-near="hospital">📍 โรงพยาบาลใกล้ฉัน (GPS)</button></div></div>`;
    if (r.referral === 'ttm') return `<div class="refbox ttm"><p>🌿 <b>แนะนำพบแพทย์แผนไทย</b> เช่น คัดตึง/ปวดตึงเต้านม น้ำนมไหลน้อย</p><div class="refbtns"><button type="button" class="mapbtn" data-near="ttm">📍 คลินิกแพทย์แผนไทยใกล้ฉัน (GPS)</button></div></div>`;
    if (r.referral === 'both') return `<div class="refbox both"><p>🟠 <b>ให้บุคลากรประเมินโดยเร็ว (ภายในวันนี้)</b> — เลือกสถานที่ที่สะดวก</p><div class="refbtns"><button type="button" class="mapbtn h" data-near="hospital">📍 โรงพยาบาลใกล้ฉัน</button><button type="button" class="mapbtn" data-near="ttm">📍 คลินิกแพทย์แผนไทยใกล้ฉัน</button></div></div>`;
    return '';
  }

  // ---------- Assessment ----------
  const STATUS = { consider: 'พิจารณาได้ (รอยืนยัน)', defer: 'ยังไม่ถึงช่วงที่พิจารณา', avoid: 'ไม่แนะนำ/มีข้อห้าม' };
  const form = $('#form'), result = $('#result');
  function readForm() {
    const o = {};
    for (const el of form.elements) { if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : el.value; }
    return o;
  }
  function renderResult(a, target) {
    const r = risk.assess(a), t = ttm.recommend(a, r);
    const missing = r.missing.length ? `<p class="muted">ข้อมูลที่ยังไม่ได้กรอก: ${r.missing.join(', ')}</p>` : '';
    target.innerHTML = `
      <h2>ผลประเมิน</h2>
      <p>${badge(r)}</p>
      <ul class="reasons">${r.reasons.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>
      <p><b>แนวทาง:</b> ${esc(r.action)}</p>
      ${referralBox(r)}
      ${r.level === 'red' ? '<div class="alert">ระบบหยุดให้คำแนะนำทั่วไป — โปรดติดต่อโรงพยาบาลทันที</div>' : ''}
      ${a.selfHarm ? '<div class="alert">สายด่วนสุขภาพจิต <b>1323</b> (24 ชม.)</div>' : ''}
      ${missing}
      <h2 style="margin-top:16px">แนวทางแพทย์แผนไทย</h2>
      <p class="muted">${esc(t.message)}</p>
      ${t.items.map(i => `<div class="item ${i.status}"><b>${esc(i.name)}</b> — ${STATUS[i.status]}<ul>${i.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>`).join('')}
      <p class="muted">AI แนะนำ — แพทย์/แพทย์แผนไทยเป็นผู้ยืนยันก่อนทำหัตถการ</p>`;
  }
  const rerun = () => {
    const a = readForm();
    renderResult(a, result);
    const r = risk.assess(a);
    $('#levelbar').innerHTML = `${badge(r)}<small>${esc(r.reasons[0].text)}</small>`;
  };
  form.addEventListener('input', rerun); form.addEventListener('change', rerun);
  // เลือกวันที่ประเมิน: D1..วันนี้ (ย้อนหลังได้ / เว้นวันได้ / ล่วงหน้าไม่ได้)
  const forDay = $('#forDay');
  const doneDays = () => new Set(history.map(h => h.day));
  function buildDayOptions() {
    const D = me.days, keep = forDay.value;
    $('#saveAssess').disabled = D < 1;
    if (D < 1) {
      forDay.innerHTML = '<option value="">—</option>'; forDay.disabled = true;
      $('#assessInfo').textContent = D === 0 ? 'วันนี้คือวันคลอด (D0) — เริ่มประเมินได้ตั้งแต่พรุ่งนี้ (D1)' : `ยังไม่ถึงวันคลอด (อีก ${-D} วัน) — เริ่มประเมินได้หลังคลอด (D1)`; return;
    }
    forDay.disabled = false; const done = doneDays(); let html = '';
    for (let d = D; d >= Math.max(1, D - 44); d--) html += `<option value="${d}">${d === D ? 'วันนี้ ' : ''}D${d}${done.has(d) ? ' ✓ ประเมินแล้ว' : ''}</option>`;
    forDay.innerHTML = html; forDay.value = keep && +keep <= D && +keep >= 1 ? keep : String(D);
    const missed = []; for (let d = Math.max(1, D - 13); d < D; d++) if (!done.has(d)) missed.push('D' + d);
    $('#assessInfo').textContent = 'ประเมินทุกวัน (D0 = วันคลอด) · ลืมกรอกย้อนหลังได้ หรือเว้นไว้ก็ได้' + (missed.length ? ` · ยังไม่ได้ประเมิน: ${missed.join(', ')}` : '');
  }
  function loadDay() {
    const d = +forDay.value; if (!d) return rerun();
    const prev = history.find(h => h.day === d), inp = prev && prev.input;
    form.reset();
    if (inp) for (const el of form.elements) { if (!el.name || el.name === 'days' || el.name === 'delivery') continue; const v = inp[el.name]; if (el.type === 'checkbox') el.checked = v === true; else if (v != null) el.value = v; }
    form.elements.days.value = d; form.elements.delivery.value = me.deliveryMode;
    $('#saveMsg').textContent = prev ? `โหลดผลที่บันทึกไว้ของ D${d} — บันทึกใหม่จะแทนที่ผลเดิม` : '';
    rerun();
  }
  forDay.addEventListener('change', loadDay);
  $('#saveAssess').addEventListener('click', async () => {
    const btn = $('#saveAssess'); btn.disabled = true; const d = +forDay.value;
    try {
      const r = await api('POST', '/api/patient/assessment', { forDay: d, input: readForm() });
      $('#saveMsg').textContent = `✓ บันทึกผลของ D${d} แล้ว${r.replaced ? ' (แทนที่ผลเดิม)' : ''} เจ้าหน้าที่จะเห็นผลนี้` + (r.level === 'red' || r.level === 'orange' ? ' และจะติดตามโดยเร็ว' : '');
      await loadHistory(); buildDayOptions(); forDay.value = String(d); await loadNotifs();
    } catch (e) { $('#saveMsg').textContent = e.message; } finally { btn.disabled = me.days < 1; }
  });

  // ---------- Chat: triage first (rule-based), then optional AI Q&A ----------
  const YN = [{ l: 'ใช่', v: true }, { l: 'ไม่ใช่', v: false }];
  const STEPS = [
    { k: 'bleedingHeavy', q: 'เลือดออกมากจนชุ่มผ้าอนามัยภายใน 1 ชั่วโมงหรือไม่?', o: YN },
    { k: 'chestOrBreath', q: 'มีเจ็บหน้าอกหรือหายใจลำบากหรือไม่?', o: YN },
    { k: 'headacheVision', q: 'ปวดศีรษะรุนแรงหรือตาพร่ามัวหรือไม่?', o: YN },
    { k: 'feverQ', q: 'มีไข้หรือหนาวสั่นหรือไม่?', o: [{ l: 'มีไข้ (≥38°C)', v: 38.5 }, { l: 'ไม่มี', v: 36.8 }] },
    { k: 'pain', q: 'ระดับความปวดตอนนี้ 0–10?', o: [0, 2, 4, 6, 8, 10].map(n => ({ l: String(n), v: n })) },
    { k: 'woundProblem', q: 'แผลผ่าตัด/แผลฝีเย็บบวม แดง มีหนอง หรือแยกหรือไม่?', o: YN },
    { k: 'milk', q: 'น้ำนมเพียงพอไหม?', o: [{ l: 'เพียงพอ', v: 'enough' }, { l: 'น้อย', v: 'low' }, { l: 'ยังไม่มีน้ำนม', v: 'none' }] },
    { k: 'selfHarm', q: 'ช่วงนี้เคยคิดทำร้ายตัวเองหรือรู้สึกไม่อยากมีชีวิตอยู่หรือไม่?', o: YN },
  ];
  let ans, step, started, finished, aiHistory;
  const log = $('#log'), quick = $('#quick');
  const say = (t, who = 'bot') => { const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = t; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  function resetChat() {
    ans = { days: me ? me.days : 0, delivery: me ? me.deliveryMode : 'vaginal', bleeding: 'normal', tempC: 36.8, pain: 0, milk: 'enough' };
    step = 0; started = false; finished = false; aiHistory = []; log.innerHTML = ''; quick.innerHTML = '';
    say('สวัสดีค่ะ น้องหมอท้องเอง 🤱 ไม่ใช่แพทย์ แต่ช่วยคัดกรองและบอกได้ว่าเมื่อไรควรพบบุคลากร\nเล่าอาการได้เลย เช่น “ปวดหลังมาก” หรือพิมพ์ “เริ่ม” เพื่อตอบคำถามคัดกรอง');
  }
  function parseFree(text) {
    if (/ปวด/.test(text) && !ans.pain) ans.pain = 5;
    if (/ไข้/.test(text)) ans.tempC = 38.2;
    if (/เลือด(ออก)?มาก|ตกเลือด/.test(text)) ans.bleeding = 'heavy';
  }
  function nextQuestion() {
    while (step < STEPS.length && STEPS[step].k === 'woundProblem' && ans.delivery !== 'cesarean') step++;
    if (step >= STEPS.length) return finishChat();
    const s = STEPS[step];
    say(s.q); quick.innerHTML = '';
    s.o.forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.textContent = o.l; b.onclick = () => answer(s, o); quick.appendChild(b); });
  }
  function answer(s, o) {
    say(o.l, 'me');
    if (s.k === 'bleedingHeavy') ans.bleeding = o.v ? 'heavy' : (ans.bleeding === 'heavy' ? 'heavy' : 'normal');
    else if (s.k === 'feverQ') ans.tempC = o.v;
    else ans[s.k] = o.v;
    step++;
    if (risk.assess(ans).level === 'red') return finishChat();      // red flag → หยุดถามและเข้าสู่ระบบส่งต่อ
    nextQuestion();
  }
  function finishChat() {
    quick.innerHTML = ''; finished = true;
    const r = risk.assess(ans), t = ttm.recommend(ans, r);
    const lines = [`ผลคัดกรองเบื้องต้น: ${r.icon} ${r.label} (${r.th})`, ...r.reasons.map(x => '• ' + x.text), '', 'แนวทาง: ' + r.action];
    if (r.level === 'red') lines.push('', '🚨 โปรดโทร 1669 หรือไปโรงพยาบาลทันที ระบบหยุดให้คำแนะนำทั่วไปและแจ้งเจ้าหน้าที่ให้ติดตาม');
    else if (r.level === 'green' || r.level === 'yellow') {
      lines.push('', 'คำแนะนำดูแลตนเอง: พักผ่อนให้เพียงพอ ดื่มน้ำ ให้นมตามต้องการของลูก สังเกตเลือดออก ไข้ และอาการปวดต่อเนื่อง');
      const c = t.items.filter(i => i.status === 'consider').map(i => '• ' + i.name);
      if (c.length) lines.push('', 'บริการแพทย์แผนไทยที่อาจพิจารณา (ต้องให้แพทย์แผนไทยประเมินและยืนยันก่อน):', ...c);
    } else lines.push('', 'ยังไม่แนะนำหัตถการใด ๆ จนกว่าบุคลากรจะประเมิน');
    if (ans.selfHarm) lines.push('', 'สายด่วนสุขภาพจิต 1323 (24 ชม.)');
    if (kb.aiEnabled && r.level !== 'red') lines.push('', 'มีคำถามอื่น พิมพ์ถามน้องหมอท้องได้เลยค่ะ');
    say(lines.join('\n'));
    if (me && me.days >= 1) api('POST', '/api/patient/assessment', { input: ans, source: 'chat' }).then(() => Promise.all([loadHistory(), loadNotifs()])).catch(() => {});   // ส่งผลคัดกรองให้เจ้าหน้าที่เห็น
    const mk = (t, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = fn; if (cls) b.className = cls; quick.appendChild(b); };
    if (r.referral === 'hospital' || r.referral === 'both') mk('📍 โรงพยาบาลใกล้ฉัน', () => openNearby('hospital'), 'mapbtn h');
    if (r.referral === 'ttm' || r.referral === 'both') mk('📍 คลินิกแพทย์แผนไทยใกล้ฉัน', () => openNearby('ttm'), 'mapbtn');
    mk('เริ่มใหม่', resetChat);
  }
  $('#chatform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = $('#chatin').value.trim(); if (!v) return;
    $('#chatin').value = '';
    say(v, 'me');
    if (!started && !finished) { started = true; parseFree(v); return nextQuestion(); }
    if (!finished) return say('กรุณาเลือกคำตอบจากปุ่มด้านล่าง เพื่อให้คัดกรองได้แม่นยำ');
    if (!kb.aiEnabled) return say('ตอนนี้ยังไม่เปิดให้ถามตอบอิสระ หากมีข้อสงสัยกรุณาติดต่อเจ้าหน้าที่ค่ะ');
    const wait = say('กำลังคิด...');
    try {
      const r = await api('POST', '/api/patient/chat', { message: v, history: aiHistory });
      wait.textContent = r.reply;
      if (!r.referral) aiHistory.push({ role: 'user', content: v }, { role: 'assistant', content: r.reply });
    } catch (er) { wait.textContent = er.message; }
  });

  // ---------- Herbal checker (ฐานข้อมูลจากผู้ดูแลระบบ; ถ้ายังไม่มีใช้ชุดตัวอย่าง) ----------
  $('#herbform').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, profile = {};
    for (const el of f.elements) if (el.type === 'checkbox') profile[el.name] = el.checked;
    const r = herbs.check($('#herbq').value, profile);
    const cls = { ok: 'b-green', consult: 'b-yellow', avoid: 'b-red' }[r.verdict];
    const icon = { ok: '✅', consult: '⚠️', avoid: '⛔' }[r.verdict];
    $('#herbres').innerHTML = `<h2>${esc(r.herb ? r.herb.name : $('#herbq').value || '—')}</h2><p><span class="badge ${cls}">${icon} ${r.th}</span></p>
      <ul class="reasons">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="muted">ผลจากฐานข้อมูลที่ตรวจสอบโดยผู้เชี่ยวชาญ ไม่ใช่การวินิจฉัย — หากไม่แน่ใจโปรดปรึกษาเจ้าหน้าที่</p>`;
  });

  // ---------- Follow-up timeline + alerts ----------
  const FU = [
    [1, 'วันนี้มีเลือดออกมากผิดปกติหรือไม่?', ['ไม่มี → Green', 'มาก → Red แจ้งเตือนบุคลากรทันที']],
    [3, 'มีไข้หรือหนาวสั่นหรือไม่?', ['ไม่มี', 'มีไข้ → Orange']],
    [5, 'ระดับความปวดวันนี้เท่าไร (0–10)?', ['0–3 → Green', '4–6 → Yellow', '7+ → Orange → พิจารณานวด/ประคบ']],
    [7, 'น้ำนมเพียงพอหรือไม่?', ['เพียงพอ', 'น้อย → Yellow + แนะนำอาหารเพิ่มน้ำนม/ประเมินนมแม่']],
    [14, 'อารมณ์และการนอนหลับเป็นอย่างไร?', ['ดี', 'แย่ → ส่งแบบ EPDS → Yellow/Orange']],
    [42, 'สุขภาพหลังคลอดกลับมาใกล้เคียงปกติหรือยัง?', ['ปกติแล้ว → ปิดเคส', 'ยังไม่ → นัดพบบุคลากร']],
  ];
  $('#timeline').innerHTML = `<div class="tl">${FU.map(([d, q, r]) => `<div class="d">Day ${d}</div><div class="bubble">${esc(q)}</div><div class="replies">${r.map(x => `<span>${esc(x)}</span>`).join('')}</div>`).join('')}</div>`;
  // ---------- Notifications: กระดิ่ง + กล่องข้อความตอนเข้าแอป ----------
  let notif = { items: [], unread: 0, popup: null };
  const fmtShort = (d) => new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  function renderAlerts() {
    const ICON = { rehab: '🌿', assess: '📝', info: 'ℹ️' };
    $('#alertlist').innerHTML = notif.items.length ? notif.items.map(i => `<div class="card al ${i.unread ? 'unread' : ''}"><div class="n ${i.kind}"><span>${ICON[i.kind]}</span></div><div style="flex:1"><b>${esc(i.title)}</b>${i.date ? ` <span class="muted">${fmtShort(i.date)}</span>` : ''}<div>${esc(i.body)}</div>
      <div class="acts">${i.kind === 'rehab' ? '<button type="button" class="mapbtn" data-near="ttm">📍 คลินิกแพทย์แผนไทยใกล้ฉัน</button>' : ''}${i.kind === 'assess' && i.today ? '<button type="button" class="mapbtn" data-go="assess">ไปประเมิน</button>' : ''}${i.kind === 'rehab' && i.unread ? `<button type="button" class="mapbtn" data-ack="${i.key}">รับทราบ</button>` : ''}</div></div></div>`).join('')
      : '<div class="card"><p class="muted">ยังไม่มีการแจ้งเตือน</p></div>';
    const n = notif.unread;
    for (const el of [$('#hbell'), $('#dot')]) { el.textContent = n > 9 ? '9+' : n || ''; el.hidden = !n; }
  }
  async function loadNotifs() { notif = await api('GET', '/api/patient/notifications'); renderAlerts(); }
  async function ack(key) { await api('POST', '/api/patient/notifications/ack', { key }).catch(() => {}); await loadNotifs(); }
  document.addEventListener('click', e => { const b = e.target.closest('[data-ack]'); if (b) ack(b.dataset.ack); });
  function showPopup() {
    const m = notif.popup; if (!m) return;
    $('#mb-title').textContent = m.title; $('#mb-body').textContent = m.body; $('#mb-date').textContent = `D${m.day} · ${fmtShort(m.date)}`;
    $('#msgbox').hidden = false; $('#mb-ack').focus();
    $('#mb-ack').onclick = async () => { $('#msgbox').hidden = true; await ack(m.key); };
    $('#mb-close').onclick = () => { $('#msgbox').hidden = true; };
    $('#mb-map').onclick = () => openNearby('ttm');
  }

  // ---------- Risk chart + history (จากผลประเมินที่บันทึกจริง) ----------
  const COLS = [[1, ['วันคลอด', '(วันที่ 1)'], ['คลอด']], [2, ['2']], [3, ['3']], [4, ['4']], [5, ['5']], [6, ['6']], [7, ['7']], [10, ['8–14', 'วัน'], ['8–14']],
    [17, ['สัปดาห์', 'ที่ 3'], ['ส.3']], [24, ['สัปดาห์', 'ที่ 4'], ['ส.4']], [31, ['สัปดาห์', 'ที่ 5'], ['ส.5']], [38, ['สัปดาห์', 'ที่ 6'], ['ส.6']]];
  const colOf = (d) => d <= 7 ? Math.max(0, d - 1) : d <= 14 ? 7 : d <= 21 ? 8 : d <= 28 ? 9 : d <= 35 ? 10 : 11;
  const CCOL = { green: '#4caf7a', yellow: '#f2c230', orange: '#f08a3c', red: '#d62b45' };
  function chartSVG(wide) {
    const W = wide ? 330 : 258, H = wide ? 210 : 214, L = wide ? 52 : 46, R = 4, T = 6, B = wide ? 74 : 86, bands = ['red', 'orange', 'yellow', 'green'];
    const NAME = { red: 'รุนแรง', orange: 'เสี่ยง', yellow: 'ต้องติดตาม', green: 'ปกติ' };
    const bh = (H - T - B) / 4, cw = (W - L - R) / COLS.length, x = i => L + cw * (i + 0.5), y = rk => T + (3 - rk + 0.5) * bh;
    const perCol = Array(COLS.length).fill(null);
    for (const h of history) perCol[colOf(h.day)] = h;     // history is oldest → newest, so the latest in each column wins
    const bg = bands.map((l, i) => `<rect x="${L}" y="${T + i * bh}" width="${W - L - R}" height="${bh}" fill="${CCOL[l]}" opacity=".16"/><text x="${L - 4}" y="${T + i * bh + bh / 2 + 3}" text-anchor="end" font-size="8.5" fill="#8d7079">${NAME[l]}</text>`).join('');
    const grid = COLS.map((_, i) => `<line x1="${L + cw * i}" x2="${L + cw * i}" y1="${T}" y2="${H - B}" stroke="#fff" stroke-dasharray="2 3" opacity=".9"/>`).join('');
    const rank = { green: 0, yellow: 1, orange: 2, red: 3 };
    const pts = perCol.map((h, i) => h && [x(i), y(rank[h.level]), h.level]).filter(Boolean);
    const line = pts.length > 1 ? `<polyline points="${pts.map(q => q[0] + ',' + q[1]).join(' ')}" fill="none" stroke="#c9a24b" stroke-width="1.8"/>` : '';
    const dots = pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="3.8" fill="${CCOL[q[2]]}" stroke="#fff" stroke-width="1.2"/>`).join('');
    const ti = colOf(me ? Math.max(1, me.days) : 1), yl = H - B + 12;
    const xl = COLS.map(([, label, short], i) => {
      const hi = i === ti, lab = wide ? label : (short || label);
      return (hi ? `<circle cx="${x(i)}" cy="${yl - 3}" r="8.5" fill="#ffd6de"/>` : '') +
        lab.map((t, k) => `<text x="${x(i)}" y="${yl + k * 9}" text-anchor="middle" font-size="${t.length > 3 ? 7 : 8.5}" fill="${hi ? '#e0476a' : '#8d7079'}" font-weight="${hi ? 700 : 400}">${t}</text>`).join('');
    }).join('');
    const bx1 = x(0) - cw / 2 + 2, bx2 = x(Math.min(6, ti)) + cw / 2 - 2, by = H - B + 36;
    const br = `<path d="M${bx1} ${by - 4}v4h${bx2 - bx1}v-4" fill="none" stroke="#f0607a" stroke-width="1"/><text x="${(bx1 + bx2) / 2}" y="${by + 9}" text-anchor="middle" font-size="10" fill="#f0607a">♥</text>` +
      `<text x="${(bx1 + bx2) / 2}" y="${by + 20}" text-anchor="middle" font-size="7.5" fill="#e0476a">ช่วงเริ่มต้น</text><text x="${(bx1 + bx2) / 2}" y="${by + 29}" text-anchor="middle" font-size="7.5" fill="#e0476a">กระตุ้นรับบริการฟื้นฟูหลังคลอด</text>`;
    const empty = pts.length ? '' : `<text x="${(L + W) / 2}" y="${T + (H - T - B) / 2}" text-anchor="middle" font-size="10" fill="#8d7079">ยังไม่มีผลประเมิน</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟระดับความเสี่ยงตามวันหลังคลอด">${bg}${grid}${line}${dots}${empty}${xl}${br}</svg>`;
  }
  const LV = { green: ['🟢', 'ปกติ'], yellow: ['🟡', 'ควรติดตาม'], orange: ['🟠', 'เสี่ยง'], red: ['🔴', 'ฉุกเฉิน'] };
  async function loadHistory() {
    history = await api('GET', '/api/patient/assessments');
    $$('[data-chart]').forEach(el => el.innerHTML = chartSVG(el.dataset.chart === 'wide'));
    $('#histlist').innerHTML = history.length ? [...history].reverse().map(h => `<div class="hist"><span>${LV[h.level][0]}</span><b>${h.level === 'green' ? 'ปกติ' : esc(h.reasons[0] || LV[h.level][1])}</b><small>วัน ${h.day}</small></div>`).join('') : '<p class="muted">ยังไม่มีประวัติ — ไปที่ “ติดตามและประเมินอาการ”</p>';
  }

  // ---------- Knowledge ----------
  function renderKnowledge() {
    if (kb.herbs.length) herbs.DB = kb.herbs; else herbs.DB = herbs.BUILTIN;
    $('#herblist').innerHTML = herbs.DB.map(h => `<option value="${esc(h.name)}">`).join('');
    const V = { true: ['✅', 'เชื่อได้', 'b-green'], false: ['⛔', 'เชื่อไม่ได้', 'b-red'], unclear: ['⚠️', 'ไม่แน่ชัด', 'b-yellow'] };
    $('#mythlist').innerHTML = kb.myths.map(m => `<details class="card kbi"><summary><b>${esc(m.title)}</b> <span class="badge ${V[m.verdict][2]}">${V[m.verdict][0]} ${V[m.verdict][1]}</span></summary><p>${esc(m.body)}</p></details>`).join('');
    $('#liblist').innerHTML = kb.library.map(l => `<details class="card kbi"><summary><b>${esc(l.title)}</b>${l.category ? ` <span class="muted">${esc(l.category)}</span>` : ''}</summary><p>${esc(l.body)}</p></details>`).join('');
    for (const [id, n] of [['tile-myths', kb.myths.length], ['tile-library', kb.library.length]]) {
      const t = $('#' + id); t.classList.toggle('soon', !n); const em = $('em', t); if (em) em.hidden = !!n;
    }
  }

  // ---------- Profile ----------
  const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { dateStyle: 'long' });
  function renderProfile() {
    $('#b-hn').textContent = me.hn; $('#b-name').textContent = me.name; $('#b-date').textContent = fmtDate(me.deliveryDate);
    $('#b-days').textContent = me.days < 0 ? `ก่อนคลอด (อีก ${-me.days} วัน)` : `D${me.days}` + (me.days === 0 ? ' (วันคลอด)' : ''); $('#b-mode').textContent = me.deliveryMode === 'cesarean' ? 'ผ่าตัดคลอด' : 'คลอดทางช่องคลอด';
    $('#b-age').textContent = me.age != null ? me.age + ' ปี' : '-'; $('#b-ga').textContent = me.gestationalWeeks != null ? me.gestationalWeeks + ' สัปดาห์' : '-'; $('#b-cov').textContent = me.coverage || '-';
    const dl = me.days < 0 ? `ก่อนคลอดอีก ${-me.days} วัน` : `D${me.days}`;
    $('#me-name').textContent = me.name; $('#me-sub').textContent = `HN ${me.hn} · ${dl} · ${me.deliveryMode === 'cesarean' ? 'ผ่าตัดคลอด' : 'ทางช่องคลอด'}`;
    const chip = $('#dchip'); chip.hidden = false; chip.textContent = me.days < 0 ? `ก่อนคลอดอีก ${-me.days} วัน` : me.days === 0 ? 'วันนี้คือวันคลอด (D0)' : `วันนี้ D${me.days} หลังคลอด`;
    form.elements.delivery.value = me.deliveryMode;
  }

  // ---------- Mic (Web Speech, เมื่อเบราว์เซอร์รองรับ) ----------
  $('#mic').addEventListener('click', () => {
    location.hash = 'chat';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { $('#chatin').focus(); return; }
    const rec = new SR(); rec.lang = 'th-TH'; rec.interimResults = false;
    const mic = $('#mic'); mic.classList.add('live');
    rec.onresult = ev => { $('#chatin').value = ev.results[0][0].transcript; $('#chatform').requestSubmit(); };
    rec.onend = rec.onerror = () => mic.classList.remove('live');
    try { rec.start(); } catch (_) { mic.classList.remove('live'); }
  });
  const mascot = $('#mascot');
  mascot.addEventListener('click', e => { if (!e.target.closest('#mic')) location.hash = 'chat'; });
  mascot.addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = 'chat'; });

  // ---------- Boot ----------
  async function startApp() {
    me = await api('GET', '/api/patient/me');
    [kb] = await Promise.all([api('GET', '/api/patient/knowledge'), loadHistory().catch(() => {})]);
    places = await api('GET', '/api/patient/places').catch(() => []);
    login.hidden = true; $('#bottom').hidden = false;
    renderProfile(); renderKnowledge(); resetChat(); await loadHistory(); buildDayOptions(); loadDay(); await loadNotifs();
    show(location.hash.slice(1)); showPopup();
  }
  api('GET', '/api/patient/me').then(startApp, () => showLogin());
})();
