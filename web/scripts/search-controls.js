import { DAYS, TYPES, formatTime } from './api.js';

function node(tag, text, className = '') {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  value.className = className;
  return value;
}
function checkbox(text) {
  const label = node('label', undefined, 'search-checkbox');
  const input = node('input'); input.type = 'checkbox';
  label.append(input, node('span', text));
  return { label, input };
}
function select(options, label) {
  const input = node('select'); input.setAttribute('aria-label', label);
  for (const [value, text] of options) {
    const option = node('option', text); option.value = value; input.append(option);
  }
  return input;
}
const minutes = value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };

export function searchStatus(data) {
  if (data.status === 'running') return 'החיפוש מתבצע — מוצגות תוצאות ביניים';
  if (data.optimal && !data.schedules.length) return 'החיפוש הושלם — אין מערכת לפי האילוצים';
  if (data.optimal) return data.total_exact
    ? `${data.total.toLocaleString('he-IL')} חלופות אפשריות — החיפוש הושלם`
    : 'החיפוש הושלם — החלופות המובילות אומתו';
  return ({cancelled:'החיפוש בוטל — התוצאות שנמצאו נשמרו', time_limit:'החיפוש הגיע למגבלת הזמן',
    node_limit:'החיפוש הגיע למגבלת העבודה', memory_limit:'החיפוש הגיע למגבלת הזיכרון'})[data.status] || 'החיפוש לא הושלם';
}

