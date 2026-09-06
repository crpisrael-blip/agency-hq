/* בועת רעיונות/באגים — כלי פיתוח למנהל. מופיעה רק עם טוקן תקף.
   בועה נגררת + פאנל צף נגרר, מיקום נשמר ב-localStorage, פריטים נשמרים ב-DB
   (מסתנכרן בין מכשירים), תיוג אוטומטי של מסך ומכשיר, והעתקת פרומט מוכן ללוח. */
(function () {
  const Z = 2147483000;
  const POS_KEY = 'agencyhq_bubble_pos';
  const PANEL_POS_KEY = 'agencyhq_bubble_panel_pos';
  const TOKEN_KEY = 'agencyhq_token';

  const api = (path, opts = {}) =>
    fetch('/api/feedback' + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem(TOKEN_KEY) || '', ...(opts.headers || {}) },
    }).then((r) => {
      if (r.status === 401) throw new Error('unauthorized');
      return r.json();
    });

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* --- זיהוי הקשר --- */
  function deviceType() {
    return (matchMedia('(pointer:coarse)').matches || innerWidth <= 768) ? 'נייד' : 'נייח';
  }
  function screenName() {
    const on = document.querySelector('#nav button.on');
    return (on && on.textContent.trim()) || 'לוח בקרה';
  }

  /* --- מיקום: שמירה והצמדה לגבולות --- */
  function loadPos(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function savePos(key, el) {
    const r = el.getBoundingClientRect();
    localStorage.setItem(key, JSON.stringify({ left: r.left, top: r.top }));
  }
  function clamp(el, pos) {
    const w = el.offsetWidth || 54, h = el.offsetHeight || 54;
    const left = Math.min(Math.max(0, pos.left), Math.max(0, innerWidth - w));
    const top = Math.min(Math.max(0, pos.top), Math.max(0, innerHeight - h));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }
  function applySavedPos(el, key, fallback) {
    const pos = loadPos(key);
    if (pos) clamp(el, pos);
    else Object.assign(el.style, fallback);
  }
  function clampToViewport(el, key) {
    const pos = loadPos(key);
    if (pos && el) clamp(el, pos);
  }

  /* גרירה עם הבחנה בין לחיצה לגרירה */
  function draggable(el, handle, key, onClick) {
    let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, active = false;
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button,input,select,textarea,a') && e.target.closest('button') !== el) {
        if (el !== e.target.closest('button')) return;
      }
      active = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!active) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      clamp(el, { left: ox + dx, top: oy + dy });
    });
    handle.addEventListener('pointerup', (e) => {
      if (!active) return;
      active = false;
      if (moved) savePos(key, el);
      else if (onClick) onClick(e);
    });
    handle.addEventListener('pointercancel', () => { active = false; });
  }

  /* ערכת צבעים נבדלת (סגול/טורקיז — כלי פיתוח, לא חלק מהמוצר) */
  const css = `
  #fb-bubble{position:fixed;bottom:18px;inset-inline-start:18px;z-index:${Z};width:54px;height:54px;border-radius:999px;
    background:linear-gradient(135deg,#7c3aed,#06b6d4);border:2px solid #a78bfa;cursor:grab;font-size:1.5rem;opacity:.75;
    box-shadow:0 6px 20px rgba(124,58,237,.5);display:flex;align-items:center;justify-content:center;user-select:none;
    transition:opacity .15s;font-family:'Heebo',system-ui,sans-serif}
  #fb-bubble:hover,#fb-bubble:active{opacity:1}
  #fb-badge{position:absolute;top:-5px;inset-inline-end:-5px;background:#dc2626;color:#fff;font-size:.7rem;font-weight:800;
    min-width:19px;height:19px;border-radius:999px;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid #0f1424}
  #fb-panel{position:fixed;bottom:84px;inset-inline-start:14px;z-index:${Z + 1};width:min(360px,calc(100vw - 20px));
    background:#1b1035;border:1.5px solid #7c3aed;border-radius:16px;box-shadow:0 12px 40px rgba(88,28,135,.55);
    font-family:'Heebo',system-ui,sans-serif;color:#ede9fe;direction:rtl;display:flex;flex-direction:column;max-height:min(560px,calc(100vh - 24px))}
  #fb-head{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid #3b2a5a;cursor:grab;user-select:none;
    background:linear-gradient(135deg,rgba(124,58,237,.25),rgba(6,182,212,.12));border-radius:14px 14px 0 0}
  #fb-head b{flex:1;font-size:.95rem;font-weight:900;color:#c4b5fd}
  #fb-head button{background:none;border:1px solid #4c3575;color:#a996d6;border-radius:8px;cursor:pointer;font-size:.85rem;padding:3px 9px;font-family:inherit}
  #fb-head button:hover{color:#ede9fe;border-color:#06b6d4}
  #fb-form{display:flex;gap:6px;padding:10px 14px;border-bottom:1px solid #3b2a5a;align-items:stretch}
  #fb-kindwrap{display:flex;gap:4px;flex:0 0 auto}
  .fb-kind-btn{width:36px;border:1.5px solid #4c3575;background:#241545;border-radius:9px;font-size:1rem;cursor:pointer;opacity:.45;padding:0;font-family:inherit}
  .fb-kind-btn.on{opacity:1;border-color:#06b6d4;background:#2d1b57;box-shadow:0 0 0 1px #06b6d4 inset}
  #fb-text{flex:1 1 auto;width:100%;min-width:0;background:#241545;border:1.5px solid #4c3575;color:#ede9fe;border-radius:9px;padding:9px 11px;font-family:inherit;font-size:.9rem}
  #fb-text::placeholder{color:#8a76b8}
  #fb-text:focus{outline:none;border-color:#06b6d4}
  #fb-add{flex:0 0 auto;background:#7c3aed;border:none;color:#fff;border-radius:9px;padding:0 13px;font-family:inherit;font-weight:800;cursor:pointer}
  #fb-add:hover{background:#6d28d9}
  #fb-list{overflow-y:auto;padding:6px 14px 12px;flex:1}
  .fb-row{display:flex;align-items:flex-start;gap:7px;padding:8px 0;border-bottom:1px solid #2c1c4f}
  .fb-row:last-child{border-bottom:0}
  .fb-row .tx{flex:1;font-size:.85rem;line-height:1.45;word-break:break-word}
  .fb-row .tx small{display:block;color:#a996d6;font-size:.7rem;margin-top:2px}
  .fb-row.done .tx{color:#8a76b8;text-decoration:line-through}
  .fb-row button{background:none;border:none;color:#a996d6;cursor:pointer;font-size:.85rem;padding:2px 3px;font-family:inherit}
  .fb-row button:hover{color:#ede9fe}
  #fb-list details{margin-top:8px}
  #fb-list summary{cursor:pointer;color:#a996d6;font-size:.8rem;font-weight:700;padding:4px 0;user-select:none}
  .fb-edit{display:flex;flex-direction:column;gap:6px;flex:1}
  .fb-edit input,.fb-edit select{background:#241545;border:1px solid #4c3575;color:#ede9fe;border-radius:8px;padding:6px 9px;font-family:inherit;font-size:.85rem}
  .fb-edit .acts{display:flex;gap:6px}
  .fb-edit .acts button{border:1px solid #4c3575;border-radius:8px;padding:3px 12px;font-size:.78rem}
  #fb-empty{color:#a996d6;font-size:.82rem;text-align:center;padding:16px 0}`;

  let items = [];
  let editing = null;
  const KIND = { idea: '💡', bug: '🐞', todo: '✅' };
  const openItems = () => items.filter((i) => i.status !== 'done');

  function badge() {
    const b = document.getElementById('fb-badge');
    if (!b) return;
    const n = openItems().length;
    b.style.display = n ? 'flex' : 'none';
    b.textContent = n;
  }

  function rowHtml(i) {
    if (editing === i.id) {
      return `<div class="fb-row" data-id="${i.id}"><div class="fb-edit">
        <select class="e-kind"><option value="idea" ${i.kind === 'idea' ? 'selected' : ''}>💡 רעיון</option><option value="bug" ${i.kind === 'bug' ? 'selected' : ''}>🐞 באג</option><option value="todo" ${i.kind === 'todo' ? 'selected' : ''}>✅ משימה</option></select>
        <input class="e-text" value="${esc(i.content)}"/>
        <div class="acts"><button data-act="save">שמירה</button><button data-act="cancel">ביטול</button></div>
      </div></div>`;
    }
    const meta = [i.screen ? 'מסך: ' + esc(i.screen) : null, i.device ? esc(i.device) : null].filter(Boolean).join(' · ');
    return `<div class="fb-row ${i.status === 'done' ? 'done' : ''}" data-id="${i.id}">
      <span>${KIND[i.kind] || '💡'}</span>
      <div class="tx">${esc(i.content)}${meta ? `<small>${meta}</small>` : ''}</div>
      <button data-act="edit" title="עריכה">✏️</button>
      ${i.status === 'done' ? '<button data-act="reopen" title="החזר לפתוחים">↺</button>' : '<button data-act="done" title="בוצע">✓</button>'}
      <button data-act="del" title="מחיקה">🗑</button>
    </div>`;
  }

  function renderList() {
    const list = document.getElementById('fb-list');
    if (!list) return;
    const open = openItems();
    const done = items.filter((i) => i.status === 'done');
    list.innerHTML =
      (open.length ? open.map(rowHtml).join('') : '<div id="fb-empty">אין פריטים פתוחים — רעיון או באג? כתוב כאן 💡</div>') +
      (done.length ? `<details><summary>בוצעו (${done.length})</summary>${done.map(rowHtml).join('')}</details>` : '');
    badge();
  }

  async function refresh() { items = await api(''); renderList(); }

  /* --- העתקת פרומט מוכן לסשן פיתוח --- */
  function buildPrompt() {
    const open = items.filter((i) => i.status !== 'done');
    const fmt = (i, n) => `${n}. ${i.content} (מסך: ${i.screen || '?'}${i.device ? ', ' + i.device : ''})`;
    const bugs = open.filter((i) => i.kind === 'bug');
    const rest = open.filter((i) => i.kind !== 'bug');
    const parts = [];
    if (bugs.length) parts.push('אלו באגים שמצאתי:\n' + bugs.map((i, x) => fmt(i, x + 1)).join('\n'));
    if (rest.length) parts.push('ואלו רעיונות/משימות לפיתוח:\n' + rest.map((i, x) => fmt(i, x + 1)).join('\n'));
    return parts.join('\n\n');
  }
  async function copyPrompt() {
    const text = buildPrompt();
    if (!text) return;
    const btn = document.getElementById('fb-copy');
    try {
      await navigator.clipboard.writeText(text);
      if (btn) { btn.textContent = 'הועתק ✓'; setTimeout(() => { btn.textContent = '📋'; }, 1600); }
    } catch (e) {
      if (btn) { btn.textContent = '⚠'; setTimeout(() => { btn.textContent = '📋'; }, 1600); }
    }
  }

  /* --- פאנל --- */
  function togglePanel() {
    let p = document.getElementById('fb-panel');
    if (p) { p.remove(); return; }
    p = document.createElement('div');
    p.id = 'fb-panel';
    p.innerHTML = `
      <div id="fb-head"><b>💡 בועת הרעיונות</b>
        <button id="fb-copy" title="העתקת פרומט ללוח">📋</button>
        <button id="fb-close" title="סגירה">✕</button></div>
      <div id="fb-form">
        <div id="fb-kindwrap">
          <button type="button" class="fb-kind-btn on" data-kind="idea" title="רעיון">💡</button>
          <button type="button" class="fb-kind-btn" data-kind="bug" title="באג">🐞</button>
          <button type="button" class="fb-kind-btn" data-kind="todo" title="משימה">✅</button>
        </div>
        <input id="fb-text" placeholder="רעיון, באג או משימה… (Enter)"/>
        <button id="fb-add">הוסף</button></div>
      <div id="fb-list"></div>`;
    document.body.appendChild(p);
    applySavedPos(p, PANEL_POS_KEY, {});
    draggable(p, p.querySelector('#fb-head'), PANEL_POS_KEY);
    p.querySelector('#fb-close').onclick = () => p.remove();
    p.querySelector('#fb-copy').onclick = copyPrompt;
    let curKind = 'idea';
    p.querySelectorAll('.fb-kind-btn').forEach((kb) => {
      kb.onclick = () => { curKind = kb.dataset.kind; p.querySelectorAll('.fb-kind-btn').forEach((x) => x.classList.toggle('on', x === kb)); };
    });
    const txt = p.querySelector('#fb-text');
    const add = async () => {
      const content = txt.value.trim();
      if (!content) return;
      txt.value = '';
      await api('', { method: 'POST', body: JSON.stringify({ content, kind: curKind, screen: screenName(), device: deviceType() }) });
      await refresh();
      txt.focus();
    };
    p.querySelector('#fb-add').onclick = add;
    txt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    p.querySelector('#fb-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const row = btn.closest('[data-id]');
      const id = row.dataset.id;
      const act = btn.dataset.act;
      if (act === 'edit') { editing = id; renderList(); return; }
      if (act === 'cancel') { editing = null; renderList(); return; }
      if (act === 'save') {
        const content = row.querySelector('.e-text').value.trim();
        const kind = row.querySelector('.e-kind').value;
        if (content) await api('/' + id, { method: 'PATCH', body: JSON.stringify({ content, kind }) });
        editing = null;
      } else if (act === 'done') {
        await api('/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });
      } else if (act === 'reopen') {
        await api('/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) });
      } else if (act === 'del') {
        if (!confirm('למחוק את הפריט?')) return;
        await api('/' + id, { method: 'DELETE' });
      }
      await refresh();
    });
    renderList();
  }

  let initInProgress = false; // מונע מרוץ: init היא async, בלי דגל סינכרוני שתי קריאות מקבילות עוברות את השומר ויוצרות שתי בועות
  async function init() {
    if (document.getElementById('fb-bubble') || initInProgress) return;
    if (!localStorage.getItem(TOKEN_KEY)) return;
    initInProgress = true;
    try {
      try { items = await api(''); } catch (e) { return; } // אין הרשאה — לא מציגים
      if (document.getElementById('fb-bubble')) return; // בדיקה חוזרת אחרי ה-await (belt & suspenders)

      if (!document.getElementById('fb-style')) {
        const style = document.createElement('style');
        style.id = 'fb-style';
        style.textContent = css;
        document.head.appendChild(style);
      }
      const b = document.createElement('button');
      b.id = 'fb-bubble';
      b.innerHTML = '💡<span id="fb-badge" style="display:none"></span>';
      b.title = 'בועת הרעיונות (גרור להזזה)';
      document.body.appendChild(b);
      applySavedPos(b, POS_KEY, {});
      draggable(b, b, POS_KEY, togglePanel);
      badge();

      addEventListener('resize', () => {
        clampToViewport(document.getElementById('fb-bubble'), POS_KEY);
        clampToViewport(document.getElementById('fb-panel'), PANEL_POS_KEY);
      });
    } finally {
      initInProgress = false;
    }
  }

  window.ideaBubbleInit = init;
  window.ideaBubbleDestroy = () => {
    initInProgress = false;
    ['fb-bubble', 'fb-panel'].forEach((id) => document.getElementById(id)?.remove());
  };

  // self-init (מטפל במקרה שהסקריפט נטען אחרי showApp) — idempotent, מותנה בטוקן
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
