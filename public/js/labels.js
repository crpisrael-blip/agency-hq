/* labels.js — מילון תוויות עברית ל-BOS (Business Operating System)
 * שמות טכניים באנגלית נשארים בקוד; כאן רק התצוגה. RTL מלא. */
(function (w) {
  const L = {};

  // סטטוס ארגון
  L.orgStatus = {
    prospect: 'ליד/פרוספקט', customer: 'לקוח פעיל', paused: 'מושהה', former_customer: 'לקוח עבר',
    active: 'לקוח פעיל', churned: 'לקוח עבר', // legacy
  };

  // שלב הזדמנות
  L.oppStage = {
    discovery: 'גילוי', diagnosis: 'אבחון', solution: 'פתרון', proposal: 'הצעה',
    negotiation: 'משא ומתן', decision: 'החלטה', won: 'נסגר בהצלחה', lost: 'אבוד',
  };
  L.oppStageOrder = ['discovery', 'diagnosis', 'solution', 'proposal', 'negotiation', 'decision'];

  // סטטוס הצעה
  L.proposalStatus = {
    draft: 'טיוטה', sent: 'נשלחה', viewed: 'נצפתה', discussion: 'בדיון',
    accepted: 'אושרה', rejected: 'נדחתה', expired: 'פגה',
  };

  // שלב פרויקט
  L.projectStatus = {
    kickoff: 'התנעה', discovery: 'גילוי', specification: 'אפיון', build: 'פיתוח',
    internal_test: 'בדיקות פנימיות', customer_test: 'בדיקות לקוח', implementation: 'הטמעה',
    live: 'עלייה לאוויר', stabilization: 'ייצוב', completed: 'הושלם', paused: 'מושהה',
  };
  L.projectStageOrder = ['kickoff', 'discovery', 'specification', 'build', 'internal_test', 'customer_test', 'implementation', 'live', 'stabilization', 'completed'];

  // סטטוס אבן דרך / בקשת שינוי
  L.milestoneStatus = { pending: 'ממתין', in_progress: 'בתהליך', done: 'הושלם', blocked: 'חסום' };
  L.changeStatus = { pending: 'ממתין', approved: 'אושר', rejected: 'נדחה', implemented: 'יושם' };

  // סטטוס מרכז רווח / רעיון
  L.ideaStatus = { idea: 'רעיון', exploring: 'בבדיקה', pitched: 'הוצע', active: 'פעיל', dropped: 'נזנח' };

  // בריאות
  L.health = { green: 'תקין', yellow: 'לתשומת לב', red: 'בסיכון' };

  // סוגי פעילות
  L.activityType = {
    call: 'שיחה', meeting: 'פגישה', whatsapp: 'וואטסאפ', email: 'אימייל', note: 'הערה',
    task: 'משימה', document: 'מסמך', decision: 'החלטה', status_change: 'שינוי סטטוס', automation: 'אוטומציה',
  };

  // דחיפות/התאמה
  L.urgency = { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה', critical: 'קריטית' };
  L.fit = { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' };
  L.severity = { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה', critical: 'קריטית' };

  // צבע pill לפי בריאות/שלב
  L.healthColor = { green: 'ok', yellow: 'warn', red: 'bad' };

  L.t = (map, key) => (L[map] && L[map][key]) || key || '—';
  w.LABELS = L;
})(window);
