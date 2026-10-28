import {
  api,
  WEIGHTS,
  DAYS,
  TYPES,
  formatTime,
  duration,
  layoutSessions,
  toCSV,
  weekLoad,
  formatScore,
} from "./api.js";
import { initSearchControls, searchStatus } from './search-controls.js';
import { initManualCourse } from './manual-course.js';
import { initShell } from './shell.js';
import { initPlannerUX } from './planner.js';
const visualEffects = initShell();
// The visual layer is optional: a stale development server must never block planning.
import("./motion.js")
  .then(({ initMotion }) => initMotion())
  .catch((error) => {
    console.warn("Optional motion layer unavailable", error);
  });

const $ = (selector) => document.querySelector(selector);
const state = {
  dataset: null,
  selected: new Set(),
  results: [],
  active: 0,
  visible: 3,
  busy: false,
  dirty: false,
  job: null,
  view: 'attendance',
  searchResult: null,
  extraSeconds: null,
};
const plannerUX = initPlannerUX({ onSession: showSession, onGenerate: () => $('#preferences-form').requestSubmit() });
function syncPlanner() {
  plannerUX.update({selected:state.selected.size,total:state.dataset?.courses.length||0,busy:state.busy,results:state.results.length,dirty:state.dirty});
}
const searchControls = initSearchControls(invalidateResults);
initManualCourse({getDataset: () => state.dataset, isBusy: () => state.busy, onSave: addManualCourse});
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
let manualTheme = false;
try {
  manualTheme = ["dark", "light"].includes(localStorage.getItem("carpedio-theme"));
} catch {
  /* Storage is optional. */
}

function syncThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  $("#theme-toggle").setAttribute("aria-pressed", String(dark));
  $("#theme-toggle").setAttribute(
    "aria-label",
    dark ? "הפעלת מצב בהיר" : "הפעלת מצב כהה",
  );
  $("#theme-toggle").title = dark ? "מעבר למצב בהיר" : "מעבר למצב כהה";
}
$("#theme-toggle").addEventListener("click", () => {
  const theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  manualTheme = true;
  try {
    localStorage.setItem("carpedio-theme", theme);
  } catch {
    /* Continue without persistence. */
  }
  syncThemeButton();
});
systemTheme.addEventListener("change", (event) => {
  if (!manualTheme) {
    document.documentElement.dataset.theme = event.matches ? "dark" : "light";
    syncThemeButton();
  }
});
syncThemeButton();

