import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askableItems, calcProgress, buildSummary } from '../../src/api/run-fill';

const sections = JSON.stringify([
  { title: 'רקע', items: [{ label: 'שם העסק', hint: 'שם מלא' }, { label: 'תחום' }] },
  { title: 'צרכים', items: [{ label: 'הכאב המרכזי' }] },
]);

test('askableItems משטח את השאלות לפי הסדר ומדלג על "לא רלוונטי"', () => {
  const all = askableItems(sections, '{}');
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((i) => i.key), ['0-0', '0-1', '1-0']);
  assert.equal(all[0].sectionTitle, 'רקע');
  assert.equal(all[0].hint, 'שם מלא');

  const withNa = askableItems(sections, JSON.stringify({ '0-1': true }));
  assert.equal(withNa.length, 2);
  assert.deepEqual(withNa.map((i) => i.key), ['0-0', '1-0']);
});

test('calcProgress סופר רק פריטים בני-מענה שסומנו', () => {
  assert.equal(calcProgress(sections, '{}'), 0);
  assert.equal(calcProgress(sections, JSON.stringify({ '0-0': true })), 33);
  assert.equal(calcProgress(sections, JSON.stringify({ '0-0': true, '0-1': true, '1-0': true })), 100);
  // פריט "לא רלוונטי" יורד מהמכנה
  assert.equal(calcProgress(sections, JSON.stringify({ '0-0': true }), JSON.stringify({ '1-0': true })), 50);
});

test('buildSummary מחשב מצב מילוי לתצוגה, כולל השאלה שבה נעצר הלקוח', () => {
  const run = { sections, answers: JSON.stringify({ '0-0': 'טבע האדם' }), na: '{}' };
  const session = {
    status: 'in_progress', currentKey: '0-1', contactName: 'דנה', token: 'abc',
    sentAt: 1, openedAt: 2, startedAt: 3, lastActivityAt: 4, completedAt: null,
  };
  const s = buildSummary(run, session, 'ort_bot')!;
  assert.equal(s.total, 3);
  assert.equal(s.answered, 1);
  assert.equal(s.progress, 33);
  assert.equal(s.statusLabel, 'ממלא');
  assert.equal(s.currentLabel, 'תחום');
  assert.equal(s.contactName, 'דנה');
  assert.equal(s.link, 'https://t.me/ort_bot?start=abc');
});

test('buildSummary מחזיר null כשאין הזמנה, ו-link=null כשאין שם בוט', () => {
  assert.equal(buildSummary({ sections, answers: '{}', na: '{}' }, null, 'bot'), null);
  const s = buildSummary({ sections, answers: '{}', na: '{}' }, { status: 'sent', token: 't' }, null)!;
  assert.equal(s.link, null);
  assert.equal(s.statusLabel, 'נשלח');
});
