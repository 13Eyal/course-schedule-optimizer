/* Hebrew ⇄ English switch for both pages.
   The pages and scripts stay written in Hebrew. In English mode this layer translates every
   visible string and accessible label in place, including text the app writes later, and keeps
   each Hebrew original so switching back restores it exactly. Unknown text is left as it is. */
(() => {
  const KEY = 'carpedio-lang';
  const HEB = /[֐-׿]/;
  const ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
  const SKIP = 'script, style, bdi, [data-no-i18n], .carpedio-wordmark';

  const DICT = {
    // Page titles and shell
    'CarpedIO — מערכת שעות בדרך שלך': 'CarpedIO — your timetable, your way',
    'CarpedIO — מחשבון ממוצע ציונים': 'CarpedIO — grade average calculator',
    'מערכת שעות שמתאימה לקצב שלך. בחירת קורסים, התאמה אישית והשוואת חלופות.': 'A timetable that fits your pace. Pick courses, set what matters and compare options.',
    'CarpedIO — עמוד הבית': 'CarpedIO — home',
    'ניווט ראשי': 'Main navigation',
    'דילוג לתכנון המערכת': 'Skip to the planner',
    'דילוג למחשבון': 'Skip to the calculator',
    'מערכת שעות בדרך שלך': 'Your timetable, your way',
    'תכנון הלימודים שלך': 'Plan your studies',
    'מערכת שעות': 'Timetable',
    'מחשבון ציונים': 'Grade calculator',
    'איך זה עובד': 'How it works',
    'הפעלת מצב כהה': 'Turn on dark mode',
    'הפעלת מצב בהיר': 'Turn on light mode',
    'מעבר למצב כהה': 'Switch to dark mode',
    'מעבר למצב בהיר': 'Switch to light mode',
    'פתיחת תפריט': 'Open menu',
    'סגירת תפריט': 'Close menu',
    'יש להפעיל JavaScript בדפדפן כדי להשתמש במערכת.': 'Turn on JavaScript in your browser to use the planner.',
    'יש להפעיל JavaScript כדי להשתמש במחשבון.': 'Turn on JavaScript to use the calculator.',
    // Launch notice
    'עוד רגע, מתחילים לתכנן.': 'One moment, and you can start planning.',
    'כדי לטעון את הקורסים ולחשב מערכות שעות, צריך לפתוח את האתר דרך קובץ ההפעלה.': 'To load courses and calculate timetables, open the site with the launcher file.',
    'חזור לתיקיית הפרויקט': 'Go back to the project folder',
    'לחץ פעמיים על': 'Double-click',
    'האתר ייפתח אוטומטית בדפדפן. אין צורך לפתוח את קובץ ה־HTML בנפרד.': 'The site opens in your browser by itself. There is no need to open the HTML file.',
    // Intro
    'מערכת השעות שלך,': 'Your timetable,',
    'בלי התנגשויות.': 'without clashes.',
    'בוחרים קורסים ומגדירים מה חשוב לכם. CarpedIO עובר על כל שילובי הקבוצות ומציג את השבועות שמתאימים לכם, מראשון עד חמישי.': 'Pick your courses and say what matters to you. CarpedIO goes through every combination of groups and shows the weeks that suit you, Sunday to Thursday.',
    'איך מתכננים': 'How planning works',
    'שלב 1': 'Step 1', 'שלב 2': 'Step 2', 'שלב 3': 'Step 3',
    'בוחרים קורסים': 'Pick courses',
    'מקובץ Excel, מקובץ הדוגמה או בהוספה ידנית': 'From an Excel file, the sample file or by hand',
    'מגדירים מה חשוב': 'Say what matters',
    'קצב השבוע, שעת התחלה ומשקלים': 'Weekly pace, start time and weights',
    'משווים ומייצאים': 'Compare and export',
    'לוח שבועי, חלופות וקובץ CSV': 'Weekly board, options and a CSV file',
    // Planner
    'מרחב התכנון': 'Planner',
    'שלבי התכנון': 'Planning steps',
    'הקורסים שלך': 'Your courses',
    'ההעדפות שלך': 'Your preferences',
    'השבוע שלך': 'Your week',
    'הגדרות מערכת השעות': 'Timetable settings',
    'טוענים את קובץ הדוגמה…': 'Loading the sample file…',
    'העלאת קובץ קורסים': 'Upload a course file',
    'Excel · עד 5 MB · אפשר גם לגרור לכאן': 'Excel · up to 5 MB · or drag it here',
    'הוספת קורס ידנית': 'Add a course by hand',
    'חיפוש בקורסים': 'Search courses',
    'שם קורס או מספר': 'Course name or number',
    'בחירת הכול': 'Select all',
    'ביטול הבחירה': 'Clear selection',
    'טעינת דוגמה': 'Load sample',
    'קורסים לבחירה': 'Courses to choose from',
    'סך נקודות זכות': 'Total credits',
    'מה צריך להיות בקובץ?': 'What goes in the file?',
    'כל שורה מתארת מפגש בקבוצה. העמודות הנדרשות:': 'Each row describes one session of a group. Required columns:',
    'סוג: lecture / tutorial / lab. יום: Sunday–Thursday או ראשון–חמישי. שעות: HH:MM. חובה: yes / no. עדיפות: low / medium / high.': 'Type: lecture / tutorial / lab. Day: Sunday–Thursday. Times: HH:MM. Mandatory: yes / no. Priority: low / medium / high.',
    'הורדת קובץ לדוגמה ↙': 'Download the sample file ↓',
    'מה חשוב לך?': 'What matters to you?',
    'איפוס': 'Reset',
    'כוונון קטן. שבוע שמתאים יותר.': 'A small tweak. A week that fits better.',
    'קצב השבוע': 'Weekly pace',
    'פחות נסיעות': 'Fewer trips',
    'פחות ימים בקמפוס': 'Fewer days on campus',
    'בוקר רגוע': 'Easy mornings',
    'מתחילים מאוחר': 'Start later',
    'רצף': 'In the flow',
    'כמעט בלי חלונות': 'Almost no gaps',
    'בוקר בקצב שלך': 'Easy mornings',
    'נכנסים לרצף': 'In the flow',
    'מתחילים את היום מ־': 'Start the day at',
    'פחות ימי לימוד': 'Fewer study days',
    'פחות חלונות': 'Fewer gaps',
    'התחלה מאוחרת': 'Later start',
    'עדיפות לקבוצות': 'Group priority',
    'ימים קצרים יותר': 'Shorter days',
    'פחות חשוב': 'Less important',
    'חשוב מאוד': 'Very important',
    'מציאת המערכת שלי': 'Find my timetable',
    'ביטול החיפוש': 'Cancel search',
    'חיפוש נוסף עם יותר זמן': 'Search again with more time',
    'הקובץ מעובד בשרת המקומי ואינו נשמר בדיסק.': 'The file is processed on the local server and never saved to disk.',
    'ההעדפות אופסו. אפשר לחשב את המערכת מחדש.': 'Preferences reset. You can calculate the timetable again.',
    // The registration-links question
    'שאלה אחת לפני החישוב': 'One question before we calculate',
    'כן, כל שילוב מותר. לחשב': 'Yes, any combination works. Calculate',
    'לא, אגדיר שילובים בעצמי': 'No, I will set the combinations',
    // Calculate bar and status
    'מצב התכנון': 'Planning status',
    'חישוב המערכת': 'Calculate timetable',
    'חישוב מחדש': 'Calculate again',
    'מחשבים…': 'Calculating…',
    'מחשבים את האפשרויות…': 'Working through the options…',
    'הבחירה השתנתה. חשבו מחדש כדי לעדכן את הלוח': 'Your choices changed. Calculate again to update the board',
    'המערכת שלך מוכנה. אפשר להשוות חלופות': 'Your timetable is ready. You can compare options',
    'הכול מוכן לחישוב': 'Ready to calculate',
    'בחרו לפחות קורס אחד': 'Pick at least one course',
    'מה חשוב לך': 'What matters to you',
    'עוד לא נבחרו': 'None picked yet',
    'העדפות אישיות': 'Your own settings',
    'נדרש חישוב מחדש': 'Needs a new calculation',
    'אחרי החישוב': 'After calculating',
    'עוד אין מערכת להצגה': 'No timetable to show yet',
    'בשלב הבא: מה חשוב לך': 'Next: what matters to you',
    'המשך': 'Continue',
    'חזרה': 'Back',
    'הבחירה שלך עודכנה': 'Your selection changed',
    'הלוח מציג את החישוב הקודם. חשבו מחדש כדי לעדכן אותו.': 'The board shows the previous calculation. Calculate again to update it.',
    'ממתינים לנתונים': 'Waiting for data',
    'מוכנים לתכנון': 'Ready to plan',
    'המערכת מוכנה': 'Timetable ready',
    'יש לטעון קורסים': 'Load courses first',
    'נדרש חישוב מחדש': 'Needs a new calculation',
    'מוסיפים קורס…': 'Adding the course…',
    'מוסיפים את הקורס…': 'Adding the course…',
    'טוענים קורסים…': 'Loading courses…',
    'טוענים את שעות הלימוד…': 'Loading the class hours…',
    'קורסים בהזנה ידנית': 'Courses entered by hand',
    'כולל קורסים ידניים': 'includes courses added by hand',
    'נתוני דוגמה · courses_sample.xlsx': 'Sample data · courses_sample.xlsx',
    'נתוני דוגמה': 'Sample data',
    'לא נטען קובץ. אפשר לנסות שוב.': 'No file loaded. You can try again.',
    'יש לבחור קובץ Excel תקין מסוג xlsx, בגודל של עד 5 MB.': 'Choose a valid .xlsx Excel file of up to 5 MB.',
    'לפחות העדפה אחת צריכה לקבל משקל גדול מאפס.': 'At least one preference needs a weight above zero.',
    'קובץ המערכת הוכן להורדה.': 'The timetable file is ready to download.',
    // Results
    'תוצאות האופטימיזציה': 'Optimisation results',
    'התאמה להעדפות': 'Match to your preferences',
    'לפי היעדים והמשקלים שבחרת': 'By the targets and weights you chose',
    'ימי לימוד': 'Study days',
    'מתוך 5 ימים בשבוע': 'out of 5 days a week',
    'חלונות במערכת': 'Gaps in the timetable',
    'סך ההמתנה בין מפגשים': 'Total waiting between sessions',
    'מערכת שבועית': 'Weekly timetable',
    'המערכת המומלצת שלך': 'Your recommended timetable',
    'ייצוא CSV': 'Export CSV',
    'תצוגת מערכת': 'Timetable view',
    'לוח שבועי': 'Week board',
    'סדר יום': 'Day by day',
    'לחצו על מפגש כדי לראות את הפרטים': 'Click a session to see its details',
    'לוח שבועי; במסך קטן ניתן לגלול אופקית': 'Weekly board; on small screens it scrolls sideways',
    'לכל חמשת הימים, גללו את הלוח לצדדים ↔': 'For all five days, scroll the board sideways ↔',
    'לוח שבועי אישי': 'Personal weekly board',
    'ראשון — חמישי': 'Sunday — Thursday',
    'מקום לשבוע טוב יותר.': 'Room for a better week.',
    'בחרו קורסים והעדפות כדי למצוא את המערכת שלכם.': 'Pick courses and preferences to find your timetable.',
    'בחרו קורסים והעדפות כדי למצוא את המערכת שלכם': 'Pick courses and preferences to find your timetable',
    'עוד דרכים לסדר את השבוע': 'Other ways to arrange the week',
    'החלופות יופיעו כאן': 'Options will appear here',
    'הצגת חלופות נוספות ↓': 'Show more options ↓',
    'סוג המערכת': 'Timetable type',
    'הגעה בפועל': 'Actual attendance',
    'מערכת לרישום': 'Registration timetable',
    'העדיפות שלך היא נקודת ההתחלה. אפשר לשנות את המשקלים ולגלות אפשרויות נוספות.': 'Your priorities are the starting point. Change the weights to discover more options.',
    'שינוי הקורסים או ההעדפות דורש חישוב חדש. החלופות מדורגות לפי המשקלים שבחרתם.': 'Changing courses or preferences needs a new calculation. Options are ranked by the weights you chose.',
    'הציון מחושב לפי היעדים והמשקלים, והמדדים מתייחסים להגעה בפועל.': 'The score follows your targets and weights; the figures refer to actual attendance.',
    'החלופות המובילות אומתו.': 'The top options were verified.',
    'אלה תוצאות ביניים; ייתכן שקיימות חלופות טובות יותר.': 'These are interim results; better options may exist.',
    'נעשה שימוש בחפיפות רישום עם תוכנית הגעה תקינה. התכנון אינו אישור רישום מהמכללה.': 'Registration overlaps were used with a valid attendance plan. This plan is not a registration approval from your college.',
    'לא קיימת מערכת לפי האילוצים': 'No timetable meets these constraints',
    'טרם נמצאה מערכת': 'No timetable found yet',
    'בדקו את זמני ההגעה וקשרי הרישום. האילוצים לא שונו.': 'Check attendance times and registration links. The constraints were not changed.',
    'החיפוש טרם הוכיח שאין פתרון.': 'The search has not proven that no solution exists.',
    'החיפוש לא הושלם': 'The search did not finish',
    'מוצגת בלוח ✓': 'On the board ✓',
    'ההתאמה המובילה': 'Best match',
    'הצגה בלוח ←': 'Show on board →',
    'זמן לעצמך': 'Time for yourself',
    'יום פנוי': 'Free day',
    'אין מפגשים ביום הזה. מקום לדברים אחרים.': 'No sessions on this day. Room for other things.',
    'יום להצגה': 'Day to show',
    'הכול': 'All',
    'כל הימים': 'All days',
    'מוצגים כל ימי השבוע': 'Showing every day of the week',
    'סיכום המערכת המוצגת': 'Summary of the timetable shown',
    'השבוע שמוצג בלוח': 'The week on the board',
    'החישוב הקודם · ממתין לעדכון': 'Previous calculation · waiting for an update',
    'לימודים בכל חמשת הימים': 'Classes on all five days',
    'ללא ספירה כפולה של מפגשים חופפים': 'overlapping sessions counted once',
    'החיפוש אינו משנה את הבחירה': 'searching does not change your selection',
    'לא נמצאו קורסים. נסו שם או מספר אחר.': 'No courses found. Try another name or number.',
    'החיפוש מתבצע — מוצגות תוצאות ביניים': 'Searching — showing interim results',
    'החיפוש הושלם — אין מערכת לפי האילוצים': 'Search complete — no timetable meets the constraints',
    'החיפוש הושלם — החלופות המובילות אומתו': 'Search complete — the top options were verified',
    'החיפוש בוטל — התוצאות שנמצאו נשמרו': 'Search cancelled — the results found so far were kept',
    'החיפוש הגיע למגבלת הזמן': 'The search reached its time limit',
    'החיפוש הגיע למגבלת העבודה': 'The search reached its work limit',
    'החיפוש הגיע למגבלת הזיכרון': 'The search reached its memory limit',
    // Session details
    'פרטי המפגש': 'Session details',
    'סגירת החלון': 'Close',
    'סגירה': 'Close',
    'סוג': 'Type', 'סוג מפגש': 'Session type', 'קבוצה': 'Group', 'מרצה': 'Lecturer', 'יום': 'Day',
    'התחלה': 'Start', 'סיום': 'End', 'שעות': 'Hours', 'נוכחות': 'Attendance', 'עדיפות': 'Priority',
    'חובה': 'Mandatory', 'רשות': 'Optional', 'כן': 'Yes', 'לא': 'No',
    'נמוכה': 'Low', 'בינונית': 'Medium', 'גבוהה': 'High',
    'הרצאה': 'Lecture', 'תרגול': 'Tutorial', 'מעבדה': 'Lab',
    'ראשון': 'Sunday', 'שני': 'Monday', 'שלישי': 'Tuesday', 'רביעי': 'Wednesday', 'חמישי': 'Thursday',
    'א׳': 'Sun', 'ב׳': 'Mon', 'ג׳': 'Tue', 'ד׳': 'Wed', 'ה׳': 'Thu',
    'מלאה': 'full',
    // Help dialog
    'שבוע טוב מתחיל בבחירה.': 'A good week starts with a choice.',
    'טוענים קובץ Excel ובוחרים את הקורסים שרוצים ללמוד. אפשר להתחיל עם קובץ הדוגמה המצורף.': 'Load an Excel file and pick the courses you want to take. You can start with the sample file.',
    'קובעים שעת התחלה רצויה ואת החשיבות של כל העדפה. אלו העדפות לדירוג, ולא אילוצים מחייבים.': 'Set a preferred start time and how much each preference matters. These rank the options; they are not hard rules.',
    'המנוע בוחר קבוצה אחת לכל רכיב קורס ומדרג את המערכות האפשריות. בוחרים חלופה כדי לראות אותה בלוח.': 'The engine picks one group for each course component and ranks the possible timetables. Choose an option to see it on the board.',
    'מתכננים הגעה לכל המפגשים. חפיפות רישום מותרות רק כשוויתור מפורש או החלפה מאושרת מאפשרים הגעה ללא התנגשויות. לחיצה על מפגש מציגה את פרטיו.': 'Plans assume you attend every session. Registration overlaps are allowed only when an explicit skip or an approved swap leaves attendance without clashes. Click a session for its details.',
    'הקבצים מעובדים בזיכרון השרת המקומי. רענון העמוד מחזיר לנתוני הדוגמה; בחירת ערכת הצבע נשמרת בדפדפן.': 'Files are processed in the local server’s memory. Refreshing the page returns to the sample data; your colour theme is saved in the browser.',
    'מבט מקרוב על התהליך': 'A closer look at the process',
    // How it works
    'מאות שילובים. שבוע אחד.': 'Hundreds of combinations. One week.',
    'בקובץ הדוגמה יש ארבעה קורסים ו־468 דרכים לשבץ את הקבוצות שלהם. המנוע עובר על כולן, מסנן התנגשויות ומדרג את מה שנשאר לפי מה שביקשת.': 'The sample file has four courses and 468 ways to arrange their groups. The engine goes through all of them, removes clashes and ranks what is left by what you asked for.',
    'ריבועים מפוזרים של כל שילובי הקבוצות נאספים לפס צר של שילובים ללא התנגשות, ומשם לשורות מסודרות של שבועות מדורגים': 'Scattered squares for every group combination gather into a narrow band without clashes, then into tidy rows of ranked weeks',
    'כל השילובים.': 'Every combination.',
    'המנוע משלב קבוצות לפי קשרי הרישום והזמנים הפנויים של כל קורס שבחרת.': 'The engine combines groups by the registration links and free times of every course you chose.',
    'בלי התנגשויות': 'Without clashes',
    'כל שילוב שבו שני מפגשים חופפים בתוכנית ההגעה יוצא מהחישוב.': 'Any combination where two sessions overlap in the attendance plan is dropped.',
    'לפי מה שחשוב לך.': 'By what matters to you.',
    'חמישה משקלים מדרגים את מה שנשאר: ימי לימוד, חלונות, שעת התחלה, עדיפות לקבוצות ואורך היום.': 'Five weights rank what is left: study days, gaps, start time, group priority and day length.',
    // Footer
    'carpe diem ו־I/O. מערכת שעות אישית ומחשבון ממוצע, בעברית.': 'carpe diem and I/O. A personal timetable and grade calculator.',
    'פרטיות': 'Privacy',
    'הקבצים מעובדים בשרת המקומי במחשב שלך ואינם נשמרים בדיסק.': 'Files are processed on the local server on your computer and never saved to disk.',
    'קובץ לדוגמה': 'Sample file',
    'הורדת courses_sample.xlsx': 'Download courses_sample.xlsx',
    'כלים': 'Tools',
    'ניווט בתחתית העמוד': 'Footer navigation',
    'חזרה למעלה': 'Back to top',
    // Manual course dialog
    'מוסיפים את פרטי הקורס, את הקבוצות ואת המפגשים של כל קבוצה.': 'Add the course details, its groups and the sessions of each group.',
    'שם הקורס': 'Course name',
    'מספר קורס': 'Course number',
    'נקודות זכות': 'Credits',
    'קבוצות ומפגשים': 'Groups and sessions',
    'הוספת קבוצה': 'Add group',
    'מוסיפים קבוצה נפרדת לכל הרצאה, תרגול או מעבדה שאפשר להירשם אליהם. בתוך הקבוצה מוסיפים את כל מפגשיה השבועיים.': 'Add a separate group for each lecture, tutorial or lab you can register for. Inside each group, add all of its weekly sessions.',
    'לקורס עם כמה סוגי מפגשים, משלימים את השילובים המותרים ב״יעדים, זמינות וקשרי רישום״ לאחר ההוספה.': 'For a course with several kinds of sessions, fill in the allowed combinations under “Targets, availability and registration links” after adding it.',
    'הקורס יצורף לרשימה וייבחר לתכנון. הנתונים זמניים ואינם נשמרים לאחר רענון הדף.': 'The course joins the list and is selected for planning. The data is temporary and is not kept after a page refresh.',
    'הוספת הקורס לרשימה': 'Add the course to the list',
    'מספר הקורס כבר קיים ברשימה. יש להזין מספר קורס אחר.': 'That course number is already on the list. Enter a different one.',
    'יש להזין נקודות זכות כמספר שאינו שלילי.': 'Enter credits as a number that is not negative.',
    'יש להוסיף לפחות קבוצה אחת.': 'Add at least one group.',
    'הסרת קבוצה': 'Remove group',
    'מספר קבוצה': 'Group number',
    'שם מרצה': 'Lecturer name',
    'עדיפות לקבוצה': 'Group priority',
    'הקבוצה מלאה': 'The group is full',
    'שעת התחלה': 'Start time',
    'שעת סיום': 'End time',
    'נוכחות חובה': 'Mandatory attendance',
    'חלק שבועי (אופציונלי)': 'Weekly part (optional)',
    'למשל: חלק א׳': 'For example: part A',
    'הסרת מפגש': 'Remove session',
    'הוספת מפגש לקבוצה': 'Add a session to the group',
    // Search settings
    'יעדים, זמינות וקשרי רישום': 'Targets, availability and registration links',
    'יעד ימי הגעה': 'Target days on campus',
    'יעד חלונות בשבוע (דקות)': 'Target gaps per week (minutes)',
    'יעד אורך יום (דקות)': 'Target day length (minutes)',
    'הפסקה רצויה — לפחות דקות': 'Preferred break — at least (minutes)',
    'הפסקה רצויה — עד דקות': 'Preferred break — at most (minutes)',
    'זמן חיפוש מרבי (שניות)': 'Maximum search time (seconds)',
    'היעדים משפיעים על הדירוג. הזמנים החסומים הם אילוץ מחייב.': 'Targets affect the ranking. Blocked times are a hard rule.',
    'הוספת זמן חסום': 'Add blocked time',
    'יום חסום': 'Blocked day',
    'תחילת זמן חסום': 'Blocked from',
    'סיום זמן חסום': 'Blocked until',
    'לכלול גם קבוצות שסומנו כמלאות': 'Include groups marked as full',
    'לבקש גם חלופות עם חפיפות רישום, בכפוף לוויתורים ולהחלפות שאישרתי': 'Also look for options with registration overlaps, within the skips and swaps I approved',
    'לספור את כל המערכות החוקיות (עשוי להאריך את החיפוש)': 'Count every valid timetable (may make the search longer)',
    'זמנים חסומים': 'Blocked times',
    'קשרים והחלטות הגעה': 'Links and attendance decisions',
    'ברירת המחדל היא הגעה לכל המפגשים. אישור החלפה מצהיר שזה אותו חלק שבועי ושמותר להשתתף בקבוצה האחרת.': 'By default you attend every session. Approving a swap states that it is the same weekly part and that you may attend the other group.',
    'בדקתי: מותר לשלב כל קבוצה מכל רכיב בקורס הזה': 'Checked: any group of each component of this course can be combined',
    'חסרים קשרי רישום: הגדירו שילובים מותרים או אשרו שכל השילובים מותרים.': 'Registration links are missing: set the allowed combinations or confirm that every combination is allowed.',
    'אישור השילוב הזה': 'Approve this combination',
    'ללא אישור החלפה': 'No swap approved',
    'מאשר/ת שקילות והשתתפות בחלופה:': 'I confirm equivalence and attendance in the alternative:',
    // Grade calculator
    'מחשבון ממוצע': 'Grade average',
    'לפי נק״ז.': 'by credits.',
    'מחשבים ממוצע לפי נק״ז, בודקים איך קורס עתידי ישפיע עליו ומגלים איזה ציון נדרש כדי להגיע ליעד.': 'Work out your credit-weighted average, see how a future course would change it and find the grade you need to reach a target.',
    'הוספת ציון ידנית': 'Add a grade by hand',
    'ייבוא ציונים מ־Excel': 'Import grades from Excel',
    'הורדת תבנית Excel': 'Download Excel template',
    'ייצוא ל־Excel': 'Export to Excel',
    'הנתונים נשמרים אוטומטית בדפדפן הזה. קובץ Excel לייבוא ציונים נפרד מקובץ מערכת השעות.': 'Your data is saved in this browser automatically. The grades Excel file is separate from the timetable file.',
    'הנתונים נשמרים אוטומטית בדפדפן הזה. לייבוא ולגיבוי משתמשים בקובץ ציונים נפרד מקובץ מערכת השעות.': 'Your data is saved in this browser automatically. For import and backup, use a grades file separate from the timetable file.',
    'לא ניתן לשמור בדפדפן הזה. אפשר לייצא ל־Excel כדי לשמור את הנתונים לפני סגירת הדף.': 'This browser cannot save data. Export to Excel to keep your data before closing the page.',
    'לא שוחזרו נתונים שמורים. לאחר ההזנה אפשר לייצא ל־Excel לגיבוי.': 'No saved data was restored. After entering grades you can export to Excel as a backup.',
    'לא ניתן לשחזר את הנתונים השמורים. אפשר לייבא את קובץ הגיבוי או להתחיל רשימה חדשה.': 'The saved data could not be restored. Import your backup file or start a new list.',
    'הממוצע הנוכחי': 'Current average',
    'משוקלל לפי נקודות הזכות': 'Weighted by credits',
    'נק״ז שנכללות בממוצע': 'Credits in the average',
    'אין קורסים לחישוב': 'No courses to count',
    'הממוצע בתרחיש העתידי': 'Average in the future scenario',
    'הוסיפו קורס עתידי לסימולציה': 'Add a future course to simulate',
    'הממוצע של הקורסים העתידיים בלבד': 'Average of the future courses only',
    'הציונים שלי': 'My grades',
    'ניקוי הרשימה': 'Clear the list',
    'סמנו אילו קורסים נכללים בממוצע. ציון 0 נכלל; פטור או קורס ללא ציון מספרי אינם נכללים.': 'Tick the courses that count toward the average. A 0 counts; exemptions and courses without a numeric grade do not.',
    'חיפוש לפי שם או קוד': 'Search by name or code',
    'חיפוש קורס': 'Search courses',
    'קורסים וציונים נוכחיים': 'Current courses and grades',
    'בממוצע': 'Counted', 'קורס': 'Course', 'נק״ז': 'Credits', 'ציון': 'Grade', 'פעולות': 'Actions',
    'עדיין אין ציונים. אפשר להוסיף קורס ידנית או לייבא קובץ Excel.': 'No grades yet. Add a course by hand or import an Excel file.',
    'הוספת הציון הראשון': 'Add your first grade',
    'איך מחשבים?': 'How is it calculated?',
    'סכום המכפלות של ציון × נק״ז, חלקי סך הנק״ז שנכללות בחישוב.': 'The sum of grade × credits, divided by the total credits counted.',
    'החישוב משתמש בערכים המלאים. העיגול הוא לתצוגה בלבד.': 'The calculation uses the full values. Rounding is for display only.',
    'קורסים עתידיים': 'Future courses',
    'הוספת קורס עתידי': 'Add a future course',
    'הציונים כאן הם הנחות לתכנון ואינם משנים את הציונים הקיימים.': 'Grades here are planning assumptions and do not change your existing grades.',
    'קורסים בתרחיש העתידי': 'Courses in the future scenario',
    'בתרחיש': 'In scenario',
    'ציון צפוי': 'Expected grade',
    'הוסיפו קורס אחד או כמה קורסים כדי לבדוק את ההשפעה על הממוצע.': 'Add one or more courses to see how they change the average.',
    'לאיזה ממוצע להגיע?': 'Which average are you aiming for?',
    'ממוצע יעד': 'Target average',
    'הוסיפו קורסים עתידיים לחישוב הציון הדרוש.': 'Add future courses to work out the grade you need.',
    'איך הציון ישנה את הממוצע?': 'How will the grade change the average?',
    'הוסיפו קורס עתידי כדי להזיז את הציון ולראות את ההשפעה.': 'Add a future course to move the grade and see the effect.',
    'קורס לבדיקה': 'Course to test',
    'שאר הקורסים העתידיים נשארים בציונים הצפויים שהזנת. ציר הממוצע מותאם לטווח השינוי. הקו המקווקו, אם מוצג, מסמן את ממוצע היעד.': 'Your other future courses keep the expected grades you entered. The average axis fits the range of change. The dashed line, when shown, marks the target average.',
    'ומה אם אשפר ציון?': 'What if I improve a grade?',
    'סימולציה על הממוצע הנוכחי, ללא הקורסים העתידיים וללא תוספת נק״ז.': 'A simulation on the current average, without future courses and without extra credits.',
    'לאחר הוספת ציונים אפשר לבדוק שיפור בקורס קיים.': 'Once you add grades you can test improving an existing course.',
    'הוספת ציון': 'Add a grade',
    'קורס לשיפור': 'Course to improve',
    'ציון חדש': 'New grade',
    'איך מחליפים את הציון?': 'How is the grade replaced?',
    'הציון החדש מחליף את הישן': 'The new grade replaces the old one',
    'הגבוה מבין שני הציונים': 'The higher of the two grades',
    'בחרו את הכלל שמתאים למוסד שלכם. השינוי כאן הוא לצורך בדיקה בלבד.': 'Choose the rule your institution uses. Changes here are for testing only.',
    'הרשימה עודכנה.': 'The list was updated.',
    'ביטול השינוי האחרון': 'Undo the last change',
    'השינוי האחרון בוטל.': 'The last change was undone.',
    'סולם ציונים 0–100 · נק״ז במשקל יחסי · הכללת קורסים לפי הבחירה שלך': 'Grades 0–100 · credits as relative weight · courses counted as you choose',
    'קוד קורס (אופציונלי)': 'Course code (optional)',
    'נכלל בממוצע': 'Counts toward the average',
    'נכלל בממוצע (אופציונלי)': 'Counts toward the average (optional)',
    'נכלל בתרחיש': 'Included in the scenario',
    'לפטור או לקורס ללא ציון מספרי, השאירו את הציון ריק והסירו את הסימון.': 'For an exemption or a course without a numeric grade, leave the grade empty and untick the box.',
    'שמירת הקורס': 'Save course',
    'עריכת קורס': 'Edit course',
    'הקורס נשמר. החישובים עודכנו.': 'Course saved. The calculations were updated.',
    'ללא ציון מספרי': 'No numeric grade',
    'ללא משקל בממוצע': 'No weight in the average',
    'עריכה': 'Edit', 'הסרה': 'Remove',
    'לא נמצאו קורסים שמתאימים לחיפוש.': 'No courses match your search.',
    'היעד אינו אפשרי עם הנק״ז האלה, גם בציון 100.': 'The target cannot be reached with these credits, even with a 100.',
    'היעד נשמר גם אם הציון העתידי יהיה 0.': 'You keep the target even with a 0 in the future courses.',
    'ממוצע צפוי': 'Expected average',
    'ציון בקורס': 'Course grade',
    'יש להזין יעד בין 0 ל־100.': 'Enter a target between 0 and 100.',
    'יש להזין ממוצע יעד תקין לחישוב הציון הדרוש.': 'Enter a valid target average to work out the grade you need.',
    'יש להזין ציון בין 0 ל־100.': 'Enter a grade between 0 and 100.',
    'יש קודי קורס חוזרים. כרגע כל שורה מסומנת נספרת בנפרד; הסירו מהחישוב ניסיונות שלא אמורים להיכלל.': 'Some course codes repeat. Each ticked row currently counts separately; untick attempts that should not count.',
    'יש להזין שם קורס באורך של עד 200 תווים.': 'Enter a course name of up to 200 characters.',
    'קוד הקורס ארוך מדי (עד 80 תווים).': 'The course code is too long (up to 80 characters).',
    'סימון הכללה בממוצע אינו תקין.': 'The “counts toward the average” value is not valid.',
    'קורס ללא ציון מספרי צריך להיות מסומן כלא נכלל בממוצע.': 'A course without a numeric grade has to be left out of the average.',
    'לקורס עתידי נדרשות נק״ז חיוביות וציון צפוי.': 'A future course needs positive credits and an expected grade.',
    'נכלל בממוצע: יש להשתמש בכן/לא או true/false.': 'Counts toward the average: use yes/no or true/false.',
    'יש לבחור עמודות לשם קורס, נק״ז וציון.': 'Choose the columns for course name, credits and grade.',
    'יש לבחור עמודה שונה לכל שדה.': 'Choose a different column for each field.',
    'בדיקת קובץ הציונים': 'Check the grades file',
    'גיליון': 'Sheet', 'שורת כותרות': 'Header row', 'לאן לייבא?': 'Import into', 'ציונים קיימים': 'Existing grades',
    'תרחיש עתידי': 'Future scenario', 'אופן הייבוא': 'Import mode', 'הוספה לרשימה': 'Add to the list', 'החלפת הרשימה': 'Replace the list',
    'התאמת העמודות': 'Match the columns',
    'בחרו את השורות לייבוא. קורסים ללא ציון מספרי יוצעו כלא נכללים בממוצע. נוסחאות נקראות לפי הערכים שנשמרו ב־Excel.': 'Choose the rows to import. Courses without a numeric grade are suggested as not counting. Formulas are read by the values saved in Excel.',
    'בחירת כל השורות': 'Select all rows',
    'ביטול בחירת שורות שגויות': 'Deselect rows with errors',
    'תצוגה מקדימה של הייבוא': 'Import preview',
    'לייבא': 'Import', 'שורה': 'Row', 'מצב': 'Status',
    'ייבוא השורות שנבחרו': 'Import the selected rows',
    'ללא עמודה': 'No column', 'בחירת עמודה': 'Choose a column', 'ללא ציון': 'No grade', 'ללא כותרת': 'No header',
    'נכלל בחישוב': 'Counted', 'לא נכלל בחישוב': 'Not counted',
    'יש לבחור קובץ xlsx בגודל של עד 5 MB.': 'Choose an .xlsx file of up to 5 MB.',
    'קוראים את קובץ הציונים…': 'Reading the grades file…',
    'קובץ ה־Excel כולל גיליון ציונים וגיליון נפרד לתרחיש העתידי.': 'The Excel file has a grades sheet and a separate sheet for the future scenario.',
    'כדי לייבא ולייצא Excel יש לפתוח את האתר דרך start.bat. חישוב ידני זמין כאן.': 'To import and export Excel, open the site with start.bat. Manual calculation works here.',
    'פטור': 'Exempt', 'עבר': 'Passed', 'עובר': 'Pass', 'זיכוי': 'Credit transfer',
    // Errors from the shared request layer
    'הבקשה לא הושלמה. נסו שוב.': 'The request did not complete. Try again.',
    'הבקשה נמשכה זמן רב. נסו שוב או השתמשו בקובץ קטן יותר.': 'The request took too long. Try again or use a smaller file.',
    'לא ניתן להתחבר לשרת. הפעילו python web_server.py ופתחו את הכתובת המקומית.': 'Cannot reach the server. Run python web_server.py and open the local address.',
  };

  const DAYS = { 'ראשון': 'Sunday', 'שני': 'Monday', 'שלישי': 'Tuesday', 'רביעי': 'Wednesday', 'חמישי': 'Thursday' };
  const T = s => translate(s);
  const list = s => s.split(/, | ו־/).map(T).join(', ');
  const count = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;
  // Sentences with numbers, names or other pieces in them. Each runs on the whole string.
  const PATTERNS = [
    [/^(\d+) דק׳$/, m => `${m[1]} min`],
    [/^(\d+) ש׳ (\d+) דק׳$/, m => `${m[1]} h ${m[2]} min`],
    [/^(\d+) ש׳$/, m => `${m[1]} h`],
    [/^ב־(.+) יש כמה סוגי מפגשים, כמו הרצאה ותרגול\. אפשר להירשם לכל קבוצת הרצאה יחד עם כל קבוצת תרגול\?$/, m => `${list(m[1])} have several kinds of sessions, like lectures and tutorials. Can any lecture group be taken together with any tutorial group?`],
    [/^([\d.]+) נק״ז$/, m => `${m[1]} credits`],
    [/^(\d+) רכיבים$/, m => count(m[1], 'component', 'components')],
    [/^הקצב שנבחר: (.+)\. אפשר לכוונן כל העדפה\.$/, m => `Pace: ${T(m[1])}. You can fine-tune every preference.`],
    [/^העדפות ״(.+)״ הוחלו\. לחצו על ״חישוב המערכת״ כדי לראות את השבוע\.$/, m => `“${T(m[1])}” preferences applied. Click “Calculate timetable” to see the week.`],
    [/^הקורס (.+) נוסף ונבחר לתכנון\.$/, m => `${m[1]} was added and selected for planning.`],
    [/^(\d+) חלופות מדורגות$/, m => count(m[1], 'ranked option', 'ranked options')],
    [/^([\d,]+) חלופות אפשריות — החיפוש הושלם$/, m => `${m[1]} possible options — search complete`],
    [/^(\d+) ימים פנויים בשבוע$/, m => `${count(m[1], 'free day', 'free days')} a week`],
    [/^המערכת שלך · חלופה (\d+)$/, m => `Your timetable · option ${m[1]}`],
    [/^יום ארוך ביותר: (.+)$/, m => `Longest day: ${T(m[1])}`],
    [/^החלפה: (.+) ← (.+)$/, m => `Swap: ${T(m[1])} → ${T(m[2])}`],
    [/^ויתור על הגעה: (.+)$/, m => `Skipping: ${T(m[1])}`],
    [/^(.+), (הרצאה|תרגול|מעבדה), יום (\S+), (.+), (חובה|רשות)\. לחצו לפרטים$/, m => `${m[1]}, ${T(m[2])}, ${T(m[3])}, ${m[4]}, ${T(m[5])}. Click for details`],
    [/^חלופה (\d+) מוצגת כעת בלוח השבועי\.$/, m => `Option ${m[1]} is now on the weekly board.`],
    [/^חלופה (\d+)$/, m => `Option ${m[1]}`],
    [/^(\d+) ימי לימוד$/, m => count(m[1], 'study day', 'study days')],
    [/^(.+) לימודים בשבוע$/, m => `${T(m[1])} of classes a week`],
    [/^(.+) לימודים$/, m => `${T(m[1])} of classes`],
    [/^(.+) חלונות$/, m => `${T(m[1])} of gaps`],
    [/^ימים פנויים: (.+)$/, m => `Free days: ${list(m[1])}`],
    [/^מוצג יום (\S+)$/, m => `Showing ${T(m[1])}`],
    [/^יום (ראשון|שני|שלישי|רביעי|חמישי|א׳|ב׳|ג׳|ד׳|ה׳)$/, m => DAYS[m[1]] || T(m[1])],
    [/^(ראשון|שני|שלישי|רביעי|חמישי) (\d.*)$/, m => `${DAYS[m[1]]} ${m[2]}`],
    [/^(\d+) קורסים נבחרו$/, m => count(m[1], 'course selected', 'courses selected')],
    [/^(\d+) קורסים$/, m => count(m[1], 'course', 'courses')],
    [/^(\d+) חלופות$/, m => count(m[1], 'option', 'options')],
    [/^(\d+) מתוך (\d+) קורסים נבחרו$/, m => `${m[1]} of ${m[2]} courses selected`],
    [/^(\d+) קורסים תואמים$/, m => count(m[1], 'matching course', 'matching courses')],
    [/^(הרצאה|תרגול|מעבדה) (\S+)$/, m => `${T(m[1])} ${m[2]}`],
    [/^לא אגיע למפגש (.+?)( \(מסומן חובה\))?$/, m => `I won't attend ${T(m[1])}${m[2] ? ' (marked mandatory)' : ''}`],
    [/^חלופה מאושרת למפגש (.+)$/, m => `Approved alternative for ${T(m[1])}`],
    [/^קבוצה (\S+)$/, m => `Group ${m[1]}`],
    [/^בקבוצה (\d+)$/, m => `in group ${m[1]}`],
    [/^מפגש (\d+)$/, m => `Session ${m[1]}`],
    [/^הסרת מפגש (\d+) מקבוצה (\d+)$/, m => `Remove session ${m[1]} from group ${m[2]}`],
    [/^הסרת קבוצה (\d+)$/, m => `Remove group ${m[1]}`],
    [/^הוספת מפגש לקבוצה (\d+)$/, m => `Add a session to group ${m[1]}`],
    [/^מספר קבוצה (.+)$/, m => `Group number ${T(m[1])}`],
    [/^שם מרצה (.+)$/, m => `Lecturer name ${T(m[1])}`],
    [/^יש למלא (.+)\.$/, m => `Fill in ${T(m[1]).toLowerCase()}.`],
    [/^יש לבחור סוג מפגש (.+)\.$/, m => `Choose a session type ${T(m[1])}.`],
    [/^יש לבחור עדיפות (.+)\.$/, m => `Choose a priority ${T(m[1])}.`],
    [/^מספר הקבוצה (.+) מופיע יותר מפעם אחת בסוג (.+)\.$/, m => `Group number ${m[1]} appears more than once for ${T(m[2]).toLowerCase()}.`],
    [/^יש להוסיף לפחות מפגש אחד (.+)\.$/, m => `Add at least one session ${T(m[1])}.`],
    [/^יש לבחור יום (.+)\.$/, m => `Choose a day ${T(m[1])}.`],
    [/^שעת הסיום חייבת להיות אחרי שעת ההתחלה (.+)\.$/, m => `The end time has to be after the start time ${T(m[1])}.`],
    [/^יש מפגשים חופפים (.+)\. יש לתקן את היום או את השעות\.$/, m => `Sessions overlap ${T(m[1])}. Fix the day or the times.`],
    [/^(.+): יש להזין מספר\.$/, m => `${T(m[1])}: enter a number.`],
    [/^(.+): הערך חייב להיות בין 0 ל־(\d+)\.$/, m => `${T(m[1])}: the value has to be between 0 and ${m[2]}.`],
    [/^אפשר להוסיף עד (\d+) קורסים\.$/, m => `You can add up to ${m[1]} courses.`],
    [/^אפשר לשמור עד (\d+) קורסים בסך הכול\.$/, m => `You can keep up to ${m[1]} courses in total.`],
    [/^⁦(.+)⁩ נקודות בממוצע$/, m => `⁦${m[1]}⁩ points on the average`],
    [/^הכללה בתרחיש: (.+)$/, m => `Include in scenario: ${m[1]}`],
    [/^הכללת (.+)$/, m => `Count ${m[1]}`],
    [/^עריכת (.+)$/, m => `Edit ${m[1]}`],
    [/^הסרת (.+)$/, m => `Remove ${m[1]}`],
    [/^בקורס הזה נדרש לפחות (.+) — או (\d+) בציון שלם\.$/, m => `This course needs at least ${m[1]}, or ${m[2]} as a whole grade.`],
    [/^נדרש ממוצע של לפחות (.+) בקורסים העתידיים\.$/, m => `Your future courses need an average of at least ${m[1]}.`],
    [/^השפעת הציון בקורס (.+) על הממוצע\. טווח הממוצע: (.+) עד (.+)\.$/, m => `How the grade in ${m[1]} changes the average. Average range: ${m[2]} to ${m[3]}.`],
    [/^(\d+) קורסים בחישוב$/, m => `${count(m[1], 'course', 'courses')} counted`],
    [/^(\d+) לא נכללים$/, m => `${m[1]} not counted`],
    [/^אם מכוונים לאותו ציון שלם בכל קורס עתידי: לפחות (\d+)\. היעד הוא (.+) לאחר (.+) נק״ז נוספות\.$/, m => `If you aim for the same whole grade in every future course: at least ${m[1]}. The target is ${m[2]} after ${m[3]} more credits.`],
    [/^הממוצע המרבי עם 100 בכל הקורסים העתידיים: (.+)\.$/, m => `Highest average with 100 in every future course: ${m[1]}.`],
    [/^הממוצע לאחר השיפור: (.+) \((.+)\)\.$/, m => `Average after the improvement: ${m[1]} (${T(m[2])}).`],
    [/^ציון ([\d.]+)$/, m => `grade ${m[1]}`],
    [/^שורה (\d+): (.*)$/, m => `Row ${m[1]}: ${m[2]}`],
    [/^(\d+) מתוך (\d+) שורות נבחרו$/, m => `${m[1]} of ${m[2]} rows selected`],
    [/^(\d+) שגויות$/, m => `${m[1]} with errors`],
    [/^(\d+) ללא משקל בממוצע$/, m => `${m[1]} without weight in the average`],
    [/^ייבוא שורה (\d+)$/, m => `Import row ${m[1]}`],
    [/^(\d+) קורסים יובאו\. אפשר לערוך כל שורה או לבטל את הייבוא\.$/, m => `${m[1]} courses imported. You can edit any row or undo the import.`],
  ];

  function translate(text) {
    const s = text.replace(/\s+/g, ' ').trim();
    if (!HEB.test(s)) return s;
    if (Object.hasOwn(DICT, s)) return DICT[s];
    for (const [re, fn] of PATTERNS) {
      const m = s.match(re);
      if (m) return fn(m);
    }
    // Composite labels such as "ALG101 · 4 נק״ז · 2 רכיבים" translate piece by piece.
    if (s.includes(' · ')) {
      const parts = s.split(' · ');
      const out = parts.map(translate);
      if (out.some((p, i) => p !== parts[i])) return out.join(' · ');
    }
    // Messages built from several known sentences translate sentence by sentence.
    const sentences = s.split(/(?<=[.?])\s+(?=\S)/);
    if (sentences.length > 1) {
      const out = sentences.map(translate);
      if (out.some((p, i) => p !== sentences[i])) return out.join(' ');
    }
    return s;
  }

  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  let lang = 'he';
  try { if (localStorage.getItem(KEY) === 'en') lang = 'en'; } catch { /* Storage is optional. */ }

  const skipped = node => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !el || !!el.closest(SKIP);
  };
  function translateText(node) {
    const value = node.nodeValue;
    if (!HEB.test(value) || skipped(node)) return;
    const lead = value.match(/^\s*/)[0], trail = value.match(/\s*$/)[0];
    const english = translate(value);
    if (english === value.trim().replace(/\s+/g, ' ')) return;
    const next = lead + english + trail;
    textOriginals.set(node, { he: value, en: next });
    node.nodeValue = next;
  }
  function translateAttrs(el) {
    if (el.closest(SKIP)) return;
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (!value || !HEB.test(value)) continue;
      const english = translate(value);
      if (english === value) continue;
      const saved = attrOriginals.get(el) || new Map();
      saved.set(name, { he: value, en: english });
      attrOriginals.set(el, saved);
      el.setAttribute(name, english);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { translateText(root); return; }
    if (root.nodeType !== 1) return;
    translateAttrs(root);
    const texts = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = texts.nextNode(); n; n = texts.nextNode()) translateText(n);
    root.querySelectorAll('[aria-label], [placeholder], [title], [alt]').forEach(translateAttrs);
  }
  function restore() {
    const texts = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = texts.nextNode(); n; n = texts.nextNode()) {
      const saved = textOriginals.get(n);
      if (saved && n.nodeValue === saved.en) n.nodeValue = saved.he;
    }
    document.querySelectorAll('*').forEach(el => {
      const saved = attrOriginals.get(el);
      if (!saved) return;
      for (const [name, { he, en }] of saved) if (el.getAttribute(name) === en) el.setAttribute(name, he);
    });
  }

  // Text the app writes while English is on is translated as soon as it lands.
  const observer = new MutationObserver(records => {
    if (lang !== 'en') return;
    for (const r of records) {
      if (r.type === 'characterData') translateText(r.target);
      else if (r.type === 'attributes') translateAttrs(r.target);
      else r.addedNodes.forEach(walk);
    }
  });

  function meta() {
    const description = document.querySelector('meta[name="description"]');
    if (!description) return;
    description.dataset.he ??= description.content;
    description.content = lang === 'en' ? translate(description.dataset.he) : description.dataset.he;
  }
  function syncButton() {
    const button = document.getElementById('lang-toggle');
    if (!button) return;
    button.setAttribute('data-no-i18n', '');
    button.textContent = lang === 'en' ? 'עב' : 'EN';
    button.lang = lang === 'en' ? 'he' : 'en';
    button.setAttribute('aria-label', lang === 'en' ? 'מעבר לעברית' : 'Switch to English');
    button.title = button.getAttribute('aria-label');
  }
  function apply(next) {
    lang = next;
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'en' ? 'ltr' : 'rtl';
    if (lang === 'en') walk(document.documentElement);
    else restore();
    meta();
    syncButton();
    document.dispatchEvent(new CustomEvent('carpedio:lang', { detail: { lang } }));
  }
  function set(next) {
    try { localStorage.setItem(KEY, next); } catch { /* Storage is optional. */ }
    apply(next);
  }

  window.CarpedIOI18n = { lang: () => lang, set, translate };
  function start() {
    apply(lang);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    document.getElementById('lang-toggle')?.addEventListener('click', () => set(lang === 'en' ? 'he' : 'en'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
