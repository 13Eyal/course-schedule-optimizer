# CarpedIO — מפת עיצוב ו־Cheat Sheet

עודכן: 27.10.2026 · מערכת השעות + מחשבון הציונים.

**איך להשתמש:** מצא בטבלאות את האזור שתרצה לשנות, פתח את הקובץ המקושר וחפש את שם המחלקה או הפונקציה בעזרת `Ctrl+F`. הקישורים פותחים את הקבצים המקומיים; מספרי השורות הם נקודת פתיחה ועשויים לזוז לאחר עריכה.

## הכי מהר: מה אני רוצה לשנות?

| השינוי | איפה מתחילים | מה מחפשים |
|---|---|---|
| צבע המותג, טקסטים וכפתורים | [base.css — פלטות][palette] | `--accent`, `--ink`, `--muted`, `--button` |
| שקיפות, טשטוש, צללים ופינות | [cobalt.css][cobalt] | `--cobalt-glass`, `backdrop-filter`, `--shadow`, `--radius` |
| תמונת הים | [cobalt.css — הרקע][background] | `body::before` ו־`url(...)` |
| הלוגו והשם CarpedIO | [brand.css][brand] + [סמל SVG][symbol] | `.carpedio-symbol`, `.carpedio-wordmark` |
| טקסט או סדר אזורים במערכת השעות | [index.html][index] | הטקסט עצמו או ה־`id` של האזור |
| פריסה ורוחב אזורים במערכת השעות | [layout.css][layout] | `.hero`, `.workspace`, `.sidebar`, `.results` |
| לוח שעות, מפגשים וחלופות | [base.css — הלוח][calendar-css] + [planner.css][planner-css] | `.calendar`, `.session`, `.alternative`, `.agenda-session` |
| עיצוב מחשבון הציונים | [grades.css][grades-css] | מחלקות שמתחילות ב־`.grade-` |
| טקסט או סדר אזורים במחשבון | [grades.html][grades-html] | הטקסט עצמו או ה־`id` של האזור |
| התאמה לנייד | סוף קובץ ה־CSS הרלוונטי | `@media` — יש פירוט בהמשך |

## לפני שמשנים: איזו שכבה קובעת?

שני המסכים חולקים צבעים, רקע ומיתוג, אך אינם טוענים את אותם קובצי העיצוב.

**מערכת השעות — סדר הטעינה:**

```text
base.css → layout.css → planner.css → cobalt.css → brand.css
```

**מחשבון ציונים — סדר הטעינה:**

```text
base.css → cobalt.css → grades.css → brand.css
```

| קובץ | האחריות שלו | היקף ההשפעה |
|---|---|---|
| [base.css][base] | פלטות בהיר/כהה, כפתורים, שדות, רכיבים בסיסיים; גם רוב עיצוב הלוח והחלופות | נטען בשני המסכים; כל כלל משפיע רק על רכיבים שתואמים לו |
| [layout.css][layout] | פריסת מערכת השעות, תפריט, איור הפתיחה ומחוון הטעינה | מערכת שעות |
| [planner.css][planner-css] | חיפוש קורסים, שורת הפעולות, סדר יום, טופס קורס ידני ואילוצים | מערכת שעות |
| [cobalt.css][cobalt] | תמונת הים, שכבות הזכוכית, פינות, טשטוש וצללים | משותף; חלק מהכללים מיועדים לרכיבי מערכת השעות |
| [grades.css][grades-css] | פריסה, כרטיסים, טבלאות, גרף וחלוניות של מחשבון הציונים | מחשבון ציונים |
| [brand.css][brand] | המידות והגופנים העדכניים של הלוגו, השם והסמל באיור | שני המסכים |

**קובץ מאוחר יותר אינו תמיד מנצח:** עבור אותה תכונה, גם מידת הפירוט של הבורר קובעת. למשל, `html[data-design="cobalt"] .hero-copy` מפורט יותר מ־`.hero-copy`. כאשר העדיפות זהה, הכלל המאוחר מנצח. גם `style` שנכתב ישירות על רכיב עשוי לקבוע את הערך.

