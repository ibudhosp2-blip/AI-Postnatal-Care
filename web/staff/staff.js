Admin.boot('staff', 'เจ้าหน้าที่ (admin2) — เข้าสู่ระบบ', async ({ root, user, logout, changePassword, api, esc, flash, badge, fmt }) => {
  const TEMPLATES = [
    ['ติดตามทั่วไป', 'สวัสดีค่ะ เจ้าหน้าที่จากหมอท้องขอติดตามอาการหลังคลอด วันนี้เป็นอย่างไรบ้างคะ? หากมีเลือดออกมาก ไข้ หรือปวดรุนแรง กรุณาติดต่อโรงพยาบาลทันที'],
    ['นัดประเมิน', 'สวัสดีค่ะ จากผลประเมินล่าสุด เจ้าหน้าที่ขอนัดประเมินอาการเพิ่มเติม กรุณาติดต่อกลับหรือเข้ารับบริการภายในวันนี้ค่ะ'],
    ['ให้กรอกแบบประเมิน', 'สวัสดีค่ะ กรุณาเข้าแอปหมอท้องเพื่อกรอกแบบประเมินอาการประจำวันค่ะ'],
  ];
  root.innerHTML = `<header class="top"><h1>หมอท้อง · เจ้าหน้าที่</h1><span class="sp"></span><span>${esc(user.name)} (${esc(user.username)})</span>
    <button class="btn alt sm" id="pw">เปลี่ยนรหัสผ่าน</button><button class="btn alt sm" id="out">ออก</button></header>
    <main><nav class="tabs"><button data-t="pt" class="on">ผู้ป่วย</button><button data-t="pl">สถานพยาบาล (แผนที่)</button></nav>
    <div id="v-pt"><div id="stats"></div><div class="card"><div class="row"><h2 style="margin:0;flex:1">ผู้ป่วยเรียงตามความเสี่ยง</h2><button class="btn alt sm" id="rf">รีเฟรช</button></div><div style="overflow-x:auto"><table id="tb"></table></div></div><div id="detail"></div></div>
    <div id="v-pl" hidden></div></main>`;
  document.getElementById('pw').onclick = changePassword; document.getElementById('out').onclick = logout;
  const $ = (s) => document.querySelector(s);
  document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('nav.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#v-pt').hidden = b.dataset.t !== 'pt'; $('#v-pl').hidden = b.dataset.t !== 'pl';
    if (b.dataset.t === 'pl') places();
  });

  async function load() {
    const d = await api('GET', '/api/staff/dashboard');
    const G = { red: 'ฉุกเฉิน ติดตามทันที', orange: 'เสี่ยง', yellow: 'ติดตาม', green: 'ปกติ', none: 'ยังไม่ประเมิน' };
    $('#stats').innerHTML = `<div class="stats">${['red', 'orange', 'yellow', 'green', 'none'].map(l => `<div class="stat b-${l}"><b>${d.counts[l]}</b>${G[l]}</div>`).join('')}</div>`;
    $('#tb').innerHTML = `<tr><th>ระดับ</th><th>HN</th><th>ชื่อ</th><th>D</th><th>สาเหตุหลัก</th><th>ค้างประเมิน</th><th>ประเมินล่าสุด</th></tr>` +
      (d.rows.map(r => `<tr class="clk" data-id="${r.id}"><td>${badge(r.level)}</td><td>${esc(r.hn)}</td><td>${esc(r.name)}</td><td>${r.days < 0 ? 'ก่อนคลอด' : 'D' + r.days}</td><td>${esc(r.reasons[0] || '-')}${r.referral === 'ttm' ? ' <span class="muted">(แพทย์แผนไทย)</span>' : ''}</td><td>${r.days >= 1 ? r.missed + ' วัน' : '-'}</td><td>${r.assessedAt ? fmt(r.assessedAt) : '-'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">ยังไม่มีผู้ป่วย</td></tr>');
    document.querySelectorAll('tr.clk').forEach(tr => tr.onclick = () => open(tr.dataset.id));
  }
  async function open(id) {
    const p = await api('GET', `/api/staff/patients/${id}`);
    $('#detail').innerHTML = `<div class="card"><h2>${esc(p.name)} · HN ${esc(p.hn)}</h2>
      <p class="muted">${p.days < 0 ? 'ก่อนคลอดอีก ' + (-p.days) + ' วัน' : 'D' + p.days} · คลอด${p.deliveryMode === 'cesarean' ? 'ผ่าตัด' : 'ทางช่องคลอด'} (${esc(p.deliveryDate)}) · อายุ ${p.age ?? '-'} ปี · ครรภ์ ${p.gestationalWeeks ?? '-'} สป. · สิทธิ์ ${esc(p.coverage || '-')} · LINE: ${p.hasLine ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม'}</p>
      <h3>ส่งข้อความทาง LINE OA</h3>
      <div class="row"><select id="tpl" style="max-width:260px"><option value="">— เลือกข้อความสำเร็จรูป —</option>${TEMPLATES.map((t, i) => `<option value="${i}">${esc(t[0])}</option>`).join('')}</select></div>
      <label style="margin-top:8px">ข้อความ<textarea id="txt" maxlength="1000"></textarea></label>
      <div class="row"><button class="btn" id="send" ${p.hasLine ? '' : 'disabled'}>ส่ง LINE</button><span id="sm"></span></div>
      <h3>ประวัติการประเมิน</h3><table><tr><th>บันทึกเมื่อ</th><th>ของวัน</th><th>ระดับ</th><th>เหตุผล</th></tr>${p.assessments.map(a => `<tr><td>${fmt(a.at)}${a.backfilled ? ' <span class="muted">(กรอกย้อนหลัง)</span>' : ''}</td><td>D${a.day}</td><td>${badge(a.level)}</td><td>${esc(a.reasons.join('; '))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">ยังไม่มี</td></tr>'}</table>
      <h3>ข้อความที่ส่งแล้ว</h3><table>${p.messages.map(m => `<tr><td>${fmt(m.at)}</td><td>${esc(m.by)}</td><td>${esc(m.text)}</td><td>${esc(m.status)}</td></tr>`).join('') || '<tr><td class="muted">ยังไม่มี</td></tr>'}</table></div>`;
    $('#tpl').onchange = (e) => { if (e.target.value !== '') $('#txt').value = TEMPLATES[e.target.value][1]; };
    $('#send').onclick = async () => {
      try { await api('POST', '/api/staff/line/send', { patientId: id, text: $('#txt').value }); flash($('#sm'), 'ส่งแล้ว'); open(id); }
      catch (e) { flash($('#sm'), e.message, false); }
    };
    $('#detail').scrollIntoView({ behavior: 'smooth' });
  }
  // ---------- สถานพยาบาล: ชื่อ เบอร์โทร ตำแหน่งจากแผนที่/GPS ----------
  const KIND = { hospital: ['🏥', 'โรงพยาบาล', '#d62b45'], ttm: ['🌿', 'คลินิกแพทย์แผนไทย', '#2e8b57'] };
  let map = null, pick = null, layer = null, editing = null, list = [];
  async function places() {
    list = await api('GET', '/api/staff/places');
    const e = editing || { kind: 'hospital' };
    $('#v-pl').innerHTML = `<div class="card"><h2>${e.id ? 'แก้ไขสถานพยาบาล' : 'เพิ่มสถานพยาบาล'}</h2>
      <p class="muted">คนไข้ที่ผลประเมินเป็นสีแดงจะเห็นโรงพยาบาล และสีส้ม (แพทย์แผนไทย) จะเห็นคลินิกแพทย์แผนไทย เรียงตามระยะทางจากตำแหน่งของเขา พร้อมปุ่มโทรและนำทาง</p>
      <form id="plf"><div class="grid">
        <label>ประเภท<select name="kind"><option value="hospital" ${e.kind === 'hospital' ? 'selected' : ''}>🏥 โรงพยาบาล</option><option value="ttm" ${e.kind === 'ttm' ? 'selected' : ''}>🌿 คลินิกแพทย์แผนไทย</option></select></label>
        <label>ชื่อ<input name="name" value="${esc(e.name)}" required maxlength="100"></label>
        <label>เบอร์โทร<input name="phone" value="${esc(e.phone)}" inputmode="tel" maxlength="25" placeholder="02-xxx-xxxx"></label>
        <label>ที่อยู่ (ถ้ามี)<input name="address" value="${esc(e.address)}" maxlength="200"></label>
        <label>หมายเหตุ เช่น เวลาทำการ<input name="note" value="${esc(e.note)}" maxlength="200"></label>
      </div>
      <h3>ตำแหน่งบนแผนที่ <span class="muted">(แตะแผนที่เพื่อปักหมุด หรือลากหมุดปรับตำแหน่ง)</span></h3>
      <div class="row"><button type="button" class="btn alt" id="gps">📍 ใช้ตำแหน่งปัจจุบันของฉัน (GPS)</button><span id="gpsm" class="muted"></span></div>
      <div id="map" style="height:340px;border-radius:14px;margin:10px 0;border:2px solid var(--gold-l);z-index:0"></div>
      <div class="grid"><label>ละติจูด (lat)<input name="lat" type="number" step="any" value="${e.lat ?? ''}" required></label><label>ลองจิจูด (lng)<input name="lng" type="number" step="any" value="${e.lng ?? ''}" required></label></div>
      <div class="row"><button class="btn">${e.id ? 'บันทึกการแก้ไข' : 'เพิ่มสถานพยาบาล'}</button>${e.id ? '<button type="button" class="btn alt" id="plcancel">ยกเลิก</button>' : ''}</div><div id="plm"></div></form></div>
      <div class="card"><h2>รายการ (${list.length})</h2><div style="overflow-x:auto"><table><tr><th>ประเภท</th><th>ชื่อ</th><th>เบอร์โทร</th><th>พิกัด</th><th></th></tr>
      ${list.map(p => `<tr><td>${KIND[p.kind][0]} ${KIND[p.kind][1]}</td><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.address)} ${esc(p.note)}</span></td><td>${esc(p.phone) || '-'}</td><td class="muted">${p.lat}, ${p.lng}</td>
      <td><button class="btn alt sm" data-v="${p.id}">ดูบนแผนที่</button> <button class="btn alt sm" data-e="${p.id}">แก้ไข</button> <button class="btn danger sm" data-d="${p.id}">ลบ</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">ยังไม่มีสถานพยาบาล — คนไข้จะเห็นปุ่มค้นหาใน Google Maps แทน</td></tr>'}</table></div></div>`;
    const f = $('#plf');
    if (map) { map.remove(); map = null; }
    map = L.map('map', { zoomControl: true }).setView(e.lat != null ? [e.lat, e.lng] : [13.7563, 100.5018], e.lat != null ? 15 : 6);
    L.Icon.Default.imagePath = '/vendor/leaflet/images/';
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    list.filter(p => p.id !== e.id).forEach(p => L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: KIND[p.kind][2], fillOpacity: 1 }).bindTooltip(p.name).addTo(layer));
    const setPoint = (lat, lng, pan) => {
      lat = Math.round(lat * 1e6) / 1e6; lng = Math.round(lng * 1e6) / 1e6; f.lat.value = lat; f.lng.value = lng;
      if (!pick) { pick = L.marker([lat, lng], { draggable: true }).addTo(map); pick.on('dragend', () => { const q = pick.getLatLng(); setPoint(q.lat, q.lng); }); } else pick.setLatLng([lat, lng]);
      if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 16));
    };
    pick = null; if (e.lat != null) setPoint(e.lat, e.lng);
    map.on('click', (ev) => setPoint(ev.latlng.lat, ev.latlng.lng));
    const typed = () => { const la = parseFloat(f.lat.value), ln = parseFloat(f.lng.value); if (Number.isFinite(la) && Number.isFinite(ln)) { setPoint(la, ln, true); } };
    f.lat.onchange = typed; f.lng.onchange = typed;
    $('#gps').onclick = () => {
      const m = $('#gpsm'); if (!navigator.geolocation) return flash(m, 'เบราว์เซอร์นี้ไม่รองรับ GPS (ต้องเปิดผ่าน https)', false);
      m.textContent = 'กำลังหาตำแหน่ง...';
      navigator.geolocation.getCurrentPosition(pos => { setPoint(pos.coords.latitude, pos.coords.longitude, true); m.textContent = `✓ ได้ตำแหน่งแล้ว (แม่นยำ ±${Math.round(pos.coords.accuracy)} ม.)`; },
        err => flash(m, err.code === 1 ? 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง' : 'หาตำแหน่งไม่สำเร็จ', false), { enableHighAccuracy: true, timeout: 12000 });
    };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const body = { kind: f.kind.value, name: f.name.value.trim(), phone: f.phone.value.trim(), address: f.address.value.trim(), note: f.note.value.trim(), lat: f.lat.value, lng: f.lng.value };
      try { await api(e.id ? 'PUT' : 'POST', e.id ? `/api/staff/places/${e.id}` : '/api/staff/places', body); editing = null; await places(); flash($('#plm'), 'บันทึกแล้ว'); }
      catch (er) { flash($('#plm'), er.message, false); }
    };
    if ($('#plcancel')) $('#plcancel').onclick = () => { editing = null; places(); };
    document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { editing = list.find(p => p.id === b.dataset.e); places(); scrollTo(0, 0); });
    document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { const p = list.find(x => x.id === b.dataset.v); map.setView([p.lat, p.lng], 16); $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    document.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { if (confirm('ลบสถานพยาบาลนี้?')) { await api('DELETE', `/api/staff/places/${b.dataset.d}`); editing = null; places(); } });
  }
  $('#rf').onclick = load; load();
});
