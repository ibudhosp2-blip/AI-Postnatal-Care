// Shared helpers for the admin1 / admin2 consoles
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: { 'x-requested-with': 'fetch', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : null;
    if (!r.ok) { const e = new Error((data && data.error) || 'เกิดข้อผิดพลาด'); e.status = r.status; throw e; }
    return data;
  }
  function flash(el, text, ok = true) { el.innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${esc(text)}</div>`; if (ok) setTimeout(() => { el.innerHTML = ''; }, 4000); }
  const THAI = { green: 'ปกติ', yellow: 'ควรติดตาม', orange: 'เสี่ยง', red: 'ฉุกเฉิน', none: 'ยังไม่ประเมิน' };
  const badge = (l) => `<span class="badge b-${l}">${THAI[l] || l}</span>`;
  const fmt = (iso) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

  // boot(role, title, startFn): login -> forced password change -> app
  async function boot(role, title, start) {
    const root = $('#root');
    const logout = async () => { await api('POST', '/api/auth/logout').catch(() => {}); location.reload(); };
    function loginView(msg) {
      root.innerHTML = `<div class="card login"><h2>${esc(title)}</h2>
        <form id="lf"><label>ชื่อผู้ใช้<input name="u" autocomplete="username" required></label>
        <label>รหัสผ่าน<input name="p" type="password" autocomplete="current-password" required></label>
        <button class="btn" style="width:100%">เข้าสู่ระบบ</button><div id="m">${msg ? `<div class="msg err">${esc(msg)}</div>` : ''}</div></form></div>`;
      $('#lf').onsubmit = async (e) => {
        e.preventDefault();
        try { const u = await api('POST', '/api/auth/login', { username: e.target.u.value.trim(), password: e.target.p.value }); gate(u); }
        catch (er) { flash($('#m'), er.message, false); }
      };
    }
    function changeView(u, forced) {
      root.innerHTML = `<div class="card login"><h2>${forced ? 'ตั้งรหัสผ่านใหม่ (บังคับในการใช้งานครั้งแรก)' : 'เปลี่ยนรหัสผ่าน'}</h2>
        <form id="cf"><label>รหัสผ่านปัจจุบัน<input name="c" type="password" autocomplete="current-password" required></label>
        <label>รหัสผ่านใหม่ (8 ตัวขึ้นไป มีตัวอักษรและตัวเลข)<input name="n" type="password" autocomplete="new-password" minlength="8" required></label>
        <label>ยืนยันรหัสผ่านใหม่<input name="n2" type="password" autocomplete="new-password" required></label>
        <button class="btn" style="width:100%">บันทึก</button><div id="m"></div></form></div>`;
      $('#cf').onsubmit = async (e) => {
        e.preventDefault(); const f = e.target;
        if (f.n.value !== f.n2.value) return flash($('#m'), 'รหัสผ่านใหม่ไม่ตรงกัน', false);
        try { await api('POST', '/api/auth/change-password', { current: f.c.value, new: f.n.value }); gate({ ...u, mustChange: false }); }
        catch (er) { flash($('#m'), er.message, false); }
      };
    }
    function gate(u) {
      const allowed = role === 'staff' ? ['admin2', 'admin1'] : [role];
      if (!allowed.includes(u.role)) { api('POST', '/api/auth/logout').catch(() => {}); return loginView(role === 'admin1' ? 'หน้านี้สำหรับ admin1 เท่านั้น' : 'หน้านี้สำหรับเจ้าหน้าที่ (admin2)'); }
      if (u.mustChange) return changeView(u, true);
      start({ root, user: u, logout, changePassword: () => changeView(u, false), api, esc, flash, badge, fmt, THAI });
    }
    try { gate(await api('GET', '/api/auth/me')); } catch { loginView(); }
  }
  window.Admin = { boot, api, esc, flash, badge, fmt, $, THAI };
})();