דוגמאות מהפרויקט: `--radius` מתחיל ב־`base.css` אבל הערך הפעיל מגיע מ־`cobalt.css`; מידות הלוגו מופיעות גם ב־`planner.css`, אך את המיתוג הנוכחי עורכים ב־`brand.css`. עדיף לערוך את הכלל הקיים ששולט בתוצאה, ולא לצבור כפילויות ו־`!important`.

## מערכת השעות — מלמעלה למטה

המבנה והטקסטים הקבועים נמצאים ב־[index.html][index]. בעמודה האחרונה מופיע גם מקור הרכיבים שנבנים בזמן הריצה.

| האזור במסך | מחלקה / מזהה לחיפוש | איפה מעצבים / משנים תוכן |
|---|---|---|
| סרגל עליון, תפריט וכפתורי תצוגה | `.site-header`, `.header-nav`, `.header-actions`, `.menu-toggle` | פריסה ותפריט: [layout.css][layout]; זכוכית ומרווח חיצוני: [cobalt.css][cobalt]; כפתור התפריט נוצר ב־[shell.js][shell] |
| שם וסמל המוצר | `.brand`, `.brand-copy`, `.carpedio-wordmark`, `.carpedio-symbol` | [brand.css][brand]; הטקסט והקישור ב־HTML |
| פס ״מערכת שעות אישית״ | `.hero-topline`, `.eyebrow`, `.edition` | [base.css][base] + [layout.css][layout]; משטח זכוכית ב־[cobalt.css][cobalt] |
| הכותרת ״כל האפשרויות. תמונה ברורה.״ | `.hero`, `.hero-copy`, `#page-title`, `.title-accent` | התוכן ב־[index.html — פתיחה][hero-html]; פריסה וגודל כותרת ב־[layout.css][layout]; ריווח פנימי ומובייל ב־[cobalt.css][cobalt] |
| הכפתורים שמתחת לכותרת | `.hero-actions`, `.hero-cta`, `.hero-secondary`, `.circle-arrow` | [base.css][base] + [layout.css][layout]; צבע ומשטח ב־[cobalt.css][cobalt] |
| איור ה־C עם I/O | `.hero-artwork`, `.material-plane`, `.parallax-orb`, `.orb-paper` | מבנה השכבות: [layout.css][layout]; זכוכית: [cobalt.css][cobalt]; צורת הכרטיס ומידות הסמל: [brand.css][brand] |
| תצוגת השבוע הקטנה באיור, אחרי חישוב | `.hero-week-preview`, `.hero-week-days` | [planner.css][planner-css]; יצירה ועדכון ב־[planner.js][planner-js] |
| שלוש אפשרויות ״הקצב שלך״ | `#rhythms`, `.rhythm-grid`, `.rhythm-card`, `.rhythm-title` | [base.css][base]; צבעי הכרטיסים בפלטה `--card-one/two/three`; זכוכית ב־[cobalt.css][cobalt]. ערכי ההעדפות עצמם: `PRESETS` ב־[app.js][app] |
| כותרת התכנון ושלושת השלבים | `.workspace-heading`, `.planner-steps` | [base.css][base] + [cobalt.css][cobalt]; חלק מהניסוחים מוחלפים ב־[planner.js][planner-copy] |
| שורת ״עדכון המערכת״ הצפה | `.planner-actionbar`, `.planner-actioncopy` | [planner.css][planner-css] + [cobalt.css][cobalt]; נבנית ב־[planner.js][planner-js] |
| חלוקת צד הגדרות / צד תוצאות | `.workspace`, `.sidebar`, `.results` | [layout.css][layout] קובע את עמודות הקובלט; מרווחים בסיסיים ב־[base.css][base] |
| העלאת קובץ ורשימת הקורסים | `#course-panel`, `.upload-zone`, `.course-row`, `.course-name`, `.course-meta` | [base.css][base] + [cobalt.css][cobalt]; שורות הקורסים נוצרות ב־`renderCourses()` ב־[app.js][app] |
| חיפוש בתוך הקורסים | `.course-search`, `.course-search-status` | [planner.css][planner-css]; המבנה והניסוחים ב־[planner.js][planner-js] |
| ״מה חשוב לך?״ והסליידרים | `#preferences-form`, `.weight-control`, `.weight-label`, `input[type="range"]` | [base.css][base]; שמות חמש ההעדפות ב־`WEIGHTS` שב־[api.js][api] |
| יעדים, זמנים חסומים וקשרי רישום | `#search-controls`, `.search-settings`, `.search-fields`, `.blocked-row`, `.course-rules`, `.attendance-rule` | [planner.css — אילוצים][search-css]; בניית הרכיבים והטקסטים ב־[search-controls.js][search-js] |
| הודעות, שינויים שלא חושבו ומצב החיפוש | `.notice`, `.stale-results`, `.result-status`, `.results-topline` | [base.css][base], [planner.css][planner-css], [cobalt.css][cobalt]; טקסטים ב־`notify()`, `searchStatus()` וב־`planner.js` |
| שלושת מדדי התוצאה | `.metrics`, `.metric`, `.metric strong` | [base.css][base]; הכרטיס המודגש ב־[cobalt.css][cobalt]; התאמה למסך צר מאוד בסוף [planner.css][planner-css] |
| לוח השבוע, ימים, שעות ומפגשים | `#calendar`, `.calendar-head`, `.day-head`, `.hour-label`, `.day-column`, `.session` | [base.css — לוח][calendar-css]; משטחי המפגשים ב־[cobalt.css][cobalt]; יצירת הלוח ומיקומי המפגשים ב־[app.js — renderCalendar][calendar-js] |
| תצוגת ״סדר יום״ ומסנן ימים | `.calendar-viewbar`, `.view-switch`, `.calendar-agenda`, `.agenda-filters`, `.agenda-session` | [planner.css][planner-css] + [cobalt.css][cobalt]; יצירה ב־`renderAgenda()` שב־[planner.js][planner-js] |
| חלופות המערכת והתרשים הקטן בכל חלופה | `.alternatives`, `.alternative`, `.alternative-week` | [base.css][base] + [cobalt.css][cobalt]; התוכן ב־`renderAlternatives()` ב־[app.js][app] |
| ״איך זה עובד״ | `#approach`, `.approach-section`, `.approach-item` | [index.html — הסבר][approach-html]; [base.css][base] + [cobalt.css][cobalt] |
| תחתית העמוד והשם הגדול | `.site-footer`, `.footer-top`, `.footer-wordmark`, `.footer-bottom` | [index.html — תחתית][footer-html]; משטח ופריסה ב־[base.css][base] וב־[cobalt.css][cobalt]; השם הגדול ב־[brand.css][brand] |
| חלונית הוספת קורס ידנית | `#manual-course-dialog`, `.manual-fields`, `.manual-group`, `.manual-meeting` | מעטפת ב־[index.html — טופס קורס][manual-html]; [planner.css — טופס קורס][manual-css]; קבוצות ומפגשים נוצרים ב־[manual-course.js][manual-js] |
| חלונית פרטי מפגש / עזרה | `#detail-dialog`, `#dialog-content`, `dialog dl`, `dialog dt`, `dialog dd` | מעטפת ב־[index.html][index]; [base.css][base] + [cobalt.css][cobalt]; התוכן ב־`dialog()` ו־`showSession()` שב־[app.js][app] |
| הוראות שמופיעות בפתיחת HTML ישירות | `.local-launch` | [index.html][index] + [cobalt.css][cobalt]; מידות הסמל ב־[brand.css][brand] |

