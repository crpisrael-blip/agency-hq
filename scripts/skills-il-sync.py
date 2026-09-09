# -*- coding: utf-8 -*-
"""
סנכרון קטלוג Skills IL → public/js/skills-il.js

מה הסקריפט עושה:
  1. משכפל (shallow) את ריפואי הסקילז של הארגון github.com/skills-il (או משתמש בתיקייה
     קיימת דרך SKILLS_IL_DIR=/path).
  2. קורא מכל תיקיית סקיל את SKILL.md + metadata.json (שם/תיאור בעברית מהארגון עצמו).
  3. מצרף את התמצית הקצרה בעברית מהמילון D שלמטה (נכתב ידנית — זה מה שמוצג על הכרטיס),
     ואת סימון ⭐ "רלוונטי לי".
  4. כותב את public/js/skills-il.js (window.SKILLS_IL_DATA / SK_IL_CATS / SK_IL_BUNDLES).

הרצה:  python3 scripts/skills-il-sync.py
סקיל חדש בארגון שאין לו תמצית ב-D יקבל תמצית אוטומטית (תחילת התיאור הרשמי) ויודפס
באזהרה — כדאי להוסיף לו שורה ב-D ולהריץ שוב.
"""
import json, os, re, glob, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'js', 'skills-il.js')
ORG = 'https://github.com/skills-il/'
# ריפואי הסקילז (ריפו לכל קטגוריה). לא כולל: skills-il-cli, mcps, design-systems, release-workflow, .github
SKILL_REPOS = ['developer-tools', 'localization', 'tax-and-finance', 'accounting', 'marketing-growth',
               'communication', 'security-compliance', 'legal-tech', 'government-services',
               'health-services', 'education', 'food-and-dining', 'travel', 'courses']
BUNDLE_REPO = 'bundles'

def ensure_repos():
    base = os.environ.get('SKILLS_IL_DIR') or tempfile.mkdtemp(prefix='skills-il-')
    for r in SKILL_REPOS + [BUNDLE_REPO]:
        d = os.path.join(base, r)
        if os.path.isdir(d):
            continue
        print('clone', r, file=sys.stderr)
        subprocess.run(['git', 'clone', '-q', '--depth', '1', ORG + r, d],
                       check=True, env={**os.environ, 'GIT_LFS_SKIP_SMUDGE': '1', 'GIT_TERMINAL_PROMPT': '0'})
    return base

def load_meta(base):
    def g(x, k):
        return x.get(k, '') if isinstance(x, dict) else ''
    rows = []
    for repo in SKILL_REPOS:
        for p in sorted(glob.glob(os.path.join(base, repo, '*', 'SKILL.md'))):
            d = os.path.dirname(p)
            mp = os.path.join(d, 'metadata.json')
            m = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {}
            rows.append({'repo': repo, 'name': os.path.basename(d),
                         'he': g(m.get('display_name'), 'he'),
                         'desc_he': g(m.get('display_description'), 'he')})
    return rows

BASE = ensure_repos()
meta = load_meta(BASE)

# קטגוריות = ריפו בארגון. [מזהה, תווית, אימוג'י]
CATS = [
    ["developer-tools", "כלי פיתוח ישראליים", "🛠️"],
    ["localization", "עברית, RTL ולוקליזציה", "🔤"],
    ["tax-and-finance", "מיסים, כספים ותשלומים", "💰"],
    ["accounting", "הנהלת חשבונות ושכר", "🧾"],
    ["marketing-growth", "שיווק וצמיחה בישראל", "📣"],
    ["communication", "תקשורת עם לקוחות", "💬"],
    ["security-compliance", "אבטחה, פרטיות ורגולציה", "🛡️"],
    ["legal-tech", "משפט וחוזים", "⚖️"],
    ["government-services", "שירותי ממשלה וזכויות", "🏛️"],
    ["health-services", "בריאות", "🏥"],
    ["education", "חינוך והשכלה", "🎓"],
    ["food-and-dining", "מזון ומסעדנות", "🍽️"],
    ["travel", "נסיעות ותיירות", "✈️"],
    ["courses", "קורסים (סקילי-לימוד)", "📚"],
]

