Admin.boot('admin1', 'ผู้ดูแลระบบ (admin1) — เข้าสู่ระบบ', async ({ root, user, logout, changePassword, api, esc, flash }) => {
  const FLAGS = { breastfeeding: 'ให้นมบุตร', hxPPH: 'เคยตกเลือดหลังคลอด', bleeding: 'เลือดออกผิดปกติ', htn: 'ความดันสูง', anticoag: 'ใช้ยาต้านการแข็งตัวของเลือด' };
  const TABS = [['patients', 'คนไข้'], ['ai', 'ตั้งค่า AI'], ['content', 'เนื้อหา'], ['connect', 'เชื่อมต่อ API'], ['account', 'บัญชี']];
  root.innerHTML = `<header class="top"><h1>หมอท้อง · ผู้ดูแลระบบ</h1><span class="sp"></span><span>${esc(user.username)}</span><button class="btn alt sm" id="out">ออก</button></header>
    <main><nav class="tabs">${TABS.map(([k, t], i) => `<button data-t="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</nav><div id="view"></div></main>`;
  const $ = (s, r = document) => r.querySelector(s);
  $('#out').onclick = logout;
  const views = { patients, ai, content, connect, account };
  document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('nav.tabs button').forEach(x => x.classList.toggle('on', x === b)); views[b.dataset.t](); });

  // ---------- คนไข้ ----------
  async function patients(editing) {
    const list = await api('GET', '/api/admin/patients');
    const e = editing || {};
    $('#view').innerHTML = `<div class="card"><h2>${e.id ? 'แก้ไขคนไข้ HN ' + esc(e.hn) : 'เพิ่มคนไข้'}</h2>
      <form id="pf"><div class="grid">
        <label>HN<input name="hn" value="${esc(e.hn)}" required maxlength="20"></label>
        <label>ชื่อ-นามสกุล<input name="name" value="${esc(e.name)}" required></label>
        <label>วันที่คลอด (D0)<input name="deliveryDate" type="date" value="${esc(e.deliveryDate)}" required></label>
        <label>ลักษณะการคลอด<select name="deliveryMode"><option value="vaginal" ${e.deliveryMode === 'vaginal' ? 'selected' : ''}>คลอดทางช่องคลอด</option><option value="cesarean" ${e.deliveryMode === 'cesarean' ? 'selected' : ''}>ผ่าตัดคลอด</option></select></label>
        <label>อายุ (ปี)<input name="age" type="number" min="10" max="60" value="${esc(e.age)}"></label>
        <label>อายุครรภ์ (สัปดาห์)<input name="gestationalWeeks" type="number" min="20" max="45" value="${esc(e.gestationalWeeks)}"></label>
        <label>สิทธิ์การรักษา<select name="coverage"><option value="">—</option>${['เบิกได้', 'ประกันสังคม', 'บัตรทอง', 'ชำระเงินเอง', 'อื่นๆ'].map(c => `<option ${e.coverage === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>เบอร์โทรศัพท์ (ใช้เข้าระบบแทน HN ได้)<input name="phone" value="${esc(e.phone)}" inputmode="tel" maxlength="20" placeholder="08x-xxx-xxxx"></label>
        <label>LINE userId (ถ้ามี)<input name="lineUserId" value="${esc(e.lineUserId)}" maxlength="60" placeholder="Uxxxxxxxx..."></label>
      </div>
      <div class="card" style="background:#fffafb"><h3 style="margin-top:0">ใบหน้า (ใช้ยืนยันตัวตนตอนคนไข้เข้าระบบ)</h3>
        <div class="row"><button type="button" class="btn alt" id="cam">เปิดกล้องสแกนสด (กะพริบตา 1 ครั้ง)</button><span class="muted">หรือ</span><input type="file" name="face" accept="image/*" style="max-width:260px"></div>
        <div id="camwrap" style="margin-top:10px"></div><div class="row">${e.id && e.hasFace ? `<img class="photo" src="/api/admin/patients/${e.id}/photo?${Date.now()}" alt="">` : ''}<img class="photo" id="prev" hidden alt=""><span id="fs" class="muted">${e.id ? (e.hasFace ? 'มีข้อมูลใบหน้าแล้ว — สแกนใหม่เพื่อแทนที่' : 'ยังไม่ลงทะเบียนใบหน้า (คนไข้จะเข้าระบบไม่ได้)') : ''}</span></div></div>
      <div class="row" style="margin-top:10px"><button class="btn">${e.id ? 'บันทึกการแก้ไข' : 'เพิ่มคนไข้'}</button>${e.id ? '<button type="button" class="btn alt" id="cancel">ยกเลิก</button>' : ''}</div><div id="m"></div></form></div>
      <div class="card"><div class="row"><h2 style="flex:1;margin:0">รายชื่อคนไข้ (${list.length})</h2><button class="btn alt sm" id="seed">โหลดข้อมูลตัวอย่าง mockup 10 ราย</button></div><div style="overflow-x:auto"><table><tr><th>HN</th><th>ชื่อ</th><th>อายุ/ครรภ์</th><th>สิทธิ์</th><th>วันคลอด</th><th>การคลอด</th><th>ใบหน้า</th><th>LINE</th><th></th></tr>
      ${list.map(p => `<tr><td>${esc(p.hn)}</td><td>${esc(p.name)}<br><span class="muted">${esc(p.phone)}</span></td><td>${p.age ?? '-'} ปี / ${p.gestationalWeeks ?? '-'} สป.</td><td>${esc(p.coverage || '-')}</td><td>${esc(p.deliveryDate)}</td><td>${p.deliveryMode === 'cesarean' ? 'ผ่าตัด' : 'ช่องคลอด'}</td><td>${p.hasFace ? '✓' : '<span class="err">ยังไม่มี</span>'}</td><td>${p.lineUserId ? '✓' : '-'}</td>
      <td><button class="btn alt sm" data-e="${p.id}">แก้ไข</button> <button class="btn danger sm" data-d="${p.id}">ลบ</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">ยังไม่มีคนไข้</td></tr>'}</table></div></div>`;
    let scanned = null;
    const f = $('#pf');
    let sc = null;
    const gotFace = (r) => { scanned = r; $('#prev').src = r.photo; $('#prev').hidden = false; const st = $('#fs'); st.textContent = '✓ ตรวจพบใบหน้า 1 ใบหน้า'; st.className = 'ok'; };
    $('#cam').onclick = async () => {
      if (sc) sc.cancel(); scanned = null; $('#prev').hidden = true; f.face.value = '';
      sc = PNCFace.liveScan($('#camwrap'), { liveness: true });
      try { gotFace(await sc.promise); $('#camwrap').innerHTML = ''; } catch (er) { const st = $('#fs'); st.textContent = er.message; st.className = 'err'; }
    };
    f.face.onchange = async () => {
      if (sc) { sc.cancel(); sc = null; $('#camwrap').innerHTML = ''; }
      scanned = null; $('#prev').hidden = true; const st = $('#fs'); st.textContent = 'กำลังตรวจจับใบหน้า...'; st.className = 'muted';
      try { gotFace(await PNCFace.scan(f.face.files[0])); }
      catch (er) { st.textContent = er.message; st.className = 'err'; f.face.value = ''; }
    };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const body = { hn: f.hn.value.trim(), name: f.name.value.trim(), deliveryDate: f.deliveryDate.value, deliveryMode: f.deliveryMode.value, lineUserId: f.lineUserId.value.trim(), phone: f.phone.value.trim(), age: f.age.value === '' ? null : Number(f.age.value), gestationalWeeks: f.gestationalWeeks.value === '' ? null : Number(f.gestationalWeeks), coverage: f.coverage.value };
      if (scanned) { body.descriptor = scanned.descriptor; body.photo = scanned.photo; }
      try { await api(e.id ? 'PUT' : 'POST', e.id ? `/api/admin/patients/${e.id}` : '/api/admin/patients', body); await patients(); flash($('#m'), 'บันทึกแล้ว'); }
      catch (er) { flash($('#m'), er.message, false); }
    };
    $('#seed').onclick = async () => { const r = await api('POST', '/api/admin/seed-mock', {}); await patients(); flash($('#m'), `เพิ่มข้อมูลตัวอย่าง ${r.added} ราย`); };
    if ($('#cancel')) $('#cancel').onclick = () => patients();
    document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { patients(list.find(p => p.id === b.dataset.e)); scrollTo(0, 0); });
    document.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { if (confirm('ลบคนไข้รายนี้และประวัติการประเมินทั้งหมด?')) { await api('DELETE', `/api/admin/patients/${b.dataset.d}`); patients(); } });
  }

  // ---------- ตั้งค่า AI ----------
  async function ai() {
    const s = await api('GET', '/api/admin/settings');
    $('#view').innerHTML = `<div class="card"><h2>OpenRouter / AI ถามตอบ</h2><form id="af">
      <label>OpenRouter API token ${s.openrouter.hasKey ? '<span class="ok">(ตั้งค่าแล้ว — กรอกใหม่เพื่อเปลี่ยน)</span>' : ''}<input name="key" type="password" autocomplete="off" placeholder="sk-or-..."></label>
      <div class="grid"><label>โมเดล<input name="model" value="${esc(s.openrouter.model)}" placeholder="เช่น openai/gpt-4o-mini"></label>
      <label>เปิดใช้งาน AI ถามตอบ<select name="enabled"><option value="0">ปิด</option><option value="1" ${s.openrouter.enabled ? 'selected' : ''}>เปิด</option></select></label></div>
      <label>คำสั่งเพิ่มเติมให้ AI (system prompt)<textarea name="prompt" maxlength="4000">${esc(s.openrouter.systemPrompt)}</textarea></label>
      <p class="muted">ระบบเพิ่มกฎความปลอดภัยให้เสมอ (ห้ามวินิจฉัย/สั่งยา, ส่งต่อเมื่อพบสัญญาณอันตราย) และคำถามที่มี red flag จะไม่ถูกส่งไปที่ AI AI จะได้รับเฉพาะ จำนวนวันหลังคลอด ลักษณะการคลอด ระดับความเสี่ยง และฐานความรู้ ไม่ได้รับชื่อหรือ HN</p>
      <div class="row">${s.openrouter.hasKey ? '<button type="button" class="btn alt" id="ck">ลบ token</button>' : ''}</div>
      <h3>สแกนหน้า / โหมดสาธิต</h3>
      <label>โหมดสาธิต (mockup)<select name="mock"><option value="1" ${s.face.mockPass ? 'selected' : ''}>เปิด — สแกนหน้าผ่านทุกคน (ผ่านขั้น HN/เบอร์ + ชื่อแล้วเข้าได้)</option><option value="0" ${s.face.mockPass ? '' : 'selected'}>ปิด — เทียบใบหน้าจริง (ต้องลงทะเบียนใบหน้าก่อน)</option></select></label>
      ${s.face.mockPass ? '<div class="msg err">โหมดสาธิตเปิดอยู่: ใครรู้ HN/เบอร์โทร + ชื่อก็เข้าได้ ใช้กับข้อมูลสมมติเท่านั้น ห้ามใช้กับคนไข้จริง</div>' : ''}
      <h3>วันที่ของระบบ (สำหรับสาธิต)</h3>
      <label>วันที่สมมติ — เว้นว่าง = ใช้วันที่จริง (วันนี้ ${esc(s.demo.realToday)}) ใช้ทดสอบการนับ D และแจ้งเตือน D7/D30<input name="demo" type="date" value="${esc(s.demo.today)}"></label>
      <h3>ยืนยันใบหน้า (เมื่อปิดโหมดสาธิต)</h3><label>ความเข้มงวด (0.30–0.60 ยิ่งต่ำยิ่งเข้มงวด, ค่าแนะนำ 0.50)<input name="th" type="number" step="0.01" min="0.3" max="0.6" value="${s.face.threshold}"></label>
      <button class="btn">บันทึก</button><div id="m"></div></form></div>`;
    const f = $('#af');
    f.onsubmit = async (ev) => { ev.preventDefault(); try { await api('PUT', '/api/admin/settings', { openrouter: { apiKey: f.key.value, model: f.model.value.trim(), enabled: f.enabled.value === '1', systemPrompt: f.prompt.value }, face: { threshold: Number(f.th.value), mockPass: f.mock.value === '1' }, demo: { today: f.demo.value } }); await ai(); flash($('#m'), 'บันทึกแล้ว'); } catch (er) { flash($('#m'), er.message, false); } };
    if ($('#ck')) $('#ck').onclick = async () => { await api('PUT', '/api/admin/settings', { openrouter: { clearKey: true, enabled: false } }); ai(); };
  }

  // ---------- เนื้อหา ----------
  async function content() {
    const kb = await api('GET', '/api/admin/knowledge');
    const VERD = { true: 'เชื่อได้', false: 'เชื่อไม่ได้', unclear: 'ไม่แน่ชัด' };
    const sec = (kind, title, rows, form) => `<div class="card"><h2>${title} (${kb[kind].length})</h2><div style="overflow-x:auto"><table>${kb[kind].map(rows).join('') || '<tr><td class="muted">ยังไม่มีข้อมูล</td></tr>'}</table></div><h3>เพิ่ม</h3>${form}</div>`;
    const flagRows = (id) => Object.entries(FLAGS).map(([k, t]) => `<tr><td>${t}</td><td><select name="${id}-${k}"><option value="">—</option><option value="consult">ควรปรึกษา</option><option value="avoid">ไม่ควรใช้</option></select></td><td><input name="${id}-${k}-r" placeholder="เหตุผล"></td></tr>`).join('');
    $('#view').innerHTML =
      sec('herbs', 'สมุนไพร (ใช้ตรวจความปลอดภัย)', h => `<tr><td><b>${esc(h.name)}</b><br><span class="muted">${esc(h.note)}</span></td><td>${h.baseline === 'ok' ? 'ใช้ได้เบื้องต้น' : 'ควรปรึกษา'}</td><td class="muted">ปรึกษา: ${esc(Object.keys(h.consultIf).map(k => FLAGS[k]).join(', ') || '-')}<br>ห้าม: ${esc(Object.keys(h.avoidIf).map(k => FLAGS[k]).join(', ') || '-')}</td><td><button class="btn danger sm" data-del="herbs/${h.id}">ลบ</button></td></tr>`,
        `<form data-kind="herbs"><div class="grid"><label>ชื่อ<input name="name" required></label><label>ชื่ออื่น (คั่นด้วย ,)<input name="aliases"></label><label>ค่าเริ่มต้น<select name="baseline"><option value="ok">ใช้ได้ (ระดับอาหาร)</option><option value="consult">ควรปรึกษา</option></select></label></div>
        <label>หมายเหตุ<input name="note" maxlength="300"></label><table>${flagRows('f')}</table><button class="btn" style="margin-top:8px">เพิ่มสมุนไพร</button></form>`) +
      sec('myths', 'โบราณเชื่อได้ไหม', m => `<tr><td><b>${esc(m.title)}</b><br><span class="muted">${esc(m.body.slice(0, 120))}</span></td><td>${VERD[m.verdict]}</td><td><button class="btn danger sm" data-del="myths/${m.id}">ลบ</button></td></tr>`,
        `<form data-kind="myths"><div class="grid"><label>เรื่อง/ความเชื่อ<input name="title" required></label><label>สรุป<select name="verdict"><option value="true">เชื่อได้</option><option value="false">เชื่อไม่ได้</option><option value="unclear">ไม่แน่ชัด</option></select></label></div><label>คำอธิบาย + หลักฐานอ้างอิง<textarea name="body" maxlength="2000"></textarea></label><button class="btn">เพิ่ม</button></form>`) +
      sec('library', 'คลังความรู้การผดุงครรภ์', l => `<tr><td><b>${esc(l.title)}</b><br><span class="muted">${esc(l.body.slice(0, 120))}</span></td><td>${esc(l.category)}</td><td><button class="btn danger sm" data-del="library/${l.id}">ลบ</button></td></tr>`,
        `<form data-kind="library"><div class="grid"><label>หัวข้อ<input name="title" required></label><label>หมวด<input name="category" maxlength="40"></label></div><label>เนื้อหา<textarea name="body" maxlength="4000"></textarea></label><button class="btn">เพิ่ม</button></form>`) +
      '<div id="m"></div>';
    document.querySelectorAll('form[data-kind]').forEach(f => f.onsubmit = async (ev) => {
      ev.preventDefault(); const kind = f.dataset.kind, v = Object.fromEntries(new FormData(f));
      let body = v;
      if (kind === 'herbs') {
        body = { name: v.name, aliases: (v.aliases || '').split(',').map(s => s.trim()).filter(Boolean), baseline: v.baseline, note: v.note, consultIf: {}, avoidIf: {} };
        for (const k of Object.keys(FLAGS)) { const t = v['f-' + k]; if (t === 'consult') body.consultIf[k] = v['f-' + k + '-r'] || FLAGS[k]; if (t === 'avoid') body.avoidIf[k] = v['f-' + k + '-r'] || FLAGS[k]; }
      }
      try { await api('POST', `/api/admin/knowledge/${kind}`, body); await content(); } catch (er) { flash($('#m'), er.message, false); }
    });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('ลบรายการนี้?')) { await api('DELETE', `/api/admin/knowledge/${b.dataset.del}`); content(); } });
  }

  // ---------- เชื่อมต่อ API ----------
  async function connect() {
    const s = await api('GET', '/api/admin/settings');
    $('#view').innerHTML = `<div class="card"><h2>API ดึงข้อมูลคนไข้ (HIS/EMR)</h2><form id="hf">
      <label>URL (GET → JSON)<input name="url" value="${esc(s.his.url)}" placeholder="https://his.example.go.th/api/postpartum"></label>
      <label>Bearer token ${s.his.hasToken ? '<span class="ok">(ตั้งค่าแล้ว — กรอกใหม่เพื่อเปลี่ยน)</span>' : ''}<input name="token" type="password" autocomplete="off"></label>
      <p class="muted">รูปแบบที่รองรับ: <code>[{"hn","name","deliveryDate":"YYYY-MM-DD","deliveryMode":"vaginal|cesarean","lineUserId"?}]</code> หรือ <code>{"patients":[...]}</code> — นำเข้าแล้วต้องลงทะเบียนใบหน้าในแท็บคนไข้ก่อนคนไข้จึงเข้าระบบได้</p>
      <div class="row"><button class="btn">บันทึก</button><button type="button" class="btn alt" id="t">ทดสอบการเชื่อมต่อ</button><button type="button" class="btn alt" id="i">ดึง/นำเข้าคนไข้</button></div><div id="m"></div></form></div>
      <div class="card"><h2>LINE Official Account</h2><form id="lf"><label>Channel access token ${s.line.hasToken ? '<span class="ok">(ตั้งค่าแล้ว)</span>' : '<span class="err">(ยังไม่ได้ตั้งค่า — เจ้าหน้าที่จะส่งข้อความไม่ได้)</span>'}<input name="token" type="password" autocomplete="off"></label>
      <p class="muted">ใช้ Messaging API push message · คนไข้ต้องมี LINE userId ในข้อมูลคนไข้</p><button class="btn">บันทึก</button><div id="lm"></div></form></div>`;
    const h = $('#hf');
    h.onsubmit = async (ev) => { ev.preventDefault(); try { await api('PUT', '/api/admin/settings', { his: { url: h.url.value.trim(), token: h.token.value, enabled: true } }); await connect(); flash($('#m'), 'บันทึกแล้ว'); } catch (er) { flash($('#m'), er.message, false); } };
    $('#t').onclick = async () => { try { const r = await api('POST', '/api/admin/his/test', {}); flash($('#m'), `เชื่อมต่อสำเร็จ พบข้อมูล ${r.count} รายการ`); } catch (er) { flash($('#m'), er.message, false); } };
    $('#i').onclick = async () => { try { const r = await api('POST', '/api/admin/his/import', {}); flash($('#m'), `นำเข้าใหม่ ${r.created} · อัปเดต ${r.updated} · ข้าม ${r.skipped} — ${r.note}`); } catch (er) { flash($('#m'), er.message, false); } };
    const l = $('#lf');
    l.onsubmit = async (ev) => { ev.preventDefault(); try { await api('PUT', '/api/admin/settings', { line: { token: l.token.value } }); await connect(); flash($('#lm'), 'บันทึกแล้ว'); } catch (er) { flash($('#lm'), er.message, false); } };
  }

  // ---------- บัญชี ----------
  function account() {
    $('#view').innerHTML = `<div class="card"><h2>บัญชี</h2><div class="row"><button class="btn" id="cp">เปลี่ยนรหัสผ่าน admin1</button><button class="btn alt" id="r2">รีเซ็ตรหัสผ่าน admin2 เป็นค่าตั้งต้น</button></div><div id="m"></div></div>`;
    $('#cp').onclick = changePassword;
    $('#r2').onclick = async () => { if (confirm('รีเซ็ต admin2 เป็นรหัสตั้งต้น (ต้องเปลี่ยนใหม่เมื่อเข้าใช้)?')) { await api('POST', '/api/admin/users/admin2/reset', {}); flash($('#m'), 'รีเซ็ตแล้ว'); } };
  }
  patients();
});