## מחשבון הציונים — מלמעלה למטה

המבנה נמצא ב־[grades.html][grades-html]. העיצוב הייעודי מרוכז ב־[grades.css][grades-css], עם צבעים ורקע מהקבצים המשותפים.

| האזור במסך | מחלקה / מזהה לחיפוש | מה משנים |
|---|---|---|
| רוחב העמוד ומרווחי הצד | `.grades-page main`, `.grade-header` | `width:min(1400px,92%)`, `margin-inline` |
| כותרת עליונה וקישורי מעבר | `.grade-header`, `.grade-header nav`, `[aria-current=page]` | ריווח, פריסה וסימון הדף הפעיל; המיתוג עצמו ב־[brand.css][brand] |
| ״הציונים שלך. היעד הבא שלך.״ | `.grade-intro`, `.grade-kicker`, `.grades-page h1` | גודל כותרת, צבע השורה השנייה, ריווח וטקסט ב־HTML |
| הוספה ידנית, ייבוא וייצוא | `.grade-toolbar`, `.grade-upload` | סידור הכפתורים, ריווח ורוחב בנייד |
| ממוצע נוכחי / נק״ז / ממוצע עתידי | `.grade-stats`, `.grade-stat`, `.grade-stat-projected` | מספר עמודות, גודל המספרים והכרטיס המודגש |
| חלוקת ״הציונים שלי״ ותרחישים | `.grade-layout`, `.grade-ledger`, `.grade-scenarios` | יחס העמודות, מרווחים וסדר הרכיבים ב־HTML |
| כל כרטיסי המחשבון | `.grade-panel`, `.grade-panel-heading` | ריפוד, כותרת, מסגרת ורקע |
| טבלאות הציונים והקורסים העתידיים | `.grade-table`, `.grade-table-scroll`, `.grade-numeric`, `.grade-excluded` | ריווח שורות, טקסט מספרי, קורס שלא נכלל וגלילה; השורות נבנות ב־`renderRows()` ב־[grades.js][grades-js] |
| הסבר הנוסחה ומצב ללא נתונים | `.grade-formula`, `.grade-empty`, `.grade-muted` | טקסט, צבע וריווח |
| ממוצע יעד ותוצאת החישוב | `.grade-target-label`, `.grade-target-result`, `.is-impossible` | גודל שדה היעד, ניסוח ותוצאה בלתי אפשרית; הניסוח הדינמי ב־`requirementText()` וב־`renderAnalytics()` ב־[grades.js][grades-js] |
| סליידר השפעת קורס וגרף | `#scenario-grade`, `#impact-chart`, `.grade-chart-line`, `.grade-chart-target`, `.grade-chart-point`, `.grade-chart-text` | ב־CSS: צבע, עובי קו וטקסט. בניית SVG, צירים ומיקומים: [grades.js — drawChart][chart-js] |
| שיפור ציון קיים | `.grade-analysis-grid`, `.grade-two-fields`, `#retake-controls` | חלוקת עמודות, שדות וכרטיס; ניסוח התוצאה ב־`renderRetake()` ב־[grades.js][grades-js] |
| חלונית הוספת / עריכת ציון | `#grade-editor`, `#grade-record-form`, `.grade-check` | שדות ותוכן ב־HTML; גודל החלונית והפריסה ב־CSS; כותרות לפי סוג הרשומה ב־`openEditor()` |
| חלונית מיפוי Excel ותצוגה מקדימה | `#grade-import-dialog`, `.grade-import-options`, `.grade-preview`, `.invalid-row` | רוחב, פריסת אפשרויות, גובה הגלילה והדגשת שגיאות; תוכן ב־`changeHeader()` וב־`renderPreview()` |
| הודעות, שגיאות וביטול שינוי | `.grade-notice`, `.grade-error`, `.grade-undo` | צבעים, מיקום וריווח |
| שורת תחתית | `.grade-footer` | הטקסט ב־HTML; גודל, יישור וריווח ב־CSS |

