/* ==========================================================================
   ORT-TECH — לוגיקה משותפת לאתר הציבורי
   Header/Footer מוזרקים · טופס לידים · וואטסאפ · אנימציות
   --------------------------------------------------------------------------
   ⚙️  להחלפה במקום אחד: כל פרטי הקשר וכתובות המערכות מרוכזים כאן ב-SITE.
   ========================================================================== */
window.SITE = {
  brand: 'ORT-TECH',
  tagline: 'תהליכים · מסע לקוח · מרכזי רווח',
  phone: '054-2214726',
  whatsapp: '972542214726',          // פורמט בינ"ל לוואטסאפ (972 + המספר בלי 0 מוביל)
  email: 'menahemtzik1@gmail.com',
  // כתובות הכניסה למערכות (עמוד "כניסת לקוחות"):
  systems: {
    one:      '#',                   // ← TODO: כתובת כניסה למערכת ONE
    zimmer:   '#',                   // ← TODO: כתובת כניסה למערכת ניהול הצימרים
    business: '/app'                 // מערכת ניהול העסק (הדשבורד הקיים)
  }
};

(function () {
  var S = window.SITE;
  var page = document.body.getAttribute('data-page') || '';
  var waMsg = encodeURIComponent('היי, הגעתי דרך האתר ואשמח לשמוע פרטים 🙂');
  var waHref = 'https://wa.me/' + S.whatsapp + '?text=' + waMsg;

  var NAV = [
    ['home', '/', 'בית'],
    ['services', '/services', 'שירותים'],
    ['for-whom', '/for-whom', 'למי זה מתאים'],
    ['about', '/about', 'אודות'],
    ['contact', '/contact', 'צור קשר']
  ];

  var LEAF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3 3-6 4.5-8 5 0 6 3.5 10 8 13 4.5-3 8-7 8-13-2-.5-5-2-8-5Z"/><path d="M9.2 12.2l2 2 3.6-4"/></svg>';
  var LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/></svg>';

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
        '<a href="/" class="brand"><span class="mark">' + LOGO + '</span>' +
          '<span class="name">' + S.brand + '<small>' + S.tagline + '</small></span></a>' +
        '<nav class="nav">' + links + '</nav>' +
        '<div class="hdr-actions">' +
          '<a href="/login" class="login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg><span class="login-text">אזור אישי</span></a>' +
          '<a href="/contact" class="btn primary sm">בוא נדבר</a>' +
          '<button class="nav-toggle" aria-label="תפריט"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
        '</div>' +
      '</div>';
    var btn = el.querySelector('.nav-toggle');
    if (btn) btn.addEventListener('click', function () { el.classList.toggle('open'); });
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
            '<div class="fbrand"><span class="mark">' + LOGO + '</span>' + S.brand + '</div>' +
            '<p class="fdesc">בונה לעסקים קטנים תהליכים חכמים, מסע לקוח שלם ומרכזי רווח חדשים — רמת עבודה של ארגון גדול, בקצב של עסק קטן.</p>' +
            '<span class="fbadge">' + LEAF + 'עסק של מילואימניק</span>' +
          '</div>' +
          '<div><h4>ניווט</h4><ul>' + navLinks + '<li><a href="/login">כניסת לקוחות</a></li></ul></div>' +
          '<div><h4>דברו איתי</h4><ul>' +
            '<li><a href="tel:' + S.phone.replace(/[^0-9+]/g, '') + '">📞 ' + S.phone + '</a></li>' +
            '<li><a href="' + waHref + '" target="_blank" rel="noopener">💬 וואטסאפ</a></li>' +
            '<li><a href="mailto:' + S.email + '">✉️ ' + S.email + '</a></li>' +
          '</ul></div>' +
        '</div>' +
        '<div class="fbot"><span>© ' + new Date().getFullYear() + ' ' + S.brand + ' · כל הזכויות שמורות</span>' +
          '<span>נבנה בישראל 🇮🇱 · מוקדש למי שמשרת</span></div>' +
      '</div>';
  }

  /* ---------- WhatsApp float ---------- */
  function buildWhatsApp() {
    if (document.querySelector('.wa-float')) return;
    var a = document.createElement('a');
    a.className = 'wa-float';
    a.href = waHref; a.target = '_blank'; a.rel = 'noopener';
    a.setAttribute('aria-label', 'וואטסאפ');
    a.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17.5 14.4c-.3-.15-1.7-.85-2-.95-.25-.1-.45-.15-.65.15-.2.3-.75.95-.9 1.15-.15.2-.35.2-.65.05-.3-.15-1.25-.45-2.4-1.5-.9-.8-1.5-1.75-1.65-2.05-.15-.3 0-.45.15-.6.15-.15.3-.35.45-.55.15-.2.2-.3.3-.5.1-.2.05-.4-.05-.55-.1-.15-.65-1.6-.9-2.15-.25-.55-.5-.5-.65-.5h-.55c-.2 0-.5.05-.75.35-.25.3-1 .95-1 2.35s1.05 2.7 1.2 2.9c.15.2 2.05 3.15 5 4.4.7.3 1.25.5 1.65.65.7.2 1.35.2 1.85.1.55-.05 1.7-.7 1.95-1.35.25-.65.25-1.2.15-1.35-.1-.15-.3-.2-.6-.35zM12 2C6.5 2 2 6.5 2 12c0 1.75.45 3.4 1.25 4.85L2 22l5.3-1.4A9.9 9.9 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>';
    document.body.appendChild(a);
  }

  /* ---------- Lead form ---------- */
  window.submitLead = function (e) {
    e.preventDefault();
    var form = e.target;
    var btn = form.querySelector('[type=submit]');
    var name = (form.querySelector('[name=name]') || {}).value;
    var phone = (form.querySelector('[name=phone]') || {}).value;
    var field = (form.querySelector('[name=field]') || {}).value || '';
    var msg = (form.querySelector('[name=msg]') || {}).value || '';
    name = (name || '').trim(); phone = (phone || '').trim();
    if (!name || !phone) return false;
    var origTxt = btn.textContent;
    btn.disabled = true; btn.textContent = 'שולח…';
    var note = '📞 ' + phone + (field ? ' · תחום: ' + field : '') + (msg ? ' · ' + msg : '');
    fetch('/api/hook/lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemId: 'sys-agency-hq-core',
        source: form.getAttribute('data-source') || 'website',
        name: name, note: note.slice(0, 300)
      })
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function () {
        var inner = form.closest('.form-card') ? form.closest('.form-card').querySelector('.form-inner') : form;
        var ok = form.closest('.form-card') ? form.closest('.form-card').querySelector('.ok-box') : null;
        if (inner) inner.style.display = 'none';
        if (ok) ok.style.display = 'block';
        else { form.reset(); btn.disabled = false; btn.textContent = origTxt; }
      })
      .catch(function () {
        btn.disabled = false; btn.textContent = 'נסה שוב';
        alert('אופס, משהו השתבש. אפשר גם לכתוב לי למייל: ' + S.email);
      });
    return false;
  };

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: .1 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  }

  function init() { buildHeader(); buildFooter(); buildWhatsApp(); initReveal(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