export function initSearchControls(onChange) {
  const container = document.querySelector('#search-controls');
  const details = node('details', undefined, 'search-settings');
  details.append(node('summary', 'יעדים, זמינות וקשרי רישום'));
  const targets = node('div', undefined, 'search-fields');
  const fields = {};
  for (const [name, caption, initial, min, max] of [
    ['target_days', 'יעד ימי הגעה', 1, 0, 5], ['target_gaps', 'יעד חלונות בשבוע (דקות)', 0, 0, 1440],
    ['target_daily_span', 'יעד אורך יום (דקות)', 480, 0, 1440],
    ['break_min', 'הפסקה רצויה — לפחות דקות', 20, 0, 240],
    ['break_max', 'הפסקה רצויה — עד דקות', 40, 0, 240],
    ['seconds', 'זמן חיפוש מרבי (שניות)', 15, 1, 120],
  ]) {
    const label = node('label', caption), input = node('input');
    input.type = 'number'; input.value = initial; input.min = min; input.max = max; input.required = true;
    input.name = name; label.append(input); targets.append(label); fields[name] = input;
  }
  details.append(node('p', 'היעדים משפיעים על הדירוג. הזמנים החסומים הם אילוץ מחייב.', 'section-description'), targets);
  const blocked = node('div');
  const addBlocked = node('button', 'הוספת זמן חסום', 'text-button'); addBlocked.type = 'button';
  addBlocked.addEventListener('click', () => {
    const row = node('div', undefined, 'blocked-row');
    const day = select(DAYS.map((d, i) => [String(i + 1), d]), 'יום חסום');
    day.dataset.field = 'day';
    const start = node('input'), end = node('input');
    for (const [input, value, caption, field] of [[start, '08:30', 'תחילת זמן חסום', 'start'], [end, '09:30', 'סיום זמן חסום', 'end']]) {
      input.type = 'time'; input.value = value; input.required = true;
      input.setAttribute('aria-label', caption); input.dataset.field = field;
    }
    const remove = node('button', 'הסרה', 'text-button'); remove.type = 'button';
    remove.addEventListener('click', () => { row.remove(); onChange(); });
    row.append(day, start, end, remove); blocked.append(row); onChange();
  });
  const full = checkbox('לכלול גם קבוצות שסומנו כמלאות');
  const relaxed = checkbox('לבקש גם חלופות עם חפיפות רישום, בכפוף לוויתורים ולהחלפות שאישרתי');
  const count = checkbox('לספור את כל המערכות החוקיות (עשוי להאריך את החיפוש)');
  const courseSettings = node('div', undefined, 'course-search-settings');
  details.append(node('h4', 'זמנים חסומים'), blocked, addBlocked, full.label, relaxed.label, count.label,
    node('h4', 'קשרים והחלטות הגעה'),
    node('p', 'ברירת המחדל היא הגעה לכל המפגשים. אישור החלפה מצהיר שזה אותו חלק שבועי ושמותר להשתתף בקבוצה האחרת.', 'section-description'), courseSettings);
  container.append(details);
  let dataset = null;
  const combinations = new Map();

  function load(data, {preserve = false} = {}) {
    // Appending a course must retain decisions for unchanged course/session identities.
    const unchanged = new Set(preserve ? (data.details || []).filter(course =>
      JSON.stringify(course) === JSON.stringify(dataset?.details?.find(old => old.id === course.id)))
      .map(course => course.id) : []);
    for (const section of [...courseSettings.children]) {
      if (!unchanged.has(section.dataset.course)) {
        combinations.delete(section.dataset.course); section.remove();
      }
    }
    dataset = data;
    for (const course of data.details || []) {
      if (unchanged.has(course.id)) continue;
      const section = node('details', undefined, 'course-rules');
      section.dataset.course = course.id;
      section.append(node('summary', course.name));
      if (!course.links_known) {
        const independent = checkbox('בדקתי: מותר לשלב כל קבוצה מכל רכיב בקורס הזה');
        independent.input.dataset.independent = course.id;
        section.append(node('p', 'חסרים קשרי רישום: הגדירו שילובים מותרים או אשרו שכל השילובים מותרים.', 'section-description'), independent.label);
        const row = node('div', undefined, 'combination-editor');
        const kinds = [...new Set(course.groups.map(g => g.type))].sort();
        const selectors = kinds.map(kind => {
          const label = node('label', TYPES[kind]);
          const input = select(course.groups.filter(g => g.type === kind).map(g => [g.id, `${g.id} · ${g.lecturer}`]), TYPES[kind]);
          label.append(input); row.append(label); return [kind, input];
        });
        const rows = node('div');
        const add = node('button', 'אישור השילוב הזה', 'text-button'); add.type = 'button';
        combinations.set(course.id, []);
        add.addEventListener('click', () => {
          const combination = Object.fromEntries(selectors.map(([kind, input]) => [kind, input.value]));
          const list = combinations.get(course.id);
          if (list.some(value => JSON.stringify(value) === JSON.stringify(combination))) return;
          list.push(combination);
          const item = node('div', undefined, 'approved-combination');
          item.append(node('span', Object.entries(combination).map(([kind, id]) => `${TYPES[kind]} ${id}`).join(' + ')));
          const remove = node('button', 'הסרה', 'text-button'); remove.type = 'button';
          remove.addEventListener('click', () => { list.splice(list.indexOf(combination), 1); item.remove(); onChange(); });
          item.append(remove); rows.append(item); onChange();
        });
        section.append(row, add, rows);
      }
      for (const group of course.groups) {
        const groupDetails = node('details', undefined, 'group-rules');
        groupDetails.append(node('summary', `${TYPES[group.type]} ${group.id} · ${group.lecturer}${group.full ? ' · מלאה' : ''}`));
        for (const session of group.sessions) {
          const line = node('div', undefined, 'attendance-rule');
          const label = `${DAYS[session.day - 1]} ${formatTime(session.start)}–${formatTime(session.end)}`;
          const skip = checkbox(`לא אגיע למפגש ${label}${session.mandatory ? ' (מסומן חובה)' : ''}`);
          skip.input.dataset.skip = session.id;
          line.append(skip.label);
          if (group.sessions.length >= 2) {
            const alternatives = course.groups.filter(g => g.type === group.type && g.id !== group.id)
              .flatMap(g => g.sessions.filter(s => !session.part || !s.part || session.part === s.part)
                .map(s => [s.id, `קבוצה ${g.id} · ${DAYS[s.day - 1]} ${formatTime(s.start)}–${formatTime(s.end)}`]));
            if (alternatives.length) {
              const replacement = select([['', 'ללא אישור החלפה'], ...alternatives], `חלופה מאושרת למפגש ${label}`);
              replacement.dataset.source = session.id;
              line.append(node('span', 'מאשר/ת שקילות והשתתפות בחלופה:'), replacement);
              skip.input.addEventListener('change', () => { replacement.disabled = skip.input.checked; if (skip.input.checked) replacement.value = ''; });
            }
          }
          groupDetails.append(line);
        }
        section.append(groupDetails);
      }
      courseSettings.append(section);
    }
  }

  function constraints(selected) {
    const independent_courses = [], skipped = [], replacements = [], allowed_combinations = {};
    for (const section of courseSettings.children) {
      if (!selected.has(section.dataset.course)) continue;
      if (section.querySelector('[data-independent]')?.checked) independent_courses.push(section.dataset.course);
      const rows = combinations.get(section.dataset.course);
      if (rows?.length && !independent_courses.includes(section.dataset.course)) allowed_combinations[section.dataset.course] = rows;
      for (const input of section.querySelectorAll('[data-skip]:checked')) skipped.push(input.dataset.skip);
      for (const input of section.querySelectorAll('[data-source]')) {
        if (input.value && !skipped.includes(input.dataset.source)) replacements.push({source:input.dataset.source, target:input.value, approved:true});
      }
    }
    return {independent_courses, skipped, replacements, allowed_combinations,
      include_full:full.input.checked, allow_registration_overlaps:relaxed.input.checked,
      blocked:[...blocked.children].map(row => ({day:Number(row.querySelector('[data-field="day"]').value),
        start:minutes(row.querySelector('[data-field="start"]').value), end:minutes(row.querySelector('[data-field="end"]').value)}))};
  }
  return {
    load, constraints,
    targets: () => Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'seconds').map(([key, input]) => [key, Number(input.value)])),
    limits: () => ({seconds:Number(fields.seconds.value), exact_count:count.input.checked}),
    ready(selected) {
      const value = constraints(selected);
      return (dataset?.details || []).filter(c => selected.has(c.id)).every(c => c.links_known ||
        value.independent_courses.includes(c.id) || value.allowed_combinations[c.id]?.length);
    },
    revealMissing() { details.open = true; for (const section of courseSettings.children) if (section.querySelector('[data-independent]')) section.open = true; },
    resetTargets() { for (const [key, value] of Object.entries({target_days:1, target_gaps:0, target_daily_span:480, break_min:20, break_max:40, seconds:15})) fields[key].value = value; },
  };
}
