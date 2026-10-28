import { api, DAYS, TYPES, formatTime } from './api.js';

/** Convert a draft to the API hierarchy; IDs remain strings, including leading zeros. */
export function buildCourseDraft(draft, slots, existingIds = []) {
  const text = (value, label) => {
    const cleaned = String(value ?? '').trim();
    if (!cleaned) throw new Error(`יש למלא ${label}.`);
    return cleaned;
  };
  const course_id = text(draft.course_id, 'מספר קורס');
  const name = text(draft.name, 'שם קורס');
  if (existingIds.includes(course_id)) throw new Error('מספר הקורס כבר קיים ברשימה. יש להזין מספר קורס אחר.');
  const credits = Number(draft.credits);
  if (String(draft.credits).trim() === '' || !Number.isFinite(credits) || credits < 0)
    throw new Error('יש להזין נקודות זכות כמספר שאינו שלילי.');
  if (!draft.groups.length) throw new Error('יש להוסיף לפחות קבוצה אחת.');
  const components = new Map();
  for (const [index, group] of draft.groups.entries()) {
    const label = `בקבוצה ${index + 1}`;
    if (!Object.hasOwn(TYPES, group.type)) throw new Error(`יש לבחור סוג מפגש ${label}.`);
    const group_id = text(group.group_id, `מספר קבוצה ${label}`);
    const lecturer = text(group.lecturer, `שם מרצה ${label}`);
    if (!['low', 'medium', 'high'].includes(group.priority)) throw new Error(`יש לבחור עדיפות ${label}.`);
    if (!components.has(group.type)) components.set(group.type, {component_type:group.type, groups:[]});
    const component = components.get(group.type);
    if (component.groups.some(value => value.group_id === group_id))
      throw new Error(`מספר הקבוצה ${group_id} מופיע יותר מפעם אחת בסוג ${TYPES[group.type]}.`);
    if (!group.sessions.length) throw new Error(`יש להוסיף לפחות מפגש אחד ${label}.`);
    const sessions = group.sessions.map(session => {
      const day = Number(session.day), first = Number(session.first), last = Number(session.last);
      if (!Number.isInteger(day) || day < 1 || day > 5) throw new Error(`יש לבחור יום ${label}.`);
      if (!Number.isInteger(first) || !Number.isInteger(last) || !slots[first] || !slots[last] || last < first)
        throw new Error(`שעת הסיום חייבת להיות אחרי שעת ההתחלה ${label}.`);
      return {day, start:formatTime(slots[first][0]), end:formatTime(slots[last][1]),
        mandatory:session.mandatory, ...(session.part?.trim() ? {part:session.part.trim()} : {})};
    });
    for (let i = 0; i < sessions.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = sessions[i], b = sessions[j];
        if (a.day === b.day && a.start < b.end && b.start < a.end)
          throw new Error(`יש מפגשים חופפים ${label}. יש לתקן את היום או את השעות.`);
      }
    }
    component.groups.push({group_id, lecturer, priority:group.priority, full:group.full, sessions});
  }
  return {course_id, name, credits, components:[...components.values()]};
}

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(text, action, className = 'text-button') {
  const el = node('button', text, className); el.type = 'button';
  el.addEventListener('click', action); return el;
}
function textField(caption, optional = false) {
  const label = node('label', caption), input = node('input');
  input.type = 'text'; input.required = !optional; input.maxLength = 200;
  label.append(input); return {label, input};
}
function selectField(caption, options, initial) {
  const label = node('label', caption), input = node('select');
  input.setAttribute('aria-label', caption);
  for (const [value, title] of options) {
    const option = node('option', title); option.value = value; input.append(option);
  }
  if (initial !== undefined) input.value = initial;
  label.append(input); return {label, input};
}
function checkField(caption, initial = false) {
  const label = node('label', undefined, 'manual-check'), input = node('input');
  input.type = 'checkbox'; input.checked = initial;
  label.append(input, node('span', caption)); return {label, input};
}

