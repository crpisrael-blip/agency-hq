// מדידה עצמית ללא IP, פרטי טופס, כתובת מפנה מלאה או מזהה קבוע בין ביקורים.
(() => {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  const paths = {'/':'/','/index.html':'/','/services':'/services','/services.html':'/services',
    '/for-whom':'/for-whom','/for-whom.html':'/for-whom','/about':'/about','/about.html':'/about',
    '/contact':'/contact','/contact.html':'/contact','/book':'/book','/book.html':'/book',
    '/lp':'/lp','/lp.html':'/lp'};
  const path = paths[location.pathname];
  if (!path) return;
  let sessionId;
  try {
    sessionId = sessionStorage.getItem('ort_visit_id');
    if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem('ort_visit_id', sessionId); }
  } catch { sessionId = crypto.randomUUID(); }
  let source = 'direct';
  try {
    const saved = sessionStorage.getItem('ort_visit_source');
    if (saved) source = saved;
    else {
      const host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
      if (/^(www\.)?(google|bing|yahoo|duckduckgo)\./.test(host)) source = 'search';
      else if (host === 'wa.me' || /(^|\.)(facebook|instagram|tiktok|linkedin|x|twitter|whatsapp)\./.test(host)) source = 'social';
      else if (host && host !== location.hostname && !(host === 'www.' + location.hostname)) source = 'referral';
      sessionStorage.setItem('ort_visit_source', source);
    }
  } catch { /* storage blocked */ }
  function track(type) {
    const data = JSON.stringify({ id: crypto.randomUUID(), sessionId, path, type, source });
    const blob = new Blob([data], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/site-analytics', blob)) return;
    fetch('/api/site-analytics', { method:'POST', headers:{'Content-Type':'application/json'}, body:data, keepalive:true }).catch(()=>{});
  }
  track('page_view');
  document.addEventListener('click', (e) => {
    const item = e.target.closest('a');
    if (!item) return;
    const href = item.getAttribute('href') || '';
    if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com)\//i.test(href)) track('whatsapp_click');
    else if (href.startsWith('tel:')) track('phone_click');
    else if (/^\/(book|book\.html)(?:[?#]|$)/.test(href)) track('booking_click');
    else if (/^\/(contact|contact\.html)(?:[?#]|$)/.test(href)) track('contact_click');
  }, { capture:true });
  document.addEventListener('submit', (e) => {
    if (e.target.matches('form[data-source]') || (path === '/lp' && e.target.closest('form'))) track('form_submit');
  }, { capture:true });
})();