// Build imported/user content with textContent, never with HTML interpolation.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function colorize(node, index) {
  const color = index % 5;
  node.style.setProperty("--event-bg", `var(--event-${color})`);
  node.style.setProperty("--event-ink", `var(--event-ink-${color})`);
  node.style.setProperty("--event-edge", `var(--event-edge-${color})`);
}
function notify(message, error = false) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.remove("question");
  notice.classList.toggle("error", error);
  notice.hidden = !message;
  notice.setAttribute("role", error ? "alert" : "status");
}
/** Asks once whether groups of the unknown courses combine freely, instead of sending people into the settings. */
function askLinks() {
  const names = searchControls.missing(state.selected);
  const notice = $("#notice");
  const list = names.length > 2 ? names.slice(0, -1).join(", ") + " ו־" + names.at(-1) : names.join(" ו־");
  const yes = element("button", "primary-button", "כן, כל שילוב מותר. לחשב");
  const manual = element("button", "secondary-button", "לא, אגדיר שילובים בעצמי");
  yes.type = manual.type = "button";
  yes.addEventListener("click", () => {
    searchControls.allowAll(state.selected);
    notify("");
    optimize(true);
  });
  manual.addEventListener("click", () => {
    plannerUX.go(2);
    searchControls.revealMissing();
    document.querySelector(".search-settings")?.scrollIntoView({ block: "start" });
  });
  const actions = element("div", "notice-actions");
  actions.append(yes, manual);
  notice.replaceChildren(
    element("strong", "notice-title", "שאלה אחת לפני החישוב"),
    element("p", "", `ב־${list} יש כמה סוגי מפגשים, כמו הרצאה ותרגול. אפשר להירשם לכל קבוצת הרצאה יחד עם כל קבוצת תרגול?`),
    actions,
  );
  notice.classList.remove("error");
  notice.classList.add("question");
  notice.setAttribute("role", "status");
  notice.hidden = false;
}
function busy(value, label = "מחשבים את האפשרויות…") {
  state.busy = value;
  visualEffects.busy(value);
  $(".results").setAttribute("aria-busy", String(value));
  $("#preferences-fields").disabled = value;
  for (const node of document.querySelectorAll(
    "#course-list input, #course-file, #load-sample, #select-all, #add-course, [data-preset]",
  ))
    node.disabled = value;
  $("#generate").disabled = value || !state.selected.size;
  $("#cancel-search").hidden = !value || !state.job;
  $("#export").disabled = value || state.dirty || !state.results.length;
  $("#generate-label").textContent = value ? label : "מציאת המערכת שלי";
  if (value) $("#result-status").textContent = label;
  syncPlanner();
}
function clearResults() {
  visualEffects.clear();
  plannerUX.clear();
  state.dirty = false;
  notify("");
  state.results = [];
  state.searchResult = null;
  $("#continue-search").hidden = true;
  $("#alternatives").replaceChildren();
  $("#more-results").hidden = true;
  $("#calendar").replaceChildren();
  $("#calendar-scroll").hidden = true;
  $("#empty-state").hidden = false;
  for (const id of ["metric-score", "metric-days", "metric-gaps"])
    $("#" + id).textContent = "—";
  $("#metric-free").textContent = "מתוך 5 ימים בשבוע";
  $("#export").disabled = true;
  $("#result-status").textContent = "מוכנים לתכנון";
  $("#alternatives-count").textContent = "החלופות יופיעו כאן";
  $("#calendar-caption").textContent = "לוח שבועי אישי";
  $("#result-explanation").textContent =
    "שינוי הקורסים או ההעדפות דורש חישוב חדש. החלופות מדורגות לפי המשקלים שבחרתם.";
  $("#empty-state h4").textContent = "מקום לשבוע טוב יותר.";
  $("#empty-state p").textContent =
    "בחרו קורסים והעדפות כדי למצוא את המערכת שלכם.";
  syncPlanner();
}
function invalidateResults() {
  notify('');
  state.dirty = true;
  state.extraSeconds = null;
  $('#continue-search').hidden = true;
  visualEffects.clear();
  $('#export').disabled = true;
  $('#alternatives').querySelectorAll('button').forEach(button => button.disabled = true);
  $('#more-results').disabled = true;
  $('#result-status').textContent = 'נדרש חישוב מחדש';
  syncPlanner();
}
function selectionChanged() {
  const courses = state.dataset?.courses || [];
  $("#course-count").textContent = state.selected.size;
  $("#credits-total").textContent = courses
    .filter((c) => state.selected.has(c.id))
    .reduce((total, c) => total + c.credits, 0)
    .toLocaleString("he-IL");
  $("#select-all").textContent =
    state.selected.size === courses.length ? "ביטול הבחירה" : "בחירת הכול";
  $("#generate").disabled = !state.selected.size || state.busy;
  invalidateResults();
}
function renderCourses() {
  $("#course-list").replaceChildren();
  state.dataset.courses.forEach((course, index) => {
    const row = element("label", "course-row");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.value = course.id;
    checkbox.checked = state.selected.has(course.id);
    const copy = element("span", "course-copy");
    const name = element("bdi", "course-name", course.name);
    copy.append(
      name,
      element(
        "span",
        "course-meta",
        `${course.id} · ${course.credits} נק״ז · ${course.components} רכיבים`,
      ),
    );
    const dot = element("span", "course-dot");
    dot.setAttribute("aria-hidden", "true");
    colorize(dot, index);
    row.append(checkbox, copy, dot);
    $("#course-list").append(row);
  });
  plannerUX.courses(state.dataset.courses);
  selectionChanged();
}
$("#course-list").addEventListener("change", (event) => {
  const input = event.target;
  if (!input.matches('input[type="checkbox"]')) return;
  if (input.checked) state.selected.add(input.value);
  else state.selected.delete(input.value);
  selectionChanged();
});
$("#select-all").addEventListener("click", () => {
  if (!state.dataset) return;
  const allSelected = state.selected.size === state.dataset.courses.length;
  state.selected = new Set(
    allSelected ? [] : state.dataset.courses.map((c) => c.id),
  );
  renderCourses();
});
for (const [name, label, value] of WEIGHTS) {
  const control = element("div", "weight-control"),
    heading = element("div", "weight-label");
  const caption = element("label", "", label);
  caption.htmlFor = name;
  const output = element("output", "", value);
  output.htmlFor = name;
  output.id = name + "-output";
  const range = element("input");
  range.type = "range";
  range.id = name;
  range.name = name;
  range.min = 0;
  range.max = 100;
  range.value = value;
  heading.append(caption, output);
  control.append(heading, range);
  $("#weight-controls").append(control);
}
$("#preferences-form").addEventListener("input", (event) => {
  clearPreset();
  if (event.target.type === "range")
    $("#" + event.target.id + "-output").value = event.target.value;
  invalidateResults();
});
$("#reset-preferences").addEventListener("click", () => {
  clearPreset();
  $("#preferred-start").value = "08:30";
  searchControls.resetTargets();
  for (const [name, , value] of WEIGHTS) {
    $("#" + name).value = value;
    $("#" + name + "-output").value = value;
  }
  invalidateResults();
  notify("ההעדפות אופסו. אפשר לחשב את המערכת מחדש.");
});

