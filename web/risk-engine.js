/* หมอท้อง ; AI Thai Postnatal Care — Rule-based Risk Engine (Phase 2 prototype)
 * กฎทั้งหมดเป็นตัวอย่างเพื่อสาธิต ต้องให้ผู้เชี่ยวชาญ (สูติแพทย์/ผดุงครรภ์) ทบทวนและ validate ก่อนใช้จริง
 * ระบบนี้ "แนะนำ" เท่านั้น บุคลากรเป็นผู้ตัดสินใจ */
(function (root) {
  const LEVELS = {
    green:  { rank: 0, label: 'Green',  th: 'ปกติ',        icon: '🟢', action: 'ให้คำแนะนำการดูแลตนเองและติดตามตามระบบ' },
    yellow: { rank: 1, label: 'Yellow', th: 'ควรติดตาม',   icon: '🟡', action: 'นัดติดตามอาการ / ปรึกษาบุคลากร' },
    orange: { rank: 2, label: 'Orange', th: 'เสี่ยง',       icon: '🟠', action: 'ให้บุคลากรประเมินโดยเร็ว (ภายในวันนี้)' },
    red:    { rank: 3, label: 'Red',    th: 'สงสัยฉุกเฉิน', icon: '🔴', action: 'หยุดคำแนะนำทั่วไป ติดต่อโรงพยาบาล/โทร 1669 และส่งต่อทันที' },
  };

  function num(v) { return v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v); }

  function assess(input) {
    const a = input || {};
    const reasons = [];
    const add = (level, text, kind = 'medical') => reasons.push({ level, text, kind });
    const temp = num(a.tempC), pain = num(a.pain), sys = num(a.sys), dia = num(a.dia);
    const epds = num(a.epds), sleep = num(a.sleepHours);

    // ---- Red: สงสัยภาวะฉุกเฉิน ----
    if (a.bleeding === 'heavy') add('red', 'เลือดออกมาก (ชุ่มผ้าอนามัยเร็ว) สงสัยตกเลือดหลังคลอด');
    if (a.chestOrBreath) add('red', 'เจ็บหน้าอก/หายใจลำบาก');
    if (a.seizure) add('red', 'ชัก/หมดสติ');
    if (a.selfHarm) add('red', 'มีความคิดทำร้ายตัวเอง');
    if (sys != null && dia != null && (sys >= 160 || dia >= 110)) add('red', `ความดันโลหิตสูงรุนแรง (${sys}/${dia})`);
    if (a.headacheVision && sys != null && dia != null && (sys >= 140 || dia >= 90))
      add('red', 'ปวดศีรษะรุนแรง/ตาพร่า ร่วมกับความดันสูง สงสัยครรภ์เป็นพิษหลังคลอด');
    if (temp != null && temp >= 38 && (a.foulLochia || a.severeAbdPain))
      add('red', 'ไข้ร่วมกับน้ำคาวปลามีกลิ่นเหม็น/ปวดท้องรุนแรง สงสัยติดเชื้อในโพรงมดลูก');

    // ---- Orange: เสี่ยง ----
    if (temp != null && temp >= 38) add('orange', `มีไข้ (${temp} °C) สงสัยติดเชื้อ`);
    if (sys != null && dia != null && (sys >= 140 || dia >= 90) && !(sys >= 160 || dia >= 110))
      add('orange', `ความดันโลหิตสูง (${sys}/${dia})`);
    if (a.headacheVision && !(sys != null && dia != null && (sys >= 140 || dia >= 90)))
      add('orange', 'ปวดศีรษะรุนแรง/ตาพร่า (ยังไม่มีข้อมูลความดัน หรือความดันปกติ)');
    if (a.bleeding === 'clots') add('orange', 'มีลิ่มเลือดก้อนใหญ่หรือเลือดออกมากกว่าปกติ');
    if (a.calfPain) add('orange', 'ปวด/บวมที่น่องข้างเดียว สงสัยลิ่มเลือดอุดตันในหลอดเลือดดำ');
    if (a.foulLochia) add('orange', 'น้ำคาวปลามีกลิ่นเหม็นผิดปกติ');
    if (a.severeAbdPain) add('orange', 'ปวดท้องน้อยรุนแรง');
    if (a.woundProblem) add('orange', 'แผลบวม แดง มีหนอง/แยก');
    if (a.breastRed) add('orange', 'เต้านมแดง ร้อน เจ็บ สงสัยเต้านมอักเสบ');
    // สีส้มกลุ่มที่แพทย์แผนไทยดูแลได้: คัดตึง/ปวดตึงเต้านม น้ำนมน้อย
    if (a.engorgement) add('orange', 'คัดตึง/ปวดตึงเต้านม — แนะนำพบแพทย์แผนไทย', 'ttm');
    if (a.milk === 'low' || a.milk === 'none') add('orange', 'น้ำนมไหลน้อย/ยังไม่มีน้ำนม — แนะนำพบแพทย์แผนไทย', 'ttm');
    if (pain != null && pain >= 7) add('orange', `ปวดรุนแรง (${pain}/10)`);
    if (epds != null && epds >= 13) add('orange', `คะแนนคัดกรองซึมเศร้าหลังคลอดสูง (EPDS ${epds})`);

    // ---- Yellow: ควรติดตาม ----
    if (pain != null && pain >= 4 && pain < 7) add('yellow', `ปวดปานกลาง (${pain}/10)`);
    if (epds != null && epds >= 10 && epds < 13) add('yellow', `คะแนน EPDS ${epds} ควรติดตามอารมณ์`);
    if (sleep != null && sleep < 4) add('yellow', `นอนน้อยมาก (${sleep} ชม./วัน)`);
    if (a.hxPPH && reasons.length === 0) add('yellow', 'มีประวัติตกเลือดหลังคลอด ควรเฝ้าระวังต่อเนื่อง');

    let level = 'green';
    for (const r of reasons) if (LEVELS[r.level].rank > LEVELS[level].rank) level = r.level;
    if (!reasons.length) add('green', 'ไม่พบสัญญาณอันตรายจากข้อมูลที่ให้');

    const orangeReasons = reasons.filter(r => r.level === 'orange');
    const ttmOnly = level === 'orange' && orangeReasons.every(r => r.kind === 'ttm');
    // referral: hospital = ไปโรงพยาบาล, ttm = คลินิกแพทย์แผนไทย, both = ให้บุคลากรประเมินโดยเร็ว + ตัวเลือกทั้งสอง
    const referral = level === 'red' ? 'hospital' : level === 'orange' ? (ttmOnly ? 'ttm' : 'both') : null;
    const missing = [];
    if (sys == null || dia == null) missing.push('ความดันโลหิต');
    if (temp == null) missing.push('อุณหภูมิร่างกาย');
    if (epds == null) missing.push('แบบคัดกรองซึมเศร้า (EPDS)');

    return { level, ...LEVELS[level], action: ttmOnly ? 'แนะนำพบแพทย์แผนไทย (กด GPS ดูคลินิกแพทย์แผนไทยใกล้ตัว)' : LEVELS[level].action, ttmOnly, referral, reasons: reasons.sort((x, y) => LEVELS[y.level].rank - LEVELS[x.level].rank), missing };
  }

  const api = { LEVELS, assess };
  root.PNC = Object.assign(root.PNC || {}, { risk: api });
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
