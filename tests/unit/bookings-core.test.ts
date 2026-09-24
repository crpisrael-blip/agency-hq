import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBookingSettings, formatIL, renderBookingText, meetingDetails, bookingTemplateParams,
  DEFAULT_CONFIRM_TEXT, DEFAULT_REMINDER_TEXT,
} from '../../src/api/bookings-core';

// 2026-09-20 10:30 Asia/Jerusalem (IDT, +03:00) => 07:30 UTC
const T = Date.UTC(2026, 8, 20, 7, 30);

test('buildBookingSettings — ברירות מחדל ופענוח', () => {
  const empty = buildBookingSettings({});
  assert.equal(empty.enabled, false);
  assert.equal(empty.offerPhone, true);           // ברירת מחדל: טלפון מוצע
  assert.equal(empty.offerZoom, false);
  assert.equal(empty.remindersEnabled, true);
  assert.deepEqual(empty.reminderOffsets, [1440, 60]);
  assert.equal(empty.confirmText, DEFAULT_CONFIRM_TEXT);
  assert.equal(empty.reminderText, DEFAULT_REMINDER_TEXT);

  const on = buildBookingSettings({
    booking_enabled: '1', booking_offer_zoom: '1', booking_zoom_link: 'https://zoom.us/j/1',
    booking_reminder_offsets: '60, 1440, x, -5', booking_offer_phone: '0',
  });
  assert.equal(on.enabled, true);
  assert.equal(on.offerPhone, false);
  assert.equal(on.offerZoom, true);
  assert.deepEqual(on.reminderOffsets, [1440, 60]);  // ממוין יורד, מסנן לא-תקין
});

test('formatIL — פורמט עברי בשעון ישראל', () => {
  const f = formatIL(T);
  assert.equal(f.time, '10:30');
  assert.match(f.date, /2026/);
  assert.ok(f.datetime.includes('10:30'));
});

test('meetingDetails — טלפון מול זום', () => {
  assert.ok(meetingDetails({ name: 'x', startAt: T, durationMin: 30, meetingType: 'phone' }).includes('טלפון'));
  const z = meetingDetails({ name: 'x', startAt: T, durationMin: 30, meetingType: 'zoom', meetingLink: 'https://zoom.us/j/9' });
  assert.ok(z.includes('https://zoom.us/j/9'));
  const zNoLink = meetingDetails({ name: 'x', startAt: T, durationMin: 30, meetingType: 'zoom' });
  assert.ok(zNoLink.includes('זום'));
});

test('renderBookingText — הצבת משתנים', () => {
  const out = renderBookingText(DEFAULT_CONFIRM_TEXT, { name: 'דנה כהן', startAt: T, durationMin: 30, meetingType: 'phone' });
  assert.ok(out.startsWith('היי דנה'));           // שם פרטי בלבד
  assert.ok(!out.includes('{'));                   // כל המשתנים הוחלפו
  assert.ok(out.includes('10:30'));
  const custom = renderBookingText('פגישה ב{date} בשעה {time}, {type}', { name: null, startAt: T, durationMin: 30, meetingType: 'zoom', meetingLink: 'L' });
  assert.ok(custom.includes('10:30'));
  assert.ok(custom.includes('זום'));
});

test('bookingTemplateParams — שלושה פרמטרים לתבנית Meta', () => {
  const p = bookingTemplateParams({ name: 'רון לוי', startAt: T, durationMin: 30, meetingType: 'phone' });
  assert.equal(p.length, 3);
  assert.equal(p[0], 'רון');
  assert.ok(p[1].includes('10:30'));
  assert.ok(p[2].includes('טלפון'));
  assert.equal(bookingTemplateParams({ name: '', startAt: T, durationMin: 30, meetingType: 'phone' })[0], 'שלום');
});

import { dueReminder } from '../../src/api/bookings-core';

test('dueReminder — שתי תזכורות (24 שעות ושעה)', () => {
  const start = 10_000_000_000;
  const offsets = [1440, 60];
  // הרבה לפני — כלום
  assert.equal(dueReminder({ startAt: start }, offsets, start - 2 * 24 * 3600_000), null);
  // בתוך חלון 24 שעות (אבל לפני שעה) — שולח את המוקדמת
  let r = dueReminder({ startAt: start }, offsets, start - 5 * 3600_000)!;
  assert.deepEqual(r.patch, { remind24SentAt: start - 5 * 3600_000 });
  // בתוך שעה, כשהמוקדמת כבר נשלחה — שולח את הקרובה
  r = dueReminder({ startAt: start, remind24SentAt: 1 }, offsets, start - 30 * 60_000)!;
  assert.deepEqual(r.patch, { remind1SentAt: start - 30 * 60_000 });
  // בתוך שעה, כשהמוקדמת עוד לא נשלחה (Worker היה מושבת) — שולח קרובה ומסמן גם מוקדמת
  r = dueReminder({ startAt: start }, offsets, start - 20 * 60_000)!;
  assert.equal(r.patch.remind1SentAt, start - 20 * 60_000);
  assert.equal(r.patch.remind24SentAt, start - 20 * 60_000);
  // הכל נשלח — כלום
  assert.equal(dueReminder({ startAt: start, remind1SentAt: 1, remind24SentAt: 1 }, offsets, start - 10 * 60_000), null);
  // הפגישה עברה — כלום
  assert.equal(dueReminder({ startAt: start }, offsets, start + 1000), null);
});

test('dueReminder — תזכורת בודדת', () => {
  const start = 10_000_000_000;
  // רק שעה: לפני שעה כלום, בתוך שעה שולח (remind1)
  assert.equal(dueReminder({ startAt: start }, [60], start - 2 * 3600_000), null);
  const r = dueReminder({ startAt: start }, [60], start - 40 * 60_000)!;
  assert.deepEqual(r.patch, { remind1SentAt: start - 40 * 60_000 });
});