# תמצית עברית קצרה לכל סקיל + סימון ⭐ (רלוונטי לבית תוכנה שבונה מערכות ללקוחות ישראליים)
D = {
# ---------- accounting ----------
"green-invoice": ("חיבור ל-API של חשבונית ירוקה (Morning): חשבוניות, קבלות, לקוחות ותשלומים", 1),
"gws-israeli-business-sheets": ("גיליונות Google להכנסות/הוצאות בשקלים, מע״מ ותקופות מס דרך gws CLI", 0),
"hashavshevet-data-tools": ("ייבוא/ייצוא נתונים מחשבשבת ל-JSON, CSV ו-Excel: פקודות יומן, מאזנים, כרטסות", 0),
"israeli-amuta-compliance": ("מכין עמותה/חל״צ להגשה השנתית לרשם העמותות: צ׳קליסט וארבעת המסמכים", 0),
"israeli-annual-reports": ("ניתוח דוחות שנתיים וגילויים רגולטוריים של חברות ישראליות", 0),
"israeli-attendance-wage-checker": ("בודק תלוש שכר מול דוח נוכחות ומחשב כמה מגיע מול כמה שולם", 0),
"israeli-bank-reconciliation": ("התאמת בנק אוטומטית לבנקים וחברות אשראי ישראליות, כולל דוח פערים", 0),
"israeli-bookkeeping-automation": ("פקודות יומן בהנהלה כפולה לעסקאות ישראליות: שכר, מע״מ, פחת והכרה בהכנסה", 0),
"israeli-e-invoice": ("יצירה ואימות חשבוניות אלקטרוניות לפי תקן רשות המסים, כולל מספרי הקצאה", 1),
"israeli-expense-categorizer": ("מיון הוצאות עסקיות לקטגוריות מוכרות במס לפי כללי פקודת מס הכנסה", 1),
"israeli-financial-reports": ("דוחות כספיים בפורמט ישראלי: רווח והפסד, מאזן, מאזן בוחן ותזרים — דו-לשוני", 1),
"israeli-healthcare-payroll": ("מסביר ובודק שכר עובדי מערכת הבריאות הציבורית: אחיות, מקצועות הבריאות", 0),
"israeli-payroll-calculator": ("חישוב שכר ברוטו-נטו: מס הכנסה, ביטוח לאומי, בריאות, פנסיה ושווי רכב", 0),
"israeli-receipt-scanner": ("OCR לקבלות וחשבוניות בעברית: ספק, תאריך, סכום, מע״מ ומספר עוסק", 1),
"israeli-teacher-payroll": ("מחשב ומסביר שכר מורים לפי רפורמות אופק חדש ועוז לתמורה", 0),
# ---------- communication ----------
"gws-hebrew-email-automation": ("אוטומציית Gmail לפרילנסרים: מיילים בעברית, תזכורות תשלום, תוויות ומסננים", 0),
"israeli-customer-support-automator": ("אוטומציית תמיכה: סיווג פניות בעברית, חוק הגנת הצרכן, SLA לפי שעות ישראל", 1),
"israeli-cv-builder": ("קורות חיים ישראליים מוכנים לשליחה, בעברית/אנגלית, כולל שירות צבאי", 0),
"israeli-hr-recruitment-automator": ("גיוס מצד המעסיק: תיאורי משרה חוקיים, פרסום ללוחות דרושים, סינון", 0),
"israeli-job-market": ("נתוני שוק העבודה הישראלי, שיפור קו״ח בעברית וטווחי שכר", 0),
"israeli-personal-assistant": ("עוזר אישי בהקשר ישראלי: שבוע א׳-ה׳, הודעות בעברית, תזכורות מע״מ וחגים", 0),
"israeli-sms-gateway": ("שליחת SMS דרך ספקים ישראליים: OTP, התראות, אימות מספר ועלות מקטעים בעברית", 1),
"israeli-telecom-comparator": ("השוואת חבילות סלולר, אינטרנט וטלוויזיה בין כל הספקים בישראל", 0),
"israeli-telegram-business-bot": ("בוט טלגרם לעסק קטן: תורים, הזמנות, מענה אוטומטי בעברית ושעות פעילות", 1),
"israeli-whatsapp-business": ("WhatsApp Business API לשוק הישראלי: תבניות בעברית, שיחות לקוח וחיבור ל-CRM", 1),
"monday-com-workflows": ("לוחות, אוטומציות ו-API של Monday.com לצוותים ישראליים", 1),
# ---------- courses ----------
"ai-agents-for-everyone": ("קורס לא-טכני ב-6 פרקים: מה זה סוכן AI ואיך מקימים אחד בלי קוד", 0),
"israeli-freelancer-year": ("קורס: לוח השנה של הפרילנסר הישראלי — 12 דדליינים מול רשות המסים ומע״מ", 0),
"israeli-pension-decoded": ("קורס: הפנסיה הישראלית למי שלא מומחה — קרנות ברירת מחדל ומתי להחליף", 0),
"making-aliyah-first-90-days": ("קורס לעולים חדשים: 90 הימים הראשונים, סל קליטה, בריאות ואולפן", 0),
"miluim-rights-and-money": ("קורס: תגמולי מילואים לעצמאים — חישוב, מענקים והגנה על מקום העבודה", 0),
"writing-your-first-agent-skill": ("קורס למפתחים: איך כותבים סקיל מאפס — פורמט SKILL.md ו-10 טעויות נפוצות", 1),
# ---------- developer-tools ----------
"cloudinary-assets": ("ניהול מדיה ב-Cloudinary: העלאה, טרנספורמציות, אופטימיזציה ותמונות רספונסיביות", 1),
"github-actions-il": ("תבניות CI/CD לצוותים ישראליים: הקפאת פריסה בשבת/חג, התראות Slack בעברית", 1),
"hebrew-chatbot-builder": ("בניית צ׳אטבוט בעברית: WhatsApp, טלגרם, ווידג׳ט אתר ו-UI צ׳אט ב-RTL", 1),
"hebrew-llm-eval-suite": ("השוואת מודלי שפה על עברית: הבנת הנקרא, סנטימנט, תרגום וידע ישראלי", 0),
"hebrew-ml-datasets-navigator": ("מפת מאגרי נתונים ומודלים לעברית ויידיש: ivrit.ai, Dicta, HeQ ועוד", 0),
"hebrew-voice-bot-builder": ("בוט קולי/IVR בעברית: תמלול, הקראה וחיבור טלפוניה לעסקים", 0),
"hyperframes-best-practices": ("יצירת וידאו מקוד עם HyperFrames (HTML + GSAP) כולל תמיכה מלאה בעברית ו-RTL", 0),
"idf-date-converter": ("המרה בין לוח עברי ללועזי, חגים ישראליים, תאריך כפול וימי עסקים", 1),
"israeli-agritech-advisor": ("שילוב פלטפורמות אגריטק ישראליות: CropX, נטפים, Taranis", 0),
"israeli-chatbot-analytics": ("ניתוח ביצועי צ׳אטבוט בעברית: זרימות, נטישה, סנטימנט ו-A/B", 0),
"israeli-cloud-cost-comparator": ("השוואת עלויות ענן באזורי ישראל: AWS תל אביב, Azure, GCP, Oracle וקמטרה", 1),
"israeli-id-validator": ("אימות ופירמוט תעודת זהות, ח.פ., מספר עמותה ושותפות", 1),
"israeli-marketplace-seller": ("מכירה במרקטפלייסים ישראליים: זאפ, יד2, פייסבוק מרקטפלייס ואינסטגרם", 0),
"israeli-phone-formatter": ("אימות ופירמוט טלפונים ישראליים, המרה ל-+972, זיהוי קידומות", 1),
"israeli-postgres-toolkit": ("PostgreSQL לאפליקציות ישראליות: קולציה לעברית, שקלים, תאריכים ואזור זמן ירושלים", 1),
"israeli-product-price-comparator": ("השוואת מחירי מוצרים בין קמעונאים ישראליים: זאפ, KSP, איווֹרי, באג", 0),
"israeli-shipping-manager": ("אינטגרציות משלוחים: דואר ישראל, צ׳יטה, HFD, GetPackage ולוקרים", 1),
"israeli-spreadsheets": ("קובצי Excel/Sheets עם חישובי מס ומע״מ, פורמט ₪, RTL ותוויות בעברית", 1),
"israeli-startup-toolkit": ("תפעול סטארטאפ ישראלי: התאגדות, מענקי רשות החדשנות, הסכמי השקעה, אופציות 102", 0),
"jfrog-devops": ("ניהול JFrog Artifactory, Docker registry ו-Xray ל-DevOps ו-MLOps", 0),
"make-com-israeli-automations": ("תרחישי Make.com לעסקים ישראליים: Morning, iCount, Monday, Priority, WhatsApp", 1),
"n8n-hebrew-workflows": ("ווֹרקפלואים ב-n8n עם API ישראליים: Morning, בנקים, data.gov.il, SMS, Cardcom", 1),
"open-slide-best-practices": ("מצגות React ב-open-slide (1920×1080) עם תמיכה מלאה בעברית ו-RTL", 0),
"remotion-best-practices": ("וידאו תוכנתי ב-Remotion עם כתוביות ואנימציות טקסט בעברית RTL", 0),
"skills-il-skill-creator": ("תהליך מודרך ליצירת סקיל חדש לארגון skills-il: תיקייה, metadata דו-לשוני והוראות", 1),
"telegram-bot-builder": ("בניית בוטים לטלגרם עם grammY/Telegraf/python: webhooks, מקלדות, תשלומים, Mini Apps", 1),
"video-use-best-practices": ("עריכת וידאו בעברית מקצה לקצה עם video-use: כתוביות, גופנים ו-RTL", 0),
"wcag-accessibility-widget": ("ווידג׳ט נגישות צף לאתר ישראלי לפי ת״י 5568: ניגודיות, גודל גופן, ניווט מקלדת", 1),
"yad2-second-hand-trader": ("קנייה ומכירה ביד2: מודעות בעברית, טווח מחיר הוגן והגנה מהונאות", 0),
"zapier-israeli-integrations": ("Zaps שמחברים אפליקציות ישראליות (Morning, Cardcom, Tranzila, iCount) לשירותים גלובליים", 1),
# ---------- education ----------
"israeli-academic-scholarships": ("התאמת סטודנט למלגות שהוא זכאי להן, מדורג לפי דדליין וגובה המלגה", 0),
"israeli-bagrut-psychometric": ("הכוונה בבגרויות ובפסיכומטרי: יחידות, ציונים ודרישות קבלה", 0),
"israeli-childcare-navigator": ("מערכת הטיפול בילדים מלידה עד 12: מעונות, גנים, קצבאות וצהרונים", 0),
"israeli-genealogy-researcher": ("חקר שורשים במאגרים ישראליים ויהודיים", 0),
"israeli-heritage-explorer": ("מחקר מורשת ישראלית ויהודית בארכיונים הדיגיטליים של הספרייה הלאומית", 0),
"israeli-special-education-dossier": ("הכנת הורה לוועדת זכאות ואפיון בחינוך המיוחד: מסמכים וטיעונים", 0),
"israeli-tech-interview-prep": ("הכנה לראיונות טכניים בחברות הייטק ישראליות: תהליכים, שאלות ומינוח בעברית", 0),
# ---------- food-and-dining ----------
"israeli-food-business-compliance": ("רגולציה לעסק מזון: רישוי, כשרות, משרד הבריאות, סימון אדום/ירוק ומע״מ", 0),
"israeli-grocery-price-intelligence": ("השוואת מחירי סופרים מנתוני חוק שקיפות המחירים: שופרסל, רמי לוי ועוד", 0),
"israeli-restaurant-ops": ("תפעול מסעדה: תפריט, תמחור ועמלות פלטפורמות משלוחים (Wolt, 10bis)", 0),
# ---------- government-services ----------
"israel-gov-api": ("שליפה וניתוח נתוני ממשל פתוחים מ-data.gov.il (CKAN): תחבורה, למ״ס ועוד", 1),
"israeli-address-autocomplete": ("פירמוט, אימות וגיאוקודינג של כתובות ישראליות: מיקוד וקודי יישוב", 1),
"israeli-aliyah-customs-shipment-planner": ("תכנון 3 המשלוחים הפטורים ממכס לעולים חדשים: מה פטור ומה חורג", 0),
"israeli-aliyah-navigator": ("מדריך עלייה מלא: לפני ההגעה, סל קליטה, משרד הקליטה והתיישבות", 0),
"israeli-bituach-leumi": ("זכויות ביטוח לאומי: קצבאות, זכאות, דמי ביטוח וטפסים", 0),
"israeli-bureaucracy-decoder": ("מפענח מכתבים וטפסים ממשלתיים לשפה פשוטה: מס הכנסה, ביטוח לאומי, עירייה", 0),
"israeli-business-war-compensation": ("חישוב פיצוי נזק עקיף לעסקים מהמלחמה ומדריך הגשה לרשות המסים", 0),
"israeli-company-lookup": ("איתור פרטי חברה ברשם החברות וסוגי התאגדות", 1),
"israeli-digital-nomad-navigator": ("נוודות דיגיטלית לישראלים: ויזות, מיסוי ושמירת אחיזה בארץ", 0),
"israeli-discharged-soldier-navigator": ("זכויות חיילים משוחררים: פיקדון, מענקים ותוכניות משרד הביטחון", 0),
"israeli-drug-database": ("מאגר תרופות ישראלי: סל הבריאות, חלופות גנריות ומחירים", 0),
"israeli-education-system": ("מערכת החינוך: בגרויות, פסיכומטרי, קבלה לאוניברסיטאות ונתוני משרד החינוך", 0),
"israeli-election-data": ("נתוני כנסת ובחירות מ-OData של הכנסת וועדת הבחירות", 0),
"israeli-fact-checker": ("אימות טענה ציבורית מול נתונים רשמיים ישראליים והחזרת פסק דין עם מקורות", 0),
"israeli-gov-form-automator": ("מילוי אוטומטי של טפסים ממשלתיים דרך Playwright ו-PDF", 1),
"israeli-land-tenders": ("מכרזי רשות מקרקעי ישראל: נתונים, הקצאות ותהליך הגשה", 0),
"israeli-lone-soldier-rights": ("סל הזכויות לחייל בודד: מענקים, שכר דירה ותשלומים", 0),
"israeli-media-authenticity-verifier": ("בדיקה מובנית אם תמונה/וידאו מזויפים או מוצגים בהקשר שגוי", 0),
"israeli-miluim-manager": ("זכויות מילואים: תגמולים, מס, חובות מעסיק ומענקים", 0),
"israeli-municipal-audit-report": ("למבקר פנימי ברשות מקומית: כתיבת דוח הביקורת השנתי הסטטוטורי", 0),
"israeli-public-transit": ("תחבורה ציבורית: מסלולים, לוחות זמנים וזמני הגעה לאוטובוס, רכבת ורכבת קלה", 0),
"israeli-real-estate": ("נדל״ן ישראלי: עסקאות דומות, מס רכישה, טאבו והנחיות עסקה", 0),
"israeli-relocation-abroad": ("רילוקיישן מישראל: לפני, במהלך ואחרי המעבר, כולל ניתוק תושבות", 0),
"israeli-returning-resident-customs-vehicle": ("מכס ויבוא רכב לתושב חוזר: משלוחים, חלון 9 חודשים ומכסות", 0),
"israeli-returning-resident-navigator": ("תהליך החזרה לארץ לתושב חוזר: ביטוח לאומי, מס ובריאות", 0),
"israeli-statistics": ("נתוני הלמ״ס: מדד המחירים, מחירי דיור, אינדיקטורים ודמוגרפיה", 0),
"israeli-survivor-benefits-navigator": ("כל הזכויות שמתעוררות אחרי פטירה: קצבת שאירים, טפסים ומוסדות", 0),
"israeli-unemployment-benefits-navigator": ("דמי אבטלה מקצה לקצה: זכאות, תקופת אכשרה, סכום והגשה", 0),
"israeli-vehicle-manager": ("ניהול רכב: טסט, חידוש רישיון, בדיקת רכב משומש וביטוח", 0),
"israeli-war-damage-claims": ("תביעת נזק ישיר מטילים: תיעוד, הגשה לקרן הפיצויים וביטוח תכולה", 0),
# ---------- health-services ----------
"foreign-caregiver-payroll": ("העסקה חוקית של מטפל סיעודי זר בבית וחישוב העלות החודשית האמיתית", 0),
"israeli-celiac-navigator": ("ניווט צליאק וחיים ללא גלוטן בישראל, בדגש על ילדים", 0),
"israeli-elder-care-navigator": ("טיפול בקשישים: גמלת סיעוד, ביטוח סיעודי, בתי אבות וטיפול בבית", 0),
"israeli-emergency-guide": ("שירותי חירום: מד״א, בתי חולים, מרכזי טראומה ומוקדי דחוף", 0),
"israeli-fertility-guide": ("טיפולי פוריות: כיסוי סל, שב״ן, הקפאת ביציות, פונדקאות וזכויות בעבודה", 0),
"israeli-food-allergy-navigator": ("בירוקרטיה של אלרגיה מסכנת חיים בילדים: גנים, בתי ספר וצהרונים", 0),
"israeli-hmo-navigator": ("ארבע קופות החולים: עלויות, הפניות, מיון וסל הבריאות", 0),
"israeli-mental-health-navigator": ("שירותי בריאות הנפש: טיפול בקופה, קווי חירום, פוסט-טראומה וזכויות בעבודה", 0),
"israeli-nutrition-planner": ("תכנון תפריט לפי הנחיות משרד הבריאות, הקשת התזונתית וסימון אדום/ירוק", 0),
"israeli-oncology-navigator": ("בירוקרטיה לחולי סרטן ומטפלים: ביטוח לאומי, פטור ממס, ארנונה ושיקום", 0),
"israeli-workout-coach": ("מאמן כושר אישי בעברית שזוכר את התוכנית וההיסטוריה בין סשנים", 0),
# ---------- legal-tech ----------
"israeli-car-accident-claim": ("אחרי תאונת דרכים: תיעוד בזירה, איזה ביטוח תובעים ותביעת נזקי גוף", 0),
"israeli-citizenship-by-descent": ("בדיקת זכאות לדרכון אירופי מכוח מוצא ובניית מסלול הגשה עצמאי", 0),
"israeli-divorce-navigator": ("תהליך גירושין: בית דין רבני מול משפחה, יישוב סכסוך והסכם", 0),
"israeli-employment-contract-reviewer": ("ביקורת חוזה עבודה לפני חתימה מצד העובד: סעיפים לא חוקיים והגנות חסרות", 0),
"israeli-employment-contracts": ("ניסוח חוזה עבודה עם כל הסעיפים המחייבים לפי דיני העבודה", 1),
"israeli-estate-settlement-navigator": ("ניהול עיזבון אחרי פטירה: ציר זמן בירוקרטי מותאם עם תאריכים", 0),
"israeli-fines-fighter": ("ערעור על דוחות חניה, תנועה ונת״צ: מכתבי ערר בעברית ומועדים", 0),
"israeli-freelancer-service-agreement": ("הסכם מתן שירותים לפרילנסר מול לקוח: היקף, תשלום, קניין רוחני", 1),
"israeli-home-defect-report": ("תיעוד ליקויי בנייה בדירה חדשה: פרוטוקול מסירה ויומן ליקויים מתוארך", 0),
"israeli-hotzaa-lapoal-debtor": ("למי שנפתח נגדו תיק הוצאה לפועל: אזהרה, מועדים ומה עושים", 0),
"israeli-patent-guide": ("תהליך פטנט ישראלי: חיפוש קודם, הגשה לאומית, PCT ואגרות", 0),
"israeli-renovation-scope-builder": ("כתב כמויות ותנאי התקשרות לשיפוץ בית: פירוט, החרגות ואבני דרך", 0),
"israeli-rental-agreements": ("חוזי שכירות: זכויות שוכר ומשכיר, ערבויות ומו״מ", 0),
"israeli-small-claims-court": ("תביעות קטנות: הגשה, טפסים ומהלך הדיון", 0),
"israeli-tabu-extract-decoder": ("קורא נסח טאבו ומסביר שורה-שורה: בעלים, משכנתאות, עיקולים והערות", 0),
"israeli-tender-proposal-builder": ("חבילת הצעה למכרז ציבורי: תנאי סף, צ׳קליסט עמידה וניסוח כל הסעיפים", 1),
"israeli-urban-renewal-owner-guide": ("התחדשות עירונית מצד בעל הדירה: פינוי-בינוי, תמ״א ורוב נדרש", 0),
"israeli-wills-inheritance": ("ניסוח צוואה בעדים תקפה וניווט תהליך הירושה לפי חוק הירושה", 0),
"israeli-workplace-rights-navigator": ("זכויות עובדים: חופשה, מחלה, שעות נוספות, לידה, פיצויים והבראה", 0),
# ---------- localization ----------
"hebrew-content-writer": ("כתיבה ועריכת תוכן מקצועי בעברית: שיווק, UX, מאמרים ומיילים — מרשמי עד דוגרי", 1),
"hebrew-document-generator": ("מסמכים בעברית (PDF/Word/PPTX) עם RTL נכון, bidi מעורב וטיפוגרפיה עברית", 1),
"hebrew-i18n": ("בינאום (i18n) לעברית באפליקציות ווב ומובייל: ריבוי, תאריכים, מספרים ותרגומים", 1),
"hebrew-nlp-toolkit": ("עיבוד שפה בעברית: DictaLM, DictaBERT, AlephBERT ו-ivrit.ai — טוקניזציה, NER, סנטימנט", 0),
"hebrew-ocr-forms": ("OCR לטפסים ממשלתיים סרוקים: טאבו, רשות המסים, ביטוח לאומי", 0),
"hebrew-rtl-best-practices": ("פריסות RTL לאתרים בעברית: CSS לוגי, טקסט דו-כיווני ומלכודות נפוצות", 1),
"hebrew-tailwind-preset": ("הגדרת Tailwind v4 לעברית: וריאנטים של dir, גופנים עבריים ומאפיינים לוגיים", 1),
"israeli-accessibility-compliance": ("נגישות לפי ת״י 5568 (WCAG 2.0 AA) לאפליקציות בעברית: חוק, בדיקה ותיקון", 1),
"israeli-apartment-hunting": ("חיפוש דירה להשכרה: יד2, מדלן, קבוצות פייסבוק ומו״מ עם בעלי דירות", 0),
"israeli-ui-design-system": ("ספריית רכיבים ומערכת עיצוב RTL-first: זיווגי גופנים, ₪, תאריכים ושעון 24", 1),
"israeli-wedding-planner": ("תכנון חתונה ישראלית: אולמות, ספקים, תקציב ולוח זמנים", 0),
"shabbat-aware-scheduler": ("תזמון פגישות, פריסות ואירועים סביב שבת, חגים ולוח עברי", 1),
# ---------- marketing-growth ----------
"hebrew-podcast-postproduction": ("פוסט-פרודקשן לפודקאסט בעברית: הערות פרק, פרקים, קליפים וכיתובים לרשתות", 0),
"hebrew-seo-geo-toolkit": ("SEO ו-GEO לעברית: גוגל ישראל ומנועי AI, סכמה, EEAT ומורפולוגיה עברית", 1),
"hebrew-survey-builder": ("סקרים בעברית (NPS, CSAT, משוב) עם ניסוח ישראלי טבעי ופריסה ל-Google Forms", 1),
"israeli-aso": ("אופטימיזציה לחנויות אפליקציות לקהל ישראלי: מטא-דאטה ומילות מפתח בעברית", 0),
"israeli-content-marketing": ("שיווק תוכן לשוק הישראלי: SEO בעברית, AEO, גיקטיים וכלכליסט, B2B", 1),
"israeli-email-sequences": ("רצפי אימייל: RTL, תזמון לפי חגים ועמידה בחוק הספאם", 1),
"israeli-linkedin-strategy": ("אסטרטגיית לינקדאין דו-לשונית להייטק הישראלי: תזמון, האשטגים ומעורבות", 1),
"israeli-market-fit": ("האם המוצר מתאים לשוק הישראלי לפני שבונים: פרסונות קונים וסימני אזהרה", 1),
"israeli-paid-ads": ("קמפיינים ממומנים בישראל: גוגל, מטא, טאבולה, אאוטבריין ויד2 — כולל רגולציה", 1),
"israeli-product-launch": ("השקת מוצר להייטק הישראלי: תקשורת, דמו-דיי וקהילות", 0),
"israeli-social-content": ("תוכן לרשתות לקהל ישראלי: פייסבוק, אינסטגרם, טיקטוק ולינקדאין", 1),
"israeli-tech-salary-negotiator": ("בנצ׳מרק שכר בהייטק ואסטרטגיית מו״מ מבוססת נתונים", 0),
"presentation-generator": ("מצגות RTL בעברית: פיץ׳, דוח רבעוני או שיעור — גופנים ויישור נכון", 1),
# ---------- security-compliance ----------
"hebrew-legal-research": ("מחקר משפטי ישראלי: חקיקה, פסיקה, מינוח משפטי בעברית והכנת מסמכים", 0),
"israeli-ai-compliance-kit": ("רגולציית AI בישראל לצוותי ML: מדיניות משרד החדשנות, חוק הפרטיות ותיקון 13", 0),
"israeli-appsec-scanner": ("סריקת אבטחה לאפליקציות ישראליות: OWASP Top 10, רשות הפרטיות, סודות ותלויות", 1),
"israeli-cyber-regulations": ("רגולציית סייבר: הנחיות מערך הסייבר, הוראה 364 של בנק ישראל ועוד", 0),
"israeli-cybersecurity-ops": ("תפעול אבטחה עם כלים ישראליים: טריאז׳ איומים, פגיעויות ותגובה לאירועים", 0),
"israeli-ecommerce-compliance": ("עמידה בחוק לחנות אונליין: הגנת הצרכן, החזרות, הצגת מחיר, נגישות וקוקיז", 1),
"israeli-privacy-shield": ("חוק הגנת הפרטיות ותיקון 13: רישום מאגר, הסכמה, אבטחת מידע ודיווח על אירוע", 1),
"israeli-scam-detector": ("בדיקה אם SMS, מייל, קישור או שיחה הם הונאה — ומה עושים גם אחרי שהכסף עבר", 0),
"israeli-shelter-guide": ("איתור והכנת מרחב מוגן: ממ״ד, ממ״ק, ממ״ן ומקלט ציבורי", 0),
"israeli-standards-import-checker": ("האם מוצר מיובא דורש אישור מכון התקנים ותקן רשמי", 0),
"pikud-haoref-safety-protocols": ("פרוטוקולי בטיחות לפי סוג התרעת פיקוד העורף", 0),
# ---------- tax-and-finance ----------
"american-freelancer-israel-tax": ("מס עצמאים אמריקאי לעוסק ישראלי בעל אזרחות אמריקאית, בנוסף לביטוח לאומי", 0),
"boi-economic-data": ("נתוני בנק ישראל: ריבית, מדד, שער יציג ולמ״ס — שליפה וניתוח", 0),
"cardcom-payment-gateway": ("סליקה ב-Cardcom: Low Profile, טוקניזציה, הוראת קבע וחשבונית אוטומטית", 1),
"dual-listed-arbitrage": ("איתור פערי מחיר בין ת״א לארה״ב במניות דואליות לפי שער יציג", 0),
"grow-payment-gateway": ("סליקה ב-Grow (משולם): דפי תשלום, טוקנים, הוראת קבע, לינקים, החזרים ו-webhooks", 1),
"il-invoice-organizer": ("סידור חשבוניות בעברית להנה״ח: חילוץ מע״מ, קטגוריות רשות המסים וייצוא לרו״ח", 1),
"israeli-arnona-optimizer": ("חישוב ארנונה, בדיקת זכאות להנחה וניסוח ערר לוועדה", 0),
"israeli-bank-connector": ("ניתוח תנועות בנק ואשראי ישראליים ודפוסי הוצאה", 0),
"israeli-budget-planner": ("תקציב משק בית עם עלויות ישראליות: משכנתא, פנסיה ומוצרים פיננסיים", 0),
"israeli-client-payment-chaser": ("גביית חשבוניות פתוחות: תזכורות בעברית, גיול חובות ומכתב דרישה", 1),
"israeli-company-valuation": ("טווח שווי אינדיקטיבי לחברה פרטית ישראלית: DCF, מכפילים ו-WACC מקומי", 0),
"israeli-consumer-fee-fighter": ("הורדת עמלות בנק ואשראי: ביטול כרטיס, מסלול עמלות זול והשוואה", 0),
"israeli-corporate-tax-strategy": ("משיכת רווחים מחברה: שכר מול דיבידנד, הלוואת בעלים ודמי ניהול", 0),
"israeli-coupon-code-finder": ("איתור ואימות קודי קופון תקפים לחנויות אונליין ישראליות", 0),
"israeli-crypto-tax-reporter": ("מס רווחי הון על קריפטו לפי רשות המסים, כולל טופס 1399 ומקדמות", 0),
"israeli-customs-duty-calculator": ("סיווג HS וחישוב עלות יבוא מלאה: מכס, מע״מ 18% ומס קנייה", 0),
"israeli-employee-tax-refund": ("החזר מס לשכירים: קריאת טופס 106 וזיהוי טריגרים להחזר", 0),
"israeli-export-shipping-kit": ("מסמכי יצוא מלאים: חשבון מסחרי, רשימת אריזה, שטר מטען ותעודות מקור", 0),
"israeli-freelancer-ops": ("תפעול יומיומי לעוסק: גיול חשבוניות, איסוף חשבונות ותזכורות מס", 1),
"israeli-hon-declaration-preparer": ("הכנת הצהרת הון (טופס 1219): כל סוגי הנכסים וההתחייבויות", 0),
"israeli-insurance-comparator": ("השוואת ביטוח רכב, דירה ובריאות משלים בין 20+ חברות לפי נתוני ממשלה", 0),
"israeli-insurance-duplication-checker": ("ביקורת כפל ביטוחים במשק הבית: בריאות, סיעוד, חיים, רכב ודירה", 0),
"israeli-mortgage-comparator": ("השוואת מסלולי משכנתא, חישוב החזר ותקרות בנק ישראל (הוראה 329)", 0),
"israeli-payment-orchestrator": ("שכבת סליקה מאוחדת: Cardcom, Tranzila, PayMe, משולם, iCredit, Pelecard + תשלומים", 1),
"israeli-pension-advisor": ("פנסיה וחיסכון: קרן פנסיה, ביטוח מנהלים, השתלמות, טופס 161 ותיקון 190", 0),
"israeli-price-quote-generator": ("הצעת מחיר תקנית בעברית לפרילנסר/עסק קטן, כולל מע״מ ותנאים", 1),
"israeli-property-appraisal": ("ניתוח עסקאות דומות לנכס מנתוני ממשלה (לא שומה מוסמכת)", 0),
"israeli-smart-saver": ("חיסכון בקניות: זאפ, BuyMe, קאשבק וביקורת מנויים", 0),
"israeli-startup-investment-analyzer": ("מזכר השקעה מובנה לסטארטאפ ישראלי: שוק, צוות, שווי, דילול וסיכונים", 0),
"israeli-stock-options-tax": ("מס על אופציות ו-RSU לפי סעיף 102: מסלולים, נאמן ורווח הון", 0),
"israeli-tax-returns": ("דוחות שנתיים לרשות המסים: 1301, 1214, 126, 856, 6111 ומקדמות", 0),
"israeli-tax-withholding": ("ניכוי מס במקור: שיעורים, אישורים, תיאום מס וחישוב", 1),
"israeli-toshav-chozer-vatik-tax-planner": ("תכנון פטור סעיף 14 לתושב חוזר ותיק (10+ שנים בחו״ל)", 0),
"israeli-trapped-profits-planner": ("חשיפה לרווחים כלואים (תיקון 277): תוספת 2% וייחוס הכנסה לבעלים", 0),
"israeli-utility-rates-comparator": ("השוואת חשמל, מים, גז, סלולר, סיבים וארנונה בין ספקים ורשויות", 0),
"israeli-vat-reporting": ("דוח מע״מ: הכנה, אימות והגשה — חודשי/דו-חודשי, יצוא בשיעור אפס ואילת", 1),
"pelecard-payment-gateway": ("סליקה ב-Pelecard: iframe, סוגי פעולה J2/J4/J5, תשלומים וטוקניזציה", 1),
"shekel-currency-converter": ("המרת מטבע לשקל ומשקל לפי שער יציג של בנק ישראל, 30+ מטבעות", 1),
"tase-stock-analysis": ("ניתוח מניות בבורסה בת״א: ת״א 35/125, דיווחי מאיה ומניות דואליות", 0),
"tranzila-payment-gateway": ("סליקה ב-Tranzila: iframe, טוקנים, תשלומים, החזרים, 3DS ו-Bit", 1),
"us-israel-dual-tax-navigator": ("מה אזרח כפול ארה״ב-ישראל חייב להגיש בשתי המערכות: 1040, FBAR, 8938", 0),
"us-person-israeli-investment-check": ("סינון מוצרי חיסכון ישראליים לאזרח אמריקאי: השתלמות, גמל, קרנות ו-PFIC", 0),
# ---------- travel ----------
"israeli-abroad-trip-planner": ("תכנון טיול לחו״ל לישראלים: מסלול, מלונות, ויזות לדרכון ישראלי ואזהרות מסע", 0),
"israeli-flight-compensation": ("פיצוי על טיסה לפי חוק שירותי תעופה (חוק טיבי) ומכתב דרישה בעברית", 0),
"israeli-flight-finder": ("השוואת מחירי טיסות מנתב״ג: לינקים מוכנים לגוגל טיסות, סקייסקאנר וקאיאק", 0),
"israeli-travel-planner": ("טיול בארץ: תחבורה, לינה, שמורות טבע ורב-קו", 0),
}

