import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFormAnswers, buildFormSummary, newFormToken } from '../../src/api/run-form';

const sections = JSON.stringify([
  { title: 'א', items: [{ label: 'ש1' }, { label: 'ש2' }] },
  { title: 'ב', items: [{ label: 'ש3' }] },
]);

test('mergeFormAnswers ממזג תשובות, מסמן/מבטל סימון, ושומר תשובות קיימות', () => {
  const run = { sections, answers: JSON.stringify({ '0-0': 'ישן' }), checked: JSON.stringify({ '0-0': true }), na: '{}' };
  const m = mergeFormAnswers(run, { '0-1': 'חדש', '1-0': '  ' })!;
  assert.equal(m.answers['0-0'], 'ישן');
  assert.equal(m.answers['0-1'], 'חדש');
  assert.equal(m.checked['0-1'], true);
  assert.ok(!('1-0' in m.answers) && !m.checked['1-0']);
  const cleared = mergeFormAnswers({ ...run, answers: JSON.stringify(m.answers), checked: JSON.stringify(m.checked) }, { '0-0': '' })!;
  assert.ok(!('0-0' in cleared.answers) && !cleared.checked['0-0']);
});

test('mergeFormAnswers דוחה מפתח לא קיים, שאלה "לא רלוונטי", ערך לא-מחרוזת או ארוך מדי', () => {
  const run = { sections, answers: '{}', checked: '{}', na: JSON.stringify({ '1-0': true }) };
  assert.equal(mergeFormAnswers(run, { '9-9': 'x' }), null);
  assert.equal(mergeFormAnswers(run, { '1-0': 'x' }), null);
  assert.equal(mergeFormAnswers(run, { '0-0': 5 }), null);
  assert.equal(mergeFormAnswers(run, { '0-0': 'x'.repeat(4001) }), null);
  assert.equal(mergeFormAnswers(run, ['x']), null);
});

test('buildFormSummary סופר שאלות ומחזיר נתיב רק לקישור פעיל', () => {
  const run = { sections, answers: JSON.stringify({ '0-0': 'כן' }), na: JSON.stringify({ '1-0': true }) };
  const s = buildFormSummary(run, { status: 'in_progress', token: 'abc' })!;
  assert.equal(s.total, 2);
  assert.equal(s.answered, 1);
  assert.equal(s.progress, 50);
  assert.equal(s.path, '/f/abc');
  assert.equal(buildFormSummary(run, { status: 'cancelled', token: 'abc' })!.path, null);
  assert.equal(buildFormSummary(run, null), null);
  assert.match(newFormToken(), /^[0-9a-f]{64}$/);
});
