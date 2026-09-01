/* bos.js — מסכי ה-BOS: היום · מכירות · לקוחות · עבודה · כספים · צמיחה
 * מרחיב את מפת RENDER הקיימת בלי לשבור מסכים ותיקים. RTL מלא, עברית.
 * מסתמך על העוזרים הגלובליים של app.html: api*, money*, esc, j, openModal, closeModal,
 * toast, val, valN, go, RENDER, $, todayISO, waLink. */
(function () {
  const L = window.LABELS;
  const H = (map, k) => L.t(map, k);

  // --- CSS ל-Kanban וכרטיסים (מוזרק פעם אחת) ---
  const style = document.createElement('style');
  style.textContent = `
    .kanban{display:flex;gap:11px;overflow-x:auto;padding-bottom:8px;scrollbar-width:thin}
    .kcol{flex:0 0 240px;background:var(--bg-2);border:1px solid var(--line);border-radius:14px;padding:10px}
    .kcol-h{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:.85rem;margin-bottom:8px;color:var(--muted)}
    .kcol-h .cnt{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:1px 8px;font-size:.72rem}
    .kcard{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:10px 11px;margin-bottom:8px;cursor:pointer;box-shadow:var(--shadow-sm)}
    .kcard b{font-size:.9rem;display:block;margin-bottom:2px}
    .kcard small{color:var(--muted);font-size:.76rem;display:block}
    .kcard .na{margin-top:6px;font-size:.74rem;color:var(--accent-2);font-weight:700}
    .attn-sec{margin-bottom:12px}
    .attn-sec h4{font-size:.86rem;font-weight:800;margin:0 0 7px;display:flex;gap:7px;align-items:center}
    .attn-sec h4 .cnt{background:rgba(239,68,68,.14);color:#b42323;border-radius:999px;padding:0 8px;font-size:.72rem;font-weight:800}
    .warn-row{color:#b42323;font-weight:700}
    .tabs2{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--line);padding-bottom:2px}
    .tabs2 button{background:none;border:0;border-bottom:2px solid transparent;color:var(--muted);font-weight:700;padding:7px 10px;font-size:.9rem}
    .tabs2 button.on{color:var(--txt);border-bottom-color:var(--accent)}
    .grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:11px}
    .tl{list-style:none;padding:0;margin:0}
    .tl li{padding:9px 0;border-bottom:1px solid var(--line);font-size:.86rem}
    .tl li small{color:var(--muted);display:block;font-size:.75rem}
    .backbtn{background:none;border:0;color:var(--accent-2);font-weight:700;font-size:.86rem;margin-bottom:8px;padding:2px 0}
  `;
  document.head.appendChild(style);

  const V = () => document.getElementById('view');
  const fmt = (d) => d ? String(d).split('-').reverse().join('/') : '';
  const hp = (map, k) => `<span class="pill p-gray">${H(map, k)}</span>`;
  const healthPill = (h) => `<span class="pill ${L.healthColor[h] === 'ok' ? 'p-green' : L.healthColor[h] === 'warn' ? 'p-amber' : 'p-red'}">${H('health', h)}</span>`;
  const overdue = (d) => d && d < todayISO();

  // כרטיס מתודולוגיה — מהלכי הפלייבוק שנפתחו (כולל autolaunch). קליק פותח את המהלך.
  function methodologyCard(runs) {
    const rows = (runs || []).map((r) => {
      const st = r.status === 'done' ? 'p-green' : 'p-amber';
      return `<div class="list-item" onclick="openRun('${r.id}')"><div class="li-main"><b>${esc(r.title)}</b><small>${r.status === 'done' ? 'הושלם' : 'פעיל'}</small></div><span class="pill ${st}">${r.progress || 0}%</span></div>`;
    }).join('') || '<div class="empty">אין מהלכים — ייפתחו אוטומטית עם התקדמות השלבים</div>';
    return `<div class="card"><h3>מתודולוגיה</h3>${rows}</div>`;
  }

  // גישה ל-state ניווט משני (טאב פעיל לכל קבוצה)
  const TAB = {};
  function tabBar(group, tabs, active) {
    TAB[group] = active;
    return `<div class="tabs2">${tabs.map(([k, l]) => `<button class="${k === active ? 'on' : ''}" onclick="BOS.tab('${group}','${k}')">${l}</button>`).join('')}</div>`;
  }

  /* =========================== היום =========================== */
  RENDER.today = async () => {
    let d; try { d = await apiGet('/today'); } catch (e) { V().innerHTML = '<div class="empty">שגיאה בטעינה</div>'; return; }
    const s = d.summary, n = d.needsAttention, a = d.myActions;
    const kpi = (v, lbl, cls = '') => `<div class="kpi ${cls}"><b>${v}</b><small>${lbl}</small></div>`;
    const attn = [];
    const sec = (title, items, render) => { if (items && items.length) attn.push(`<div class="attn-sec"><h4>${title} <span class="cnt">${items.length}</span></h4>${items.map(render).join('')}</div>`); };
    sec('לידים חדשים', n.newLeads, (l) => `<div class="list-item" onclick="BOS.handleLead('${l.id}')"><div class="li-main"><b>${esc(l.name || 'ליד')}</b><small>${esc(l.source || '')}</small></div><span class="pill p-amber">טיפול מהיר ›</span></div>`);
    sec('הזדמנויות ללא פעולה הבאה', n.oppsNoNextAction, (o) => `<div class="list-item warn-row" onclick="BOS.openOpp('${o.id}')"><div class="li-main"><b>${esc(o.title)}</b><small>${esc(o.organizationName)} · ${H('oppStage', o.stage)}</small></div><span class="pill p-red">חסר Next Action</span></div>`);
    sec('Follow-ups באיחור', n.overdueFollowups, (o) => `<div class="list-item" onclick="BOS.openOpp('${o.id}')"><div class="li-main"><b>${esc(o.title)}</b><small>${esc(o.organizationName)} · ${esc(o.nextAction || '')}</small></div><span class="pill p-red">${fmt(o.nextActionDate)}</span></div>`);
    sec('הצעות ממתינות', n.waitingProposals, (p) => `<div class="list-item" onclick="BOS.openOpp('${p.opportunityId}')"><div class="li-main"><b>${esc(p.opportunityTitle)} · v${p.version}</b><small>${esc(p.organizationName)}</small></div>${hp('proposalStatus', p.status)}</div>`);
    sec('פרויקטים בסיכון', n.projectsAtRisk, (p) => `<div class="list-item" onclick="BOS.openProject('${p.id}')"><div class="li-main"><b>${esc(p.title)}</b><small>${esc(p.organizationName)} · ${H('projectStatus', p.status)}</small></div>${healthPill(p.health)}</div>`);
    sec('משימות באיחור', n.overdueTasks, (t) => `<div class="list-item"><div class="li-main"><b>${esc(t.title)}</b></div><span class="pill p-red">${fmt(t.dueDate)}</span></div>`);
    sec('אבני דרך קרובות', n.upcomingMilestones, (m) => `<div class="list-item" onclick="BOS.openProject('${m.projectId}')"><div class="li-main"><b>${esc(m.title)}</b></div><span class="pill p-amber">${fmt(m.dueDate)}</span></div>`);

    const actLine = (x) => `<div class="list-item" onclick="BOS.open${x.entity === 'project' ? 'Project' : 'Opp'}('${x.id}')"><div class="li-main"><b>${esc(x.action)}</b><small>${esc(x.title)} · ${esc(x.organizationName)}</small></div>${x.date ? `<span class="pill ${overdue(x.date) ? 'p-red' : x.date === todayISO() ? 'p-amber' : 'p-gray'}">${fmt(x.date)}</span>` : ''}</div>`;
    const actionsBlock = (title, arr) => arr.length ? `<div class="card"><h3>${title}</h3>${arr.map(actLine).join('')}</div>` : '';

    V().innerHTML = `
      <div class="spread"><h2 style="margin:0">היום</h2><button class="btn small" onclick="BOS.newOpp()">+ הזדמנות</button></div>
      <div class="kpis">
        ${kpi(money(s.pipeline), 'צינור מכירות', 'accent')}
        ${kpi(money(s.weightedPipeline), 'צינור משוקלל', 'accent')}
        ${kpi(money(s.mrr), 'MRR', 'green')}
        ${kpi(s.activeProjects, 'פרויקטים פעילים')}
        ${kpi(s.activeCustomers, 'לקוחות פעילים')}
        ${kpi(s.proposalsWaiting, 'הצעות ממתינות', 'amber')}
      </div>
      <div class="grid2" style="align-items:start">
        <div><h3 style="margin:6px 0 10px">דורש טיפול</h3>${attn.join('') || '<div class="empty">הכול תחת שליטה ✓</div>'}</div>
        <div><h3 style="margin:6px 0 10px">הפעולות שלי היום</h3>
          ${actionsBlock('באיחור', a.overdue)}
          ${actionsBlock('להיום', a.today)}
          ${actionsBlock('קרוב', a.upcoming)}
          ${actionsBlock('ללא תאריך', a.undated)}
          ${(a.overdue.length + a.today.length + a.upcoming.length + a.undated.length) === 0 ? '<div class="empty">אין פעולות פתוחות</div>' : ''}
        </div>
      </div>`;
  };

  /* =========================== מכירות =========================== */
  RENDER.sales = async () => {
    const active = TAB.sales || 'opportunities';
    V().innerHTML = tabBar('sales', [['opportunities', 'הזדמנויות'], ['proposals', 'הצעות'], ['quotes', 'הצעות מחיר'], ['leads', 'לידים ממערכות']], active) + '<div id="salesBody"><div class="empty">טוען…</div></div>';
    const body = document.getElementById('salesBody');
    if (active === 'opportunities') return salesOpps(body);
    if (active === 'proposals') return salesProposals(body);
    if (active === 'quotes') return salesQuotes(body);
    if (active === 'leads') return salesLeads(body);
  };
  async function salesOpps(body) {
    const rows = await apiGet('/opportunities');
    const active = rows.filter((o) => L.oppStageOrder.includes(o.stage));
    const won = rows.filter((o) => o.stage === 'won');
    const lost = rows.filter((o) => o.stage === 'lost');
    const cols = L.oppStageOrder.map((st) => {
      const items = active.filter((o) => o.stage === st);
      return `<div class="kcol"><div class="kcol-h"><span>${H('oppStage', st)}</span><span class="cnt">${items.length}</span></div>
        ${items.map((o) => `<div class="kcard" onclick="BOS.openOpp('${o.id}')">
          <b>${esc(o.title)}</b><small>${esc(o.organizationName)}</small>
          <div class="row" style="justify-content:space-between;margin-top:5px"><b class="li-val" style="color:var(--accent-2)">${o.estimatedValue ? money(o.estimatedValue) : ''}</b><small>${o.probability || 0}%</small></div>
          ${o.nextAction ? `<div class="na">↳ ${esc(o.nextAction)}${o.nextActionDate ? ` · ${fmt(o.nextActionDate)}` : ''}</div>` : '<div class="na" style="color:#b42323">חסר Next Action</div>'}
        </div>`).join('') || '<div class="empty" style="padding:10px">—</div>'}
      </div>`;
    }).join('');
    body.innerHTML = `<div class="spread"><div class="row"><span class="pill p-green">נסגרו: ${won.length}</span><span class="pill p-red">אבודות: ${lost.length}</span></div><button class="btn small" onclick="BOS.newOpp()">+ הזדמנות</button></div>
      <div class="kanban">${cols}</div>`;
  }
  async function salesProposals(body) {
    const rows = await apiGet('/proposals');
    body.innerHTML = rows.length ? `<div class="card">${rows.map((p) => `<div class="list-item" onclick="BOS.openOpp('${p.opportunityId}')"><div class="li-main"><b>${esc(p.opportunityTitle)} · v${p.version}</b><small>${esc(p.organizationName || '')} · ${money(p.oneTimeValue)} + ${money(p.monthlyValue)}/ח׳</small></div>${hp('proposalStatus', p.status)}</div>`).join('')}</div>` : '<div class="empty">אין הצעות עדיין</div>';
  }
  // הצעות מחיר שהופקו — צפייה/הדפסה חוזרת ל-PDF (מסתמך על מנוע ה-quotes הקיים ב-app)
  async function salesQuotes(body) {
    let rows = []; try { rows = await apiGet('/quotes'); } catch (e) {}
    try { if (typeof QUOTES_CACHE !== 'undefined') QUOTES_CACHE = rows; } catch (e) {}
    const m0 = (n) => '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });
    body.innerHTML = `<div class="spread" style="margin-bottom:10px"><p class="hint" style="color:var(--muted);margin:0">הצעות המחיר שהפקת — צפייה, הדפסה חוזרת ל-PDF ומחיקה.</p>${typeof quoteForm === 'function' ? '<button class="btn small" onclick="quoteForm()">+ הצעת מחיר</button>' : ''}</div>` +
      (rows.length ? `<div class="card">${rows.map((q) => `<div class="list-item">
        <div class="li-main"><b>${esc(q.clientName || '—')}</b><small>${q.title ? esc(q.title) + ' · ' : ''}${esc(q.quoteNo || '')} · ${new Date(q.createdAt).toLocaleDateString('he-IL')}</small></div>
        <div class="row" style="gap:6px;align-items:center"><b class="li-val" style="color:var(--accent-2)">${m0(q.total)}</b>
          <button class="btn small ghost" onclick="quoteReopen('${q.id}')" title="פתח והדפס PDF">🖨️</button>
          <button class="btn small ghost" onclick="BOS.delQuote('${q.id}')" title="מחק">🗑</button></div></div>`).join('')}</div>`
        : '<div class="empty">עדיין לא הפקת הצעות מחיר.' + (typeof quoteForm === 'function' ? ' לחצו “+ הצעת מחיר” כדי להפיק את הראשונה.' : '') + '</div>');
  }
  async function delQuote(id) { if (!confirm('למחוק את הצעת המחיר?')) return; try { await apiDel('/quotes/' + id); toast('נמחקה ✓'); } catch (e) { toast('שגיאה במחיקה', 'bad'); } TAB.sales = 'quotes'; go('sales'); }

  // לידים ממערכות — CRM מלא לטיפול מהיר (מנצל את מנוע הלידים הקיים ב-app)
  async function salesLeads(body) {
    await ensureLeads(true);
    const rows = (LEADS_ALL || []).slice().sort((a, b) => b.createdAt - a.createdAt);
    const useCard = typeof leadCard === 'function';
    body.innerHTML = `<p class="hint" style="color:var(--muted);margin:0 0 10px">לידים שנכנסו מהמערכות שלך — חייגו, שלחו וואטסאפ, עדכנו סטטוס או המירו ללקוח.</p>` +
      (rows.length ? (useCard ? rows.map((l) => leadCard(l)).join('')
        : `<div class="card">${rows.map((l) => `<div class="list-item" onclick="BOS.handleLead('${l.id}')"><div class="li-main"><b>${esc(l.name || 'ליד')}</b><small>${esc(l.source || '')} · ${esc(l.note || '')}</small></div><span class="pill p-amber">טיפול</span></div>`).join('')}</div>`)
        : '<div class="empty">אין לידים עדיין</div>');
  }

  // מוודא שמטמון הלידים הגלובלי (LEADS_ALL/LEADS_SYS) טעון עבור openLead/leadCard מה-app
  async function ensureLeads(force) {
    try {
      const have = typeof LEADS_ALL !== 'undefined' && Array.isArray(LEADS_ALL);
      if (!force && have && LEADS_ALL.length) return;
      const [lr, sys, cls] = await Promise.all([
        apiGet('/leads'), apiGet('/systems').catch(() => []), apiGet('/clients').catch(() => []),
      ]);
      LEADS_ALL = lr;
      LEADS_SYS = Object.fromEntries((sys || []).map((s) => [s.id, s.name]));
      LEADS_CLIENTS = Object.fromEntries((cls || []).map((x) => [x.id, x.name]));
    } catch (e) { try { if (typeof LEADS_ALL === 'undefined' || !Array.isArray(LEADS_ALL)) LEADS_ALL = []; } catch (e2) {} }
  }

  // טיפול מהיר בליד ממסך "היום" — פותח את כרטיס הליד המלא (חיוג/וואטסאפ/סטטוס/יומן/המרה)
  async function handleLead(id) {
    await ensureLeads();
    if (!(LEADS_ALL || []).find((x) => x.id === id)) await ensureLeads(true);
    if (typeof openLead === 'function' && (LEADS_ALL || []).find((x) => x.id === id)) { openLead(id); return; }
    TAB.sales = 'leads'; go('sales');
  }

  /* =========================== לקוחות (Organizations) =========================== */
  RENDER.customers = async () => {
    const view = TAB.customers || 'active';
    const [rows, arch] = await Promise.all([
      apiGet('/organizations'),
      apiGet('/organizations?view=archived').catch(() => []),
    ]);
    const list = view === 'archived' ? arch : rows;
    const stPill = (st) => { const c = st === 'customer' ? 'p-green' : st === 'former_customer' ? 'p-red' : st === 'paused' ? 'p-gray' : 'p-amber'; return `<span class="pill ${c}">${H('orgStatus', st)}</span>`; };
    const rowActions = (o) => view === 'archived'
      ? `<button class="btn small ghost" onclick="event.stopPropagation();BOS.restoreOrg('${o.id}')" title="שחזר מהארכיון">♻︎</button><button class="btn small ghost" onclick="event.stopPropagation();BOS.deleteOrg('${o.id}','${esc(o.name).replace(/'/g, '')}')" title="מחיקה לצמיתות">🗑</button>`
      : `<button class="btn small ghost" onclick="event.stopPropagation();BOS.archiveOrg('${o.id}')" title="העבר לארכיון">🗄</button>`;
    const item = (o) => `<div class="list-item" onclick="BOS.openOrg('${o.id}')">
        <div class="li-main"><b>${esc(o.name)}</b><small>${esc(o.industry || '')}${o.openOpportunities ? ` · ${o.openOpportunities} הזדמנויות` : ''}${o.activeProjects ? ` · ${o.activeProjects} פרויקטים` : ''}</small></div>
        <div class="row" style="gap:7px;align-items:center">${o.mrr ? `<b class="li-val" style="color:var(--accent-2)">${money(o.mrr)}</b>` : ''}${stPill(o.status)}${rowActions(o)}</div></div>`;
    const toggle = `<div class="tabs2" style="margin-bottom:12px">
        <button class="${view === 'active' ? 'on' : ''}" onclick="BOS.tab('customers','active')">פעילים <span class="cnt">${rows.length}</span></button>
        <button class="${view === 'archived' ? 'on' : ''}" onclick="BOS.tab('customers','archived')">ארכיון <span class="cnt">${arch.length}</span></button>
      </div>`;
    V().innerHTML = `<div class="spread"><h2 style="margin:0">לקוחות</h2><button class="btn small" onclick="BOS.newOrg()">+ ארגון</button></div>
      ${toggle}
      ${list.length ? `<div class="card">${list.map(item).join('')}</div>`
        : `<div class="empty">${view === 'archived' ? 'הארכיון ריק' : 'אין ארגונים עדיין'}</div>`}`;
  };

  async function archiveOrg(id) { try { await apiPatch('/organizations/' + id, { archived: 1 }); toast('הועבר לארכיון ✓'); } catch (e) { toast('שגיאה', 'bad'); } go('customers'); }
  async function restoreOrg(id) { try { await apiPatch('/organizations/' + id, { archived: 0 }); toast('שוחזר ✓'); } catch (e) { toast('שגיאה', 'bad'); } go('customers'); }
  async function deleteOrg(id, name) {
    if (!confirm(`למחוק לצמיתות את "${name || 'הארגון'}"?\nפעולה זו בלתי הפיכה. אם יש נתונים מקושרים — עדיף להשאיר בארכיון.`)) return;
    try {
      await apiDel('/organizations/' + id);
      toast('נמחק לצמיתות ✓');
    } catch (e) {
      const m = String(e && e.message || '');
      const why = m === 'has_systems' ? 'יש מערכות מקושרות' : m === 'has_engagements' ? 'יש התקשרויות מקושרות' : m === 'has_opportunities' ? 'יש הזדמנויות מקושרות' : '';
      toast(why ? `לא ניתן למחוק — ${why}. השאירו בארכיון.` : 'שגיאה במחיקה', 'bad');
      return;
    }
    go('customers');
  }

  /* =========================== עבודה =========================== */
  RENDER.work = async () => {
    const active = TAB.work || 'projects';
    V().innerHTML = tabBar('work', [['projects', 'פרויקטים'], ['systems', 'מערכות'], ['processes', 'תהליכים']], active) + '<div id="workBody"><div class="empty">טוען…</div></div>';
    if (active === 'systems') return go('systems');
    if (active === 'processes') return go('processes');
    const body = document.getElementById('workBody');
    const rows = await apiGet('/projects');
    const activeP = rows.filter((p) => !['completed', 'paused'].includes(p.status));
    const doneP = rows.filter((p) => ['completed', 'paused'].includes(p.status));
    const card = (p) => `<div class="list-item" onclick="BOS.openProject('${p.id}')">
      <div class="li-main"><b>${esc(p.title)}</b><small>${esc(p.organizationName)} · ${H('projectStatus', p.status)}${p.nextMilestone ? ` · אבן דרך: ${esc(p.nextMilestone.title)}` : ''}</small>
      ${p.nextAction ? `<small>↳ ${esc(p.nextAction)}${p.nextActionDate ? ` · ${fmt(p.nextActionDate)}` : ''}</small>` : ''}</div>
      <div class="row" style="gap:7px"><small>${p.progress || 0}%</small>${healthPill(p.health)}</div></div>`;
    body.innerHTML = `<div class="spread"><div class="row"><span class="pill p-green">פעילים: ${activeP.length}</span></div><button class="btn small" onclick="BOS.newProject()">+ פרויקט</button></div>
      ${activeP.length ? `<div class="card">${activeP.map(card).join('')}</div>` : '<div class="empty">אין פרויקטים פעילים</div>'}
      ${doneP.length ? `<h3 style="margin:14px 0 8px">הושלמו / מושהים</h3><div class="card">${doneP.map(card).join('')}</div>` : ''}`;
  };

  /* =========================== כספים =========================== */
  RENDER.finance = async () => {
    const active = TAB.finance || 'overview';
    V().innerHTML = tabBar('finance', [['overview', 'סקירה'], ['engagements', 'התקשרויות'], ['cashflow', 'תזרים'], ['calculator', 'מחשבון חיוב']], active) + '<div id="finBody"></div>';
    if (active === 'engagements') return go('engagements');
    if (active === 'cashflow') return go('cashflow');
    if (active === 'calculator') return go('calculator');
    let d; try { d = await apiGet('/dashboard'); } catch (e) { document.getElementById('finBody').innerHTML = '<div class="empty">שגיאה</div>'; return; }
    const k = d.kpis;
    const kpi = (v, lbl, cls = '') => `<div class="kpi ${cls}"><b>${v}</b><small>${lbl}</small></div>`;
    document.getElementById('finBody').innerHTML = `<div class="kpis">
      ${kpi(money(k.mrr), 'MRR', 'green')}${kpi(money(k.arr), 'ARR', 'green')}
      ${kpi(money(k.pipeline), 'צינור (הזדמנויות)', 'accent')}${kpi(money(k.pipelineWeighted || 0), 'צינור משוקלל', 'accent')}
    </div><p class="hint" style="color:var(--muted)">לוגיקת החישוב המלאה נשמרת במסכי התקשרויות/תזרים/מחשבון. הצינור מגיע מהזדמנויות בלבד.</p>`;
  };

  /* =========================== צמיחה =========================== */
  RENDER.growth = async () => {
    const active = TAB.growth || 'centers';
    V().innerHTML = tabBar('growth', [['centers', 'מרכזי רווח'], ['qbr', 'QBR']], active) + '<div id="growthBody"></div>';
    const body = document.getElementById('growthBody');
    if (active === 'qbr') { body.innerHTML = '<div class="empty">QBR — סקירות רבעוניות מופעלות מתוך כרטיס הלקוח (Playbook QBR).</div>'; return; }
    let rows = []; try { rows = await apiGet('/ideas'); } catch (e) {}
    const IST = { idea: 'p-gray', exploring: 'p-amber', pitched: 'p-blue', active: 'p-green', dropped: 'p-red' };
    body.innerHTML = rows.length ? `<div class="card">${rows.map((i) => `<div class="list-item">
      <div class="li-main"><b>${esc(i.title)}</b><small>${i.potentialMonthly ? money(i.potentialMonthly) + '/ח׳' : ''}${i.clientId ? ' · מקושר לארגון' : ' · פנימי'}</small></div>
      <div class="row" style="gap:6px"><span class="pill ${IST[i.status] || 'p-gray'}">${H('ideaStatus', i.status)}</span>${i.clientId ? `<button class="btn small" onclick="event.stopPropagation();BOS.convertPC('${i.id}')">המר להזדמנות</button>` : ''}</div></div>`).join('')}</div>` : '<div class="empty">אין מרכזי רווח</div>';
  };

  /* =========================== כרטיס הזדמנות =========================== */
  async function openOpp(id) {
    CURRENT = 'opportunity'; buildNav && document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.p === 'sales'));
    V().innerHTML = '<div class="empty">טוען…</div>';
    const d = await apiGet('/opportunities/' + id);
    const o = d.opportunity;
    const stageOpts = [...L.oppStageOrder, 'won', 'lost'].map((s) => `<option value="${s}" ${s === o.stage ? 'selected' : ''}>${H('oppStage', s)}</option>`).join('');
    const painRows = d.pains.map((p) => `<div class="list-item"><div class="li-main"><b>${esc(p.title)}</b><small>${p.severity ? 'חומרה: ' + H('severity', p.severity) : ''}${p.estimatedCost ? ' · ' + money(p.estimatedCost) : ''}</small></div><button class="btn small ghost" onclick="BOS.delSub('opportunities/${id}/pains','${p.id}','opportunity','${id}')">✕</button></div>`).join('') || '<div class="empty">—</div>';
    const solRows = d.solutions.map((s) => `<div class="list-item"><div class="li-main"><b>${esc(s.title)}</b><small>${esc(s.expectedOutcome || '')}</small></div><button class="btn small ghost" onclick="BOS.delSub('opportunities/${id}/solutions','${s.id}','opportunity','${id}')">✕</button></div>`).join('') || '<div class="empty">—</div>';
    const propRows = d.proposals.map((p) => `<div class="list-item"><div class="li-main"><b>גרסה ${p.version}</b><small>${money(p.oneTimeValue)} + ${money(p.monthlyValue)}/ח׳</small></div><div class="row" style="gap:6px">${hp('proposalStatus', p.status)}<button class="btn small" onclick="BOS.propStatus('${p.id}','${id}')">סטטוס</button>${p.status === 'accepted' ? `<button class="btn small" onclick="BOS.propToEngagement('${p.id}','${id}')">→ התקשרות</button>` : ''}</div></div>`).join('') || '<div class="empty">—</div>';
    V().innerHTML = `
      <button class="backbtn" onclick="go('sales')">← חזרה למכירות</button>
      <div class="spread"><div><h2 style="margin:0 0 3px">${esc(o.title)}</h2><small style="color:var(--muted)">${esc(d.organization?.name || '')}</small></div>
        ${o.stage === 'won' ? '<span class="pill p-green">נסגר בהצלחה</span>' : o.stage === 'lost' ? '<span class="pill p-red">אבוד</span>' : ''}</div>
      <div class="kpis">
        <div class="kpi accent"><b>${o.estimatedValue ? money(o.estimatedValue) : '—'}</b><small>שווי משוער</small></div>
        <div class="kpi"><b>${o.probability || 0}%</b><small>הסתברות</small></div>
        <div class="kpi green"><b>${o.recurringValue ? money(o.recurringValue) : '—'}</b><small>חוזר/חודש</small></div>
        <div class="kpi"><b>${fmt(o.expectedCloseDate) || '—'}</b><small>סגירה צפויה</small></div>
      </div>
      <div class="card"><h3>שלב ופעולה הבאה</h3>
        <div class="row" style="gap:8px"><label>שלב:</label><select id="oppStage" onchange="BOS.setOppStage('${id}')" class="btn" style="min-width:140px">${stageOpts}</select></div>
        <div class="f" style="margin-top:10px"><label>הפעולה הבאה</label><input id="oppNA" value="${esc(o.nextAction || '')}" placeholder="מה השלב הבא?"></div>
        <div class="f"><label>תאריך פעולה</label><input id="oppNAD" type="date" value="${o.nextActionDate || ''}"></div>
        <button class="btn primary small" onclick="BOS.saveOppNA('${id}')">שמירה</button>
        ${o.stage !== 'won' ? `<button class="btn small" onclick="BOS.convertToProject('${id}')">סמן כזכייה → צור פרויקט</button>` : ''}
      </div>
      <div class="grid2" style="align-items:start">
        <div class="card"><h3>בעיות (כאבים)</h3>${painRows}<button class="btn small ghost" style="margin-top:8px" onclick="BOS.addPain('${id}')">+ בעיה</button></div>
        <div class="card"><h3>פתרונות</h3>${solRows}<button class="btn small ghost" style="margin-top:8px" onclick="BOS.addSolution('${id}')">+ פתרון</button></div>
      </div>
      <div class="card"><h3>הצעות</h3>${propRows}<button class="btn small ghost" style="margin-top:8px" onclick="BOS.newProposal('${id}')">+ הצעה (גרסה חדשה)</button></div>
      ${methodologyCard(d.playbookRuns)}`;
  }

  /* =========================== כרטיס פרויקט =========================== */
  async function openProject(id) {
    CURRENT = 'project'; document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.p === 'work'));
    V().innerHTML = '<div class="empty">טוען…</div>';
    const d = await apiGet('/projects/' + id);
    const p = d.project;
    const statusOpts = L.projectStageOrder.concat(['paused']).map((s) => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${H('projectStatus', s)}</option>`).join('');
    const msRows = d.milestones.map((m) => `<div class="list-item"><div class="li-main"><b>${esc(m.title)}</b><small>${m.dueDate ? fmt(m.dueDate) : ''} ${m.owner ? '· ' + esc(m.owner) : ''}</small></div><div class="row" style="gap:6px">${hp('milestoneStatus', m.status)}<button class="btn small" onclick="BOS.msToggle('${id}','${m.id}','${m.status}')">✓</button><button class="btn small ghost" onclick="BOS.delSub('projects/${id}/milestones','${m.id}','project','${id}')">✕</button></div></div>`).join('') || '<div class="empty">—</div>';
    const crRows = d.changeRequests.map((cr) => `<div class="list-item"><div class="li-main"><b>${esc(cr.title)}</b><small>${cr.costImpact ? money(cr.costImpact) : ''} ${esc(cr.timelineImpact || '')}</small></div>${hp('changeStatus', cr.status)}</div>`).join('') || '<div class="empty">—</div>';
    const acts = d.activities.map((a) => `<li><b>${esc(a.title)}</b><small>${H('activityType', a.type)} · ${new Date(a.occurredAt).toLocaleDateString('he-IL')}</small></li>`).join('') || '<li class="empty">—</li>';
    // בריאות מסירה — שערים
    const gates = [['specification', 'אפיון'], ['scope', 'Scope'], ['build', 'Build'], ['internal_test', 'QA'], ['live', 'Go-Live'], ['completed', 'מסירה']];
    const reachedIdx = L.projectStageOrder.indexOf(p.status);
    const gateHtml = gates.map((g) => { const gi = L.projectStageOrder.indexOf(g[0]); const ok = gi >= 0 && reachedIdx >= gi; return `<span class="pill ${ok ? 'p-green' : 'p-gray'}">${ok ? '✓ ' : ''}${g[1]}</span>`; }).join(' ');
    V().innerHTML = `
      <button class="backbtn" onclick="go('work')">← חזרה לעבודה</button>
      <div class="spread"><div><h2 style="margin:0 0 3px">${esc(p.title)}</h2><small style="color:var(--muted)">${esc(d.organization?.name || '')}</small></div>${healthPill(p.health)}</div>
      <div class="kpis">
        <div class="kpi"><b>${H('projectStatus', p.status)}</b><small>שלב</small></div>
        <div class="kpi"><b>${p.progress || 0}%</b><small>התקדמות</small></div>
        <div class="kpi"><b>${fmt(p.targetDate) || '—'}</b><small>יעד</small></div>
        <div class="kpi accent"><b>${d.engagements.length}</b><small>התקשרויות</small></div>
      </div>
      <div class="card"><h3>ניהול פרויקט</h3>
        <div class="row" style="gap:8px"><label>שלב:</label><select id="projStatus" onchange="BOS.setProjStatus('${id}')" class="btn" style="min-width:150px">${statusOpts}</select>
        <label>בריאות:</label><select id="projHealth" onchange="BOS.setProjHealth('${id}')" class="btn"><option value="green" ${p.health === 'green' ? 'selected' : ''}>תקין</option><option value="yellow" ${p.health === 'yellow' ? 'selected' : ''}>לתשומת לב</option><option value="red" ${p.health === 'red' ? 'selected' : ''}>בסיכון</option></select></div>
        <div class="f" style="margin-top:10px"><label>הפעולה הבאה</label><input id="projNA" value="${esc(p.nextAction || '')}"></div>
        <div class="f"><label>תאריך</label><input id="projNAD" type="date" value="${p.nextActionDate || ''}"></div>
        <div class="f"><label>התקדמות %</label><input id="projProg" type="number" min="0" max="100" value="${p.progress || 0}"></div>
        <button class="btn primary small" onclick="BOS.saveProj('${id}')">שמירה</button>
      </div>
      <div class="card"><h3>בריאות מסירה</h3><div class="chips" style="gap:6px">${gateHtml}</div></div>
      <div class="grid2" style="align-items:start">
        <div class="card"><h3>אבני דרך</h3>${msRows}<button class="btn small ghost" style="margin-top:8px" onclick="BOS.addMilestone('${id}')">+ אבן דרך</button></div>
        <div class="card"><h3>בקשות שינוי Scope</h3>${crRows}<button class="btn small ghost" style="margin-top:8px" onclick="BOS.addChange('${id}')">+ בקשת שינוי</button></div>
      </div>
      ${methodologyCard(d.playbookRuns)}
      <div class="card"><h3>מערכות ותהליכים מקושרים</h3>
        <small style="color:var(--muted)">מערכות: ${d.systems.length} · תהליכים: ${d.processes.length}</small></div>
      <div class="card"><h3>פעילות</h3><ul class="tl">${acts}</ul></div>`;
  }

  /* =========================== כרטיס ארגון 360 =========================== */
  async function openOrg(id) {
    CURRENT = 'organization'; document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.p === 'customers'));
    V().innerHTML = '<div class="empty">טוען…</div>';
    const d = await apiGet('/organizations/' + id);
    const o = d.organization;
    const contactRows = d.contacts.map((ct) => `<div class="list-item"><div class="li-main"><b>${esc(ct.name)}${ct.isPrimary ? ' ⭐' : ''}${ct.isDecisionMaker ? ' 🎯' : ''}</b><small>${esc(ct.role || '')} ${ct.phone ? '· ' + esc(ct.phone) : ''}</small></div>${ct.whatsapp || ct.phone ? `<a class="btn small ghost" href="${waLink(ct.whatsapp || ct.phone)}" target="_blank">וואטסאפ</a>` : ''}</div>`).join('') || '<div class="empty">—</div>';
    const oppRows = d.opportunities.map((op) => `<div class="list-item" onclick="BOS.openOpp('${op.id}')"><div class="li-main"><b>${esc(op.title)}</b><small>${H('oppStage', op.stage)} · ${op.probability || 0}%</small></div>${op.estimatedValue ? `<b class="li-val" style="color:var(--accent-2)">${money(op.estimatedValue)}</b>` : ''}</div>`).join('') || '<div class="empty">—</div>';
    const projRows = d.projects.map((p) => `<div class="list-item" onclick="BOS.openProject('${p.id}')"><div class="li-main"><b>${esc(p.title)}</b><small>${H('projectStatus', p.status)} · ${p.progress || 0}%</small></div>${healthPill(p.health)}</div>`).join('') || '<div class="empty">—</div>';
    const acts = d.activities.map((a) => `<li><b>${esc(a.title)}</b><small>${H('activityType', a.type)} · ${new Date(a.occurredAt).toLocaleDateString('he-IL')}</small></li>`).join('') || '<li class="empty">—</li>';
    const stLbl = H('orgStatus', o.status);
    V().innerHTML = `
      <button class="backbtn" onclick="go('customers')">← חזרה ללקוחות</button>
      <div class="spread"><div><h2 style="margin:0 0 3px">${esc(o.name)}</h2><small style="color:var(--muted)">${esc(o.industry || '')}</small></div><span class="pill p-green">${stLbl}</span></div>
      <div class="kpis">
        <div class="kpi green"><b>${d.mrr ? money(d.mrr) : '—'}</b><small>MRR</small></div>
        <div class="kpi accent"><b>${d.opportunities.filter((x) => !['won', 'lost'].includes(x.stage)).length}</b><small>הזדמנויות פתוחות</small></div>
        <div class="kpi"><b>${d.projects.filter((x) => !['completed', 'paused'].includes(x.status)).length}</b><small>פרויקטים פעילים</small></div>
        <div class="kpi"><b>${d.systems.length}</b><small>מערכות</small></div>
      </div>
      <div class="grid2" style="align-items:start">
        <div class="card"><h3>אנשי קשר</h3>${contactRows}<button class="btn small ghost" style="margin-top:8px" onclick="BOS.addContact('${id}')">+ איש קשר</button></div>
        <div class="card"><h3>הזדמנויות</h3>${oppRows}<button class="btn small ghost" style="margin-top:8px" onclick="BOS.newOpp('${id}')">+ הזדמנות</button></div>
        <div class="card"><h3>פרויקטים</h3>${projRows}<button class="btn small ghost" style="margin-top:8px" onclick="BOS.newProject('${id}')">+ פרויקט</button></div>
        <div class="card"><h3>צמיחה</h3>${d.growth.length ? d.growth.map((g) => `<div class="list-item"><div class="li-main"><b>${esc(g.title)}</b></div><button class="btn small" onclick="BOS.convertPC('${g.id}')">המר להזדמנות</button></div>`).join('') : '<div class="empty">—</div>'}</div>
      </div>
      <div class="card"><h3>פעילות אחרונה</h3><ul class="tl">${acts}</ul></div>`;
  }

  /* =========================== פעולות / טפסים =========================== */
  const fInput = (id, label, val = '', type = 'text') => `<div class="f"><label>${label}</label><input id="${id}" type="${type}" value="${esc(val)}"></div>`;

  async function newOrg() {
    openModal(`<h3>ארגון חדש</h3>${fInput('o_name', 'שם הארגון')}${fInput('o_ind', 'תחום')}
      <div class="f"><label>סטטוס</label><select id="o_st" class="btn" style="width:100%"><option value="prospect">ליד/פרוספקט</option><option value="customer">לקוח פעיל</option><option value="paused">מושהה</option></select></div>
      <div class="modal-actions"><button class="btn primary" onclick="BOS._newOrg()">יצירה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  }
  async function _newOrg() { const name = val('o_name'); if (!name) return toast('חסר שם', 'bad'); await apiPost('/organizations', { name, industry: val('o_ind'), status: $('o_st').value }); closeModal(); toast('נוצר ✓'); go('customers'); }

  async function newOpp(orgId) {
    let orgs = await apiGet('/organizations');
    const opts = orgs.map((o) => `<option value="${o.id}" ${o.id === orgId ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
    openModal(`<h3>הזדמנות חדשה</h3>
      <div class="f"><label>ארגון</label><select id="op_org" class="btn" style="width:100%">${opts}</select></div>
      ${fInput('op_title', 'שם ההזדמנות')}${fInput('op_val', 'שווי משוער', '', 'number')}${fInput('op_rec', 'חוזר/חודש', '', 'number')}${fInput('op_prob', 'הסתברות %', '20', 'number')}${fInput('op_na', 'הפעולה הבאה')}${fInput('op_nad', 'תאריך פעולה', '', 'date')}
      <div class="modal-actions"><button class="btn primary" onclick="BOS._newOpp()">יצירה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  }
  async function _newOpp() {
    const organizationId = $('op_org').value, title = val('op_title');
    if (!organizationId || !title) return toast('חסר ארגון/שם', 'bad');
    await apiPost('/opportunities', { organizationId, title, estimatedValue: valN('op_val'), recurringValue: valN('op_rec'), probability: valN('op_prob'), nextAction: val('op_na'), nextActionDate: val('op_nad') });
    closeModal(); toast('נוצר ✓'); go('sales');
  }

  async function newProject(orgId) {
    let orgs = await apiGet('/organizations');
    const opts = orgs.map((o) => `<option value="${o.id}" ${o.id === orgId ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
    openModal(`<h3>פרויקט חדש</h3>
      <div class="f"><label>ארגון</label><select id="pr_org" class="btn" style="width:100%">${opts}</select></div>
      ${fInput('pr_title', 'שם הפרויקט')}${fInput('pr_target', 'תאריך יעד', '', 'date')}
      <div class="modal-actions"><button class="btn primary" onclick="BOS._newProject()">יצירה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  }
  async function _newProject() { const organizationId = $('pr_org').value, title = val('pr_title'); if (!organizationId || !title) return toast('חסר ארגון/שם', 'bad'); const r = await apiPost('/projects', { organizationId, title, targetDate: val('pr_target') }); closeModal(); toast('נוצר ✓'); openProject(r.id); }

  async function addContact(orgId) {
    openModal(`<h3>איש קשר</h3>${fInput('c_name', 'שם')}${fInput('c_role', 'תפקיד')}${fInput('c_phone', 'טלפון')}${fInput('c_email', 'אימייל')}
      <label class="row" style="gap:6px"><input type="checkbox" id="c_dm"> מקבל החלטות</label>
      <label class="row" style="gap:6px"><input type="checkbox" id="c_pr"> איש קשר ראשי</label>
      <div class="modal-actions"><button class="btn primary" onclick="BOS._addContact('${orgId}')">הוספה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  }
  async function _addContact(orgId) { const name = val('c_name'); if (!name) return toast('חסר שם', 'bad'); await apiPost(`/organizations/${orgId}/contacts`, { name, role: val('c_role'), phone: val('c_phone'), email: val('c_email'), isDecisionMaker: $('c_dm').checked ? 1 : 0, isPrimary: $('c_pr').checked ? 1 : 0 }); closeModal(); toast('נוסף ✓'); openOrg(orgId); }

  async function addPain(oppId) { openModal(`<h3>בעיה / כאב</h3>${fInput('pn_title', 'כותרת')}<div class="f"><label>חומרה</label><select id="pn_sev" class="btn" style="width:100%"><option value="low">נמוכה</option><option value="medium">בינונית</option><option value="high">גבוהה</option><option value="critical">קריטית</option></select></div>${fInput('pn_cost', 'עלות משוערת ללקוח', '', 'number')}<div class="modal-actions"><button class="btn primary" onclick="BOS._addPain('${oppId}')">הוספה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`); }
  async function _addPain(oppId) { const title = val('pn_title'); if (!title) return toast('חסר', 'bad'); await apiPost(`/opportunities/${oppId}/pains`, { title, severity: $('pn_sev').value, estimatedCost: valN('pn_cost') }); closeModal(); openOpp(oppId); }

  async function addSolution(oppId) { openModal(`<h3>פתרון מוצע</h3>${fInput('sl_title', 'כותרת')}${fInput('sl_out', 'תוצאה צפויה')}<div class="modal-actions"><button class="btn primary" onclick="BOS._addSolution('${oppId}')">הוספה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`); }
  async function _addSolution(oppId) { const title = val('sl_title'); if (!title) return toast('חסר', 'bad'); await apiPost(`/opportunities/${oppId}/solutions`, { title, expectedOutcome: val('sl_out') }); closeModal(); openOpp(oppId); }

  async function newProposal(oppId) { openModal(`<h3>הצעה חדשה</h3>${fInput('pp_ot', 'סכום חד-פעמי', '', 'number')}${fInput('pp_mo', 'חודשי', '', 'number')}${fInput('pp_valid', 'בתוקף עד', '', 'date')}<div class="modal-actions"><button class="btn primary" onclick="BOS._newProposal('${oppId}')">יצירה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`); }
  async function _newProposal(oppId) { await apiPost('/proposals', { opportunityId: oppId, oneTimeValue: valN('pp_ot'), monthlyValue: valN('pp_mo'), validUntil: val('pp_valid') }); closeModal(); toast('נוצרה הצעה ✓'); openOpp(oppId); }

  async function propStatus(propId, oppId) {
    const opts = Object.entries(L.proposalStatus).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    openModal(`<h3>סטטוס הצעה</h3><div class="f"><label>סטטוס חדש</label><select id="ps_v" class="btn" style="width:100%">${opts}</select></div><div class="modal-actions"><button class="btn primary" onclick="BOS._propStatus('${propId}','${oppId}')">עדכון</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  }
  async function _propStatus(propId, oppId) { await apiPatch(`/proposals/${propId}/status`, { status: $('ps_v').value }); closeModal(); toast('עודכן ✓'); openOpp(oppId); }
  async function propToEngagement(propId, oppId) { await apiPost(`/proposals/${propId}/create-engagement`, {}); toast('נוצרה התקשרות ✓'); openOpp(oppId); }

  async function setOppStage(oppId) { await apiPatch('/opportunities/' + oppId, { stage: $('oppStage').value }); toast('שלב עודכן ✓'); openOpp(oppId); }
  async function saveOppNA(oppId) { await apiPatch('/opportunities/' + oppId, { nextAction: val('oppNA'), nextActionDate: val('oppNAD') }); toast('נשמר ✓'); }
  async function convertToProject(oppId) { const r = await apiPost(`/opportunities/${oppId}/convert-to-project`, {}); toast('נוצר פרויקט ✓'); openProject(r.projectId); }

  async function setProjStatus(id) { await apiPatch('/projects/' + id, { status: $('projStatus').value }); toast('שלב עודכן ✓'); openProject(id); }
  async function setProjHealth(id) { await apiPatch('/projects/' + id, { health: $('projHealth').value }); toast('עודכן ✓'); }
  async function saveProj(id) { await apiPatch('/projects/' + id, { nextAction: val('projNA'), nextActionDate: val('projNAD'), progress: valN('projProg') }); toast('נשמר ✓'); }

  async function addMilestone(id) { openModal(`<h3>אבן דרך</h3>${fInput('ms_title', 'כותרת')}${fInput('ms_owner', 'אחראי')}${fInput('ms_due', 'תאריך יעד', '', 'date')}<div class="modal-actions"><button class="btn primary" onclick="BOS._addMilestone('${id}')">הוספה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`); }
  async function _addMilestone(id) { const title = val('ms_title'); if (!title) return toast('חסר', 'bad'); await apiPost(`/projects/${id}/milestones`, { title, owner: val('ms_owner'), dueDate: val('ms_due') }); closeModal(); openProject(id); }
  async function msToggle(pid, mid, cur) { const next = cur === 'done' ? 'pending' : 'done'; await apiPatch(`/projects/${pid}/milestones/${mid}`, { status: next }); openProject(pid); }

  async function addChange(id) { openModal(`<h3>בקשת שינוי Scope</h3>${fInput('cr_title', 'כותרת')}${fInput('cr_cost', 'השפעת עלות', '', 'number')}${fInput('cr_time', 'השפעת לו״ז')}<div class="modal-actions"><button class="btn primary" onclick="BOS._addChange('${id}')">הוספה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`); }
  async function _addChange(id) { const title = val('cr_title'); if (!title) return toast('חסר', 'bad'); await apiPost(`/projects/${id}/change-requests`, { title, costImpact: valN('cr_cost'), timelineImpact: val('cr_time') }); closeModal(); openProject(id); }

  async function convertPC(pcId) { const r = await apiPost('/opportunities/from-profit-center/' + pcId, {}); toast('נוצרה הזדמנות ✓'); openOpp(r.id); }

  async function delSub(path, subId, backEntity, backId) { if (!confirm('למחוק?')) return; await apiDel(`/${path}/${subId}`); if (backEntity === 'opportunity') openOpp(backId); else openProject(backId); }

  function tab(group, k) { TAB[group] = k; go(group); }

  // Registrations
  RENDER.opportunity = () => {};
  RENDER.project = () => {};
  RENDER.organization = () => {};
  RENDER.growth = RENDER.growth;

  window.BOS = {
    tab, openOpp, openProject, openOrg,
    newOrg, _newOrg, newOpp, _newOpp, newProject, _newProject,
    addContact, _addContact, addPain, _addPain, addSolution, _addSolution,
    newProposal, _newProposal, propStatus, _propStatus, propToEngagement,
    setOppStage, saveOppNA, convertToProject,
    setProjStatus, setProjHealth, saveProj, addMilestone, _addMilestone, msToggle,
    addChange, _addChange, convertPC, delSub,
    handleLead, delQuote,
    archiveOrg, restoreOrg, deleteOrg,
  };

  // אם האפליקציה כבר מוצגת ועומדים על מסך BOS — רענון לאחר טעינת המודול
  if (typeof CURRENT !== 'undefined' && document.getElementById('app') && document.getElementById('app').style.display !== 'none' && RENDER[CURRENT]) {
    try { go(CURRENT); } catch (e) {}
  }
})();