export function initManualCourse({getDataset, isBusy, onSave}) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#manual-course-dialog'), form = $('#manual-course-form');
  const fields = $('#manual-course-fields'), container = $('#manual-groups');
  const error = $('#manual-course-error'), save = $('#save-manual-course'), close = $('#close-manual-course');
  let slots = null, groups = [], saving = false, loading = false;

  function message(value = '') { error.textContent = value; error.hidden = !value; }
  function renumber() { groups.forEach((group, index) => group.number(index + 1)); }

  function addGroup() {
    const card = node('fieldset', undefined, 'manual-group');
    const legend = node('legend'); card.append(legend);
    const tools = node('div', undefined, 'manual-group-tools');
    const remove = button('הסרת קבוצה', () => {
      groups.splice(groups.indexOf(group), 1); card.remove(); renumber();
      (groups.at(-1)?.element.querySelector('select') || $('#add-manual-group')).focus();
    });
    tools.append(remove); card.append(tools);
    const grid = node('div', undefined, 'manual-fields manual-group-meta');
    const type = selectField('סוג מפגש', Object.entries(TYPES));
    const id = textField('מספר קבוצה'); id.input.dir = 'ltr'; id.input.maxLength = 80;
    const lecturer = textField('שם מרצה');
    const priority = selectField('עדיפות לקבוצה', [['low','נמוכה'],['medium','בינונית'],['high','גבוהה']], 'medium');
    const full = checkField('הקבוצה מלאה');
    grid.append(type.label, id.label, lecturer.label, priority.label); card.append(grid, full.label);
    const meetings = node('div', undefined, 'manual-meetings'); card.append(meetings);
    const sessions = [];
    let groupNumber = 1;
    function numberMeetings() {
      sessions.forEach((session, index) => session.number(index + 1));
    }
    function addSession() {
      const row = node('fieldset', undefined, 'manual-meeting'), heading = node('legend');
      row.append(heading);
      const times = node('div', undefined, 'manual-fields manual-time-fields');
      const day = selectField('יום', DAYS.map((day, index) => [index + 1, day]));
      const first = selectField('שעת התחלה', slots.map(([start], index) => [index, formatTime(start)]));
      const last = selectField('שעת סיום', slots.map(([, end], index) => [index, formatTime(end)]));
      first.input.addEventListener('change', () => {
        if (Number(last.input.value) < Number(first.input.value)) last.input.value = first.input.value;
        for (const option of last.input.options) option.disabled = Number(option.value) < Number(first.input.value);
      });
      times.append(day.label, first.label, last.label);
      const mandatory = checkField('נוכחות חובה', true);
      const part = textField('חלק שבועי (אופציונלי)', true);
      part.input.placeholder = 'למשל: חלק א׳';
      const bottom = node('div', undefined, 'manual-meeting-bottom');
      const removeSession = button('הסרת מפגש', () => {
        sessions.splice(sessions.indexOf(session), 1); row.remove(); numberMeetings(); addMeeting.focus();
      });
      bottom.append(mandatory.label, removeSession);
      row.append(times, part.label, bottom); meetings.append(row);
      const session = {
        number(index) {
          heading.textContent = `מפגש ${index}`;
          removeSession.disabled = sessions.length === 1;
          removeSession.setAttribute('aria-label', `הסרת מפגש ${index} מקבוצה ${groupNumber}`);
        },
        read: () => ({day:day.input.value, first:first.input.value, last:last.input.value,
          mandatory:mandatory.input.checked, part:part.input.value}),
      };
      sessions.push(session); numberMeetings();
      return day.input;
    }
    const addMeeting = button('הוספת מפגש לקבוצה', () => addSession().focus());
    card.append(addMeeting);
    const group = {
      element:card,
      number(index) {
        groupNumber = index; legend.textContent = `קבוצה ${index}`;
        remove.disabled = groups.length === 1; remove.setAttribute('aria-label', `הסרת קבוצה ${index}`);
        addMeeting.setAttribute('aria-label', `הוספת מפגש לקבוצה ${index}`); numberMeetings();
      },
      read: () => ({type:type.input.value, group_id:id.input.value, lecturer:lecturer.input.value,
        priority:priority.input.value, full:full.input.checked, sessions:sessions.map(s => s.read())}),
    };
    groups.push(group); container.append(card); addSession(); renumber();
    return type.input;
  }

  $('#add-manual-group').addEventListener('click', () => addGroup().focus());
  close.addEventListener('click', () => { if (!saving) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  $('#add-course').addEventListener('click', async () => {
    if (isBusy()) return;
    dialog.showModal(); message();
    if (!slots && !loading) {
      loading = true; fields.disabled = true; save.disabled = true;
      save.textContent = 'טוענים את שעות הלימוד…';
      try {
        ({slots} = await api.courseOptions());
        if (!groups.length) addGroup();
      } catch (failure) { message(failure.message); }
      finally {
        loading = false; fields.disabled = !slots; save.disabled = !slots;
        save.textContent = 'הוספת הקורס לרשימה';
      }
    }
    if (dialog.open) form.elements.course_name.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !slots || isBusy()) return;
    message();
    try {
      const course = buildCourseDraft({course_id:form.elements.course_id.value, name:form.elements.course_name.value,
        credits:form.elements.credits.value, groups:groups.map(group => group.read())}, slots,
        (getDataset()?.courses || []).map(course => course.id));
      saving = true; fields.disabled = true; save.disabled = true; close.disabled = true;
      save.textContent = 'מוסיפים את הקורס…';
      await onSave(course);
      dialog.close(); form.reset(); groups = []; container.replaceChildren(); addGroup();
    } catch (failure) {
      message(failure.message); error.scrollIntoView({block:'nearest'});
    } finally {
      saving = false; fields.disabled = false; save.disabled = false; close.disabled = false;
      save.textContent = 'הוספת הקורס לרשימה';
    }
  });
}