missing = [m['name'] for m in meta if m['name'] not in D]
extra = [k for k in D if k not in {m['name'] for m in meta}]
if missing:
    print('⚠ סקילז חדשים בלי תמצית ידנית (קיבלו תמצית אוטומטית):', ', '.join(missing), file=sys.stderr)
if extra:
    print('ℹ תמציות במילון לסקילז שכבר לא בארגון (מדולגות):', ', '.join(extra), file=sys.stderr)

def trim(s, n=300):
    s = re.sub(r'\s+', ' ', s or '').strip()
    return s if len(s) <= n else s[:n].rsplit(' ', 1)[0] + '…'

rows = []
for m in sorted(meta, key=lambda x: (x['repo'], x['name'])):
    short, star = D.get(m['name'], (trim(m['desc_he'], 110), 0))
    rows.append([m['name'], m['repo'], short, star, m['he'], trim(m['desc_he'])])

# חבילות (bundles) — קבוצות סקילז מוכנות מהארגון
known = {m['name'] for m in meta}
bundles = []
for p in sorted(glob.glob(os.path.join(BASE, BUNDLE_REPO, '*', 'bundle.json'))):
    b = json.load(open(p, encoding='utf-8'))
    slug = os.path.basename(os.path.dirname(p))
    # רק סקילז שקיימים בקטלוג (חלק מהחבילות מפנות לכלים חיצוניים כמו postiz)
    bundles.append([slug, b.get('name_he') or b.get('name_en') or slug, b.get('icon', '📦'),
                    [s['slug'] for s in b.get('skills', []) if s['slug'] in known], b.get('description_he', '')])

