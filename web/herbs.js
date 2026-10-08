/* AI Herbal Safety Checker — ฐานข้อมูลตัวอย่างเพื่อสาธิตเท่านั้น (ยังไม่ผ่านการตรวจสอบโดยผู้เชี่ยวชาญ)
 * ตัดสินด้วยกฎจากฐานข้อมูล ไม่ใช้ Generative AI ตัดสินความปลอดภัย
 * ไม่พบในฐานข้อมูล → "ควรปรึกษาบุคลากร" เสมอ (fail-safe) */
(function (root) {
  const DB = [
    { name: 'ขิง', aliases: ['ginger', 'น้ำขิง', 'ขิงผง'], baseline: 'ok', note: 'ปริมาณระดับอาหาร',
      consultIf: { anticoag: 'ใช้ยาต้านการแข็งตัวของเลือด', hxPPH: 'มีประวัติตกเลือด (ถ้าใช้ในรูปสกัด/ขนาดสูง)' } },
    { name: 'ขมิ้นชัน', aliases: ['turmeric', 'curcumin', 'ขมิ้น'], baseline: 'ok', note: 'ระดับอาหาร; แคปซูลสกัดควรปรึกษา',
      consultIf: { anticoag: 'ใช้ยาต้านการแข็งตัวของเลือด', hxPPH: 'มีประวัติตกเลือด', bleeding: 'มีเลือดออกผิดปกติ' } },
    { name: 'หัวปลี', aliases: ['banana blossom'], baseline: 'ok', note: 'อาหารพื้นบ้านเพิ่มน้ำนม (หลักฐานจำกัด)', consultIf: {} },
    { name: 'ใบแมงลัก', aliases: ['แมงลัก', 'hairy basil'], baseline: 'ok', note: 'ระดับอาหาร', consultIf: {} },
    { name: 'กระเทียม', aliases: ['garlic'], baseline: 'ok', note: 'ระดับอาหาร; อาหารเสริมสกัดควรปรึกษา',
      consultIf: { anticoag: 'ใช้ยาต้านการแข็งตัวของเลือด' } },
    { name: 'ฟ้าทะลายโจร', aliases: ['andrographis'], baseline: 'consult', note: 'ข้อมูลความปลอดภัยในมารดาให้นมบุตรจำกัด', consultIf: {} },
    { name: 'ว่านชักมดลูก', aliases: ['kaempferia'], baseline: 'consult', note: 'ตำรับพื้นบ้านหลังคลอด',
      avoidIf: { hxPPH: 'มีประวัติตกเลือดหลังคลอด', bleeding: 'มีเลือดออกผิดปกติ' } },
    { name: 'ยาขับน้ำคาวปลา', aliases: ['ตำรับขับน้ำคาวปลา', 'ยาหลังคลอด', 'ยาขับเลือด'], baseline: 'consult', note: 'ตำรับยาหลังคลอด ต้องตรวจส่วนประกอบรายผลิตภัณฑ์',
      avoidIf: { hxPPH: 'ข้อห้ามใช้ในผู้มีภาวะตกเลือดหลังคลอด', bleeding: 'มีเลือดออกผิดปกติ' } },
    { name: 'ชะเอมเทศ', aliases: ['licorice', 'ชะเอม'], baseline: 'consult', note: 'อาจทำให้ความดันสูงขึ้นเมื่อใช้ปริมาณมาก/ต่อเนื่อง',
      avoidIf: { htn: 'ความดันโลหิตสูง' } },
  ];

  function norm(s) { return String(s || '').trim().toLowerCase(); }
  function find(q) {
    const n = norm(q);
    if (!n) return null;
    return api.DB.find(h => [h.name, ...h.aliases].some(k => n.includes(norm(k)) || norm(k).includes(n))) || null;
  }

  // profile: {breastfeeding, hxPPH, bleeding, htn, anticoag}
  function check(query, profile) {
    const p = profile || {};
    const herb = find(query);
    if (!herb) return { verdict: 'consult', th: 'ควรปรึกษาบุคลากร', herb: null,
      reasons: ['ไม่พบในฐานข้อมูลที่ผ่านการตรวจสอบ — ไม่สามารถยืนยันความปลอดภัยได้'] };

    const avoid = Object.entries(herb.avoidIf || {}).filter(([k]) => p[k]).map(([, v]) => v);
    if (avoid.length) return { verdict: 'avoid', th: 'ไม่ควรใช้', herb, reasons: avoid };

    const consult = Object.entries(herb.consultIf || {}).filter(([k]) => p[k]).map(([, v]) => v);
    if (p.breastfeeding && herb.baseline === 'consult') consult.push('อยู่ระหว่างให้นมบุตร');
    if (herb.baseline === 'consult' && !consult.length) consult.push(herb.note);
    if (consult.length) return { verdict: 'consult', th: 'ควรปรึกษาบุคลากร', herb, reasons: consult };

    return { verdict: 'ok', th: 'ใช้ได้ (ตามข้อมูลที่มี)', herb, reasons: [herb.note] };
  }

  const api = { DB, BUILTIN: DB, check };
  root.PNC = Object.assign(root.PNC || {}, { herbs: api });
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