## צבעים, גופנים ונכסים

| מה | הגדרה מדויקת |
|---|---|
| בהיר / כהה | שני בלוקים בתחילת [base.css][palette]: `:root,[data-theme="light"]` ו־`[data-theme="dark"]`. יש גם שני בלוקים לזכוכית ב־[cobalt.css][cobalt] |
| צבעים עיקריים | `--accent` למבטא; `--accent-soft` למשטח מודגש; `--ink` לטקסט ראשי; `--muted` למשני; `--button`, `--button-hover`, `--on-accent` לכפתורים |
| צבעי הקורסים | `--event-0` עד `--event-4`, יחד עם `--event-ink-N` ו־`--event-edge-N` ב־`base.css`. ההצמדה לקורס מתבצעת ב־`colorize()` ב־`app.js` ובתצוגת סדר היום ב־`planner.js` |
| שלוש אפשרויות הקצב | `--card-one`, `--card-two`, `--card-three`, `--card-ink` ב־`base.css` |
| גבולות, צללים ופוקוס | `--line`, `--shadow`, `--float-shadow`, `--focus` — הערכים הפעילים משותפים ב־`cobalt.css` |
| שקיפות הכרטיסים | `--cobalt-glass`, `--cobalt-glass-strong`, `--cobalt-soft-glass`, `--cobalt-blue-glass`, `--glass` ב־`cobalt.css`; האלפא ב־`rgba` היא השקיפות: `1` אטום |
| כהות / בהירות התמונה מאחור | `--cobalt-background-wash` ב־`cobalt.css`; צבע שכבה מעל תמונת הים |
| פינות מעוגלות | `--radius` ב־`cobalt.css`: כרגע `24px`, בנייד `20px`. רכיבים עם `border-radius` משלהם, כגון כפתורים ומפגשים, דורשים שינוי נקודתי |
| גופן מערכת השעות | `html[data-design="cobalt"] body` ב־[layout.css][layout] קובע Helvetica/Arial. יש רכיבים עם `font` / `font-family` מפורשים ב־`base.css` וב־`planner.css` |
| גופן מחשבון הציונים | `.grades-page` בתחילת `grades.css` — Heebo. בשינוי גופן צריך לשנות גם את טעינתו ב־`<head>` אם הוא גופן רשת |
| גופן המותג | `.carpedio-wordmark` וכללי השם הנלווים ב־[brand.css][brand] — Heebo; `direction:ltr` שומר על סדר האותיות |
| סמל המותג | [carpedio-symbol.svg][symbol]. בממשק הוא מוצג כמסכה, לכן הצבע מגיע מ־`currentColor` ב־CSS; שינוי צבע בתוך SVG בלבד לא משנה את צבע המסכה |
| סמל לשונית הדפדפן | [favicon.svg][favicon] — קובץ נפרד, מקושר ב־`<head>` של שני הדפים |
| תמונת רקע | [תמונת הים][sea], מקושרת מתוך `body::before` ב־`cobalt.css` |