// Presets only populate the existing preference inputs; Python still ranks every schedule.
const PRESETS = {
  compact: { label: "פחות נסיעות", start: "08:30", weights: [100, 55, 20, 45, 30] },
  morning: { label: "בוקר בקצב שלך", start: "10:00", weights: [45, 55, 100, 40, 50] },
  flow: { label: "נכנסים לרצף", start: "08:30", weights: [65, 100, 30, 40, 90] },
};
function clearPreset() {
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  $('#preset-status').textContent = 'כוונון קטן. שבוע שמתאים יותר.';
}
document.querySelectorAll('[data-preset]').forEach(button => {
  button.addEventListener('click', () => {
    if (state.busy) return;
    const preset = PRESETS[button.dataset.preset];
    clearPreset();
    button.setAttribute('aria-pressed', 'true');
    $('#preferred-start').value = preset.start;
    WEIGHTS.forEach(([name], index) => {
      $('#' + name).value = preset.weights[index];
      $('#' + name + '-output').value = preset.weights[index];
    });
    invalidateResults();
    $('#preset-status').textContent = `הקצב שנבחר: ${preset.label}. אפשר לכוונן כל העדפה.`;
    notify(`העדפות ״${preset.label}״ הוחלו. לחצו על ״חישוב המערכת״ כדי לראות את השבוע.`);
  });
});

async function addManualCourse(course) {
  const previous = state.dataset;
  const previousStatus = $('#result-status').textContent;
  busy(true, 'מוסיפים קורס…');
  try {
    const data = await api.addCourse({...course, ...(previous ? {
      dataset_id:previous.id, dataset_revision:previous.revision,
    } : {})});
    clearResults();
    state.dataset = data;
    searchControls.load(data, {preserve:true});
    state.selected.add(course.course_id);
    $('#course-search').value = '';
    renderCourses();
    const source = $('#source-label');
    // A flag, not the label text, since the label may be shown translated.
    if (!previous) source.textContent = 'קורסים בהזנה ידנית';
    else if (!source.dataset.manual) source.textContent += ' · כולל קורסים ידניים';
    source.dataset.manual = 'true';
    notify(`הקורס ${course.name} נוסף ונבחר לתכנון.`);
  } finally {
    busy(false);
    if (state.dataset === previous) $('#result-status').textContent = previousStatus;
  }
}

