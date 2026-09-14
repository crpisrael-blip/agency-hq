/* ==========================================================================
   ORT-TECH — לוגיקה משותפת לאתר הציבורי (Option 2)
   Header/Footer מוזרקים · טופס לידים · וואטסאפ · Motion שמסביר תהליך
   --------------------------------------------------------------------------
   ⚙️  כל פרטי הקשר וכתובות המערכות מרוכזים כאן ב-SITE (מקום אחד).
   ⚠️  אינטגרציות קיימות נשמרות: submitLead → POST /api/hook/lead (webhook לידים).
   ========================================================================== */
window.SITE = {
  brand: 'ORT-TECH',
  tagline: 'פתרונות תפעול חכמים לעסקים',
  phone: '054-2214726',
  whatsapp: '972542214726',          // פורמט בינ"ל לוואטסאפ (972 + המספר בלי 0 מוביל)
  email: 'menahemtzik1@gmail.com',
  systems: {
    one:      '#',
    zimmer:   '#',
    business: '/app'                 // מערכת ניהול העסק (הדשבורד הקיים)
  }
};

(function () {
  var S = window.SITE;
  var page = document.body.getAttribute('data-page') || '';
  var waMsg = encodeURIComponent('היי, הגעתי דרך האתר של ORT-TECH ואשמח לשמוע פרטים 🙂');
  var waHref = 'https://wa.me/' + S.whatsapp + '?text=' + waMsg;

  // ניווט ראשי (Option 2)
  var NAV = [
    ['home', '/', 'בית'],
    ['what', '/#what', 'מה אנחנו עושים'],
    ['method', '/#method', 'איך אנחנו עובדים'],
    ['services', '/services', 'פתרונות'],
    ['about', '/about', 'אודות'],
    ['contact', '/contact', 'צור קשר']
  ];
  var LOGO_DARK = '/ort-tech-logo-dark.png';
  var LOGO_ALT = 'ORT-TECH — פתרונות תפעול חכמים לעסקים';
  var LEAF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3 3-6 4.5-8 5 0 6 3.5 10 8 13 4.5-3 8-7 8-13-2-.5-5-2-8-5Z"/><path d="M9.2 12.2l2 2 3.6-4"/></svg>';

  /* ---------- Header ---------- */
  function buildHeader() {
    var el = document.getElementById('site-header');
    if (!el) return;
    var links = NAV.map(function (n) {
      return '<a href="' + n[1] + '"' + (n[0] === page ? ' class="on"' : '') + '>' + n[2] + '</a>';
    }).join('');
    el.className = 'site';
    el.innerHTML =
      '<div class="wrap">' +
        '<a href="/" class="brand" aria-label="' + LOGO_ALT + '"><img src="' + LOGO_DARK + '" class="logo-img" alt="' + LOGO_ALT + '" width="150" height="34"></a>' +
        '<nav class="nav" id="mainnav">' + links +
          '<a href="/contact" class="btn primary sm drawer-cta">שיחת ייעוץ ללא התחייבות</a>' +
        '</nav>' +
        '<div class="hdr-actions">' +
          '<a href="/login" class="login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg><span class="login-text">אזור אישי</span></a>' +
          '<a href="/contact" class="btn primary sm">שיחת ייעוץ</a>' +
          '<button class="nav-toggle" aria-label="פתיחת תפריט" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
        '</div>' +
      '</div>';

    var btn = el.querySelector('.nav-toggle');
    function closeMenu() { el.classList.remove('open'); document.body.classList.remove('nav-locked'); if (btn) btn.setAttribute('aria-expanded', 'false'); }
    function toggleMenu() {
      var open = el.classList.toggle('open');
      document.body.classList.toggle('nav-locked', open);
      if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (btn) btn.addEventListener('click', toggleMenu);
    // סגירה בלחיצה על קישור בתפריט
    el.querySelectorAll('.nav a').forEach(function (a) { a.addEventListener('click', closeMenu); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

    // מצב גלילה — זכוכית כהה אחרי גלילה
    function onScroll() { el.classList.toggle('scrolled', window.scrollY > 8); }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Footer ---------- */
  function buildFooter() {
    var el = document.getElementById('site-footer');
    if (!el) return;
    var navLinks = NAV.map(function (n) { return '<li><a href="' + n[1] + '">' + n[2] + '</a></li>'; }).join('');
    el.className = 'site';
    el.innerHTML =
      '<div class="wrap">' +
        '<div class="cols">' +
          '<div>' +
            '<div class="fbrand"><img src="' + LOGO_DARK + '" class="logo-img" alt="' + LOGO_ALT + '"></div>' +
            '<p class="fdesc">מתכננים איך העסק עובד — ואז בונים את הטכנולוגיה שמפעילה אותו. תהליכים, אוטומציות, מערכות מידע ונתונים במערכת עבודה אחת ברורה.</p>' +
            '<span class="fbadge">' + LEAF + 'עסק של מילואימניק</span>' +
          '</div>' +
          '<div><h4>ניווט</h4><ul>' + navLinks + '<li><a href="/login">אזור אישי</a></li></ul></div>' +
          '<div><h4>דברו איתנו</h4><ul>' +
            '<li><a href="tel:' + S.phone.replace(/[^0-9+]/g, '') + '">📞 ' + S.phone + '</a></li>' +
            '<li><a href="' + waHref + '" target="_blank" rel="noopener">💬 וואטסאפ</a></li>' +
            '<li><a href="mailto:' + S.email + '">✉️ ' + S.email + '</a></li>' +
          '</ul></div>' +
        '</div>' +
        '<div class="fbot"><span>© ' + new Date().getFullYear() + ' ' + S.brand + ' · פתרונות תפעול חכמים לעסקים</span>' +
          '<span>נבנה בישראל 🇮🇱</span></div>' +
      '</div>';
  }

  /* ---------- WhatsApp float ---------- */
  function buildWhatsApp() {
    if (document.querySelector('.wa-float')) return;
    var a = document.createElement('a');
    a.className = 'wa-float';
    a.href = waHref; a.target = '_blank'; a.rel = 'noopener';
    a.setAttribute('aria-label', 'שיחת וואטסאפ');
    a.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17.5 14.4c-.3-.15-1.7-.85-2-.95-.25-.1-.45-.15-.65.15-.2.3-.75.95-.9 1.15-.15.2-.35.2-.65.05-.3-.15-1.25-.45-2.4-1.5-.9-.8-1.5-1.75-1.65-2.05-.15-.3 0-.45.15-.6.15-.15.3-.35.45-.55.15-.2.2-.3.3-.5.1-.2.05-.4-.05-.55-.1-.15-.65-1.6-.9-2.15-.25-.55-.5-.5-.65-.5h-.55c-.2 0-.5.05-.75.35-.25.3-1 .95-1 2.35s1.05 2.7 1.2 2.9c.15.2 2.05 3.15 5 4.4.7.3 1.25.5 1.65.65.7.2 1.35.2 1.85.1.55-.05 1.7-.7 1.95-1.35.25-.65.25-1.2.15-1.35-.1-.15-.3-.2-.6-.35zM12 2C6.5 2 2 6.5 2 12c0 1.75.45 3.4 1.25 4.85L2 22l5.3-1.4A9.9 9.9 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>';
    document.body.appendChild(a);
  }

  /* ---------- אימות טלפון ישראלי (זהה ל-normalizeILPhone בשרת) ---------- */
  function normalizeILPhone(raw) {
    var d = (raw || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.indexOf('972') === 0) { if (d.length === 13 && d[3] === '0') d = '972' + d.slice(4); }
    else if (d[0] === '0') d = '972' + d.slice(1);
    else if (d.length >= 8 && d.length <= 9) d = '972' + d;
    if (d.indexOf('972') === 0) return (d.length === 11 || d.length === 12) ? d : null;
    return (d.length >= 8 && d.length <= 15) ? d : null;
  }
  function fieldError(input, msg) {
    if (!input) return;
    var wrap = (input.closest && input.closest('.field')) || input.parentNode;
    var e = wrap.querySelector('.field-err');
    if (!e) { e = document.createElement('div'); e.className = 'field-err'; wrap.appendChild(e); }
    e.textContent = msg;
    input.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
    input.addEventListener('input', function clr() {
      e.textContent = ''; input.classList.remove('invalid'); input.removeAttribute('aria-invalid');
      input.removeEventListener('input', clr);
    });
    input.focus();
  }

  /* ---------- Lead form (אינטגרציה קיימת — לא לשנות יעד) ---------- */
  window.submitLead = function (e) {
    e.preventDefault();
    var form = e.target;
    var btn = form.querySelector('[type=submit]');
    var nameEl = form.querySelector('[name=name]');
    var phoneEl = form.querySelector('[name=phone]');
    var name = (nameEl || {}).value;
    var phone = (phoneEl || {}).value;
    var field = (form.querySelector('[name=field]') || {}).value || '';
    var msg = (form.querySelector('[name=msg]') || {}).value || '';
    name = (name || '').trim(); phone = (phone || '').trim();
    if (!name) { fieldError(nameEl, 'צריך למלא שם'); return false; }
    if (!phone) { fieldError(phoneEl, 'צריך למלא מספר טלפון'); return false; }
    if (!normalizeILPhone(phone)) { fieldError(phoneEl, 'מספר טלפון לא תקין — לדוגמה 050-0000000'); return false; }
    var origTxt = btn.textContent;
    btn.disabled = true; btn.textContent = 'שולח…';
    var note = '📞 ' + phone + (field ? ' · תחום: ' + field : '') + (msg ? ' · ' + msg : '');
    fetch('/api/hook/lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemId: 'sys-agency-hq-core',
        source: form.getAttribute('data-source') || 'website',
        name: name, phone: phone, note: note.slice(0, 300)
      })
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (res) {
        var inner = form.closest('.form-card') ? form.closest('.form-card').querySelector('.form-inner') : form;
        var ok = form.closest('.form-card') ? form.closest('.form-card').querySelector('.ok-box') : null;
        if (inner) inner.style.display = 'none';
        if (ok) {
          // אם המערכת שלחה למבקר הודעת ווטסאפ אוטומטית — אומרים לו לחפש אותה שם
          if (res && res.whatsapp === 'queued' && !ok.querySelector('.ok-wa')) {
            var wa = document.createElement('p');
            wa.className = 'ok-wa';
            wa.textContent = '💬 שלחנו לך עכשיו הודעה בווטסאפ. אפשר לכתוב לנו שם כבר עכשיו כמה מילים על העסק.';
            ok.appendChild(wa);
          }
          ok.style.display = 'block';
        }
        else { form.reset(); btn.disabled = false; btn.textContent = origTxt; }
      })
      .catch(function () {
        btn.disabled = false; btn.textContent = 'נסה שוב';
        alert('אופס, משהו השתבש. אפשר גם לכתוב לנו למייל: ' + S.email);
      });
    return false;
  };

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
    // רשת ביטחון: אם משום מה לא הופעל תוך זמן קצר אחרי גלילה — מציגים בכל זאת
    setTimeout(function () {
      document.querySelectorAll('.reveal:not(.in)').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.92) el.classList.add('in');
      });
    }, 1200);
  }

  /* ---------- Hero transformation animation ---------- */
  function initHero() {
    var hero = document.querySelector('.diagram');
    if (!hero) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var labels = hero.querySelectorAll('.src-label');
    var mods = hero.querySelectorAll('.dmod');
    if (reduce) {
      labels.forEach(function (l) { l.classList.add('in'); });
      mods.forEach(function (m) { m.classList.add('lit'); });
      return;
    }
    // תוויות מקור נכנסות בהדרגה, ואז מודולי הדשבורד "נדלקים" — feed מהזרימה
    labels.forEach(function (l, i) { setTimeout(function () { l.classList.add('in'); }, 900 + i * 110); });
    function litLoop() {
      mods.forEach(function (m, i) { setTimeout(function () { m.classList.add('lit'); }, 1900 + i * 150); });
    }
    litLoop();
  }

  /* ---------- Method timeline + business flow (scroll-activated) ---------- */
  function activateSequence(root, itemSel, progressSel, vertical) {
    var items = root.querySelectorAll(itemSel);
    var prog = progressSel ? root.querySelector(progressSel) : null;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function run() {
      if (prog && !reduce) prog.style[vertical ? 'height' : 'width'] = (vertical ? 'calc(100% - 52px)' : '84%');
      items.forEach(function (it, i) {
        if (reduce) { it.classList.add('on'); return; }
        setTimeout(function () { it.classList.add('on'); }, 180 + i * 260);
      });
    }
    if (!('IntersectionObserver' in window)) { run(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { run(); io.disconnect(); } });
    }, { threshold: .3 });
    io.observe(root);
  }

  function init() {
    buildHeader(); buildFooter(); buildWhatsApp(); initReveal(); initHero();
    var method = document.querySelector('.method');
    if (method) activateSequence(method, '.mstep', '.progress', window.innerWidth <= 820);
    var flow = document.querySelector('.flow');
    if (flow) activateSequence(flow, '.fnode', null, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