## דוגמאות עריכה קטנות

**להקטין את הכותרת הראשית במערכת השעות:** ערוך את `font-size` בכלל `html[data-design] h1` ב־[layout.css][layout]. לדוגמה:

```css
font-size: clamp(52px, 5.8vw, 90px);
```

`clamp` הוא מינימום, ערך גמיש לפי רוחב המסך, ומקסימום. יש כללים נוספים לכותרת בתוך `@media`, כולל כלל נייד ב־`cobalt.css`; ערוך גם אותם אם השינוי מיועד לנייד.

**להפוך את כרטיסי מערכת השעות לאטומים יותר במצב בהיר:** בתוך הבלוק הראשון של [cobalt.css][cobalt], שנה למשל:

```css
--cobalt-glass: rgba(255, 255, 255, .88);
```

כרטיסי מחשבון הציונים משתמשים בעיקר ב־`--cobalt-glass-strong`, ולכן עבורם שנה את המשתנה הזה. אל תשתמש ב־`opacity` על כל הכרטיס, כי הוא יחליש גם את הטקסט.

**להגדיל את הרווח בין כרטיסי המחשבון:** ב־[grades.css][grades-css], שנה `gap` ב־`.grade-layout`, ב־`.grade-scenarios` וב־`.grade-analysis-grid`. למשל `gap: 32px;`. אלו שלושה אזורים נפרדים.

## נייד ותנועה

| תחום | איפה לחפש |
|---|---|
| פריסת מערכת השעות | `@media` ב־`base.css` וב־`layout.css`; נקודות מרכזיות: `1000px` למעבר סביבת התכנון לעמודה אחת, `680px` לפתיחה בנייד, `560px` לכרטיסים ולרכיבים הקטנים |
| זכוכית וריווח בנייד | `@media (max-width: 680px)` בסוף `cobalt.css` |
| סדר יום, סרגל פעולות וטופס קורס | `@media` ב־`planner.css`; לטופס `560px`, למדדים במסך צר מאוד `380px` |
| לוגו ושם בנייד | `@media(max-width:680px)` ב־`brand.css` |
| מחשבון ציונים | בסוף `grades.css`: ב־`1000px` התוכן עובר לעמודה אחת; ב־`600px` משתנים התפריט, הכפתורים, המדדים והטפסים |
| בחירת סדר יום כברירת מחדל בנייד | `phone=matchMedia('(max-width: 680px)')` ב־`planner.js`; זו התנהגות JavaScript, והעדפת תצוגה שכבר נשמרה מקבלת קדימות |
| כניסות בגלילה והעדפת תנועה | [motion.js][motion]; מחלקות `.reveal` וכללי תנועה ב־`base.css` |
| תפריט, איור זז ומחוון טעינה | [shell.js][shell] + `layout.css`; חפש `.heart-loader`, `@keyframes heart-build`, `--mx`, `--my` |
| קונפטי | [effects.js][effects]; המיקום החזותי `.celebration-canvas` ב־`layout.css` |

