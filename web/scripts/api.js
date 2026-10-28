/** Data access and pure presentation calculations. No DOM dependencies. */
export const WEIGHTS = [
  ["study_days_weight", "פחות ימי לימוד", 100],
  ["gaps_weight", "פחות חלונות", 70],
  ["start_time_weight", "התחלה מאוחרת", 40],
  ["priority_weight", "עדיפות לקבוצות", 60],
  ["daily_span_weight", "ימים קצרים יותר", 50],
];
export const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];
export const TYPES = { lecture: "הרצאה", tutorial: "תרגול", lab: "מעבדה" };
/** Never round an imperfect result up to the perfect-score celebration threshold. */
export function formatScore(score) {
  if (!Number.isFinite(score) || score < 0 || score > 1) return '—';
  if (score === 1) return '100%';
  return `${Math.min(99.9, Math.round(score * 1000) / 10)}%`;
}
/** Occupied minutes per day, counting overlapping optional sessions only once. */
export function weekLoad(sessions) {
  return DAYS.map((_, index) => {
    let end = 0;
    return sessions.filter(session => session.day === index + 1)
      .sort((a, b) => a.start - b.start)
      .reduce((total, session) => {
        const occupied = Math.max(0, session.end - Math.max(end, session.start));
        end = Math.max(end, session.end);
        return total + occupied;
      }, 0);
  });
}
export const formatTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export function duration(minutes) {
  if (minutes < 60) return `${minutes} דק׳`;
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return rest ? `${hours} ש׳ ${rest} דק׳` : `${hours} ש׳`;
}

async function request(path, options = {}, format = 'json') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "הבקשה לא הושלמה. נסו שוב.");
    }
    return format === 'blob' ? await response.blob() : await response.json();
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error("הבקשה נמשכה זמן רב. נסו שוב או השתמשו בקובץ קטן יותר.");
    if (error instanceof TypeError || error instanceof SyntaxError) {
      throw new Error(
        "לא ניתן להתחבר לשרת. הפעילו python web_server.py ופתחו את הכתובת המקומית.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export const api = {
  importGrades: file => request('/api/grades/import', {method:'POST', headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}, body:file}),
  exportGrades: payload => request('/api/grades/export', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}, 'blob'),
  sample: () => request("/api/sample"),
  courseOptions: () => request('/api/course-options'),
  addCourse: (payload) => request('/api/courses/manual', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
  }),
  upload: (file) =>
    request("/api/courses", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      body: file,
    }),
  startSearch: (payload) => request('/api/jobs', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
  }),
  search: (id) => request(`/api/jobs/${encodeURIComponent(id)}`),
  cancelSearch: (id) => request(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}',
  }),
};

/** Split connected overlap clusters into lanes, including optional sessions. */
export function layoutSessions(sessions) {
  const sorted = [...sessions].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const output = [];
  let cluster = [],
    clusterEnd = -1;
  function flush() {
    const laneEnds = [];
    for (const session of cluster) {
      let lane = laneEnds.findIndex((end) => end <= session.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = session.end;
      output.push({ ...session, lane, lanes: 0 });
    }
    for (const item of output.slice(output.length - cluster.length))
      item.lanes = laneEnds.length;
    cluster = [];
  }
  for (const session of sorted) {
    if (cluster.length && session.start >= clusterEnd) flush();
    if (!cluster.length) clusterEnd = session.end;
    cluster.push(session);
    clusterEnd = Math.max(clusterEnd, session.end);
  }
  flush();
  return output;
}

/** Quote RFC 4180 cells and neutralize spreadsheet formulas in imported text. */
export function toCSV(schedule, locale = 'he') {
  const english = locale === 'en';
  const quote = (value) => {
    let text = String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [
    english ? ['Course', 'Course ID', 'Type', 'Group', 'Lecturer', 'Day', 'Start', 'End', 'Required'] : [
      "קורס",
      "מספר קורס",
      "סוג",
      "קבוצה",
      "מרצה",
      "יום",
      "התחלה",
      "סיום",
      "חובה",
    ],
  ];
  for (const s of schedule.sessions)
    rows.push([
      s.name,
      s.course_id,
      english ? ({lecture:'Lecture',tutorial:'Tutorial',lab:'Lab'}[s.type] || s.type) : TYPES[s.type],
      s.group_id,
      s.lecturer,
      english ? ['Sunday','Monday','Tuesday','Wednesday','Thursday'][s.day - 1] : DAYS[s.day - 1],
      formatTime(s.start),
      formatTime(s.end),
      english ? (s.mandatory ? 'Yes' : 'No') : (s.mandatory ? "כן" : "לא"),
    ]);
  return "\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n");
}