async function loadDataset(file = null) {
  if (state.busy) return;
  if (
    file &&
    (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024 || !file.size)
  ) {
    notify("יש לבחור קובץ Excel תקין מסוג xlsx, בגודל של עד 5 MB.", true);
    return;
  }
  busy(true, "טוענים קורסים…");
  notify("");
  let loaded = false;
  try {
    const data = file ? await api.upload(file) : await api.sample();
    clearResults();
    state.dataset = data;
    searchControls.load(data);
    state.selected = new Set(data.courses.map((c) => c.id));
    renderCourses();
    $("#source-label").textContent = file
      ? file.name
      : "נתוני דוגמה · courses_sample.xlsx";
    delete $("#source-label").dataset.manual;
    loaded = true;
  } catch (error) {
    notify(error.message, true);
  } finally {
    busy(false);
    $("#result-status").textContent = state.results.length
      ? "המערכת מוכנה"
      : state.dataset
        ? "מוכנים לתכנון"
        : "יש לטעון קורסים";
    if (!state.dataset)
      $("#source-label").textContent = "לא נטען קובץ. אפשר לנסות שוב.";
    $("#course-file").value = "";
  }
  // The registration-links question waits for the calculate button, in step 2.
  if (loaded && searchControls.ready(state.selected)) await optimize();
}
$("#course-file").addEventListener("change", (event) => {
  if (event.target.files[0]) loadDataset(event.target.files[0]);
});
$("#load-sample").addEventListener("click", () => loadDataset());
const dropZone = $("#upload-zone");
for (const name of ["dragenter", "dragover"])
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    if (!state.busy) dropZone.classList.add("dragging");
  });
for (const name of ["dragleave", "drop"])
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
dropZone.addEventListener("drop", (event) => {
  if (event.dataTransfer.files[0]) loadDataset(event.dataTransfer.files[0]);
});

function preferences() {
  const result = Object.fromEntries(
    WEIGHTS.map(([name]) => [name, Number($("#" + name).value)]),
  );
  const [hours, minutes] = $("#preferred-start").value.split(":").map(Number);
  result.preferred_start = hours * 60 + minutes;
  return {...result, ...searchControls.targets()};
}
function acceptSearchResult(data) {
  state.searchResult = data;
  state.results = data.schedules || [];
  state.active = Math.min(state.active, Math.max(0, state.results.length - 1));
  $('#result-status').textContent = searchStatus(data);
  $('#alternatives-count').textContent = `${state.results.length} חלופות מדורגות`;
  if (state.results.length) {
    renderActive();
    renderAlternatives();
  } else {
    $('#empty-state h4').textContent = data.optimal ? 'לא קיימת מערכת לפי האילוצים' : 'טרם נמצאה מערכת';
    $('#empty-state p').textContent = (data.diagnostics || []).join(' ') ||
      (data.optimal ? 'בדקו את זמני ההגעה וקשרי הרישום. האילוצים לא שונו.' : 'החיפוש טרם הוכיח שאין פתרון.');
  }
  $('#continue-search').hidden = data.status === 'running' || data.optimal;
}

