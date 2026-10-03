# רילס שיווקיים — ORT-TECH

סרטונים אנכיים (1080×1920, ‏30fps) שנבנים בקוד עם [Remotion](https://www.remotion.dev/).
הצבעים לקוחים מ־`public/site.css` והסמל מ־`public/ort-tech-mark.svg`. הגופן הוא Heebo, כמו באתר.
המבנה ותקן אזורי הבטיחות מבוססים על [coding-chops](https://github.com/Sun-Deep/coding-chops) (MIT).

| מזהה | שם | אורך | תקציר |
|---|---|---|---|
| `OT01-LeadAt2314` | ליד ב־23:14 | 15 ש׳ | ליד שנכנס בלילה ונענה רק בבוקר ← הכול מפוזר בין כלים ← שכבת תפעול אחת (הזרימה מעמוד הבית) ← הנעה לשיחת אבחון |

הרילס בלי קול ובלי מוזיקה, והטקסט צרוב בתמונה. התוכן נשאר בתוך אזורי הבטיחות של Reels, ‏Shorts ו־TikTok: ‏190px עליונים, ‏420px תחתונים, ומתחת ל־y=1000 גם 150px בצד ימין.

```bash
cd marketing/reels
npm install
npm run dev            # Remotion Studio
npm run render:reel    # out/ot01-lead-at-2314.mp4
npm run render:cover   # out/ot01-lead-at-2314-cover.png
```

בסביבה בלי Chrome מוסיפים את הדגל `--browser-executable=<path to chrome-headless-shell>`.
התיקייה עצמאית (`package.json` משלה) ואינה חלק מה־build של האתר או של ה־Functions.
