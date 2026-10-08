Admin.boot('staff', 'เจ้าหน้าที่ (admin2) — เข้าสู่ระบบ', async ({ root, user, logout, changePassword, api, esc, flash, badge, fmt }) => {
  const TEMPLATES = [
    ['ติดตามทั่วไป', 'สวัสดีค่ะ เจ้าหน้าที่จากหมอท้องขอติดตามอาการหลังคลอด วันนี้เป็นอย่างไรบ้างคะ? หากมีเลือดออกมาก ไข้ หรือปวดรุนแรง กรุณาติดต่อโรงพยาบาลทันที'],
    ['นัดประเมิน', 'สวัสดีค่ะ จากผลประเมินล่าสุด เจ้าหน้าที่ขอนัดประเมินอาการเพิ่มเติม กรุณาติดต่อกลับหรือเข้ารับบริการภายในวันนี้ค่ะ'],
    ['ให้กรอกแบบประเมิน', 'สวัสดีค่ะ กรุณาเข้าแอปหมอท้องเพื่อกรอกแบบประเมินอาการประจำวันค่ะ'],
  ];
  root.innerHTML = `<header class="top"><h1>หมอท้อง · เจ้าหน้าที่</h1><span class="sp"></span><span>${esc(user.name)} (${esc(user.username)})</span>
    <button class="btn alt sm" id="pw">เปลี่ยนรหัสผ่าน</button><button class="btn alt sm" id="out">ออก</button></header>
    <main><div id="stats"></div><div class="card"><div class="row"><h2 style="margin:0;flex:1">ผู้ป่วยเรียงตามความเสี่ยง</h2><button class="btn alt sm" id="rf">รีเฟรช</button></div><div style="overflow-x:auto"><table id="tb"></table></div></div><div id="detail"></div></main>`;
  document.getElementById('pw').onclick = changePassword; document.getElementById('out').onclick = logout;
  const $ = (s) => document.querySelector(s);

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
  $('#rf').onclick = load; load();
});