בשינוי תנועה שמור על `prefers-reduced-motion` ועל `[data-motion="off"]`. בממשק RTL העדף `margin-inline`, `padding-inline` ו־`inset-inline-start` לריווח תלוי כיוון.

## כששינוי לא מופיע

1. **ודא שאתה עורך את הקובץ שנטען בדף הנכון.** למשל, `planner.css` אינו נטען במחשבון הציונים.
2. **חפש את אותו בורר בכל `web/styles`.** ייתכן שיש כלל מפורט יותר, כלל מאוחר או כלל בתוך `@media` שדורס את השינוי.
3. **אם שינית טקסט והוא חזר:** בדוק [planner.js — החלפת ניסוחים][planner-copy]. למשל תיאור מרחב התכנון והכיתוב בתחתית אזור הפתיחה מוחלפים לאחר טעינת ה־HTML. רשימות, תוצאות וגרפים נבנים בקובצי ה־JavaScript שבטבלאות.
4. **בדוק מאפיין שנכתב ישירות על הרכיב.** מיקום וגובה מפגשים נקבעים ב־`renderCalendar()`. לשינוי קנה המידה של הזמן צריך לתאם את `pixelsPerMinute`, את `--hour-height` ואת מיקום תוויות השעה; שינוי משתנה יחיד אינו מספיק. בגרף הציונים יש לתאם בין ה־`viewBox` והקואורדינטות ב־`drawChart()` לבין היחס ב־CSS.
5. **פתח כלי פיתוח בדפדפן (`F12` → בחירת רכיב → Styles / Computed).** הכלי מציג את הקובץ והשורה של הערך הפעיל; כלל מחוק בקו נדרס על ידי כלל אחר. עריכה שם היא ניסוי זמני — כדי לשמור, העתק את השינוי לקובץ המקור.
6. **רענן דרך השרת.** הפעל `start.bat`, שמור את הקובץ ורענן; לשינוי HTML/CSS/JS אין שלב build ואין צורך להפעיל מחדש את Python. בעת הצורך בצע רענון מלא עם `Ctrl+Shift+R`. בדוק בהיר, כהה, מחשב ונייד.

אם אתה מוסיף קובץ CSS/JS/תמונה בשם חדש, הוסף גם את הקישור אליו וגם רשומה מתאימה ב־[STATIC_FILES שבשרת][static-files], ואז הפעל מחדש את השרת. החלפת תוכן בקובץ שכבר מוגש אינה דורשת רשומה חדשה. שינוי עיצוב רגיל אינו דורש עריכה במנוע שב־`src/` או בנוסחאות שב־`grade-math.js`.

[base]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/base.css
[palette]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/base.css:2
[layout]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/layout.css
[planner-css]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/planner.css
[cobalt]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/cobalt.css
[background]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/cobalt.css:39
[brand]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/brand.css
[grades-css]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/grades.css
[index]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/index.html
[hero-html]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/index.html:95
[approach-html]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/index.html:344
[footer-html]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/index.html:352
[manual-html]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/index.html:359
[manual-css]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/planner.css:117
[search-css]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/planner.css:160
[calendar-css]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/styles/base.css:132
[calendar-js]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/app.js:486
[grades-html]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/grades.html
[app]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/app.js
[api]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/api.js:2
[planner-js]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/planner.js
[planner-copy]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/planner.js:30
[manual-js]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/manual-course.js:79
[search-js]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/search-controls.js:34
[grades-js]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/grades.js
[chart-js]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/grades.js:139
[shell]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/shell.js
[motion]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/motion.js
[effects]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web/scripts/effects.js
[symbol]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/assets/brand/carpedio-symbol.svg
[favicon]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/assets/brand/favicon.svg
[sea]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/assets/design/sand-sea-watercolor-texture-background.jpg
[static-files]: C:/Users/Admin/PythonPractice/course-schedule-optimizer/web_server.py:43
