/* Thai Traditional Medicine Clinical Decision Support (prototype)
 * - ไม่อนุมัติหัตถการอัตโนมัติ: ทุกข้อเป็นเพียง "ข้อเสนอให้พิจารณา" ต้องยืนยันโดยแพทย์แผนไทย/บุคลากรผู้มีอำนาจ
 * - ค่าใน WINDOWS เป็น placeholder เพื่อสาธิต ให้สถานบริการกำหนดตามแนวทาง ทปษ. ฉบับล่าสุด */
(function (root) {
  const WINDOWS = {
    // วันหลังคลอด (D) ที่เริ่มพิจารณาหัตถการฟื้นฟู — ตามเกณฑ์ของโครงการ: คลอดปกติ D7, ผ่าคลอด D30
    // (ผู้ให้บริการควรทบทวนร่วมกับแนวทาง ทปษ. ฉบับล่าสุด)
    vaginal:  { massage: 7, saltPot: 7, steam: 7 },
    cesarean: { massage: 30, saltPot: 30, steam: 30 },
  };

  function recommend(a, risk) {
    const days = Number(a.days);
    const mode = a.delivery === 'cesarean' ? 'cesarean' : 'vaginal';
    const win = WINDOWS[mode];
    const temp = a.tempC === '' || a.tempC == null ? null : Number(a.tempC);
    const sys = a.sys === '' || a.sys == null ? null : Number(a.sys);
    const dia = a.dia === '' || a.dia == null ? null : Number(a.dia);

    if (risk.level === 'red')
      return { gate: 'blocked', message: 'งดแนะนำหัตถการแพทย์แผนไทยทั้งหมด — ส่งต่อประเมินฉุกเฉินก่อน', items: [] };
    if (risk.level === 'orange' && !risk.ttmOnly)
      return { gate: 'review', message: 'ให้บุคลากรประเมินก่อน ยังไม่พิจารณาหัตถการ', items: [] };

    const heatBlockers = [];
    if (temp != null && temp >= 37.8) heatBlockers.push('มีไข้/อุณหภูมิสูง');
    if (a.bleeding && a.bleeding !== 'normal') heatBlockers.push('เลือดออกผิดปกติ');
    if (a.hxPPH) heatBlockers.push('มีประวัติตกเลือดหลังคลอด');
    if (sys != null && dia != null && (sys >= 140 || dia >= 90)) heatBlockers.push('ความดันโลหิตสูง');
    if (a.woundProblem) heatBlockers.push('แผลผิดปกติ');
    if (a.breastRed) heatBlockers.push('เต้านมอักเสบ');

    const items = [];
    const woundNote = mode === 'cesarean' ? 'ผ่าตัดคลอด: ต้องตรวจประเมินแผลผ่าตัดก่อนเสมอ' : null;
    const procedure = (id, name, key, relevant, note) => {
      const blockers = heatBlockers;
      if (!relevant) return;
      if (blockers.length) return items.push({ id, name, status: 'avoid', why: blockers.map(b => 'ข้อห้าม/ข้อควรระวัง: ' + b) });
      if (!(days >= win[key])) return items.push({ id, name, status: 'defer', why: [`ยังไม่ถึงช่วงที่พิจารณา (${mode === 'cesarean' ? 'ผ่าตัดคลอด' : 'คลอดทางช่องคลอด'} เริ่ม D${win[key]})`] });
      items.push({ id, name, status: 'consider', why: ['ไม่พบข้อห้ามจากข้อมูลที่มี — รอแพทย์แผนไทยตรวจประเมินก่อนทำหัตถการ', ...(note ? [note] : [])] });
    };

    const hasPain = Number(a.pain) >= 1;
    procedure('massage', 'นวด/ประคบสมุนไพร (บรรเทาปวดเมื่อยกล้ามเนื้อ)', 'massage', hasPain);
    procedure('saltpot', 'ทับหม้อเกลือ', 'saltPot', true, woundNote);
    procedure('steam', 'อบไอน้ำสมุนไพร', 'steam', true, woundNote);

    if (a.milk === 'low' || a.milk === 'none')
      items.push({ id: 'food', name: 'อาหาร/เครื่องดื่มสมุนไพรเพิ่มน้ำนม (เช่น หัวปลี แกงเลียง ใบแมงลัก)', status: 'consider',
        why: ['ตรวจรายการยา/สมุนไพรที่ใช้ร่วมด้วย Herbal Safety Checker', 'หลักฐานเรื่องสมุนไพรกระตุ้นน้ำนมยังจำกัด — อย่าอ้างผลเกินหลักฐาน', 'ประเมินการดูดนม/ท่าอุ้มโดยผู้เชี่ยวชาญด้านนมแม่ควบคู่'] });
    if (a.engorgement && !a.breastRed)
      items.push({ id: 'breast', name: 'คัดตึงเต้านม: คำแนะนำการบีบ/ให้นมถี่ขึ้น + ประเมินโดยผู้เชี่ยวชาญ', status: 'consider',
        why: ['หากเต้านมแดง ร้อน มีไข้ → หยุดและติดต่อบุคลากร'] });

    return { gate: 'open', message: 'ข้อเสนอเพื่อประกอบการตัดสินใจ — ต้องได้รับการยืนยันจากบุคลากรก่อนดำเนินการ', items };
  }

  const api = { WINDOWS, recommend };
  root.PNC = Object.assign(root.PNC || {}, { ttm: api });
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
