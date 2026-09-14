import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeILPhone, renderWelcome, DEFAULT_WELCOME_TEXT, isWhatsAppReady,
  greenSendRequest, metaSendRequest, describeWelcomeResult,
} from '../../src/api/whatsapp';
import { phoneFromNote } from '../../src/api/leads';

test('normalizeILPhone מנרמל מספרים ישראליים לפורמט בינלאומי בלי +', () => {
  assert.equal(normalizeILPhone('054-221-4726'), '972542214726');
  assert.equal(normalizeILPhone('0542214726'), '972542214726');
  assert.equal(normalizeILPhone('+972 54 221 4726'), '972542214726');
  assert.equal(normalizeILPhone('972542214726'), '972542214726');
  assert.equal(normalizeILPhone('00972542214726'), '972542214726');
  assert.equal(normalizeILPhone('+972-054-2214726'), '972542214726'); // 0 מוביל אחרי הקידומת
  assert.equal(normalizeILPhone('542214726'), '972542214726');        // בלי 0 מוביל
  assert.equal(normalizeILPhone('03-1234567'), '97231234567');         // קווי — 8 ספרות אחרי 972
});

test('normalizeILPhone מחזיר null על קלט לא תקין', () => {
  assert.equal(normalizeILPhone(''), null);
  assert.equal(normalizeILPhone(null), null);
  assert.equal(normalizeILPhone('abc'), null);
  assert.equal(normalizeILPhone('054-12'), null);
  assert.equal(normalizeILPhone('05412345678901'), null);
});

test('renderWelcome מכניס שם פרטי בלבד, ומנקה כשאין שם', () => {
  const withName = renderWelcome(DEFAULT_WELCOME_TEXT, 'דנה כהן');
  assert.ok(withName.startsWith('היי דנה 👋'));
  assert.ok(!withName.includes('{name}'));
  assert.ok(!withName.includes('כהן'));
  const noName = renderWelcome(DEFAULT_WELCOME_TEXT, '');
  assert.ok(noName.startsWith('היי 👋'), noName);
  assert.equal(renderWelcome('', 'רון').split('\n')[0], 'היי רון 👋'); // תבנית ריקה → ברירת מחדל
  assert.equal(renderWelcome('שלום {name}, קיבלנו.', null), 'שלום, קיבלנו.');
});

test('isWhatsAppReady דורש ספק מוגדר ומכבד כיבוי', () => {
  const base = {
    enabled: '', provider: '', welcomeText: '', greenInstance: '', greenToken: '', greenUrl: '',
    metaPhoneId: '', metaToken: '', metaTemplate: '', metaTemplateLang: '',
  };
  assert.deepEqual(isWhatsAppReady(base), { ready: false, reason: 'green_not_configured' });
  assert.deepEqual(isWhatsAppReady({ ...base, greenInstance: '1', greenToken: 't' }), { ready: true });
  assert.deepEqual(isWhatsAppReady({ ...base, greenInstance: '1', greenToken: 't', enabled: '0' }), { ready: false, reason: 'disabled' });
  assert.deepEqual(isWhatsAppReady({ ...base, provider: 'meta' }), { ready: false, reason: 'meta_not_configured' });
  assert.deepEqual(isWhatsAppReady({ ...base, provider: 'meta', metaPhoneId: 'p', metaToken: 't' }), { ready: true });
  assert.deepEqual(isWhatsAppReady({ ...base, provider: 'sms' }), { ready: false, reason: 'unknown_provider' });
});

test('greenSendRequest בונה כתובת וגוף לפי Green API', () => {
  const r = greenSendRequest({ greenInstance: '7105', greenToken: 'abc', greenUrl: 'https://7105.api.greenapi.com/' }, '972541234567', 'היי');
  assert.equal(r.url, 'https://7105.api.greenapi.com/waInstance7105/sendMessage/abc');
  assert.deepEqual(r.body, { chatId: '972541234567@c.us', message: 'היי' });
  const def = greenSendRequest({ greenInstance: '1', greenToken: 't', greenUrl: '' }, '972541234567', 'x');
  assert.ok(def.url.startsWith('https://api.green-api.com/waInstance1/'));
});

test('metaSendRequest שולח תבנית עם שם הליד, או טקסט כשאין תבנית', () => {
  const cfg = { metaPhoneId: '111', metaToken: 'tok', metaTemplate: 'lead_received', metaTemplateLang: '' };
  const r = metaSendRequest(cfg, '972541234567', 'טקסט', 'דנה כהן');
  assert.equal(r.url, 'https://graph.facebook.com/v21.0/111/messages');
  assert.equal(r.headers.Authorization, 'Bearer tok');
  const b: any = r.body;
  assert.equal(b.type, 'template');
  assert.equal(b.to, '972541234567');
  assert.equal(b.template.name, 'lead_received');
  assert.equal(b.template.language.code, 'he');
  assert.equal(b.template.components[0].parameters[0].text, 'דנה');
  const t: any = metaSendRequest({ ...cfg, metaTemplate: '' }, '972541234567', 'טקסט', null).body;
  assert.equal(t.type, 'text');
  assert.equal(t.text.body, 'טקסט');
});

test('phoneFromNote מחלץ טלפון מהערה של טפסים ישנים', () => {
  assert.equal(phoneFromNote('📞 054-2214726 · תחום: קליניקה · כואב לי'), '054-2214726');
  assert.equal(phoneFromNote('📞 +972 54-2214726 · x'), '+972 54-2214726');
  assert.equal(phoneFromNote('בלי טלפון'), null);
  assert.equal(phoneFromNote(null), null);
});

test('describeWelcomeResult מתאר תוצאה בעברית להתראת הטלגרם', () => {
  assert.equal(describeWelcomeResult({ status: 'sent', detail: 'id' }), '💬 ווטסאפ אוטומטי: נשלח ✓');
  assert.ok(describeWelcomeResult({ status: 'failed', detail: 'green 401' }).includes('green 401'));
  assert.ok(describeWelcomeResult({ status: 'skipped', detail: 'bad_phone' }).includes('טלפון לא תקין'));
});
