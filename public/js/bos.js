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

    /* ===== Living Business — dashboard ===== */
    .living-dashboard{position:relative;isolation:isolate}
    .living-dashboard:before{content:"";position:absolute;z-index:-2;inset:-24px;background:
      radial-gradient(circle at 18% 18%,rgba(40,199,190,.16),transparent 31%),
      radial-gradient(circle at 72% 34%,rgba(43,92,255,.12),transparent 29%),
      linear-gradient(145deg,var(--bg-2) 0%,var(--bg) 60%,var(--bg-2) 100%);border-radius:28px}
    .living-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}
    .living-title h2{font-size:1.58rem;margin:0;color:var(--txt)}
    .living-title p{margin:2px 0 0;color:var(--muted);font-size:.86rem}
    /* direction:ltr places the map on the left and the panel on the right; children reset to rtl for Hebrew text */
    .live-layout{direction:ltr;display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:18px;align-items:stretch}
    .business-map,.attention-panel{direction:rtl}
    .business-map{position:relative;min-height:500px;border:1px solid var(--line);border-radius:28px;overflow:hidden;background:rgba(255,255,255,.58);box-shadow:0 24px 70px rgba(36,60,103,.1);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
    .business-map:before{content:"";position:absolute;inset:0;background:
      radial-gradient(circle at 50% 48%,rgba(43,92,255,.10),transparent 29%),
      radial-gradient(circle at 16% 22%,rgba(40,199,190,.12),transparent 23%),
      radial-gradient(circle at 82% 72%,rgba(245,166,35,.11),transparent 22%);pointer-events:none}
    .map-caption{position:absolute;top:22px;right:24px;z-index:3}
    .map-caption b{display:block;font-size:1rem;color:var(--txt)}.map-caption small{color:var(--muted)}
    /* links share a 0..100 coordinate space with the nodes so they stay connected at any container size */
    .map-links{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
    .map-links path{fill:none;stroke-width:1.8;stroke-linecap:round;opacity:.6;stroke-dasharray:2 8;vector-effect:non-scaling-stroke;animation:live-flow 11s linear infinite}
    @keyframes live-flow{to{stroke-dashoffset:-80}}
    .orbit-node,.business-core{position:absolute;z-index:2;border:0;font-family:inherit;text-align:center;color:var(--txt)}
    .orbit-node{width:134px;height:134px;border-radius:50%;transform:translate(-50%,-50%);background:rgba(255,255,255,.92);box-shadow:0 17px 42px rgba(36,64,110,.13),inset 0 0 0 1px rgba(255,255,255,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;transition:transform .2s ease,box-shadow .2s ease}
    .orbit-node:after{content:"";position:absolute;inset:6px;border-radius:50%;border:4px solid var(--node);border-left-color:transparent;opacity:.9}
    .orbit-node:hover{transform:translate(-50%,calc(-50% - 5px)) scale(1.04);box-shadow:0 24px 55px rgba(36,64,110,.2)}
    .orbit-node .node-icon{width:35px;height:35px;border-radius:12px;display:grid;place-items:center;background:#eef4fb;background:color-mix(in srgb,var(--node) 14%,white);color:var(--node);font-size:1.15rem;font-weight:900;margin-bottom:3px}
    .orbit-node b{font-size:1rem}.orbit-node strong{font-size:1.26rem;line-height:1.15}.orbit-node small{font-size:.73rem;color:var(--muted)}
    .node-sales{--node:#0c8f81;top:15%;left:50%}.node-clients{--node:#2f6fdc;top:42%;left:16%}
    .node-projects{--node:#6c4fd6;top:42%;left:84%}.node-finance{--node:#1580b8;top:80%;left:38%}
    .node-tasks{--node:#c9820a;top:80%;left:66%}
    .business-core{width:206px;height:206px;border-radius:50%;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,255,255,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 0 12px rgba(255,255,255,.55),0 25px 65px rgba(44,92,160,.18)}
    .business-core:before,.business-core:after{content:"";position:absolute;border-radius:50%;inset:-2px;border:7px solid transparent;border-top-color:var(--accent-2);border-right-color:var(--accent);border-bottom-color:#32a8ef}
    .business-core:after{inset:18px;border-width:1px;border-color:rgba(69,111,181,.16)}
    .business-core .pulse{width:43px;height:43px;border-radius:15px;background:linear-gradient(135deg,var(--accent-2),var(--accent));color:white;display:grid;place-items:center;font-size:1.2rem;margin-bottom:8px;box-shadow:0 9px 22px rgba(41,169,193,.3)}
    .business-core b{font-size:1.42rem}.business-core small{color:var(--muted)}.business-core em{font-style:normal;font-size:.74rem;color:var(--accent-2);margin-top:5px}
    .map-preview{position:absolute;z-index:3;bottom:24px;left:24px;width:190px;padding:14px 16px;border:1px solid var(--line);border-radius:19px;background:rgba(255,255,255,.88);box-shadow:0 18px 42px rgba(44,64,102,.12);text-align:right}
    .map-preview b{display:block;color:var(--txt)}.map-preview small{color:var(--muted)}.map-preview .preview-val{font-size:1.35rem;font-weight:900;color:var(--accent-2);margin-top:6px}
    .attention-panel{background:rgba(255,255,255,.86);border:1px solid var(--line);border-radius:26px;padding:18px;box-shadow:0 22px 60px rgba(36,60,103,.1);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);max-height:500px;overflow:auto}
    .attention-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.attention-title h3{margin:0;font-size:1.18rem;color:var(--txt)}.attention-badge{min-width:31px;height:31px;padding:0 8px;border-radius:11px;background:rgba(239,68,68,.14);color:#b42323;display:grid;place-items:center;font-weight:900}
    .attention-panel .attn-sec{margin:0 0 9px;padding:11px 12px;border-radius:16px;background:var(--bg-2);border:1px solid var(--line)}
    .attention-panel .attn-sec h4{margin-bottom:4px}.attention-panel .list-item{padding:8px 0}.attention-panel .li-main b{font-size:.85rem}.attention-panel .pill{font-size:.65rem}
    .attn-more{display:block;width:100%;text-align:right;background:none;border:0;padding:6px 0 0;color:var(--accent);font-weight:700;font-size:.76rem;cursor:pointer}
    .action-dock{margin:18px auto 0;max-width:940px;border:1px solid var(--line);border-radius:28px;padding:16px 20px;background:rgba(255,255,255,.88);box-shadow:0 22px 55px rgba(36,60,103,.11);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
    .action-dock-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.action-dock-head h3{margin:0;font-size:1.05rem;color:var(--txt)}.action-dock-head span{color:var(--muted);font-size:.8rem;font-weight:700}
    .action-list{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.action-chip{border:1px solid var(--line);border-radius:16px;padding:11px 12px;background:var(--bg-2);cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:right}
    .action-chip:hover{border-color:var(--accent);background:var(--card)}.action-chip b{font-size:.82rem;display:block;color:var(--txt)}.action-chip small{font-size:.7rem;color:var(--muted)}
    .chip-end{display:flex;align-items:center;gap:6px;flex:none}.action-arrow{width:28px;height:28px;flex:none;border-radius:9px;background:#edf3ff;background:color-mix(in srgb,var(--accent) 12%,white);color:var(--accent);display:grid;place-items:center}
    .living-empty{padding:24px;text-align:center;color:var(--muted)}
    @media(max-width:960px){.live-layout{grid-template-columns:1fr}.attention-panel{max-height:none}.business-map{min-height:460px}.action-list{grid-template-columns:1fr}}
    @media(max-width:660px){
      .living-dashboard:before{inset:-18px}.living-head{align-items:flex-start}.living-title p{display:none}.business-map{min-height:auto;padding:72px 14px 18px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .map-links,.map-caption,.map-preview{display:none}.business-core,.orbit-node{position:relative;inset:auto!important;transform:none!important;width:auto;height:126px;border-radius:22px}
      .business-core{grid-column:1/-1;height:152px;order:-1}.business-core:before,.business-core:after{border-radius:22px}
      .orbit-node:after{border-radius:18px}.attention-panel{border-radius:22px}.action-dock{border-radius:22px;padding:14px}
    }
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
    const s = d.summary || {}, n = d.needsAttention || {}, a = d.myActions || {};
    const safe = (x) => Array.isArray(x) ? x : [];
    const attn = [];
    const sec = (title, items, render, page) => {
      items = safe(items);
      if (!items.length) return;
      const more = (items.length > 4 && page) ? `<button class="attn-more" onclick="go('${page}')">הצג הכול (${items.length}) ›</button>` : '';
      attn.push(`<div class="attn-sec"><h4>${title} <span class="cnt">${items.length}</span></h4>${items.slice(0,4).map(render).join('')}${more}</div>`);
    };
    sec('לידים חדשים', n.newLeads, (l) => `<div class="list-item" onclick="BOS.handleLead('${l.id}')"><div class="li-main"><b>${esc(l.name || 'ליד')}</b><small>${esc(l.source || '')}</small></div><span class="pill p-amber">טיפול ›</span></div>`, 'leads');
    sec('הזדמנויות ללא פעולה הבאה', n.oppsNoNextAction, (o) => `<div class="list-item warn-row" onclick="BOS.openOpp('${o.id}')"><div class="li-main"><b>${esc(o.title)}</b><small>${esc(o.organizationName)} · ${H('oppStage', o.stage)}</small></div><span class="pill p-red">חסר פעולה</span></div>`, 'sales');
    sec('מעקבים באיחור', n.overdueFollowups, (o) => `<div class="list-item" onclick="BOS.openOpp('${o.id}')"><div class="li-main"><b>${esc(o.title)}</b><small>${esc(o.organizationName)} · ${esc(o.nextAction || '')}</small></div><span class="pill p-red">${fmt(o.nextActionDate)}</span></div>`, 'sales');
    sec('הצעות ממתינות', n.waitingProposals, (p) => `<div class="list-item" onclick="BOS.openOpp('${p.opportunityId}')"><div class="li-main"><b>${esc(p.opportunityTitle)} · v${p.version}</b><small>${esc(p.organizationName)}</small></div>${hp('proposalStatus', p.status)}</div>`, 'sales');
    sec('פרויקטים בסיכון', n.projectsAtRisk, (p) => `<div class="list-item" onclick="BOS.openProject('${p.id}')"><div class="li-main"><b>${esc(p.title)}</b><small>${esc(p.organizationName)} · ${H('projectStatus', p.status)}</small></div>${healthPill(p.health)}</div>`, 'work');
    sec('משימות באיחור', n.overdueTasks, (t) => `<div class="list-item" onclick="go('tasks')"><div class="li-main"><b>${esc(t.title)}</b></div><span class="pill p-red">${fmt(t.dueDate)}</span></div>`, 'tasks');
    sec('אבני דרך קרובות', n.upcomingMilestones, (m) => `<div class="list-item" onclick="BOS.openProject('${m.projectId}')"><div class="li-main"><b>${esc(m.title)}</b></div><span class="pill p-amber">${fmt(m.dueDate)}</span></div>`, 'work');

    const allActions = [
      ...safe(a.overdue).map(x => ({...x, timing:'באיחור'})),
      ...safe(a.today).map(x => ({...x, timing:'להיום'})),
      ...safe(a.upcoming).map(x => ({...x, timing:'קרוב'})),
      ...safe(a.undated).map(x => ({...x, timing:'ללא תאריך'}))
    ];
    const timingCls = (t) => t === 'באיחור' ? 'p-red' : t === 'להיום' ? 'p-amber' : 'p-gray';
    const actionChip = (x) => {
      const opener = x.entity === 'project' ? 'Project' : 'Opp';
      return `<button class="action-chip" onclick="BOS.open${opener}('${x.id}')"><span><b>${esc(x.action || 'המשך טיפול')}</b><small>${esc(x.title || '')}${x.organizationName ? ' · ' + esc(x.organizationName) : ''}</small></span><span class="chip-end"><span class="pill ${timingCls(x.timing)}">${x.timing}</span><span class="action-arrow" aria-hidden="true">←</span></span></button>`;
    };
    const attentionCount = ['newLeads','oppsNoNextAction','overdueFollowups','waitingProposals','projectsAtRisk','overdueTasks','upcomingMilestones']
      .reduce((sum,key) => sum + safe(n[key]).length, 0);
    const momentum = attentionCount ? 'יש נושאים שמחכים לך' : 'הכול מתקדם בצורה טובה';

    V().innerHTML = `
      <div class="living-dashboard">
        <div class="living-head">
          <div class="living-title"><h2>העסק היום</h2><p>תמונה אחת שמחברת מכירות, לקוחות, עבודה וכספים</p></div>
          <button class="btn small" onclick="BOS.newOpp()">+ הזדמנות</button>
        </div>
        <div class="live-layout">
          <section class="business-map" aria-label="מפת הפעילות העסקית">
            <div class="map-caption"><b>מפת הפעילות</b><small>לחיצה על תחום פותחת את התמונה המלאה</small></div>
            <svg class="map-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d="M50 50 L50 15" stroke="#0c8f81"/>
              <path d="M50 50 L16 42" stroke="#2f6fdc"/>
              <path d="M50 50 L84 42" stroke="#6c4fd6"/>
              <path d="M50 50 L38 80" stroke="#1580b8"/>
              <path d="M50 50 L66 80" stroke="#c9820a"/>
            </svg>
            <button class="orbit-node node-sales" onclick="go('sales')" aria-label="מכירות — צינור ${money(s.pipeline || 0)}"><span class="node-icon" aria-hidden="true">↗</span><b>מכירות</b><strong>${money(s.pipeline || 0)}</strong><small>צינור · משוקלל ${money(s.weightedPipeline || 0)}</small></button>
            <button class="orbit-node node-clients" onclick="go('customers')" aria-label="${s.activeCustomers || 0} לקוחות פעילים"><span class="node-icon" aria-hidden="true">◎</span><strong>${s.activeCustomers || 0}</strong><b>לקוחות</b><small>לקוחות פעילים</small></button>
            <button class="orbit-node node-projects" onclick="go('work')" aria-label="${s.activeProjects || 0} פרויקטים פעילים"><span class="node-icon" aria-hidden="true">◈</span><strong>${s.activeProjects || 0}</strong><b>פרויקטים</b><small>ביצוע ותוצאות</small></button>
            <button class="orbit-node node-finance" onclick="go('finance')" aria-label="כספים — הכנסה חודשית חוזרת ${money(s.mrr || 0)}"><span class="node-icon" aria-hidden="true">₪</span><b>כספים</b><strong>${money(s.mrr || 0)}</strong><small>הכנסה חודשית חוזרת</small></button>
            <button class="orbit-node node-tasks" onclick="go('tasks')" aria-label="${safe(n.overdueTasks).length} משימות באיחור"><span class="node-icon" aria-hidden="true">✓</span><strong>${safe(n.overdueTasks).length}</strong><b>משימות</b><small>משימות באיחור</small></button>
            <div class="business-core"><span class="pulse" aria-hidden="true">↗</span><b>העסק היום</b><small>כל התחומים מחוברים</small><em>● ${momentum}</em></div>
            <div class="map-preview"><b>הצעות ממתינות</b><small>דורשות החלטה או מעקב</small><div class="preview-val">${s.proposalsWaiting || 0}</div></div>
          </section>
          <aside class="attention-panel">
            <div class="attention-title"><h3>דורש טיפול</h3><span class="attention-badge">${attentionCount}</span></div>
            ${attn.join('') || '<div class="living-empty">הכול תחת שליטה ✓</div>'}
          </aside>
        </div>
        <section class="action-dock">
          <div class="action-dock-head"><h3>מה כדאי לעשות עכשיו</h3>${allActions.length ? `<span>${allActions.length} פעולות פתוחות</span>` : '<span aria-hidden="true">⚡</span>'}</div>
          <div class="action-list">
            ${allActions.length ? allActions.slice(0,6).map(actionChip).join('') : '<div class="living-empty" style="grid-column:1/-1">אין כרגע פעולות פתוחות</div>'}
          </div>
        </section>
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
  // צנרת מכירה: הצעת מחיר → הזמנה → הושלם → קבלה. קנבן 4 עמודות המוזן ממיזוג
  // quotes (ללא עסקה עדיין) + sales_deals (GET /sales/pipeline) — ר' src/api/sales.ts.
  async function salesQuotes(body) {
    let rows = []; try { rows = await apiGet('/sales/pipeline'); } catch (e) {}
    try {
      if (typeof QUOTES_CACHE !== 'undefined') QUOTES_CACHE = rows.filter((r) => r.kind === 'quote').map((r) => ({ id: r.quoteId, clientName: r.clientName, total: r.total, createdAt: r.createdAt, quoteNo: r.quoteNo }));
    } catch (e) {}
    const m0 = (n) => '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });
    const dateStr = (t) => new Date(t).toLocaleDateString('he-IL');

    const quoteCol = rows.filter((r) => r.stage === 'quote');
    const orderCol = rows.filter((r) => r.stage === 'order');
    const completedCol = rows.filter((r) => r.stage === 'completed');
    const issuedCol = rows.filter((r) => r.stage === 'receipt_issued');

    const quoteCard = (q) => `<div class="kcard">
      <b>${esc(q.clientName || '—')}</b><small>${esc(q.quoteNo || '')} · ${dateStr(q.createdAt)}</small>
      <div class="row" style="justify-content:space-between;margin-top:5px"><b class="li-val" style="color:var(--accent-2)">${m0(q.total)}</b></div>
      <div class="row" style="gap:6px;margin-top:6px">
        <button class="btn small ghost" onclick="quoteReopen('${q.quoteId}')" title="פתח והדפס PDF">🖨️</button>
        <button class="btn small primary" onclick="openOrderFromQuote('${q.quoteId}')" title="פתח הזמנה">🧾 פתח הזמנה</button>
        <button class="btn small ghost" onclick="BOS.delQuote('${q.quoteId}')" title="מחק">🗑</button>
      </div></div>`;

    const orderCard = (d) => `<div class="kcard">
      <b>${esc(d.clientName || '—')}</b><small>${dateStr(d.createdAt)}</small>
      <div class="row" style="justify-content:space-between;margin-top:5px"><b class="li-val" style="color:var(--accent-2)">${m0(d.totalAmount)}</b></div>
      <div class="row" style="gap:6px;margin-top:6px"><button class="btn small primary" onclick="dealMarkCompleted('${d.dealId}')" title="סמן כהושלם">✅ סמן כהושלם</button></div></div>`;

    const completedCard = (d) => `<div class="kcard">
      <b>${esc(d.clientName || '—')}</b><small>${dateStr(d.createdAt)}</small>
      <div class="row" style="justify-content:space-between;margin-top:5px"><b class="li-val" style="color:var(--accent-2)">${m0(d.totalAmount)}</b></div>
      <div class="row" style="gap:6px;margin-top:6px"><button class="btn small primary" onclick='receiptForm(${j(d)})' title="הפק קבלה">🧾 הפק קבלה</button></div></div>`;

    const issuedCard = (d) => `<div class="kcard">
      <b>${esc(d.clientName || '—')}</b><small>${dateStr(d.createdAt)}</small>
      ${(d.receipts || []).map((r) => `<div class="row" style="justify-content:space-between;margin-top:5px;padding-top:5px;border-top:1px dashed var(--line)">
        <small>${r.kind === 'credit' ? '↩️ זיכוי' : 'קבלה'} #${r.receiptNo} · ${m0(r.amount)}</small>
        <span class="row" style="gap:4px">
          <button class="btn small ghost" onclick="receiptReopen('${r.id}')" title="הדפסה חוזרת">🖨️</button>
          ${r.kind === 'receipt' ? `<button class="btn small ghost" onclick='creditNoteForm(${j(r)})' title="קבלת זיכוי">↩️</button>` : ''}
        </span></div>`).join('')}
      <div class="row" style="gap:6px;margin-top:8px"><button class="btn small ghost" onclick='receiptForm(${j(d)})' title="קבלה נוספת">+ קבלה נוספת</button></div></div>`;

    const col = (title, items, render) => `<div class="kcol"><div class="kcol-h"><span>${title}</span><span class="cnt">${items.length}</span></div>
      ${items.map(render).join('') || '<div class="empty" style="padding:10px">—</div>'}</div>`;

    body.innerHTML = `<div class="spread" style="margin-bottom:10px"><p class="hint" style="color:var(--muted);margin:0">הצעת מחיר → הזמנה → הושלם → קבלה. ${typeof quoteForm === 'function' ? '' : ''}</p>${typeof quoteForm === 'function' ? '<button class="btn small" onclick="quoteForm()">+ הצעת מחיר</button>' : ''}</div>
      <div class="kanban">
        ${col('הצעת מחיר', quoteCol, quoteCard)}
        ${col('הזמנה', orderCol, orderCard)}
        ${col('הושלם', completedCol, completedCard)}
        ${col('קבלה הופקה', issuedCol, issuedCard)}
      </div>`;
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

  /* =========================== הגדרות =========================== */
  // מסך הגדרות ייעודי — כרגע טאב יחיד "פרטי עסק"; קטגוריית הגדרות עתידית = שורה אחת ב-tabBar + branch.
  RENDER.settings = async () => {
    const active = TAB.settings || 'business';
    V().innerHTML = tabBar('settings', [['business', 'פרטי עסק']], active) + '<div id="settingsBody"><div class="empty">טוען…</div></div>';
    const body = document.getElementById('settingsBody');
    if (active === 'business') return settingsBusiness(body);
  };
  async function settingsBusiness(body) {
    let s = {}; try { s = await apiGet('/business-settings'); } catch (e) {}
    const inp = 'width:100%;padding:9px 11px;border:1.5px solid #d9d2c4;border-radius:9px;font-family:inherit;font-size:.95rem;background:#fff';
    const field = (id, label, val, ph) => `<div class="f"><label>${label}</label><input id="${id}" value="${esc(val || '')}" placeholder="${esc(ph || '')}" style="${inp}"></div>`;
    body.innerHTML = `
      ${!s.complete ? '<div class="card" style="border:1px solid #b42323;background:#fdecec;margin-bottom:12px"><b style="color:#b42323">⚠ קבלות לא ניתנות להפקה</b><div class="hint">יש להשלים מספר עוסק וכתובת עסק לפני שאפשר להפיק קבלה חוקית.</div></div>' : ''}
      <div class="card">
        <div class="f2">
          ${field('bs_name', 'שם העסק', s.businessName, 'ORT-TECH')}
          ${field('bs_taxid', 'מספר עוסק (ע.מ / ח.פ)', s.businessTaxId, '000000000')}
        </div>
        ${field('bs_address', 'כתובת העסק', s.businessAddress, 'רחוב, מספר, עיר')}
        <div class="f2" style="margin-top:10px">
          ${field('bs_phone', 'טלפון', s.businessPhone)}
          ${field('bs_email', 'אימייל', s.businessEmail)}
        </div>
        <div class="f2" style="margin-top:10px">
          ${field('bs_website', 'אתר', s.businessWebsite)}
          ${field('bs_issuer', 'שם המנפיק (חתימה על קבלות)', s.issuerName)}
        </div>
        ${field('bs_logo', 'כתובת לוגו (יחסית לאתר)', s.businessLogoUrl, '/ort-tech-logo.png')}
        <div class="hint" style="margin-top:10px">מספר ההזמנה הבא: <b>${s.nextOrderNo ?? 1}</b> · מספר הקבלה הבא: <b>${s.nextReceiptNo ?? 1}</b></div>
        <div class="spread" style="margin-top:16px"><span></span><button class="btn primary" onclick="settingsBusinessSave()">שמירה</button></div>
      </div>`;
  }
  async function settingsBusinessSave() {
    const body = {
      businessName: val('bs_name'), businessTaxId: val('bs_taxid'), businessAddress: val('bs_address'),
      businessPhone: val('bs_phone'), businessEmail: val('bs_email'), businessWebsite: val('bs_website'),
      issuerName: val('bs_issuer'), businessLogoUrl: val('bs_logo'),
    };
    try { await apiPut('/business-settings', body); try { if (typeof BIZ_CACHE !== 'undefined') BIZ_CACHE = null; } catch (e) {} toast('נשמר ✓'); }
    catch (e) { toast('שגיאה בשמירה', 'bad'); return; }
    TAB.settings = 'business'; go('settings');
  }

  /* =========================== לקוחות =========================== *
   * רשימת לקוחות אחת בלבד — הניווט הראשי "לקוחות" מנתב לרשימה המאוחדת
   * (RENDER.portfolio ב-index.html): אקורדיון לקוחות+מערכות, חיפוש, מדדי CRM,
   * ארכיון (פעילים/ארכיון + העבר/שחזר/מחק), ופתיחת כרטיס הלקוח המאוחד.
   * פעולות הארכיון (archiveOrg/restoreOrg/deleteOrg) נשמרות כאן ונקראות מהרשימה המאוחדת. */
  RENDER.customers = (...a) => RENDER.portfolio(...a);

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
    const propRows = d.proposals.map((p) => `<div class="list-item"><div class="li-main"><b>גרסה ${p.version}</b><small>${money(p.oneTimeValue)} + ${money(p.monthlyValue)}/ח׳</small></div><div class="row" style="gap:6px">${hp('proposalStatus', p.status)}<button class="btn small ghost" onclick="BOS.proposalPdf('${p.id}','${id}')" title="הפק הצעה + תיחום (SOW) ל-PDF">📄 PDF</button>${p.status === 'draft' ? `<button class="btn small ghost" onclick="BOS.editProposal('${p.id}','${id}')" title="עריכת תיחום וסכומים">✎</button>` : ''}<button class="btn small" onclick="BOS.propStatus('${p.id}','${id}')">סטטוס</button>${p.status === 'accepted' ? `<button class="btn small" onclick="BOS.propToEngagement('${p.id}','${id}')">→ התקשרות</button>` : ''}</div></div>`).join('') || '<div class="empty">—</div>';
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

  /* =========================== כרטיס לקוח מאוחד ===========================
   * אין עוד כרטיס ארגון נפרד — openOrg מנתב לכרטיס הלקוח היחיד (openClient
   * שב-index.html, מסך מלא), כדי שיהיה כרטיס אחד לכל לקוח מכל מקום רלוונטי. */
  async function openOrg(id) { return window.openClient(id); }

  /* =========================== פעולות / טפסים =========================== */
  const fInput = (id, label, val = '', type = 'text') => `<div class="f"><label>${label}</label><input id="${id}" type="${type}" value="${esc(val)}"></div>`;
  const fArea = (id, label, val = '', ph = '') => `<div class="f"><label>${label}</label><textarea id="${id}" rows="3" placeholder="${esc(ph)}" style="width:100%;font-family:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--txt);resize:vertical">${esc(val)}</textarea></div>`;

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

  // טופס הצעה + תיחום עבודה (SOW). p = הצעה קיימת לעריכה, אחרת יצירה חדשה.
  function proposalForm(oppId, p) {
    const v = p || {};
    return `<h3>${p ? 'עריכת הצעה — גרסה ' + p.version : 'הצעה ותיחום עבודה (SOW)'}</h3>
      ${fArea('pp_notes', 'מה נבנה (תיאור קצר)', v.notes || '', 'תקציר 2–3 שורות + הפניה למסמך האפיון')}
      ${fArea('pp_inc', 'תכולה — כלול', v.scopeIncluded || '', 'מה בדיוק מספקים')}
      ${fArea('pp_exc', 'תכולה — לא כלול (יתומחר בנפרד)', v.scopeExcluded || '', 'אינטגרציות, מיגרציה, שינויים אחרי אישור…')}
      <div class="grid2" style="gap:0 11px">${fInput('pp_ot', 'הקמה — חד-פעמי (₪)', v.oneTimeValue || '', 'number')}${fInput('pp_mo', 'חודשי (₪)', v.monthlyValue || '', 'number')}</div>
      ${fArea('pp_assum', 'הנחות יסוד', v.assumptions || '')}
      ${fArea('pp_dep', 'תלויות', v.dependencies || '', 'מה נדרש מהלקוח כדי להתקדם')}
      ${fInput('pp_valid', 'בתוקף עד', v.validUntil || '', 'date')}
      <div class="modal-actions"><button class="btn primary" onclick="BOS.${p ? '_editProposal' : '_newProposal'}('${p ? p.id : oppId}','${oppId}')">${p ? 'שמירה' : 'יצירה'}</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`;
  }
  function proposalPayload() {
    return {
      oneTimeValue: valN('pp_ot'), monthlyValue: valN('pp_mo'), validUntil: val('pp_valid'),
      scopeIncluded: val('pp_inc'), scopeExcluded: val('pp_exc'),
      assumptions: val('pp_assum'), dependencies: val('pp_dep'), notes: val('pp_notes'),
    };
  }
  async function newProposal(oppId) { openModal(proposalForm(oppId, null)); }
  async function _newProposal(oppId) { await apiPost('/proposals', { opportunityId: oppId, ...proposalPayload() }); closeModal(); toast('נוצרה הצעה ✓'); openOpp(oppId); }
  async function editProposal(propId, oppId) { const p = await apiGet('/proposals/' + propId); openModal(proposalForm(oppId, p)); }
  async function _editProposal(propId, oppId) { try { await apiPatch('/proposals/' + propId, proposalPayload()); toast('נשמר ✓'); } catch (e) { toast(String(e && e.message) === 'locked_create_new_version' ? 'הצעה שנשלחה — צור גרסה חדשה' : 'שגיאה', 'bad'); } closeModal(); openOpp(oppId); }

  // הפקת מסמך הצעה + תיחום עבודה (SOW) ל-PDF ממותג — מאחד תבנית, סכומים ותיחום למקום אחד
  async function proposalPdf(propId, oppId) {
    try {
      const [p, od] = await Promise.all([apiGet('/proposals/' + propId), apiGet('/opportunities/' + oppId)]);
      proposalRenderPrint(p, od.opportunity, od.organization);
    } catch (e) { toast('שגיאה בהפקת המסמך', 'bad'); }
  }
  function proposalRenderPrint(p, opp, org) {
    const f = (n) => '<span class="ltr">₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 }) + '</span>';
    const created = new Date(p.createdAt || Date.now());
    const client = (org && org.name) || '', subject = (opp && opp.title) || '';
    const validStr = p.validUntil ? new Date(p.validUntil + 'T12:00:00').toLocaleDateString('he-IL') : '';
    const logoUrl = location.origin + '/ort-tech-logo.png';
    const nl = (s) => esc(s || '').replace(/\n/g, '<br>');
    const bill = [];
    if (Number(p.oneTimeValue)) bill.push(['הקמה (חד-פעמי)', f(p.oneTimeValue), '50% מקדמה']);
    if (Number(p.monthlyValue)) bill.push(['חודשי / ריטיינר', f(p.monthlyValue) + ' /ח׳', 'לפי יום חיוב']);
    const sec = (title, body) => body && String(body).trim() ? `<div class="sec"><b>${title}</b>${nl(body)}</div>` : '';
    const html = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>הצעה ותיחום עבודה — ' + esc(subject) + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&display=swap" rel="stylesheet"><style>' +
      '*{margin:0;padding:0;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}' +
      '.ltr{direction:ltr;unicode-bidi:isolate}' +
      "body{font-family:'Heebo','Assistant','Arial Hebrew','Segoe UI',Arial,sans-serif;color:#16202e;padding:46px 54px;font-size:14px;line-height:1.7;background:#fff}" +
      '.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0f7a5c;padding-bottom:16px;margin-bottom:24px}' +
      '.logo-crop{display:flex;align-items:center;justify-content:flex-end}.logo-crop img{height:54px;width:auto;display:block}' +
      '.biz{font-size:12.5px;color:#3d4b5e;line-height:1.55;text-align:left;margin-top:6px;direction:ltr;unicode-bidi:isolate}' +
      'h1{font-size:24px;margin-bottom:2px}.meta{color:#6b7a8d;font-size:13px}' +
      '.to{margin:18px 0 4px;font-size:15px}.subject{font-size:16px;font-weight:700;margin-bottom:4px}' +
      'table{width:100%;border-collapse:collapse;margin:8px 0 2px}' +
      'th{background:#f4efe6;text-align:right;padding:9px 12px;font-size:13px;border-bottom:2px solid #0f7a5c}' +
      'td{padding:9px 12px;border-bottom:1px solid #e3dccf}td.amt,th.amt{text-align:left;white-space:nowrap;width:150px}' +
      '.sec{margin-top:15px;font-size:13.5px}.sec b{display:block;margin-bottom:2px;color:#0f7a5c}' +
      '.vatnote{font-size:12px;color:#6b7a8d;margin-top:4px}' +
      '.sig{margin-top:40px;display:flex;justify-content:space-between;align-items:flex-end;gap:30px}' +
      '.sig .line{width:210px;border-top:1.5px solid #16202e;padding-top:5px;text-align:center;font-size:12.5px;color:#3d4b5e}' +
      '.foot{margin-top:30px;border-top:1px solid #e3dccf;padding-top:9px;font-size:11.5px;color:#6b7a8d;display:flex;justify-content:space-between}' +
      '@media print{body{padding:20px 26px}}</style></head><body>' +
      '<div class="hdr"><div><h1>הצעה ותיחום עבודה</h1><div class="meta">גרסה <span class="ltr">' + (p.version || 1) + '</span> · תאריך: <span class="ltr">' + created.toLocaleDateString('he-IL') + '</span>' + (validStr ? ' · בתוקף עד <span class="ltr">' + validStr + '</span>' : '') + '</div></div>' +
      '<div><div class="logo-crop"><img src="' + logoUrl + '" alt="ORT-TECH"></div><div class="biz">050-4860199 · menahemtzik1@gmail.com · ort-tech.co.il</div></div></div>' +
      '<div class="to">לכבוד: <b>' + esc(client) + '</b></div>' +
      (subject ? '<div class="subject">הנדון: ' + esc(subject) + '</div>' : '') +
      sec('מה נבנה', p.notes) +
      sec('תכולת העבודה — כלול', p.scopeIncluded) +
      sec('לא כלול (יתומחר בנפרד)', p.scopeExcluded) +
      (bill.length ? '<div class="sec"><b>מודל חיוב</b></div><table><thead><tr><th>רכיב</th><th class="amt">סכום</th><th style="width:120px">מועד</th></tr></thead><tbody>' +
        bill.map((r) => '<tr><td>' + r[0] + '</td><td class="amt">' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('') +
        '</tbody></table><div class="vatnote">המחירים אינם כוללים מע״מ.</div>' : '') +
      sec('הנחות יסוד', p.assumptions) +
      sec('תלויות', p.dependencies) +
      '<div class="sec"><b>תנאים</b>שינויי היקף מתומחרים בנפרד ומאושרים בכתב. בעלות על הקוד/הנתונים עוברת ללקוח עם השלמת התשלום. תמיכה לפי מסמך SLA נפרד.</div>' +
      '<div class="sig"><div><div style="font-weight:700">בברכה,</div><div>ORT-TECH · פתרונות תפעול חכמים לעסק שלך</div></div><div class="line">חתימת הלקוח ואישור ההצעה</div></div>' +
      '<div class="foot"><span>ORT-TECH · ort-tech.co.il</span><span>עסק של מילואימניק · גאה לשרת, גאה לבנות</span></div>' +
      '<scr' + 'ipt>window.onload=function(){var done=false;var go=function(){if(done)return;done=true;setTimeout(function(){window.print()},250)};(document.fonts&&document.fonts.ready?document.fonts.ready.then(go):go());setTimeout(go,1500)}</scr' + 'ipt></body></html>';
    const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), '_blank');
    if (!w) toast('המסמך מוכן אך הדפדפן חסם חלון קופץ', 'bad');
  }

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
    newProposal, _newProposal, editProposal, _editProposal, proposalPdf, propStatus, _propStatus, propToEngagement,
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