def js(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))

out = []
out.append('// קטלוג סקילז מארגון skills-il (https://github.com/skills-il · agentskills.co.il)')
out.append('// נוצר אוטומטית ע"י scripts/skills-il-sync.py מקובצי SKILL.md + metadata.json של כל ריפו בארגון. התמצית הקצרה נכתבה ידנית (בסקריפט).')
out.append('// מבנה פריט: [שם, ריפו(קטגוריה), תמצית קצרה, ⭐רלוונטי-לי, שם-תצוגה בעברית, תיאור מלא בעברית]')
out.append('// נתיב גישה לכל סקיל: github.com/skills-il/<ריפו>/tree/main/<שם>  (SKILL.md בתוך התיקייה)')
out.append('window.SK_IL_CATS=' + js(CATS) + ';')
out.append('window.SKILLS_IL_DATA=[')
for r in rows:
    out.append(js(r) + ',')
out.append('];')
out.append('// חבילות מוכנות: [מזהה, שם, אימוג׳י, [סקילז], תיאור]')
out.append('window.SK_IL_BUNDLES=[')
for b in bundles:
    out.append(js(b) + ',')
out.append('];')
open(OUT, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('skills', len(rows), 'stars', sum(r[3] for r in rows), 'bundles', len(bundles), '→', os.path.relpath(OUT, ROOT))
