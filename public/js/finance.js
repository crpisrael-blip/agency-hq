/* finance.js — מרכז שליטה פיננסי (Finance Control).
 * מחליף את מסך "כספים" ב-BOS במרכז שליטה מלא: שליטה · הכנסות · הוצאות · תזרים · תחזית · רווחיות.
 * נטען אחרי bos.js ולכן דורס את RENDER.finance. RTL מלא, עברית, מחובר לנתונים אמיתיים בלבד.
 * מסתמך על עוזרים גלובליים של app.html: apiGet/apiPost/apiPatch/apiPut/apiDel, money, money1,
 * esc, openModal, closeModal, toast, go, RENDER, $, todayISO, CACHE, clientOptions, loadRefs. */
(function () {
  const V = () => document.getElementById('view');
  const FB = () => document.getElementById('finBody');
  const fmt = (d) => (d ? String(d).split('-').reverse().join('/') : '');
  const r0 = (n) => Math.round(n || 0);

  // --- סגנונות ייחודיים למודול (מוזרקים פעם אחת) ---
  const style = document.createElement('style');
  style.textContent = `
    .fin-status{border-radius:14px;padding:12px 15px;margin-bottom:14px;border:1px solid;font-weight:700;font-size:.92rem;display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
    .fin-status.ok{background:rgba(34,197,94,.10);border-color:rgba(34,197,94,.4);color:#0a7f5a}
    .fin-status.attention{background:rgba(246,183,60,.12);border-color:rgba(246,183,60,.45);color:#9a6a00}
    .fin-status.critical{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.45);color:#b42323}
    .fin-status .dot{font-size:1.1rem;line-height:1}
    .fin-status ul{margin:2px 0 0;padding-inline-start:18px;font-weight:600}
    .kpi.clk{cursor:pointer;position:relative;transition:border-color .12s,transform .12s}
    .kpi.clk:hover{border-color:var(--accent)}
    .kpi.clk:active{transform:scale(.985)}
    .kpi .q{position:absolute;inset-inline-end:10px;inset-block-start:10px;font-size:.7rem;color:var(--muted);opacity:.6}
    .kpi.blue b{color:#1741d6}.kpi.red b{color:#b42323}.kpi.gray b{color:var(--muted)}
    .fin-chart{width:100%;height:auto;display:block;overflow:visible}
    .fin-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.78rem;color:var(--muted);margin-top:8px}
    .fin-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-inline-end:5px;vertical-align:middle}
    .aging{display:flex;flex-direction:column;gap:7px}
    .aging-row{display:grid;grid-template-columns:110px 1fr auto;gap:10px;align-items:center;font-size:.83rem}
    .aging-bar{height:9px;border-radius:999px;background:var(--bg-2);overflow:hidden}
    .aging-bar>span{display:block;height:100%;border-radius:999px}
    .fin-tbl{width:100%;border-collapse:collapse;font-size:.85rem}
    .fin-tbl th,.fin-tbl td{padding:8px 9px;text-align:start;border-bottom:1px solid var(--line);white-space:nowrap}
    .fin-tbl th{color:var(--muted);font-weight:700;font-size:.76rem}
    .fin-tbl td.num,.fin-tbl th.num{text-align:end;font-variant-numeric:tabular-nums}
    .fin-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
    .fin-clk:hover td{background:var(--bg-2)}
    .fin-detail>td{background:var(--bg-2)}
    .fin-sec-h{display:flex;justify-content:space-between;align-items:center;margin:0 0 10px}
    .fin-sec-h h3{margin:0;font-size:1rem}
    .exc{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line)}
    .exc:last-child{border-bottom:0}
    .exc .ico{font-size:1.05rem;line-height:1.3}
    .exc .body{flex:1;min-width:0}
    .exc .body b{display:block;font-size:.9rem}
    .exc .body small{color:var(--muted);font-size:.78rem;display:block;margin-top:1px}
    .exc .acts{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
    .exc .acts button{font-size:.74rem;padding:3px 9px}
    .dq{display:inline-flex;gap:6px;align-items:center;font-size:.78rem}
    @media(max-width:560px){.aging-row{grid-template-columns:84px 1fr auto}}
  `;
  document.head.appendChild(style);

  // ---------- state ----------
  let FIN_TAB = 'control';
  let FC_MONTHS = 12;
  let FC_SCEN = 'realistic';
  let EXP_FILTER = 'all';
  let HIST_MONTHS = 6;
  const HIST_OPEN = {};   // ym -> true  (שורות חודש פתוחות בהיסטוריה)
  const FC_OPEN = {};     // ym -> true  (שורות חודש פתוחות בתחזית)

  // fetch עם טוקן מנהל שאינו-JSON (העלאה/הורדת קבצי קבלה)
  const authFetch = (path, opts = {}) => fetch('/api' + path, {
    ...opts,
    headers: { 'x-admin-token': (typeof TOKEN !== 'undefined' ? TOKEN : localStorage.getItem('agencyhq_token')) || '', ...(opts.headers || {}) },
  });

  // ---------- עזרי תצוגה ----------
  const m = (n) => money(n);
  const tierMap = { actual: ['p-green', 'בפועל'], committed: ['p-teal', 'מחויב'], expected: ['p-blue', 'צפוי'], potential: ['p-gray', 'פוטנציאלי'] };
  const sevMap = { info: ['p-blue', 'ℹ️'], warning: ['p-amber', '⚠️'], critical: ['p-red', '🔴'] };
  const ratingMap = { high: ['p-green', 'רווחי מאוד'], ok: ['p-teal', 'תקין'], review: ['p-amber', 'דורש בדיקה'], low: ['p-red', 'בעייתי'] };
  const tierPill = (t) => { const x = tierMap[t] || ['p-gray', t]; return `<span class="pill ${x[0]}">${x[1]}</span>`; };
  const dqMap = { high: ['p-green', 'גבוהה'], medium: ['p-amber', 'בינונית'], low: ['p-red', 'נמוכה'] };

  // KPI לחיץ עם הסבר "איך חושב?"
  const EXPLAIN = {
    currentBalance: ['יתרה נוכחית', 'היתרה מבוססת על עדכון היתרה האחרון (snapshot). אם לא עודכנה — יתרת הפתיחה. עדכן דרך "עדכן יתרה".'],
    expectedIncomeMonth: ['צפוי להיכנס החודש', 'סכום ההכנסות הצפויות החודש בתרחיש הריאלי: התקשרויות מחויבות + הכנסות צפויות + צינור משוקלל לפי הסתברות.'],
    expectedExpenseMonth: ['צפוי לצאת החודש', 'סכום ההוצאות הצפויות החודש: הוצאות חוזרות קבועות + הוצאות חד-פעמיות מתוזמנות.'],
    expectedNetMonth: ['נטו צפוי החודש', 'הכנסות צפויות פחות הוצאות צפויות החודש (Expected Net = Expected Income − Expected Expenses).'],
    expectedEndBalance: ['יתרה צפויה בסוף החודש', 'יתרה נוכחית + נטו צפוי החודש (Expected End Balance = Current Balance + Expected Net).'],
    receivables: ['חייבים לי', 'סך התשלומים הצפויים שטרם התקבלו (חשבוניות/תשלומים פתוחים לפי מועד).'],
    overdueReceivables: ['באיחור', 'מתוך החייבים — הסכום שמועד התשלום שלו כבר חלף.'],
    mrr: ['MRR', 'הכנסה חוזרת חודשית מכל ההתקשרויות הפעילות (לפי מודל החיוב של כל אחת).'],
    fixedMonthlyCosts: ['הוצאות קבועות', 'עלות חודשית שקולה של הוצאות חוזרות: חודשי + שנתי/12.'],
    operatingContribution: ['רווח תפעולי צפוי', 'הכנסה חודשית פחות עלויות ישירות ו-overhead (Operating Contribution).'],
  };
  function kpi(key, value, cls) {
    const meta = EXPLAIN[key];
    const lbl = meta ? meta[0] : key;
    return `<div class="kpi clk ${cls || ''}" onclick="FIN.explain('${key}')"><span class="q">?</span><b>${value}</b><small>${lbl}</small></div>`;
  }
  function explain(key) {
    const meta = EXPLAIN[key];
    if (!meta) return;
    openModal(`<h3>${esc(meta[0])}</h3><p style="color:var(--muted);line-height:1.7;font-size:.92rem">${esc(meta[1])}</p>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">סגירה</button></div>`);
  }

  // ---------- גרף קווי (SVG, responsive, RTL-safe) ----------
  function lineChart(labels, series, threshold) {
    const W = 640, H = 240, padL = 48, padR = 14, padT = 14, padB = 26;
    const all = series.flatMap((s) => s.values).concat(threshold != null ? [threshold] : []);
    let min = Math.min(0, ...all), max = Math.max(...all, 0);
    if (min === max) max = min + 1;
    const span = max - min;
    const n = labels.length || 1;
    const xAt = (i) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
    const yAt = (v) => padT + (1 - (v - min) / span) * (H - padT - padB);
    const yZero = yAt(0);
    const gridVals = [max, min + span * 0.5, min].map((v) => Math.round(v));
    const grid = gridVals.map((v) => `<line x1="${padL}" y1="${yAt(v)}" x2="${W - padR}" y2="${yAt(v)}" stroke="var(--line)" stroke-width="1"/><text x="${padL - 6}" y="${yAt(v) + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${money1(v)}</text>`).join('');
    const zero = (min < 0 && max > 0) ? `<line x1="${padL}" y1="${yZero}" x2="${W - padR}" y2="${yZero}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="2 3"/>` : '';
    const thr = threshold != null ? `<line x1="${padL}" y1="${yAt(threshold)}" x2="${W - padR}" y2="${yAt(threshold)}" stroke="#b42323" stroke-width="1.4" stroke-dasharray="5 4"/><text x="${W - padR}" y="${yAt(threshold) - 4}" text-anchor="end" font-size="9" fill="#b42323">סף מזומן</text>` : '';
    const step = Math.max(1, Math.ceil(n / 6));
    const xlabels = labels.map((l, i) => (i % step === 0 || i === n - 1) ? `<text x="${xAt(i)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${esc(l)}</text>` : '').join('');
    const paths = series.map((s) => {
      const pts = s.values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
      const dots = s.values.map((v, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="2" fill="${s.color}"/>`).join('');
      return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${s.values.length <= 14 ? dots : ''}`;
    }).join('');
    const legend = `<div class="fin-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}${threshold != null ? '<span><i style="background:#b42323"></i>סף מזומן</span>' : ''}</div>`;
    return `<div class="fin-scroll"><svg class="fin-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="גרף תחזית">${grid}${zero}${thr}${paths}${xlabels}</svg></div>${legend}`;
  }

  const C = { committed: '#0a7f6b', realistic: '#1741d6', optimistic: '#7a2fb0', income: '#0a7f5a', expense: '#b42323' };

  // ================= לשוניות =================
  const TABS = [
    ['control', 'שליטה'], ['income', 'הכנסות'], ['expenses', 'הוצאות'], ['history', 'היסטוריה'],
    ['cashflow', 'תזרים'], ['forecast', 'תחזית'], ['scenarios', 'תרחישים'], ['profitability', 'רווחיות'],
    ['overview', 'סקירה'], ['engagements', 'התקשרויות'], ['calculator', 'מחשבון'],
  ];
  function tabbar(active) {
    active = active || FIN_TAB;
    return `<div class="tabs2">${TABS.map(([k, l]) => `<button class="${k === active ? 'on' : ''}" onclick="FIN.tab('${k}')">${l}</button>`).join('')}</div>`;
  }

  // לשוניות המפנות למסכים ותיקים (מסך מלא). מטופלות דרך עטיפת go שמחזירה את הסרגל.
  const LEGACY_FIN = { cashflow: 1, engagements: 1, calculator: 1 };

  RENDER.finance = async () => {
    if (LEGACY_FIN[FIN_TAB]) return go(FIN_TAB); // go העטוף מזריק בחזרה את סרגל הכספים
    V().innerHTML = tabbar() + '<div id="finBody"><div class="empty">טוען…</div></div>';
    try {
      if (FIN_TAB === 'income') return await renderIncome();
      if (FIN_TAB === 'expenses') return await renderExpenses();
      if (FIN_TAB === 'history') return await renderHistory();
      if (FIN_TAB === 'forecast') return await renderForecast();
      if (FIN_TAB === 'scenarios') return await renderScenarios();
      if (FIN_TAB === 'profitability') return await renderProfit();
      if (FIN_TAB === 'overview') return await renderOverview();
      return await renderControl();
    } catch (e) {
      if (FB()) FB().innerHTML = '<div class="empty">שגיאה בטעינת הנתונים. נסה שוב.</div>';
    }
  };
  function tab(k) { FIN_TAB = k; go('finance'); }

  // ================= מסך שליטה =================
  async function renderControl() {
    const d = await apiGet('/finance/control');
    const s = d.summary;
    const stt = d.status || { tone: 'ok', lines: [] };
    const statusBanner = `<div class="fin-status ${stt.tone}"><span class="dot">${stt.tone === 'ok' ? '🟢' : stt.tone === 'attention' ? '🟡' : '🔴'}</span>
      <div><b>מצב העסק</b>${stt.lines.length ? `<ul>${stt.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<div>אין נתונים מספיקים — הוסף התקשרויות והוצאות.</div>'}</div></div>`;

    const kpis = `<div class="kpis">
      ${kpi('currentBalance', m(s.currentBalance), '')}
      ${kpi('expectedIncomeMonth', m(s.expectedIncomeMonth), 'green')}
      ${kpi('expectedExpenseMonth', m(s.expectedExpenseMonth), 'red')}
      ${kpi('expectedNetMonth', m(s.expectedNetMonth), s.expectedNetMonth < 0 ? 'red' : 'green')}
      ${kpi('expectedEndBalance', m(s.expectedEndBalance), s.expectedEndBalance < (d.cashPosition.threshold || 0) ? 'amber' : '')}
      ${kpi('receivables', m(s.receivables), 'blue')}
      ${kpi('overdueReceivables', m(s.overdueReceivables), s.overdueReceivables > 0 ? 'red' : '')}
      ${kpi('mrr', m(s.mrr), 'green')}
      ${kpi('fixedMonthlyCosts', m(s.fixedMonthlyCosts), '')}
      ${kpi('operatingContribution', m(s.operatingContribution), s.operatingContribution < 0 ? 'red' : 'green')}
    </div>`;

    // גרף תחזית — 3 קווים
    const fc = d.forecast;
    const labels = fc.realistic.map((b) => b.label);
    const chart = labels.length ? lineChart(labels, [
      { name: 'מחויב', color: C.committed, values: fc.committed.map((b) => b.balance) },
      { name: 'ריאלי', color: C.realistic, values: fc.realistic.map((b) => b.balance) },
      { name: 'אופטימי', color: C.optimistic, values: fc.optimistic.map((b) => b.balance) },
    ], fc.threshold || null) : '<div class="empty">אין עדיין נתונים לתחזית</div>';

    // דורש טיפול
    const alertsHtml = d.alerts.length
      ? d.alerts.slice(0, 12).map(excRow).join('')
      : '<div class="empty">אין חריגות פתוחות — הכול תקין 👌</div>';

    // 30 הימים הקרובים
    const up = d.upcoming.slice(0, 12);
    const upHtml = up.length ? up.map((e) => `<div class="list-item"><div class="li-main"><b>${esc(e.label)}</b><small>${fmt(e.date)} · ${tierMap[e.tier] ? tierMap[e.tier][1] : ''}</small></div>
      <b class="li-val" style="color:${e.kind === 'income' ? 'var(--green)' : '#b42323'}">${e.kind === 'income' ? '+' : '−'}${m(e.amount)}</b></div>`).join('')
      : '<div class="empty">אין תנועות מתוזמנות ב-30 הימים הקרובים</div>';

    // הכנסות מול הוצאות (החודש)
    const mo = d.month;
    const incExp = mo ? `<div class="row" style="gap:10px;align-items:stretch;flex-wrap:wrap">
      <div class="kpi green" style="flex:1;min-width:130px"><b>${m(mo.income)}</b><small>הכנסות ${mo.label}</small></div>
      <div class="kpi red" style="flex:1;min-width:130px"><b>${m(mo.expense)}</b><small>הוצאות ${mo.label}</small></div>
      <div class="kpi ${mo.net < 0 ? 'red' : 'green'}" style="flex:1;min-width:130px"><b>${m(mo.net)}</b><small>נטו ${mo.label}</small></div>
    </div>` : '';

    // רווחיות לקוחות (top)
    const prof = d.profitability;
    const profHtml = prof.clients.length ? `<div class="fin-scroll"><table class="fin-tbl"><thead><tr><th>לקוח</th><th class="num">הכנסה</th><th class="num">תרומה</th><th class="num">מרווח</th><th></th></tr></thead><tbody>
      ${prof.clients.slice(0, 6).map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${m(c.revenue)}</td><td class="num">${m(c.contribution)}</td><td class="num">${c.margin}%</td><td>${ratingPill(c.rating)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">אין נתוני רווחיות — צריך התקשרויות פעילות</div>';

    // Pipeline
    const pl = d.pipeline;
    const plHtml = `<div class="kpis" style="margin:0">
      <div class="kpi accent"><b>${m(pl.total)}</b><small>צינור פתוח (${pl.count})</small></div>
      <div class="kpi accent"><b>${m(pl.weighted)}</b><small>צינור משוקלל</small></div>
      <div class="kpi"><b>${m(pl.recurringWeighted)}</b><small>חוזר משוקלל/ח׳</small></div>
    </div>`;

    const dq = d.dataQuality;

    FB().innerHTML = `
      <div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        <button class="btn small" onclick="FIN.addIncome()">+ הכנסה</button>
        <button class="btn small" onclick="FIN.addExpense()">+ הוצאה</button>
        <button class="btn small" onclick="FIN.updateBalance()">עדכן יתרה</button>
        <span class="dq">איכות תחזית: <span class="pill ${dqMap[dq.level][0]}">${dqMap[dq.level][1]}</span></span>
      </div>
      ${statusBanner}
      ${kpis}
      <div class="card"><div class="fin-sec-h"><h3>תחזית יתרה (${labels.length} ח׳)</h3><button class="btn small ghost" onclick="FIN.tab('forecast')">לתחזית המלאה →</button></div>${chart}</div>
      <div class="grid2" style="align-items:start">
        <div class="card"><div class="fin-sec-h"><h3>דורש טיפול</h3>${d.alerts.length ? `<span class="pill p-red">${d.alerts.length}</span>` : ''}</div>${alertsHtml}</div>
        <div class="card"><div class="fin-sec-h"><h3>30 הימים הקרובים</h3></div>${upHtml}</div>
      </div>
      ${incExp ? `<div class="card"><h3 style="margin:0 0 10px">הכנסות מול הוצאות</h3>${incExp}</div>` : ''}
      <div class="grid2" style="align-items:start">
        <div class="card"><div class="fin-sec-h"><h3>רווחיות לקוחות</h3><button class="btn small ghost" onclick="FIN.tab('profitability')">הכול →</button></div>${profHtml}</div>
        <div class="card"><div class="fin-sec-h"><h3>Pipeline כספי</h3><button class="btn small ghost" onclick="FIN.tab('income')">הכנסות →</button></div>${plHtml}</div>
      </div>`;
  }

  function ratingPill(rt) { const x = ratingMap[rt] || ['p-gray', rt]; return `<span class="pill ${x[0]}">${x[1]}</span>`; }

  function excRow(e) {
    const sev = sevMap[e.severity] || sevMap.info;
    return `<div class="exc"><span class="ico">${sev[1]}</span><div class="body">
      <b>${esc(e.title)}</b><small>${esc(e.message)}${e.amount != null ? ' · ' + m(e.amount) : ''}${e.dueDate ? ' · ' + fmt(e.dueDate) : ''}</small>
      ${e.recommendedAction ? `<small style="color:var(--accent-2)">↳ ${esc(e.recommendedAction)}</small>` : ''}
      <div class="acts">
        <button class="btn small ghost" onclick='FIN.exceptionTask(${JSON.stringify(e).replace(/'/g, "&#39;")})'>צור משימה</button>
        <button class="btn small ghost" onclick="FIN.dismissExc('${esc(e.key)}','resolve')">סמן כטופל</button>
        <button class="btn small ghost" onclick="FIN.dismissExc('${esc(e.key)}','dismiss')">דחה</button>
      </div></div></div>`;
  }

  async function dismissExc(key, action) {
    try { await apiPost('/finance/alerts/dismiss', { key, action }); toast(action === 'resolve' ? 'סומן כטופל' : 'נדחה'); go('finance'); }
    catch (e) { toast('שגיאה', 'bad'); }
  }
  async function exceptionTask(e) {
    try {
      await apiPost('/tasks', { title: e.title + (e.message ? ' — ' + e.message : ''), details: e.recommendedAction || '', entityType: e.entityType, entityId: e.entityId, priority: e.severity === 'critical' ? 'urgent' : 'high', dueDate: e.dueDate || '' });
      toast('נוצרה משימה ✓');
    } catch (err) { toast('שגיאה ביצירת משימה', 'bad'); }
  }

  // ================= הכנסות =================
  async function renderIncome() {
    const d = await apiGet('/finance/income');
    const k = d.kpis;
    const rec = d.receivables;
    const kpis = `<div class="kpis">
      <div class="kpi green"><b>${m(k.mrr)}</b><small>MRR</small></div>
      <div class="kpi"><b>${m(k.committedMonthly)}</b><small>מחויב/חודש</small></div>
      <div class="kpi blue"><b>${m(k.expectedMonthly)}</b><small>צפוי/חודש</small></div>
      <div class="kpi red"><b>${m(k.overdue)}</b><small>באיחור</small></div>
      <div class="kpi accent"><b>${m(k.pipeline)}</b><small>צינור פתוח</small></div>
      <div class="kpi accent"><b>${m(k.weightedPipeline)}</b><small>צינור משוקלל</small></div>
    </div>`;
    const maxBucket = Math.max(1, ...rec.buckets.map((b) => b.amount));
    const bucketColor = (key) => key === 'not_due' ? '#1741d6' : key === 'd1_7' ? '#9a6a00' : '#b42323';
    const aging = `<div class="aging">${rec.buckets.map((b) => `<div class="aging-row"><span>${esc(b.label)}</span>
      <div class="aging-bar"><span style="width:${Math.round((b.amount / maxBucket) * 100)}%;background:${bucketColor(b.key)}"></span></div>
      <b>${m(b.amount)}${b.count ? ` · ${b.count}` : ''}</b></div>`).join('')}</div>`;
    const items = rec.items.length ? `<div class="fin-scroll"><table class="fin-tbl"><thead><tr><th>תשלום</th><th>מועד</th><th class="num">סכום</th><th>איחור</th></tr></thead><tbody>
      ${rec.items.map((it) => `<tr><td>${esc(it.label)}</td><td>${fmt(it.dueDate) || '—'}</td><td class="num">${m(it.amount)}</td><td>${it.daysLate > 0 ? `<span class="pill p-red">${it.daysLate} ימים</span>` : '<span class="pill p-gray">—</span>'}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">אין תשלומים פתוחים</div>';
    const sources = d.sources.filter((x) => x.tier !== 'actual');
    const srcHtml = sources.length ? `<div class="fin-scroll"><table class="fin-tbl"><thead><tr><th>מקור</th><th>רמה</th><th>סוג</th><th class="num">סכום</th></tr></thead><tbody>
      ${sources.slice(0, 40).map((x) => `<tr><td>${esc(x.label)}</td><td>${tierPill(x.tier)}</td><td>${x.recurring === 'monthly' ? 'חודשי' : x.recurring === 'yearly' ? 'שנתי' : 'חד-פעמי'}${x.tier === 'potential' ? ` · ${x.probability}%` : ''}</td><td class="num">${m(x.amount)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">אין מקורות הכנסה צפויים</div>';

    FB().innerHTML = `
      <div class="row" style="justify-content:flex-end;margin-bottom:10px"><button class="btn small" onclick="FIN.addIncome()">+ הכנסה / תשלום צפוי</button></div>
      ${kpis}
      <div class="card"><h3 style="margin:0 0 12px">גיול חייבים (Aging)</h3>${aging}
        <div class="row" style="gap:14px;margin-top:12px;flex-wrap:wrap">
          <div><small style="color:var(--muted)">סה"כ חייבים</small><div style="font-weight:800">${m(rec.totalReceivables)}</div></div>
          <div><small style="color:var(--muted)">באיחור</small><div style="font-weight:800;color:#b42323">${m(rec.overdueReceivables)}</div></div>
          <div><small style="color:var(--muted)">ממוצע ימי איחור</small><div style="font-weight:800">${rec.averageDaysLate}</div></div>
        </div></div>
      <div class="card"><h3 style="margin:0 0 10px">תשלומים פתוחים</h3>${items}</div>
      <div class="card"><h3 style="margin:0 0 10px">מקורות הכנסה צפויים</h3>${srcHtml}</div>`;
  }

  // ================= הוצאות =================
  async function renderExpenses() {
    const d = await apiGet('/finance/expenses');
    const k = d.kpis;
    const b = d.burn;
    const kpis = `<div class="kpis">
      <div class="kpi red"><b>${m(k.fixedMonthly)}</b><small>הוצאות קבועות/חודש</small></div>
      <div class="kpi"><b>${m(k.totalMonthly)}</b><small>סה"כ חודשי שקול</small></div>
      <div class="kpi"><b>${k.recurringCount}</b><small>הוצאות חוזרות</small></div>
      <div class="kpi ${k.unallocatedCount ? 'amber' : ''}"><b>${k.unallocatedCount}</b><small>ללא שיוך</small></div>
      ${k.infraCount ? `<div class="kpi gray"><b>${k.infraCount}</b><small>תשתיות (מעקב)</small></div>` : ''}
      ${b.cashNegative && b.runwayMonths != null ? `<div class="kpi red"><b>${b.runwayMonths} ח׳</b><small>Runway</small></div>` : ''}
    </div>`;
    const cats = d.categories;
    const catName = (r) => (cats.find((c) => c.id === r.categoryId) || {}).name || r.category || '—';
    const isInfra = EXP_FILTER === 'infra';
    let rows = isInfra ? (d.infra || []) : d.expenses;
    if (EXP_FILTER === 'recurring') rows = rows.filter((r) => r.recurring !== 'once');
    if (EXP_FILTER === 'once') rows = rows.filter((r) => r.recurring === 'once');
    if (EXP_FILTER === 'unallocated') rows = rows.filter((r) => r.unallocated && r.recurring !== 'once');
    const filters = [['all', 'הכול'], ['recurring', 'חוזרות'], ['once', 'חד-פעמי'], ['unallocated', 'ללא שיוך'], ['infra', `תשתיות${k.infraCount ? ` (${k.infraCount})` : ''}`]];
    const seg = `<div class="seg" style="max-width:520px;margin-bottom:12px">${filters.map(([kk, l]) => `<button class="${kk === EXP_FILTER ? 'on' : ''}" onclick="FIN.expFilter('${kk}')">${l}</button>`).join('')}</div>`;
    const receiptBadge = (r) => r.receiptCount ? `<span title="${r.receiptCount} קבלות" style="color:var(--muted);font-size:.8rem">📎${r.receiptCount}</span>` : '';
    const list = rows.length ? `<div class="fin-scroll"><table class="fin-tbl"><thead><tr><th>הוצאה</th><th>ספק</th><th>קטגוריה</th><th>מחזוריות</th><th class="num">${isInfra ? 'עלות' : 'חודשי שקול'}</th><th>${isInfra ? 'קבלה' : 'שיוך'}</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td>${esc(r.label)} ${receiptBadge(r)}</td>
        <td>${r.vendorName ? esc(r.vendorName) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${esc(catName(r))}</td>
        <td>${r.recurring === 'monthly' ? 'חודשי' : r.recurring === 'yearly' ? 'שנתי' : 'חד-פעמי'}${r.renewalDate ? `<br><small style="color:var(--muted)">חידוש ${fmt(r.renewalDate)}</small>` : ''}</td>
        <td class="num">${isInfra ? (r.amount ? m(r.amount) : '<span style="color:var(--muted)">0</span>') : m(r.monthlyEquivalent)}</td>
        <td>${isInfra ? (r.receiptCount ? `📎 ${r.receiptCount}` : '<span style="color:var(--muted)">—</span>') : (r.unallocated ? '<span class="pill p-amber">ללא</span>' : r.clientName ? `<span class="pill p-teal">${esc(r.clientName)}</span>` : r.allocationCount ? `<span class="pill p-teal">${r.allocationCount} יעדים</span>` : '<span class="pill p-gray">Overhead</span>')}</td>
        <td><button class="btn small ghost" onclick="FIN.editExpense('${r.id}')">✎</button></td>
      </tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">${isInfra ? 'אין תשתיות למעקב. סמן הוצאה כ"תשתית למעקב בלבד" כדי שתופיע כאן.' : 'אין הוצאות בסינון זה'}</div>`;

    FB().innerHTML = `
      <div class="row" style="justify-content:flex-end;gap:6px;margin-bottom:10px">
        <button class="btn small ghost" onclick="FIN.tab('history')">הוצאות אחורה →</button>
        <button class="btn small ghost" onclick="FIN.tab('forecast')">חידושים בתחזית</button>
        <button class="btn small" onclick="FIN.addExpense()">+ הוצאה</button>
      </div>
      ${kpis}
      ${isInfra ? '<div class="fin-status ok"><span class="dot">🧩</span><div>תשתיות למעקב בלבד — מנויים/כלים שאתה רוצה לדעת עליהם (גם ב-0 ₪). אינם נספרים ב-Burn, בתחזית או ב-KPI.</div></div>' : ''}
      ${!isInfra && b.cashNegative ? `<div class="fin-status attention"><span class="dot">🟡</span><div><b>Burn חודשי:</b> ${m(b.monthlyBurn)} · הכנסה חודשית ${m(b.monthlyIncome)} · נטו ${m(b.netMonthly)}${b.runwayMonths != null ? ` · Runway כ-${b.runwayMonths} חודשים` : ''}</div></div>` : ''}
      <div class="card">${seg}${list}</div>`;
  }
  function expFilter(k) { EXP_FILTER = k; go('finance'); }

  // ================= תחזית =================
  async function renderForecast() {
    const d = await apiGet('/finance/forecast/scenarios?months=' + FC_MONTHS);
    const scen = { committed: d.committed, realistic: d.realistic, optimistic: d.optimistic }[FC_SCEN];
    const labels = scen.buckets.map((x) => x.label);
    const chart = labels.length ? lineChart(labels, [
      { name: 'מחויב', color: C.committed, values: d.committed.buckets.map((x) => x.balance) },
      { name: 'ריאלי', color: C.realistic, values: d.realistic.buckets.map((x) => x.balance) },
      { name: 'אופטימי', color: C.optimistic, values: d.optimistic.buckets.map((x) => x.balance) },
    ], d.threshold || null) : '<div class="empty">אין נתונים</div>';

    const monthSeg = `<div class="seg" style="max-width:260px">${[3, 6, 12, 24, 36].map((n) => `<button class="${n === FC_MONTHS ? 'on' : ''}" onclick="FIN.fcMonths(${n})">${n}</button>`).join('')}</div>`;
    const scenSeg = `<div class="seg" style="max-width:340px">${[['committed', 'מחויב'], ['realistic', 'ריאלי'], ['optimistic', 'אופטימי']].map(([kk, l]) => `<button class="${kk === FC_SCEN ? 'on' : ''}" onclick="FIN.fcScen('${kk}')">${l}</button>`).join('')}</div>`;

    const hz = d.horizons.map((h) => `<div class="kpi"><b>${m(h[FC_SCEN])}</b><small>+${h.days} יום</small></div>`).join('');

    const table = `<div class="fin-scroll"><table class="fin-tbl"><thead><tr><th>חודש</th><th class="num">הכנסות</th><th class="num">הוצאות</th><th class="num">נטו</th><th class="num">יתרה</th></tr></thead><tbody>
      ${scen.buckets.map((x) => {
        const open = !!FC_OPEN[x.ym];
        const head = `<tr class="fin-clk" onclick="FIN.fcToggle('${x.ym}')" style="cursor:pointer"><td>${open ? '▾' : '◂'} ${esc(x.label)}</td><td class="num" style="color:var(--green)">${m(x.income)}</td><td class="num" style="color:#b42323">${m(x.expense)}</td><td class="num">${m(x.net)}</td><td class="num" style="font-weight:800${x.balance < (d.threshold || 0) ? ';color:#b42323' : ''}">${m(x.balance)}</td></tr>`;
        return head + (open ? monthDetailRows(x.items || [], 5) : '');
      }).join('')}
    </tbody></table></div>`;

    const daily = d.daily;
    const dailyWarn = daily.firstBelowThreshold
      ? `<div class="fin-status critical"><span class="dot">🔴</span><div>בתחזית היומית: היתרה יורדת מתחת לסף בתאריך <b>${fmt(daily.firstBelowThreshold)}</b> (מינימום ${m(daily.minBalance)} ב-${fmt(daily.minBalanceDate)}).</div></div>`
      : daily.minBalance < 0
        ? `<div class="fin-status critical"><span class="dot">🔴</span><div>התחזית היומית שלילית — מינימום ${m(daily.minBalance)} בתאריך ${fmt(daily.minBalanceDate)}.</div></div>`
        : `<div class="fin-status ok"><span class="dot">🟢</span><div>התחזית היומית ל-90 יום נשארת חיובית (מינימום ${m(daily.minBalance)}).</div></div>`;

    FB().innerHTML = `
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">${scenSeg}${monthSeg}</div>
      ${dailyWarn}
      <div class="card"><h3 style="margin:0 0 6px">תחזית יתרה — 3 תרחישים</h3>${chart}</div>
      <div class="card"><h3 style="margin:0 0 10px">נקודות זמן (${{ committed: 'מחויב', realistic: 'ריאלי', optimistic: 'אופטימי' }[FC_SCEN]})</h3><div class="kpis" style="margin:0">${hz}</div></div>
      <div class="card"><h3 style="margin:0 0 10px">פירוט חודשי</h3>${table}</div>`;
  }
  function fcMonths(n) { FC_MONTHS = n; go('finance'); }
  function fcScen(s) { FC_SCEN = s; go('finance'); }
  function fcToggle(ym) { FC_OPEN[ym] = !FC_OPEN[ym]; go('finance'); }

  // ================= היסטוריה (הוצאות אחורה, idea 2) =================
  const kindIco = (k) => (k === 'income' ? '🟢' : '🔴');
  function monthDetailRows(items, cols) {
    // פירוט פריטי חודש — מקובצים לפי תווית, ממוין לפי סכום
    const agg = {};
    for (const it of items) {
      const key = it.kind + '|' + it.label;
      if (!agg[key]) agg[key] = { label: it.label, kind: it.kind, amount: 0 };
      agg[key].amount += it.amount;
    }
    const arr = Object.values(agg).sort((a, b) => b.amount - a.amount);
    if (!arr.length) return `<tr class="fin-detail"><td colspan="${cols}"><span style="color:var(--muted)">אין תנועות בחודש זה</span></td></tr>`;
    return `<tr class="fin-detail"><td colspan="${cols}"><div style="padding:2px 0 6px">
      ${arr.map((it) => `<div class="row" style="justify-content:space-between;gap:10px;font-size:.82rem;padding:2px 0"><span>${kindIco(it.kind)} ${esc(it.label)}</span><span class="num" style="font-variant-numeric:tabular-nums;color:${it.kind === 'income' ? 'var(--green)' : '#b42323'}">${m(it.amount)}</span></div>`).join('')}
    </div></td></tr>`;
  }
  async function renderHistory() {
    const d = await apiGet('/finance/expenses/history?months=' + HIST_MONTHS);
    const s = d.summary;
    const kpis = `<div class="kpis">
      <div class="kpi red"><b>${m(s.totalExpense)}</b><small>סה"כ הוצאות (${HIST_MONTHS} ח׳)</small></div>
      <div class="kpi"><b>${m(s.avgMonthlyExpense)}</b><small>ממוצע חודשי</small></div>
      <div class="kpi green"><b>${m(s.totalIncome)}</b><small>סה"כ הכנסות</small></div>
      <div class="kpi ${s.net < 0 ? 'red' : 'green'}"><b>${m(s.net)}</b><small>נטו</small></div>
    </div>`;
    const monthSeg = `<div class="seg" style="max-width:300px">${[3, 6, 12, 24].map((n) => `<button class="${n === HIST_MONTHS ? 'on' : ''}" onclick="FIN.histMonths(${n})">${n}</button>`).join('')}</div>`;
    // מהחדש לישן בתצוגה
    const buckets = [...d.buckets].reverse();
    const rows = buckets.map((b) => {
      const open = !!HIST_OPEN[b.ym];
      const head = `<tr class="fin-clk" onclick="FIN.histToggle('${b.ym}')" style="cursor:pointer">
        <td>${open ? '▾' : '◂'} ${esc(b.label)}</td>
        <td class="num" style="color:var(--green)">${m(b.income)}</td>
        <td class="num" style="color:#b42323">${m(b.expense)}</td>
        <td class="num" style="font-weight:700">${m(b.net)}</td></tr>`;
      return head + (open ? monthDetailRows(b.items, 4) : '');
    }).join('');
    const table = buckets.length ? `<div class="fin-scroll"><table class="fin-tbl"><thead><tr><th>חודש</th><th class="num">הכנסות</th><th class="num">הוצאות</th><th class="num">נטו</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">אין נתונים היסטוריים</div>';
    FB().innerHTML = `
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div><h3 style="margin:0 0 2px">הוצאות אחורה</h3><small style="color:var(--muted)">לחיצה על חודש פותחת פירוט מלא של התנועות</small></div>
        ${monthSeg}
      </div>
      ${kpis}
      <div class="card">${table}</div>`;
  }
  function histMonths(n) { HIST_MONTHS = n; go('finance'); }
  function histToggle(ym) { HIST_OPEN[ym] = !HIST_OPEN[ym]; go('finance'); }

  // ================= רווחיות =================
  async function renderProfit() {
    const d = await apiGet('/finance/profitability');
    const biz = d.business;
    const bizKpis = `<div class="kpis">
      <div class="kpi green"><b>${m(biz.revenue)}</b><small>הכנסה חודשית</small></div>
      <div class="kpi red"><b>${m(biz.directCosts)}</b><small>עלויות ישירות</small></div>
      <div class="kpi"><b>${m(biz.grossContribution)}</b><small>תרומה גולמית (${biz.grossMargin}%)</small></div>
      <div class="kpi red"><b>${m(biz.overhead)}</b><small>Overhead</small></div>
      <div class="kpi ${biz.operatingContribution < 0 ? 'red' : 'green'}"><b>${m(biz.operatingContribution)}</b><small>תרומה תפעולית (${biz.operatingMargin}%)</small></div>
    </div>`;
    const clients = d.clients.length ? `<div class="fin-scroll"><table class="fin-tbl"><thead><tr><th>לקוח</th><th class="num">הכנסה</th><th class="num">עלות ישירה</th><th class="num">Overhead</th><th class="num">תרומה</th><th class="num">מרווח</th><th>דירוג</th></tr></thead><tbody>
      ${d.clients.map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${m(c.revenue)}</td><td class="num">${m(c.directCosts)}</td><td class="num">${m(c.allocatedShared)}</td><td class="num" style="font-weight:700">${m(c.contribution)}</td><td class="num">${c.margin}%</td><td>${ratingPill(c.rating)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">אין נתוני רווחיות — צריך התקשרויות פעילות והוצאות משויכות</div>';
    const conc = d.concentration.length ? `<div class="aging">${d.concentration.map((c) => `<div class="aging-row"><span>${esc(c.name)}</span><div class="aging-bar"><span style="width:${Math.min(100, c.percent)}%;background:${c.percent >= d.topConcentration && c.percent >= 40 ? '#b42323' : '#1741d6'}"></span></div><b>${c.percent}%</b></div>`).join('')}</div>` : '<div class="empty">—</div>';
    const concWarn = d.topConcentration >= 40 ? `<p class="hint" style="color:#b42323;margin:8px 0 0">⚠️ תלות גבוהה: ${d.concentration[0].percent}% מההכנסה מלקוח בודד.</p>` : '';

    FB().innerHTML = `
      <h3 style="margin:0 0 10px">רווחיות העסק (חודשי)</h3>${bizKpis}
      <div class="card"><h3 style="margin:0 0 10px">רווחיות לפי לקוח</h3>${clients}
        <p class="hint" style="color:var(--muted);margin-top:8px">תרומה = הכנסה − עלויות ישירות − Overhead משויך. הדירוג: &gt;60% רווחי מאוד · 40-60% תקין · 20-40% דורש בדיקה · &lt;20% בעייתי.</p></div>
      <div class="card"><h3 style="margin:0 0 10px">ריכוזיות הכנסה</h3>${conc}${concWarn}</div>`;
  }

  // ================= סקירה (נשמר — תאימות למסך הקיים) =================
  async function renderOverview() {
    let d; try { d = await apiGet('/dashboard'); } catch (e) { FB().innerHTML = '<div class="empty">שגיאה</div>'; return; }
    const k = d.kpis;
    FB().innerHTML = `<div class="kpis">
      <div class="kpi green"><b>${m(k.mrr)}</b><small>MRR</small></div>
      <div class="kpi green"><b>${m(k.arr)}</b><small>ARR</small></div>
      <div class="kpi accent"><b>${m(k.pipeline)}</b><small>צינור (הזדמנויות)</small></div>
      <div class="kpi accent"><b>${m(k.pipelineWeighted || 0)}</b><small>צינור משוקלל</small></div>
    </div><p class="hint" style="color:var(--muted)">מסך "שליטה" מרכז את התמונה המלאה. הצינור מגיע מהזדמנויות בלבד.</p>`;
  }

  // ================= טפסים (Progressive Disclosure §29) =================
  function updateBalance() {
    openModal(`<h3>עדכון יתרה נוכחית</h3>
      <div class="f"><label>יתרה בפועל (₪)</label><input type="number" id="fb_amt" inputmode="decimal"></div>
      <div class="f"><label>נכון לתאריך</label><input type="date" id="fb_date" value="${todayISO()}"></div>
      <div class="f"><label>הערה</label><input id="fb_note" placeholder="למשל: יתרת בנק בפועל"></div>
      <p class="hint" style="color:var(--muted)">התחזית תתחיל מהיתרה הזו. עדכונים קודמים נשמרים בהיסטוריה.</p>
      <div class="modal-actions"><button class="btn primary" onclick="FIN._saveBalance()">שמירה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  }
  async function _saveBalance() {
    const amt = $('fb_amt').value;
    if (amt === '' || amt == null) return toast('הזן סכום', 'bad');
    try { await apiPost('/finance/balance', { amount: Number(amt), asOfDate: $('fb_date').value, notes: val('fb_note') }); closeModal(); toast('היתרה עודכנה ✓'); go('finance'); }
    catch (e) { toast('שגיאה', 'bad'); }
  }

  function addIncome() {
    openModal(`<h3>הכנסה / תשלום צפוי</h3>
      <div class="f"><label>תיאור</label><input id="fi_label" placeholder="למשל: חשבונית ריטיינר ספטמבר"></div>
      <div class="f"><label>סכום (₪)</label><input type="number" id="fi_amt" inputmode="decimal"></div>
      <div class="grid2">
        <div class="f"><label>רמת ודאות</label><select id="fi_status">
          <option value="expected">צפוי</option><option value="committed">מחויב</option><option value="received">התקבל</option></select></div>
        <div class="f"><label>מועד</label><input type="date" id="fi_due" value="${todayISO()}"></div>
      </div>
      <div class="f"><label>לקוח (אופציונלי)</label><select id="fi_client">${clientOptions('')}</select></div>
      <div class="modal-actions"><button class="btn primary" onclick="FIN._saveIncome()">שמירה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  }
  async function _saveIncome() {
    const label = val('fi_label'); const amt = $('fi_amt').value;
    if (!label || amt === '') return toast('חסר תיאור/סכום', 'bad');
    const status = $('fi_status').value;
    try {
      await apiPost('/finance/occurrences', { kind: 'income', label, amount: Number(amt), status, dueDate: $('fi_due').value, actualDate: status === 'received' ? $('fi_due').value : '', clientId: $('fi_client').value || '', confidence: status === 'expected' ? 80 : 100 });
      closeModal(); toast('נשמר ✓'); go('finance');
    } catch (e) { toast('שגיאה', 'bad'); }
  }

  async function addExpense() { await expenseForm(null); }
  async function editExpense(id) {
    const rows = await apiGet('/finance/cashflow');
    const r = rows.find((x) => x.id === id);
    if (!r) return toast('לא נמצא', 'bad');
    await expenseForm(r);
  }
  async function expenseForm(r) {
    let cats = []; try { cats = await apiGet('/finance/categories'); } catch (e) {}
    let vends = []; try { vends = await apiGet('/finance/vendors'); } catch (e) {}
    if (!CACHE.clients || !CACHE.clients.length) { try { await loadRefs(); } catch (e) {} }
    const catOpts = `<option value="">— קטגוריה —</option>` + cats.map((c) => `<option value="${c.id}" ${r && r.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const vendOpts = `<option value="">— ללא ספק —</option>`
      + vends.map((v) => `<option value="${v.id}" ${r && r.vendorId === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')
      + `<option value="__new__">+ ספק חדש…</option>`;
    const rec = r ? r.recurring : 'monthly';
    const trackOnly = !!(r && r.trackOnly);
    // מקטע קבלות — רק בעריכה (צריך מזהה הוצאה קיים כדי לצרף קובץ)
    const receiptsSection = r
      ? `<div class="f"><label>קבלות</label>
          <div id="fe_receipts_list" style="margin-bottom:6px"><span style="color:var(--muted);font-size:.82rem">טוען…</span></div>
          <div class="row" style="gap:6px;align-items:center">
            <input type="file" id="fe_receipt_file" accept="image/*,application/pdf" multiple style="flex:1;min-width:0;font-size:.82rem">
            <button type="button" class="btn small" onclick="FIN._uploadReceipt('${r.id}')">העלה</button>
          </div>
          <p class="hint" style="color:var(--muted);margin:4px 0 0;font-size:.76rem">תמונה או PDF · עד 10MB · נגיש רק לך.</p></div>`
      : `<p class="hint" style="color:var(--muted);margin:0 0 4px">📎 כדי לצרף קבלה — שמור את ההוצאה ואז פתח אותה שוב לעריכה.</p>`;
    openModal(`<h3>${r ? 'עריכת הוצאה' : 'הוצאה חדשה'}</h3>
      <div class="f"><label>שירות / מוצר</label><input id="fe_label" value="${r ? esc(r.label) : ''}" placeholder="למשל: Claude, דומיין, אחסון ענן"></div>
      <div class="f"><label>ספק</label><select id="fe_vendor" onchange="FIN._vendorToggle()">${vendOpts}</select>
        <input id="fe_vendor_new" placeholder="שם ספק חדש (למשל: Anthropic)" style="display:none;margin-top:6px"></div>
      <div class="grid2">
        <div class="f"><label>סכום (₪)</label><input type="number" id="fe_amt" inputmode="decimal" value="${r ? r.amount : ''}"></div>
        <div class="f"><label>מחזוריות</label><select id="fe_rec" onchange="FIN._expToggle()">
          <option value="once" ${rec === 'once' ? 'selected' : ''}>חד-פעמי</option>
          <option value="monthly" ${rec === 'monthly' ? 'selected' : ''}>חודשי</option>
          <option value="yearly" ${rec === 'yearly' ? 'selected' : ''}>שנתי</option></select></div>
      </div>
      <div class="grid2">
        <div class="f"><label>קטגוריה</label><select id="fe_cat">${catOpts}</select></div>
        <div class="f"><label>סוג עלות</label><select id="fe_ct">
          ${['', 'fixed', 'variable', 'direct', 'overhead'].map((v) => `<option value="${v}" ${r && r.costType === v ? 'selected' : ''}>${{ '': '—', fixed: 'קבועה', variable: 'משתנה', direct: 'ישירה', overhead: 'תקורה' }[v]}</option>`).join('')}</select></div>
      </div>
      <div class="f"><label>תאריך התחלה/חיוב</label><input type="date" id="fe_start" value="${r ? (r.startDate || todayISO()) : todayISO()}"></div>
      <div id="fe_recur" style="display:${rec === 'once' ? 'none' : 'block'}">
        <div class="grid2">
          <div class="f"><label>יום חיוב בחודש</label><input type="number" id="fe_bday" min="1" max="31" value="${r && r.billingDay ? r.billingDay : ''}"></div>
          <div class="f"><label>מועד חידוש</label><input type="date" id="fe_renew" value="${r && r.renewalDate ? r.renewalDate : ''}"></div>
        </div>
        <div class="row" style="gap:16px"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fe_cancellable" ${r && r.cancellable ? 'checked' : ''}> ניתן לביטול</label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fe_essential" ${r && r.essential ? 'checked' : ''}> חיוני</label></div>
      </div>
      <div class="f" style="background:var(--bg-2);border-radius:10px;padding:9px 11px">
        <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;margin:0"><input type="checkbox" id="fe_track" ${trackOnly ? 'checked' : ''} style="margin-top:2px">
          <span>תשתית למעקב בלבד <small style="display:block;color:var(--muted);font-weight:400">מנוי/כלי שאני רק רוצה לדעת שקיים (גם ב-0 ₪) — לא נספר ב-Burn/תחזית.</small></span></label></div>
      <div class="f"><label>שיוך ללקוח (אופציונלי)</label><select id="fe_client">${clientOptions(r ? r.clientId : '')}</select></div>
      ${receiptsSection}
      <div class="modal-actions">
        <button class="btn primary" onclick="FIN._saveExpense('${r ? r.id : ''}')">שמירה</button>
        ${r ? `<button class="btn ghost" onclick="FIN._delExpense('${r.id}')">מחיקה</button>` : ''}
        <button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
    if (r) _renderReceiptsInto(r.id);
  }
  function _expToggle() { const rec = $('fe_rec').value; $('fe_recur').style.display = rec === 'once' ? 'none' : 'block'; }
  function _vendorToggle() {
    const isNew = $('fe_vendor').value === '__new__';
    const inp = $('fe_vendor_new');
    if (inp) { inp.style.display = isNew ? 'block' : 'none'; if (isNew) inp.focus(); }
  }
  async function _saveExpense(id) {
    const label = val('fe_label'); const amt = $('fe_amt').value;
    if (!label || amt === '') return toast('חסר שם/סכום', 'bad');
    // ספק: קיים או חדש (נוצר תוך כדי שמירה)
    let vendorId = $('fe_vendor') ? $('fe_vendor').value : '';
    if (vendorId === '__new__') {
      const vname = val('fe_vendor_new');
      if (vname) { try { const vr = await apiPost('/finance/vendors', { name: vname }); vendorId = vr.id || ''; } catch (e) { vendorId = ''; } }
      else vendorId = '';
    }
    const body = {
      kind: 'expense', label, amount: Number(amt), recurring: $('fe_rec').value,
      vendorId: vendorId || '',
      categoryId: $('fe_cat').value || '', costType: $('fe_ct').value || '', startDate: $('fe_start').value,
      billingDay: val('fe_bday') || '', renewalDate: val('fe_renew') || '',
      cancellable: $('fe_cancellable') ? $('fe_cancellable').checked : false,
      essential: $('fe_essential') ? $('fe_essential').checked : false,
      trackOnly: $('fe_track') ? $('fe_track').checked : false,
      clientId: $('fe_client').value || '', status: 'confirmed',
    };
    try { id ? await apiPatch('/finance/cashflow/' + id, body) : await apiPost('/finance/cashflow', body); closeModal(); toast('נשמר ✓'); go('finance'); }
    catch (e) { toast('שגיאה', 'bad'); }
  }
  async function _delExpense(id) { if (!confirm('למחוק הוצאה? הקבלות המצורפות יימחקו גם.')) return; await apiDel('/finance/cashflow/' + id); closeModal(); toast('נמחק'); go('finance'); }

  // ---------- קבלות (idea 1) ----------
  async function _renderReceiptsInto(cfId) {
    const box = $('fe_receipts_list');
    if (!box) return;
    let list = [];
    try { list = await apiGet('/finance/cashflow/' + cfId + '/receipts'); } catch (e) { box.innerHTML = '<span style="color:#b42323;font-size:.82rem">שגיאה בטעינת קבלות</span>'; return; }
    if (!list.length) { box.innerHTML = '<span style="color:var(--muted);font-size:.82rem">אין קבלות מצורפות.</span>'; return; }
    const sizeKb = (n) => n ? Math.max(1, Math.round(n / 1024)) + 'KB' : '';
    box.innerHTML = list.map((rc) => `<div class="row" style="gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid var(--line)">
      <span style="flex:1;min-width:0;font-size:.83rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(rc.contentType || '').startsWith('image') ? '🖼️' : '📄'} ${esc(rc.filename || 'קבלה')} <small style="color:var(--muted)">${sizeKb(rc.size)}</small></span>
      <button type="button" class="btn small ghost" onclick="FIN._viewReceipt('${rc.id}')" title="צפייה">👁</button>
      <button type="button" class="btn small ghost" onclick="FIN._delReceipt('${rc.id}','${cfId}')" title="מחיקה">🗑</button>
    </div>`).join('');
  }
  async function _uploadReceipt(cfId) {
    const inp = $('fe_receipt_file');
    if (!inp || !inp.files || !inp.files.length) return toast('בחר קובץ', 'bad');
    const box = $('fe_receipts_list');
    if (box) box.innerHTML = '<span style="color:var(--muted);font-size:.82rem">מעלה…</span>';
    let ok = 0, fail = 0;
    for (const file of Array.from(inp.files)) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await authFetch('/finance/cashflow/' + cfId + '/receipts', { method: 'POST', body: fd });
        if (res.ok) ok++; else fail++;
      } catch (e) { fail++; }
    }
    inp.value = '';
    if (ok) toast(`הועלו ${ok} קבלות ✓`);
    if (fail) toast(`${fail} נכשלו (סוג/גודל?)`, 'bad');
    await _renderReceiptsInto(cfId);
  }
  async function _viewReceipt(id) {
    try {
      const res = await authFetch('/finance/receipts/' + id + '/file');
      if (!res.ok) return toast('שגיאה בפתיחת הקבלה', 'bad');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast('שגיאה', 'bad'); }
  }
  async function _delReceipt(id, cfId) {
    if (!confirm('למחוק את הקבלה?')) return;
    try { await apiDel('/finance/receipts/' + id); toast('נמחק'); } catch (e) { toast('שגיאה', 'bad'); }
    await _renderReceiptsInto(cfId);
  }

  // ================= תרחישים (What-if §20) =================
  // טיוטת תרחיש במצב מודול — נשמרת בין רינדורים של הלשונית. Snapshot בלבד, לא נוגע בנתוני אמת.
  let SC_DRAFT = { id: null, name: '', months: 12, scenario: 'realistic', adjustments: [] };
  let SC_RESULT = null;

  // presets ידידותיים → התאמה מנורמלת
  const SC_PRESETS = {
    new_client: { label: 'לקוח חדש', target: 'income', op: 'add', recurring: 'monthly', hint: 'MRR חדש' },
    onetime_income: { label: 'הכנסה חד-פעמית', target: 'income', op: 'add', recurring: 'once', hint: 'פרויקט/מקדמה' },
    lose_client: { label: 'אובדן לקוח', target: 'income', op: 'remove', recurring: 'monthly', hint: 'ירידת MRR' },
    new_hire: { label: 'עובד/קבלן חדש', target: 'expense', op: 'add', recurring: 'monthly', hint: 'עלות חודשית' },
    new_subscription: { label: 'מנוי חדש', target: 'expense', op: 'add', recurring: 'monthly', hint: 'הוצאה חוזרת' },
    expense_up: { label: 'הגדלת הוצאה', target: 'expense', op: 'add', recurring: 'monthly', hint: 'תוספת חודשית' },
    expense_down: { label: 'הפחתת הוצאה', target: 'expense', op: 'remove', recurring: 'monthly', hint: 'חיסכון חודשי' },
    onetime_expense: { label: 'הוצאה חד-פעמית', target: 'expense', op: 'add', recurring: 'once', hint: 'רכישה' },
  };
  const adjIcon = (a) => a.target === 'income' ? (a.op === 'add' ? '📈' : '📉') : (a.op === 'add' ? '💸' : '💰');
  const adjSign = (a) => (a.op === 'add' ? '+' : '−');

  async function renderScenarios() {
    let saved = []; try { saved = await apiGet('/finance/whatif'); } catch (e) {}
    // הרצת סימולציה חיה אם יש התאמות
    SC_RESULT = null;
    if (SC_DRAFT.adjustments.length) {
      try { SC_RESULT = await apiPost('/finance/whatif/simulate', { adjustments: SC_DRAFT.adjustments, months: SC_DRAFT.months, scenario: SC_DRAFT.scenario }); } catch (e) {}
    }

    const savedHtml = saved.length ? saved.map((s) => `<div class="list-item">
      <div class="li-main"><b>${esc(s.name)}</b><small>${s.adjustments.length} התאמות · ${s.months} ח׳ · ${{ committed: 'מחויב', realistic: 'ריאלי', optimistic: 'אופטימי' }[s.scenario] || s.scenario}</small></div>
      <div class="row" style="gap:5px"><button class="btn small" onclick="FIN.scLoad('${s.id}')">טען</button><button class="btn small ghost" onclick="FIN.scDelete('${s.id}')">✕</button></div></div>`).join('')
      : '<div class="empty">אין תרחישים שמורים. בנה תרחיש חדש למטה.</div>';

    const adjChips = SC_DRAFT.adjustments.length ? SC_DRAFT.adjustments.map((a, i) => `<div class="list-item">
      <div class="li-main"><b>${adjIcon(a)} ${esc(a.label)}</b><small>${adjSign(a)}${m(a.amount)} · ${a.recurring === 'monthly' ? 'חודשי' : 'חד-פעמי'}${a.startDate ? ' · מ-' + fmt(a.startDate) : ''}${a.endDate ? ' עד ' + fmt(a.endDate) : ''}</small></div>
      <button class="btn small ghost" onclick="FIN.scRemoveAdj(${i})">✕</button></div>`).join('')
      : '<div class="empty">הוסף התאמות (לקוח חדש, אובדן לקוח, גיוס, שינוי הוצאה...) כדי לראות את ההשפעה.</div>';

    const presetBtns = Object.entries(SC_PRESETS).map(([k, p]) => `<button class="btn small ghost" onclick="FIN.scAdd('${k}')">+ ${p.label}</button>`).join('');

    // תצוגת השוואה
    let compare = '<div class="empty">הוסף לפחות התאמה אחת כדי להריץ סימולציה.</div>';
    if (SC_RESULT) {
      const r = SC_RESULT;
      const labels = r.base.map((b) => b.label);
      const chart = lineChart(labels, [
        { name: 'בסיס (מצב נוכחי)', color: '#93a0c8', values: r.base.map((b) => b.balance) },
        { name: 'תרחיש', color: C.optimistic, values: r.simulated.map((b) => b.balance) },
      ], SC_DRAFT.scenario === 'committed' ? null : null);
      const su = r.summary;
      const deltaKpi = (v, lbl) => `<div class="kpi ${v > 0 ? 'green' : v < 0 ? 'red' : 'gray'}"><b>${v >= 0 ? '+' : ''}${m(v)}</b><small>${lbl}</small></div>`;
      compare = `
        <div class="kpis" style="margin:0 0 12px">
          ${deltaKpi(su.endBalanceDelta, 'שינוי יתרה בסוף התקופה')}
          ${deltaKpi(su.minBalanceDelta, 'שינוי יתרת מינימום')}
          ${deltaKpi(su.mrrDelta, 'שינוי MRR')}
        </div>
        ${chart}
        ${su.firstNegativeYm ? `<div class="fin-status critical" style="margin-top:10px"><span class="dot">🔴</span><div>בתרחיש זה היתרה יורדת מתחת ל-0 בחודש ${esc(r.simulated.find((b) => b.ym === su.firstNegativeYm).label)}.</div></div>` : ''}
        <div class="fin-scroll" style="margin-top:10px"><table class="fin-tbl"><thead><tr><th>חודש</th><th class="num">בסיס</th><th class="num">תרחיש</th><th class="num">פער</th></tr></thead><tbody>
          ${r.base.map((b, i) => { const s = r.simulated[i]; const diff = Math.round((s.balance - b.balance) * 100) / 100; return `<tr><td>${esc(b.label)}</td><td class="num">${m(b.balance)}</td><td class="num" style="font-weight:700">${m(s.balance)}</td><td class="num" style="color:${diff > 0 ? 'var(--green)' : diff < 0 ? '#b42323' : 'var(--muted)'}">${diff >= 0 ? '+' : ''}${m(diff)}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }

    FB().innerHTML = `
      <div class="card"><div class="fin-sec-h"><h3>תרחישים שמורים</h3></div>${savedHtml}</div>
      <div class="card">
        <div class="fin-sec-h"><h3>בונה תרחיש${SC_DRAFT.name ? ' · ' + esc(SC_DRAFT.name) : ' חדש'}</h3>
          <div class="row" style="gap:5px">${SC_DRAFT.adjustments.length ? '<button class="btn small" onclick="FIN.scSave()">שמירה</button>' : ''}<button class="btn small ghost" onclick="FIN.scNew()">חדש</button></div></div>
        <div class="grid2" style="align-items:start">
          <div class="f"><label>טווח תחזית</label><div class="seg">${[3, 6, 12, 24].map((n) => `<button class="${n === SC_DRAFT.months ? 'on' : ''}" onclick="FIN.scMonths(${n})">${n} ח׳</button>`).join('')}</div></div>
          <div class="f"><label>בסיס תרחיש</label><div class="seg">${[['committed', 'מחויב'], ['realistic', 'ריאלי'], ['optimistic', 'אופטימי']].map(([k, l]) => `<button class="${k === SC_DRAFT.scenario ? 'on' : ''}" onclick="FIN.scBase('${k}')">${l}</button>`).join('')}</div></div>
        </div>
        <div style="margin:6px 0 10px">${adjChips}</div>
        <div class="row" style="gap:6px;flex-wrap:wrap">${presetBtns}</div>
        <p class="hint" style="color:var(--muted);margin-top:8px">התרחיש הוא סימולציה בלבד — אינו משנה תזרים, התקשרויות, הזדמנויות או נתוני אמת.</p>
      </div>
      <div class="card"><h3 style="margin:0 0 10px">השפעת התרחיש</h3>${compare}</div>`;
  }

  function scAdd(presetKey) {
    const p = SC_PRESETS[presetKey];
    if (!p) return;
    const isDelay = false;
    openModal(`<h3>${esc(p.label)}</h3>
      <div class="f"><label>תיאור</label><input id="sca_label" value="${esc(p.label)}"></div>
      <div class="f"><label>סכום חודשי/חד-פעמי (₪)</label><input type="number" id="sca_amt" inputmode="decimal" placeholder="${p.hint}"></div>
      <div class="grid2">
        <div class="f"><label>מ-תאריך</label><input type="date" id="sca_start" value="${todayISO()}"></div>
        <div class="f"><label>${p.recurring === 'monthly' ? 'עד תאריך (אופציונלי)' : ' '}</label>${p.recurring === 'monthly' ? '<input type="date" id="sca_end">' : '<span style="color:var(--muted);font-size:.8rem">אירוע חד-פעמי</span>'}</div>
      </div>
      <div class="modal-actions"><button class="btn primary" onclick="FIN._scAdd('${presetKey}')">הוספה</button><button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  }
  function _scAdd(presetKey) {
    const p = SC_PRESETS[presetKey];
    const amt = $('sca_amt').value;
    if (amt === '' || Number(amt) <= 0) return toast('הזן סכום', 'bad');
    SC_DRAFT.adjustments.push({
      label: val('sca_label') || p.label, target: p.target, op: p.op, amount: Number(amt),
      recurring: p.recurring, startDate: val('sca_start') || todayISO(), endDate: (p.recurring === 'monthly' && $('sca_end')) ? (val('sca_end') || null) : null,
    });
    closeModal(); go('finance');
  }
  function scRemoveAdj(i) { SC_DRAFT.adjustments.splice(i, 1); go('finance'); }
  function scMonths(n) { SC_DRAFT.months = n; go('finance'); }
  function scBase(s) { SC_DRAFT.scenario = s; go('finance'); }
  function scNew() { SC_DRAFT = { id: null, name: '', months: 12, scenario: 'realistic', adjustments: [] }; go('finance'); }
  async function scLoad(id) {
    const list = await apiGet('/finance/whatif');
    const s = list.find((x) => x.id === id);
    if (!s) return toast('לא נמצא', 'bad');
    SC_DRAFT = { id: s.id, name: s.name, months: s.months, scenario: s.scenario, adjustments: s.adjustments };
    go('finance');
  }
  async function scSave() {
    const name = SC_DRAFT.name || prompt('שם התרחיש:');
    if (!name) return;
    SC_DRAFT.name = name;
    try {
      if (SC_DRAFT.id) await apiPatch('/finance/whatif/' + SC_DRAFT.id, { name, adjustments: SC_DRAFT.adjustments, months: SC_DRAFT.months, scenario: SC_DRAFT.scenario });
      else { const r = await apiPost('/finance/whatif', { name, adjustments: SC_DRAFT.adjustments, months: SC_DRAFT.months, scenario: SC_DRAFT.scenario }); SC_DRAFT.id = r.id; }
      toast('התרחיש נשמר ✓'); go('finance');
    } catch (e) { toast('שגיאה', 'bad'); }
  }
  async function scDelete(id) {
    if (!confirm('למחוק תרחיש?')) return;
    await apiDel('/finance/whatif/' + id);
    if (SC_DRAFT.id === id) scNew(); else go('finance');
    toast('נמחק');
  }

  // ---------- חשיפה גלובלית ----------
  window.FIN = {
    scAdd, _scAdd, scRemoveAdj, scMonths, scBase, scNew, scLoad, scSave, scDelete,
    tab, explain, expFilter, fcMonths, fcScen, fcToggle,
    histMonths, histToggle,
    dismissExc, exceptionTask, updateBalance, _saveBalance,
    addIncome, _saveIncome, addExpense, editExpense, _saveExpense, _delExpense, _expToggle,
    _vendorToggle, _uploadReceipt, _viewReceipt, _delReceipt,
  };

  /* ===== תיקון ניווט: שמירת סרגל לשוניות-המשנה גם במסכים ה"ותיקים" =====
   * cashflow/engagements/calculator (כספים) ו-systems/processes (עבודה) הם מסכים עצמאיים
   * שכותבים ל-#view ובכך מוחקים את סרגל הלשוניות של הקבוצה — מה שגרם ל"מלכודת" (אי-אפשר
   * לנווט חזרה בין מסכי הכספים/העבודה). עוטפים את go: אחרי רינדור מסך-ילד מזריקים מחדש את
   * סרגל הלשוניות של הקבוצה בראש התצוגה. פתרון עצמאי — ללא שינוי המסכים הוותיקים. */
  const CHILD_GROUP = { cashflow: 'finance', engagements: 'finance', calculator: 'finance', systems: 'work', processes: 'work' };
  const WORK_TABS = [['projects', 'פרויקטים'], ['systems', 'מערכות'], ['processes', 'תהליכים']];
  function subTabBar(group, active) {
    if (group === 'finance') return tabbar(active);
    if (group === 'work') return `<div class="tabs2">${WORK_TABS.map(([k, l]) => `<button class="${k === active ? 'on' : ''}" onclick="BOS.tab('work','${k}')">${l}</button>`).join('')}</div>`;
    return '';
  }
  const _origGo = window.go;
  window.go = function (page) {
    const group = CHILD_GROUP[page];
    if (!group) return _origGo(page);
    // משכפל את התנהגות go המקורית עבור מסך-ילד, ומזריק את סרגל הלשוניות לאחר הרינדור
    CURRENT = page;
    const navKey = (typeof NAV_GROUP !== 'undefined' && NAV_GROUP[page]) || group;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.p === navKey));
    V().innerHTML = '<div class="empty">טוען…</div>';
    let ret;
    try { ret = (RENDER[page] || (() => {}))(); } catch (e) { ret = null; }
    Promise.resolve(ret).then(() => {
      if (CURRENT !== page || !V().firstChild) return;            // המשתמש ניווט בינתיים
      if (document.querySelector('#view > .tabs2')) return;        // כבר קיים סרגל
      const holder = document.createElement('div');
      holder.innerHTML = subTabBar(group, page);
      if (holder.firstElementChild) V().insertBefore(holder.firstElementChild, V().firstChild);
    }).catch(() => {});
    window.scrollTo(0, 0);
    return ret;
  };

  // רענון אם עומדים על מסך הכספים בזמן טעינת המודול
  if (typeof CURRENT !== 'undefined' && document.getElementById('app') && document.getElementById('app').style.display !== 'none' && CURRENT === 'finance') {
    try { go('finance'); } catch (e) {}
  }
})();