async function optimize(revealResults = false) {
  if (state.busy || !state.dataset || !state.selected.size) return;
  const prefs = preferences();
  if (!WEIGHTS.some(([name]) => prefs[name] > 0)) {
    notify('לפחות העדפה אחת צריכה לקבל משקל גדול מאפס.', true); return;
  }
  if (!searchControls.ready(state.selected)) { askLinks(); return; }
  if (revealResults) plannerUX.go(3);
  clearResults();
  state.active = 0; state.visible = 3;
  busy(true);
  try {
    const limits = searchControls.limits();
    if (state.extraSeconds) limits.seconds = state.extraSeconds;
    const job = await api.startSearch({dataset_id:state.dataset.id, dataset_revision:state.dataset.revision, course_ids:[...state.selected],
      preferences:prefs, constraints:searchControls.constraints(state.selected), limits});
    state.job = job.id;
    $('#cancel-search').hidden = false;
    $('#cancel-search').disabled = false;
    for (;;) {
      const snapshot = await api.search(job.id);
      if (snapshot.error) throw new Error(snapshot.error);
      if (snapshot.result) acceptSearchResult(snapshot.result);
      if (snapshot.state !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    // The outcome is announced by #result-status beside the title, so no second notice.
    notify("");
  } catch (error) {
    // Stop server work as well when polling fails; an aborted fetch alone is insufficient.
    if (state.job) api.cancelSearch(state.job).catch(() => {});
    $('#result-status').textContent = 'החיפוש לא הושלם';
    notify(error.message, true);
  } finally {
    state.job = null;
    busy(false);
  }
}
$('#cancel-search').addEventListener('click', async () => {
  if (!state.job) return;
  $('#cancel-search').disabled = true;
  try { await api.cancelSearch(state.job); }
  catch (error) { notify(error.message, true); $('#cancel-search').disabled = false; }
});
$('#continue-search').addEventListener('click', () => {
  state.extraSeconds = Math.min(120, (state.extraSeconds || searchControls.limits().seconds) * 2);
  optimize(true);
});
for (const view of ['attendance', 'registration']) {
  $('#' + view + '-view').addEventListener('click', () => {
    state.view = view;
    if (state.results.length) glide(renderActive);
  });
}
$("#preferences-form").addEventListener("submit", (event) => {
  event.preventDefault();
  optimize(true);
});

function renderActive() {
  const schedule = state.results[state.active];
  $("#empty-state").hidden = true;
  $("#calendar-scroll").hidden = false;
  $("#metric-score").textContent = formatScore(schedule.score);
  $("#metric-days").textContent = schedule.metrics.study_days;
  $("#metric-free").textContent =
    `${5 - schedule.metrics.study_days} ימים פנויים בשבוע`;
  $("#metric-gaps").textContent = duration(schedule.metrics.total_gaps);
  $("#calendar-title").textContent =
    state.active === 0
      ? "המערכת המומלצת שלך"
      : `המערכת שלך · חלופה ${state.active + 1}`;
  $("#calendar-caption").textContent =
    `יום ארוך ביותר: ${duration(schedule.metrics.max_daily_minutes)}`;
  const shownSessions = state.view === 'registration' ? schedule.registration_sessions : schedule.sessions;
  renderCalendar(shownSessions || schedule.sessions);
  plannerUX.result({...schedule, sessions:shownSessions || schedule.sessions});
  $('#attendance-view').setAttribute('aria-pressed', String(state.view === 'attendance'));
  $('#registration-view').setAttribute('aria-pressed', String(state.view === 'registration'));
  const changed = schedule.changes || [];
  const labels = new Map([...(schedule.registration_sessions || []), ...schedule.sessions]
    .map(s => [s.session_id, `${s.name}, ${TYPES[s.type]} ${s.group_id}, ${DAYS[s.day - 1]} ${formatTime(s.meeting_start ?? s.start)}`]));
  const changes = changed.map(c => c.replacement ? `החלפה: ${labels.get(c.source)} ← ${labels.get(c.replacement)}` : `ויתור על הגעה: ${labels.get(c.source)}`);
  $('#result-explanation').textContent = [
    'הציון מחושב לפי היעדים והמשקלים, והמדדים מתייחסים להגעה בפועל.',
    state.searchResult?.optimal ? 'החלופות המובילות אומתו.' : 'אלה תוצאות ביניים; ייתכן שקיימות חלופות טובות יותר.',
    state.searchResult?.mode === 'approved_overlaps' ? 'נעשה שימוש בחפיפות רישום עם תוכנית הגעה תקינה. התכנון אינו אישור רישום מהמכללה.' : '',
    ...changes,
  ].filter(Boolean).join(' ');
  visualEffects.result(schedule.score);
  syncPlanner();
}
// A meeting keeps one name across alternatives (course, type and its order in the week),
// so a view transition can glide it from its old slot to its new one.
const meetingNames = new Map();
function meetingName(key) {
  if (!meetingNames.has(key)) meetingNames.set(key, `meeting-${meetingNames.size}`);
  return meetingNames.get(key);
}
function nameMeetings(sessions) {
  const seen = new Map();
  return [...sessions].sort((a, b) => a.day - b.day || a.start - b.start).map((session) => {
    const key = `${session.course_id}|${session.type}`;
    const order = seen.get(key) || 0;
    seen.set(key, order + 1);
    return { ...session, transition: meetingName(`${key}|${order}`) };
  });
}
/** Runs a board update inside a view transition when the browser and motion settings allow. */
function glide(update) {
  const root = document.documentElement;
  if (!document.startViewTransition || root.dataset.motion === "off") { update(); return; }
  root.classList.add("is-gliding");
  const transition = document.startViewTransition(update);
  transition.finished.catch(() => {}).finally(() => root.classList.remove("is-gliding"));
}
function renderCalendar(sessions) {
  sessions = nameMeetings(sessions);
  const calendar = $("#calendar");
  calendar.replaceChildren();
  const start = Math.min(
    8 * 60,
    Math.floor(Math.min(...sessions.map((s) => s.start)) / 60) * 60,
  );
  const end = Math.max(
    17 * 60,
    Math.ceil(Math.max(...sessions.map((s) => s.end)) / 60) * 60,
  );
  const pixelsPerMinute = 1;
  const head = element("div", "calendar-head");
  head.append(element("span"));
  const english = ["SUN", "MON", "TUE", "WED", "THU"];
  DAYS.forEach((day, index) => {
    const node = element("div", "day-head", day);
    node.append(element("small", "", english[index]));
    head.append(node);
  });
  const body = element("div", "calendar-body");
  body.style.height = `${(end - start) * pixelsPerMinute + 12}px`;
  body.style.setProperty("--hour-height", "60px");
  const rail = element("div", "time-rail");
  for (let minute = start; minute <= end; minute += 60) {
    const label = element("span", "hour-label", formatTime(minute));
    label.style.top = `${minute - start}px`;
    rail.append(label);
  }
  body.append(rail);
  DAYS.forEach((_, index) => {
    const column = element("div", "day-column");
    const daily = sessions.filter((s) => s.day === index + 1);
    if (!daily.length) {
      const free = element("div", "free-day");
      free.append(element("span", "", "—"), element("p", "", "זמן לעצמך"));
      column.append(free);
    }
    for (const session of layoutSessions(daily)) {
      const node = element("button", "session");
      node.type = "button";
      const courseIndex = state.dataset.courses.findIndex(
        (c) => c.id === session.course_id,
      );
      colorize(node, courseIndex);
      node.style.top = `${(session.start - start) * pixelsPerMinute}px`;
      node.style.height = `${Math.max(1, (session.end - session.start) * pixelsPerMinute - 3)}px`;
      node.style.width = `calc(${100 / session.lanes}% - 6px)`;
      node.style.insetInlineStart = `calc(${(session.lane * 100) / session.lanes}% + 3px)`;
      node.style.viewTransitionName = session.transition;
      if (session.end - session.start <= 60) node.classList.add("compact");
      const time = `${formatTime(session.start)}–${formatTime(session.end)}`;
      node.setAttribute(
        "aria-label",
        `${session.name}, ${TYPES[session.type]}, יום ${DAYS[index]}, ${time}, ${session.mandatory ? "חובה" : "רשות"}. לחצו לפרטים`,
      );
      node.title = `${session.name} · ${time} · ${session.lecturer}`;
      node.append(
        element("span", "session-time", time),
        element("bdi", "session-name", session.name),
        element(
          "span",
          "session-type",
          `${TYPES[session.type]} · ${session.mandatory ? "חובה" : "רשות"}`,
        ),
      );
      node.addEventListener("click", () => showSession(session));
      column.append(node);
    }
    body.append(column);
  });
  calendar.append(head, body);
}
function renderAlternatives() {
  const target = $("#alternatives");
  target.replaceChildren();
  state.results.slice(0, state.visible).forEach((schedule, index) => {
    const button = element("button", "alternative");
    button.type = "button";
    button.setAttribute("aria-pressed", String(index === state.active));
    const top = element("span", "alternative-top");
    top.append(
      element("span", "", `חלופה ${String(index + 1).padStart(2, "0")}`),
      element(
        "strong",
        "alternative-score",
        formatScore(schedule.score),
      ),
    );
    const week = element('span', 'alternative-week');
    week.setAttribute('aria-hidden', 'true');
    const load = weekLoad(schedule.sessions);
    const peak = Math.max(60, ...load);
    load.forEach((minutes, day) => {
      const column = element('span', 'week-column');
      const bar = element('i');
      bar.style.setProperty('--load', `${Math.max(4, minutes / peak * 100)}%`);
      if (!minutes) bar.className = 'week-free';
      column.title = `${DAYS[day]} · ${duration(minutes)} לימודים`;
      column.append(bar, element('small', '', ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳'][day]));
      week.append(column);
    });
    button.append(
      top,
      week,
      element(
        "span",
        "alternative-meta",
        `${schedule.metrics.study_days} ימי לימוד · ${duration(schedule.metrics.total_gaps)} חלונות`,
      ),
      element(
        "span",
        "alternative-tag",
        index === state.active
          ? "מוצגת בלוח ✓"
          : index === 0
            ? "ההתאמה המובילה"
            : "הצגה בלוח ←",
      ),
    );
    // The board title announces the change, so no notice box shifts the page mid-glide.
    button.addEventListener("click", () => glide(() => {
      state.active = index;
      renderActive();
      renderAlternatives();
      $("#alternatives").children[index]?.focus({ preventScroll: true });
    }));
    target.append(button);
  });
  $("#more-results").hidden = state.visible >= state.results.length;
  $('#more-results').disabled = state.dirty;
}
$("#more-results").addEventListener("click", () => {
  const previous = state.visible;
  state.visible += 6;
  renderAlternatives();
  $("#alternatives").children[previous]?.focus({ preventScroll: true });
});
function dialog(title, children) {
  const opener = document.activeElement;
  $("#dialog-title").textContent = title;
  $("#dialog-content").replaceChildren(...children);
  $("#detail-dialog").showModal();
  $('#detail-dialog').addEventListener('close', () => { if(opener?.isConnected) opener.focus({preventScroll:true}); }, {once:true});
}
function showSession(session) {
  const list = element("dl");
  const pairs = [
    ["קורס", session.course_id],
    ["סוג מפגש", TYPES[session.type]],
    ["קבוצה", session.group_id],
    ["מרצה", session.lecturer],
    ["יום", DAYS[session.day - 1]],
    ["שעות", `${formatTime(session.start)}–${formatTime(session.end)}`],
    ["נוכחות", session.mandatory ? "חובה" : "רשות"],
    [
      "עדיפות",
      { low: "נמוכה", medium: "בינונית", high: "גבוהה" }[session.priority],
    ],
  ];
  for (const [key, value] of pairs)
    list.append(element("dt", "", key), element("dd", "", value));
  dialog(session.name, [list]);
}
$("#help-button").addEventListener("click", () =>
  dialog("שבוע טוב מתחיל בבחירה.", [
    element(
      "p",
      "",
      "טוענים קובץ Excel ובוחרים את הקורסים שרוצים ללמוד. אפשר להתחיל עם קובץ הדוגמה המצורף.",
    ),
    element(
      "p",
      "",
      "קובעים שעת התחלה רצויה ואת החשיבות של כל העדפה. אלו העדפות לדירוג, ולא אילוצים מחייבים.",
    ),
    element(
      "p",
      "",
      "המנוע בוחר קבוצה אחת לכל רכיב קורס ומדרג את המערכות האפשריות. בוחרים חלופה כדי לראות אותה בלוח.",
    ),
    element(
      "p",
      "",
      "מתכננים הגעה לכל המפגשים. חפיפות רישום מותרות רק כשוויתור מפורש או החלפה מאושרת מאפשרים הגעה ללא התנגשויות. לחיצה על מפגש מציגה את פרטיו.",
    ),
    element(
      "p",
      "",
      "הקבצים מעובדים בזיכרון השרת המקומי. רענון העמוד מחזיר לנתוני הדוגמה; בחירת ערכת הצבע נשמרת בדפדפן.",
    ),
  ]),
);
$("#close-dialog").addEventListener("click", () => $("#detail-dialog").close());
$("#detail-dialog").addEventListener("click", (event) => {
  if (
    event.target === $("#detail-dialog") &&
    (event.offsetX < 0 ||
      event.offsetY < 0 ||
      event.offsetX > event.target.clientWidth ||
      event.offsetY > event.target.clientHeight)
  )
    event.target.close();
});
$("#export").addEventListener("click", () => {
  const schedule = state.results[state.active];
  if (!schedule || state.dirty || state.busy) return;
  const url = URL.createObjectURL(
    new Blob([toCSV({...schedule, sessions:state.view === 'registration' ? schedule.registration_sessions : schedule.sessions}, document.documentElement.lang === 'en' ? 'en' : 'he')], { type: "text/csv;charset=utf-8;" }),
  );
  const link = element("a");
  link.href = url;
  link.download = `carpedio-${state.view}-${state.active + 1}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify("קובץ המערכת הוכן להורדה.");
});
loadDataset();
