/**
 * Marketing Model Prototype
 * Funnel: Lead (clicked link) -> Attended Quiz -> Qualified & Booked Appointment
 * Two views, switched from the top bar:
 *   - Admin: controls the whole marketing team and every lead.
 *   - Marketing Portal: one member's own leads and stats only.
 *     Other members' names / contact details are never shown here,
 *     only anonymous team figures (rank, team average).
 * ZERO dummy values. Starts clean. Data lives in this browser's localStorage.
 */

const STORAGE_KEY = 'clean_marketing_entries_v2';   // leads (same key as before, so old entries survive)
const MEMBERS_KEY = 'clean_marketing_members_v1';   // marketing team members
const UI_KEY = 'clean_marketing_ui_v1';             // last view / signed-in member
const DEMO_FLAG = 'clean_marketing_demo_seeded_v6'; // set once demo values are loaded (v6: multiple forms)
const TICKETS_KEY = 'clean_marketing_tickets_v1';         // help requests raised from the Marketing Portal
const TICKETS_SEED_FLAG = 'clean_marketing_tickets_seeded_v1';

// All leads come from LinkedIn (single platform), so there is no source / channel tracking.

// FORMS (quizzes). Each lead clicked the link of ONE form and took that quiz.
// DEMO forms — replace with the real forms once they are final.
// `answer` is the index of the correct option; `passMark` = minimum correct answers to QUALIFY.
const DAY_MS = 86400000;
const FORMS = [
  {
    id: 'FORM-WEB',
    name: 'Full Stack Web Development Quiz',
    description: 'Screening quiz for the full stack web development programme.',
    status: 'Active',
    created: new Date(Date.now() - 120 * DAY_MS).toISOString(),
    passMark: 3,
    questions: [
      { q: 'Which HTML tag is used to link an external CSS file?', options: ['<script>', '<link>', '<style>', '<a>'], answer: 1 },
      { q: 'What does SQL stand for?', options: ['Structured Query Language', 'Simple Query Logic', 'Sequential Question Language', 'Standard Quick List'], answer: 0 },
      { q: 'Which data structure follows First-In-First-Out (FIFO)?', options: ['Stack', 'Queue', 'Tree', 'Graph'], answer: 1 },
      { q: 'Which JavaScript keyword declares a value that cannot be reassigned?', options: ['var', 'let', 'const', 'static'], answer: 2 },
      { q: 'What is the time complexity of binary search on a sorted array?', options: ['O(n)', 'O(log n)', 'O(n²)', 'O(1)'], answer: 1 }
    ]
  },
  {
    id: 'FORM-DS',
    name: 'Data Science Aptitude Quiz',
    description: 'Checks basic Python, statistics and SQL for the data science track.',
    status: 'Active',
    created: new Date(Date.now() - 75 * DAY_MS).toISOString(),
    passMark: 3,
    questions: [
      { q: 'Which Python library is mainly used for data frames?', options: ['NumPy', 'Pandas', 'Matplotlib', 'Flask'], answer: 1 },
      { q: 'What does the mean of a data set measure?', options: ['How spread out it is', 'The middle value', 'The average value', 'The most frequent value'], answer: 2 },
      { q: 'Which chart best shows a trend over time?', options: ['Pie chart', 'Line chart', 'Scatter plot', 'Histogram'], answer: 1 },
      { q: 'In SQL, which clause filters rows?', options: ['ORDER BY', 'GROUP BY', 'WHERE', 'SELECT'], answer: 2 },
      { q: 'Which of these is a supervised learning task?', options: ['Clustering', 'Classification', 'Dimensionality reduction', 'Association rules'], answer: 1 }
    ]
  },
  {
    id: 'FORM-JAVA',
    name: 'Java Programming Basics',
    description: 'Entry test for the Java batch (closed — no longer shared).',
    status: 'Closed',
    created: new Date(Date.now() - 95 * DAY_MS).toISOString(),
    closed: new Date(Date.now() - 20 * DAY_MS).toISOString(),
    passMark: 4,
    questions: [
      { q: 'Which keyword creates an object in Java?', options: ['class', 'new', 'this', 'create'], answer: 1 },
      { q: 'Which method is the entry point of a Java program?', options: ['start()', 'run()', 'main()', 'init()'], answer: 2 },
      { q: 'Which of these is NOT a primitive type?', options: ['int', 'boolean', 'String', 'char'], answer: 2 },
      { q: 'What is the size of an int in Java?', options: ['8 bits', '16 bits', '32 bits', '64 bits'], answer: 2 },
      { q: 'Which keyword is used for inheritance?', options: ['implements', 'extends', 'inherits', 'super'], answer: 1 }
    ]
  }
];

function getFormById(id) { return FORMS.find(f => f.id === id) || null; }
// The form (quiz) a lead took; older/manual leads without one fall back to the first form
function formOf(item) { return getFormById(item.formId) || FORMS[0]; }

// Appointment statuses. "Completed" is stored, but shown as "Showed up"
const STATUS_LABEL = { Scheduled: 'Scheduled', Completed: 'Showed up', 'No-show': 'No-show', Cancelled: 'Cancelled' };
function statusLabel(status) { return STATUS_LABEL[status] || status; }

let entries = [];
let members = [];
let tickets = [];          // help requests
const searchState = {};    // search text per tab (not saved)
let ui = { view: 'admin', memberId: '', modeAdmin: 'daily', modePortal: 'daily', adminTab: 'dashboard', formView: null, formResp: 'all', formPeriod: 'all' };

// Left sidebar tabs in Admin
const ADMIN_TABS = {
  summary:   { title: 'Summary',         sub: 'Pick a day, week or month to see leads, quiz results, show-ups and cancellations.' },
  dashboard: { title: 'Admin Dashboard', sub: 'Leads → Attended Quiz → Qualified & Booked, across the whole team.' },
  team:      { title: 'Marketing Team',  sub: 'Add, edit and manage members, and track each one against their target.' },
  help:      { title: 'Help Requests',   sub: 'Problems raised by marketing members from their portal. Reply and update the status here.' },
  forms:     { title: 'Forms',           sub: 'How each form (quiz) is doing: attempts, qualified, bookings, question results and every response.' },
  leads:     { title: 'All Leads',       sub: 'Every lead with its stage and owner. Click a name to see their quiz submission.' }
};

let entryModalContext = 'admin'; // 'admin' | 'portal'
let editingMemberId = null;

/* ---------------- Storage ---------------- */

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function loadData() {
  // Clear any old dummy datasets from previous runs
  localStorage.removeItem('marketing_prototype_leads_v1');
  localStorage.removeItem('marketing_prototype_links_v1');
  localStorage.removeItem('marketing_prototype_members_v1');

  entries = safeParse(localStorage.getItem(STORAGE_KEY), []);
  members = safeParse(localStorage.getItem(MEMBERS_KEY), []);
  ui = Object.assign(ui, safeParse(localStorage.getItem(UI_KEY), {}));
  // No switch button: Admin opens index.html, members open portal.html (= index.html#portal)
  ui.view = location.hash === '#portal' ? 'portal' : 'admin';

  tickets = safeParse(localStorage.getItem(TICKETS_KEY), []);

  // First run: load demo values so filters and breakdowns can be shown working
  if (!localStorage.getItem(DEMO_FLAG)) {
    seedDemoData();
    saveMembers();
    saveEntries();
    localStorage.setItem(DEMO_FLAG, '1');
  }
  if (!localStorage.getItem(TICKETS_SEED_FLAG)) {
    seedTickets();
    saveTickets();
    localStorage.setItem(TICKETS_SEED_FLAG, '1');
  }

  // Older entries had no owner: keep them as "Unassigned"; map old stage names
  entries.forEach(e => { if (e.memberId === undefined) e.memberId = ''; if (!e.formId) e.formId = FORMS[0].id; migrateStage(e); });
}

/* ---------------- Demo values ---------------- */

// Builds a fixed demo team + ~180 leads spread over the last 90 days.
// A seeded random generator keeps the demo identical on every machine.
function seedDemoData() {
  let seed = 20261021;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const now = new Date();
  const daysAgoIso = (days, hour) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hour, Math.floor(rand() * 60), 0, 0);
    return d.toISOString();
  };

  members = [
    { id: 'MEM-DEMO1', name: 'Priya Sharma',  email: 'priya.sharma@demo.in',  phone: '98480 11223', target: 25, active: true,  joined: daysAgoIso(120, 10) },
    { id: 'MEM-DEMO2', name: 'Rahul Verma',   email: 'rahul.verma@demo.in',   phone: '99000 44556', target: 20, active: true,  joined: daysAgoIso(110, 10) },
    { id: 'MEM-DEMO3', name: 'Ananya Iyer',   email: 'ananya.iyer@demo.in',   phone: '97010 77889', target: 20, active: true,  joined: daysAgoIso(95, 10) },
    { id: 'MEM-DEMO4', name: 'Karthik Reddy', email: 'karthik.reddy@demo.in', phone: '96660 22334', target: 15, active: true,  joined: daysAgoIso(70, 10) },
    { id: 'MEM-DEMO5', name: 'Sneha Patel',   email: 'sneha.patel@demo.in',   phone: '95500 66778', target: 10, active: false, joined: daysAgoIso(100, 10) }
  ];

  // How likely each member's leads move down the funnel
  const skill = { 'MEM-DEMO1': 0.75, 'MEM-DEMO2': 0.6, 'MEM-DEMO3': 0.68, 'MEM-DEMO4': 0.5, 'MEM-DEMO5': 0.45, '': 0.35 };
  const owners = ['MEM-DEMO1', 'MEM-DEMO1', 'MEM-DEMO1', 'MEM-DEMO2', 'MEM-DEMO2', 'MEM-DEMO2',
                  'MEM-DEMO3', 'MEM-DEMO3', 'MEM-DEMO4', 'MEM-DEMO4', 'MEM-DEMO5', ''];

  const first = ['Aarav', 'Diya', 'Vihaan', 'Ishita', 'Arjun', 'Meera', 'Rohan', 'Kavya', 'Aditya', 'Sanya',
                 'Nikhil', 'Pooja', 'Siddharth', 'Riya', 'Varun', 'Neha', 'Harsha', 'Lakshmi', 'Manoj', 'Divya',
                 'Akash', 'Tanvi', 'Suresh', 'Bhavana', 'Rakesh', 'Swathi', 'Yash', 'Nandini', 'Gautam', 'Keerthi'];
  const last = ['Kumar', 'Rao', 'Gupta', 'Nair', 'Singh', 'Joshi', 'Menon', 'Das', 'Pillai', 'Chowdary',
                'Mehta', 'Kulkarni', 'Bhat', 'Naidu', 'Agarwal', 'Shetty', 'Mishra', 'Varma'];

  entries = [];
  const TOTAL = 180;
  for (let i = 0; i < TOTAL; i++) {
    let owner = pick(owners);
    // Recent days get more leads; first few are forced to "today" so the Today filter has data
    let days = i < 6 ? 0 : Math.floor(Math.pow(rand(), 1.4) * 90);
    // Inactive member only has older leads
    if (owner === 'MEM-DEMO5' && days < 40) days += 40;

    // Did they take the quiz after clicking the link? (booking is decided below from the score)
    const stage = rand() < skill[owner] ? 'attended' : 'came';

    // Which form's link they clicked: the Java form was only shared between 95 and 20 days ago
    const formId = days >= 20 && days <= 95 && rand() < 0.3 ? 'FORM-JAVA'
      : (rand() < 0.6 ? 'FORM-WEB' : (days <= 75 ? 'FORM-DS' : 'FORM-WEB'));

    entries.push({
      id: 'ENT-DEMO' + String(i + 1).padStart(3, '0'),
      name: `${pick(first)} ${pick(last)}`,
      formId,
      stage,
      date: daysAgoIso(days, 9 + Math.floor(rand() * 4)),
      memberId: owner
    });
  }
  // Quiz submissions: the quiz form (Name, Contact number, Email address) + answers
  const domains = ['gmail.com', 'gmail.com', 'yahoo.com', 'outlook.com'];
  entries.forEach(e => {
    if (e.stage === 'came') return;
    const [fn, ln] = e.name.toLowerCase().split(' ');
    e.form = {
      name: e.name,
      contact: `${pick(['9', '8', '7', '6'])}${1000 + Math.floor(rand() * 9000)} ${10000 + Math.floor(rand() * 90000)}`,
      email: `${fn}.${ln}${10 + Math.floor(rand() * 90)}@${pick(domains)}`,
      submittedAt: e.date
    };
    // Each form has its own difficulty, and some questions are harder than others
    const difficulty = { 'FORM-WEB': 0, 'FORM-DS': -0.06, 'FORM-JAVA': 0.02 }[e.formId] || 0;
    const pCorrect = 0.4 + skill[e.memberId] * 0.45 + difficulty;
    e.quiz = {
      submittedAt: new Date(new Date(e.date).getTime() + (10 + Math.floor(rand() * 50)) * 60000).toISOString(),
      answers: formOf(e).questions.map((q, qi) => rand() < pCorrect - (qi === 4 ? 0.2 : qi === 1 ? 0.1 : 0)
        ? q.answer : pick([0, 1, 2, 3].filter(x => x !== q.answer)))
    };
  });

  // Appointments: only people who QUALIFIED can book; most of them do
  const slots = ['10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '16:00', '16:30', '17:00', '17:30'];
  const modes = ['Online', 'Online', 'In-person', 'Phone'];
  const notes = ['', '', '', 'Wants weekend batch', 'Asked about fees', 'Prefers evening calls', 'Referred by a friend', 'Needs EMI details'];
  entries.forEach(e => {
    if (!isQualified(e) || rand() >= 0.75) return;
    const d = new Date(e.date);
    d.setDate(d.getDate() + 1 + Math.floor(rand() * 7));
    const [hh, mm] = pick(slots).split(':').map(Number);
    d.setHours(hh, mm, 0, 0);
    // Past: most showed up, some no-shows, some cancelled. Future: mostly scheduled, a few cancelled
    const r2 = rand();
    let status;
    if (d < now) status = r2 < 0.7 ? 'Completed' : r2 < 0.85 ? 'No-show' : 'Cancelled';
    else status = r2 < 0.85 ? 'Scheduled' : 'Cancelled';
    e.appointment = {
      date: toDateInput(d),
      time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      mode: pick(modes),
      status,
      notes: pick(notes)
    };
    syncStage(e);
  });

  entries.sort((a, b) => b.date.localeCompare(a.date));
}

/* ---------------- Funnel stages ----------------
   came     = 1. Lead (clicked the link)
   attended = 2. Attended the quiz (the form IS the quiz)
   booked   = 3. Qualified the quiz AND booked an appointment
*/

// Did they pass? null = no answers recorded (manually added lead), so we can't tell
function isQualified(item) {
  if (!item.quiz) return item.stage === 'came' ? false : null;
  const s = quizScore(item);
  return s.correct >= formOf(item).passMark;
}

// Stage 3 follows the appointment: an active (non-cancelled) booking = booked
function syncStage(item) {
  const hasBooking = item.appointment && item.appointment.status !== 'Cancelled';
  if (hasBooking) item.stage = 'booked';
  else if (item.stage === 'booked') item.stage = 'attended';
}

// Older saved data used came / form_filled / quiz_attended
function migrateStage(item) {
  if (item.stage === 'form_filled' || item.stage === 'quiz_attended') item.stage = 'attended';
  if (item.stage === 'attended' || item.stage === 'booked') syncStage(item);
}

// Local yyyy-mm-dd (for <input type="date">)
function toDateInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function saveTickets() { localStorage.setItem(TICKETS_KEY, JSON.stringify(tickets)); }

// Demo help requests (only added once, and only for the demo members)
function seedTickets() {
  const ago = (days, hours = 0) => new Date(Date.now() - days * DAY_MS - hours * 3600000).toISOString();
  tickets = [
    { id: 'HLP-1001', memberId: 'MEM-DEMO2', category: 'Leads', priority: 'High', status: 'Open',
      subject: 'Two of my LinkedIn leads are missing',
      description: 'I shared the quiz link with Varun and Neha yesterday. Both say they filled it, but I can\'t see them under My Leads.',
      createdAt: ago(0, 3), updatedAt: ago(0, 3), replies: [] },
    { id: 'HLP-1002', memberId: 'MEM-DEMO1', category: 'Appointments', priority: 'Medium', status: 'In Progress',
      subject: 'Need to reschedule an appointment',
      description: 'Aditya Kumar asked to move his appointment to next week. How do I change the date from my side?',
      createdAt: ago(1, 5), updatedAt: ago(0, 20),
      replies: [{ by: 'admin', text: 'Thanks Priya, I\'m checking this. For now I can move it from the admin side — send me the new date.', at: ago(0, 20) }] },
    { id: 'HLP-1003', memberId: 'MEM-DEMO3', category: 'Forms & Quiz', priority: 'Medium', status: 'Open',
      subject: 'Question 2 on the Data Science quiz is confusing',
      description: 'Many people are choosing "How spread out it is" for the mean question. Can we reword it?',
      createdAt: ago(2, 2), updatedAt: ago(2, 2), replies: [] },
    { id: 'HLP-1004', memberId: 'MEM-DEMO4', category: 'Targets', priority: 'Low', status: 'Resolved',
      subject: 'Monthly target looks wrong',
      description: 'My target shows 15 but my manager told me it is 12 this month.',
      createdAt: ago(6), updatedAt: ago(5),
      replies: [{ by: 'admin', text: 'You are right — updated your target. Please refresh.', at: ago(5) }] },
    { id: 'HLP-1005', memberId: 'MEM-DEMO1', category: 'Login / Access', priority: 'High', status: 'Resolved',
      subject: 'Portal not loading on my phone',
      description: 'The portal page stays blank on my phone browser.',
      createdAt: ago(10), updatedAt: ago(9),
      replies: [{ by: 'admin', text: 'Please update your browser and try again. Let us know if it still happens.', at: ago(9, 4) },
                { by: 'member', text: 'Works now, thank you!', at: ago(9) }] },
    { id: 'HLP-1006', memberId: 'MEM-DEMO2', category: 'Other', priority: 'Low', status: 'In Progress',
      subject: 'Can I get a list of qualified leads?',
      description: 'Is there a way to download my qualified leads for follow-up calls?',
      createdAt: ago(3, 6), updatedAt: ago(2),
      replies: [{ by: 'admin', text: 'Good idea — we are adding an export for members.', at: ago(2) }] }
  ];
}

function saveEntries() { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
function saveMembers() { localStorage.setItem(MEMBERS_KEY, JSON.stringify(members)); }
function saveUi() { localStorage.setItem(UI_KEY, JSON.stringify(ui)); }

/* ---------------- Helpers ---------------- */

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

function getMember(id) { return members.find(m => m.id === id) || null; }
function activeMembers() { return members.filter(m => m.active); }

// Case-insensitive search across several fields
function matchesSearch(q, ...fields) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return !needle || fields.some(f => String(f == null ? '' : f).toLowerCase().includes(needle));
}
function leadMatches(q, e) {
  return matchesSearch(q, e.name, e.id, e.form && e.form.email, e.form && e.form.contact, formOf(e).name,
    (getMember(e.memberId) || {}).name);
}

function pct(part, whole) { return whole > 0 ? ((part / whole) * 100).toFixed(1) : '0.0'; }

function funnel(list) {
  return {
    came: list.length,                                                         // 1. leads (clicked link)
    attended: list.filter(x => x.stage === 'attended' || x.stage === 'booked').length, // 2. attended quiz
    booked: list.filter(x => x.stage === 'booked').length                       // 3. qualified & booked
  };
}

function isThisMonth(iso) {
  const d = new Date(iso), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/* ---------------- Formatters ---------------- */

function getWeekLabel(dateObj) {
  const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - 3);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);

  // Week number inside the month the week starts in (Monday): days 1–7 = Week 1, 8–14 = Week 2, ...
  const weekOfMonth = Math.ceil(mon.getUTCDate() / 7);
  const monthName = mon.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

  const sameYear = mon.getUTCFullYear() === sun.getUTCFullYear();
  const mStr = mon.toLocaleDateString('en-US', sameYear
    ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const sStr = sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `Week ${weekOfMonth} of ${monthName} (${mStr} – ${sStr})`;
}

function getMonthLabel(dateObj) {
  return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------------- Filtering & Aggregation ---------------- */

function filterList(list, timeRange) {
  const now = new Date();
  return list.filter(item => {

    const itemDate = new Date(item.date);
    if (timeRange === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      if (item.date.split('T')[0] !== todayStr) return false;
    } else if (timeRange === '7days') {
      if ((now - itemDate) / 86400000 > 7) return false;
    } else if (timeRange === '30days') {
      if ((now - itemDate) / 86400000 > 30) return false;
    }
    return true;
  });
}

function aggregateEntries(filteredList, mode) {
  const groups = {};

  filteredList.forEach(item => {
    const d = new Date(item.date);
    let key, sortKey, displayLabel;

    if (mode === 'daily') {
      key = item.date.split('T')[0];
      sortKey = key;
      displayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } else if (mode === 'weekly') {
      displayLabel = getWeekLabel(d);
      const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = dUtc.getUTCDay() || 7;
      dUtc.setUTCDate(dUtc.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(dUtc.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((dUtc - yearStart) / 86400000) + 1) / 7);
      sortKey = `${dUtc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      key = sortKey;
    } else {
      displayLabel = getMonthLabel(d);
      sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      key = sortKey;
    }

    if (!groups[key]) {
      groups[key] = { key, sortKey, label: displayLabel, came: 0, attended: 0, booked: 0 };
    }
    groups[key].came += 1;
    if (item.stage === 'attended' || item.stage === 'booked') groups[key].attended += 1;
    if (item.stage === 'booked') groups[key].booked += 1;
  });

  return Object.values(groups).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

/* ---------------- Shared render pieces ---------------- */

function emptyRow(cols, icon, title, hint) {
  return `<tr><td colspan="${cols}" class="empty-box"><span>${icon}</span>${title}<br><small>${hint}</small></td></tr>`;
}

function stageBadge(stage) {
  if (stage === 'came') return '<span class="badge came">1. Lead (Clicked)</span>';
  if (stage === 'attended') return '<span class="badge form">2. Attended Quiz</span>';
  return '<span class="badge quiz">&#10003; Qualified &amp; Booked</span>';
}

function nextActionButton(item) {
  if (item.stage === 'came') {
    return `<button class="btn btn-sm btn-outline" onclick="advanceStage('${item.id}', 'attended')">Mark Quiz Attended &rarr;</button>`;
  }
  if (item.stage === 'attended') {
    if (isQualified(item) === false) return '<span class="fail-label">Not qualified</span>';
    return `<button class="btn btn-sm btn-primary" onclick="openApptModal('${item.id}')">Book Appointment &rarr;</button>`;
  }
  return '<span class="done-label">Booked &#10003;</span>';
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function quizScore(item) {
  if (!item.quiz) return null;
  const qs = formOf(item).questions;
  const correct = item.quiz.answers.filter((a, i) => qs[i] && a === qs[i].answer).length;
  return { correct, total: qs.length, pct: Math.round((correct / qs.length) * 100) };
}

function answersSummaryText(item) {
  const s = quizScore(item);
  return s ? `${s.correct}/${s.total} correct (${s.pct}%) · ${s.correct >= formOf(item).passMark ? 'Qualified' : 'Not qualified'}` : 'Quiz not attempted';
}

/* ---------------- CSV export ---------------- */

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet apps treating text as a formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// form = a single form -> one column per question; no form (mixed list) -> answers in one column
function responseCsvRows(list, form = null) {
  const header = ['Timestamp', 'Name', 'Email', 'Contact', 'Form', 'Stage', 'Routed To',
    'Quiz Submitted', 'Quiz Result',
    ...(form ? form.questions.map((q, i) => `Q${i + 1}: ${q.q}`) : ['Answers']),
    'Appointment Date', 'Appointment Time', 'Appointment Mode', 'Appointment Status'];
  const stageText = { came: 'Lead (Clicked)', attended: 'Attended Quiz', booked: 'Qualified & Booked' };
  const answerText = (item, q, i) => {
    const pickIdx = item.quiz.answers[i];
    return `${q.options[pickIdx] ?? 'No answer'}${pickIdx === q.answer ? ' (correct)' : ' (wrong)'}`;
  };
  const rows = list.map(item => {
    const f = item.form || {};
    const owner = getMember(item.memberId);
    const a = item.appointment;
    const qs = formOf(item).questions;
    return [
      f.submittedAt ? fmtDateTime(f.submittedAt) : '', f.name || item.name, f.email || '', f.contact || '',
      formOf(item).name, stageText[item.stage], owner ? owner.name : 'Unassigned',
      item.quiz ? fmtDateTime(item.quiz.submittedAt) : '', answersSummaryText(item),
      ...(form
        ? qs.map((q, i) => item.quiz ? answerText(item, q, i) : '')
        : [item.quiz ? qs.map((q, i) => `Q${i + 1}: ${answerText(item, q, i)}`).join(' | ') : '']),
      a ? a.date : '', a ? fmtTime12(a.time) : '', a ? a.mode : '', a ? statusLabel(a.status) : ''
    ];
  });
  return [header, ...rows];
}

let lastLeadsList = [];

// Exports the leads currently shown in All Leads (respects the filters)
function exportLeadsCsv() {
  if (lastLeadsList.length === 0) { alert('No leads match the current filters.'); return; }
  downloadCsv(`leads-${toDateInput(new Date())}.csv`, responseCsvRows(lastLeadsList));
}

function exportLeadCsv(id) {
  const item = entries.find(x => x.id === id);
  if (!item) return;
  const safe = item.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  downloadCsv(`lead-${safe || item.id}.csv`, responseCsvRows([item]));
}

function fmtTime12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

// Appointment cell: date, time, mode, status, notes — or a "Book" button
function appointmentCell(item, canEdit) {
  const a = item.appointment;
  if (!a) {
    if (item.stage === 'came') return '<span class="muted">Quiz not taken yet</span>';
    if (isQualified(item) === false) return '<span class="fail-label">Not qualified</span><br><span class="muted small">Can\'t book</span>';
    return canEdit
      ? `<span class="muted">Qualified · not booked</span><br><button class="link-btn" onclick="openApptModal('${item.id}')">+ Book</button>`
      : '<span class="muted">Qualified · not booked</span>';
  }
  const day = new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const statusClass = { Scheduled: 'came', Completed: 'quiz', 'No-show': 'danger', Cancelled: 'neutral' }[a.status] || 'neutral';
  return `
    <div class="appt">
      <div class="appt-when">📅 ${day}</div>
      <div class="appt-time">🕒 ${fmtTime12(a.time)} · ${esc(a.mode)}</div>
      <div class="appt-meta">
        <span class="badge ${statusClass}">${esc(statusLabel(a.status))}</span>
        ${canEdit ? `<button class="link-btn" onclick="openApptModal('${item.id}')">Edit</button>` : ''}
      </div>
      ${a.notes ? `<div class="appt-notes">${esc(a.notes)}</div>` : ''}
    </div>`;
}

function renderBreakdown(tbodyId, titleId, list, mode, emptyHint) {
  const rows = aggregateEntries(list, mode);
  document.getElementById(titleId).textContent =
    mode === 'daily' ? 'Daily Breakdown' : mode === 'weekly' ? 'Week-wise Breakdown' : 'Month-wise Breakdown';

  const tbody = document.getElementById(tbodyId);
  if (rows.length === 0) {
    tbody.innerHTML = emptyRow(6, '📭', 'No data recorded yet.', emptyHint);
    return;
  }
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td><strong>${esc(row.label)}</strong></td>
      <td><span class="badge came">${row.came}</span></td>
      <td><span class="badge form">${row.attended}</span></td>
      <td><span class="badge quiz">${row.booked}</span></td>
      <td>${pct(row.attended, row.came)}%</td>
      <td><strong>${pct(row.booked, row.attended)}%</strong></td>
    </tr>`).join('');
}

function setMetrics(prefix, f) {
  document.getElementById(prefix + 'CountCame').textContent = f.came;
  document.getElementById(prefix + 'CountForm').textContent = f.attended;
  document.getElementById(prefix + 'CountQuiz').textContent = f.booked;
  document.getElementById(prefix + 'SubFormPct').textContent = `${pct(f.attended, f.came)}% of leads`;
  document.getElementById(prefix + 'SubQuizPct').textContent = `${pct(f.booked, f.attended)}% of quiz takers`;
}

/* ---------------- ADMIN VIEW ---------------- */

function populateAdminMemberFilter() {
  const sel = document.getElementById('aFilterMember');
  const current = sel.value || 'all';
  sel.innerHTML =
    '<option value="all">All Members</option>' +
    '<option value="unassigned">Unassigned</option>' +
    members.map(m => `<option value="${m.id}">${esc(m.name)}${m.active ? '' : ' (inactive)'}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === current) ? current : 'all';
}

function renderAdminTabs() {
  if (!ADMIN_TABS[ui.adminTab]) ui.adminTab = 'dashboard';
  const tab = ui.adminTab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#adminView [data-panel]').forEach(el => {
    el.style.display = el.dataset.panel === tab ? '' : 'none';
  });
  document.getElementById('aPageTitle').textContent = ADMIN_TABS[tab].title;
  document.getElementById('topbarTitle').textContent =
    document.querySelector(`.nav-btn[data-tab="${tab}"] .nav-text`).textContent;
  document.getElementById('aPageSub').textContent = ADMIN_TABS[tab].sub;
  // The Daily / Week-wise / Month-wise dropdown only matters for the breakdown on Dashboard
  document.getElementById('aFilterView').style.display = tab === 'dashboard' ? '' : 'none';
  // Summary has its own controls, so the shared filter bar is hidden there
  document.getElementById('aControls').style.display = tab === 'summary' ? 'none' : '';
  // Search box on every list tab (Dashboard uses the search in the top bar)
  const searchBox = document.getElementById('aSearch');
  const placeholders = { leads: 'Search name, email, phone, lead ID…', team: 'Search member name, email, phone…',
    forms: ui.formView ? 'Search responses by name, email, phone…' : 'Search forms…', help: 'Search requests, members, IDs…' };
  searchBox.style.display = placeholders[tab] ? '' : 'none';
  searchBox.placeholder = placeholders[tab] || '';
  if (document.activeElement !== searchBox) searchBox.value = searchState[tab + (tab === 'forms' && ui.formView ? ':' + ui.formView : '')] || '';
  // Date range: Forms has its own Today / Week / Month / All Time picker; Help lists every request
  document.getElementById('aFilterDateRange').style.display = (tab === 'forms' || tab === 'help') ? 'none' : '';
  document.getElementById('aFilterAppt').style.display = tab === 'leads' ? '' : 'none';
  // Form filter on Dashboard and All Leads (the Forms tab picks a form by clicking it)
  document.getElementById('aFilterForm').style.display = (tab === 'dashboard' || tab === 'leads') ? '' : 'none';
  // Filters: member filter doesn't apply to the team list; team filters only on the team tab
  const isTeam = tab === 'team';
  document.getElementById('aFilterMember').style.display = isTeam ? 'none' : '';
  document.querySelectorAll('.team-only').forEach(el => { el.style.display = isTeam ? '' : 'none'; });
  // Each add button lives only on its own tab
  document.getElementById('btnAddMember').style.display = tab === 'team' ? '' : 'none';
  document.getElementById('btnAddEntry').style.display = tab === 'leads' ? '' : 'none';
}

function searchKey() {
  return ui.adminTab + (ui.adminTab === 'forms' && ui.formView ? ':' + ui.formView : '');
}
function currentSearch() { return searchState[searchKey()] || ''; }

function populateFormSelect(sel, withAll) {
  const current = sel.value;
  sel.innerHTML = (withAll ? '<option value="all">All Forms</option>' : '') +
    FORMS.map(f => `<option value="${f.id}">${esc(f.name)}${f.status === 'Closed' ? ' (closed)' : ''}</option>`).join('');
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

function renderAdmin() {
  renderAdminTabs();
  populateAdminMemberFilter();
  populateFormSelect(document.getElementById('aFilterForm'), true);
  if (ui.adminTab === 'summary') renderSummary();

  const memberFilter = document.getElementById('aFilterMember').value;
  const range = document.getElementById('aFilterDateRange').value;

  const base = filterList(entries, range);
  const apptFilter = ui.adminTab === 'leads' ? document.getElementById('aFilterAppt').value : 'all';
  const formFilter = document.getElementById('aFilterForm').value;
  const filtered = base.filter(e => {
    if (formFilter !== 'all' && formOf(e).id !== formFilter) return false;
    if (memberFilter === 'unassigned' && getMember(e.memberId)) return false;
    if (memberFilter !== 'all' && memberFilter !== 'unassigned' && e.memberId !== memberFilter) return false;
    if (ui.adminTab === 'leads' && !leadMatches(currentSearch(), e)) return false;
    if (apptFilter === 'none') return !e.appointment;
    if (apptFilter !== 'all') return !!e.appointment && e.appointment.status === apptFilter;
    return true;
  });

  // Metrics
  const f = funnel(filtered);
  setMetrics('a', f);
  document.getElementById('aCountMembers').textContent = members.length;
  document.getElementById('aSubMembers').textContent = `${activeMembers().length} active`;
  const unassigned = base.filter(e => !getMember(e.memberId)).length;
  document.getElementById('aSubUnassigned').textContent =
    unassigned > 0 ? `${unassigned} unassigned lead${unassigned === 1 ? '' : 's'}` : 'Total visitors / clicks';

  // Sidebar counts
  document.getElementById('navCountTeam').textContent = members.length;
  document.getElementById('navCountForms').textContent = FORMS.length;
  document.getElementById('navCountLeads').textContent = filtered.length;
  document.getElementById('aLeadsCount').textContent =
    `· ${filtered.length} lead${filtered.length === 1 ? '' : 's'} match the filters`;

  lastLeadsList = filtered;

  // Forms tab uses the member + date filters (not the form / appointment filters)
  if (ui.adminTab === 'forms') {
    renderForms(entries.filter(e => memberFilter === 'all' ? true
      : memberFilter === 'unassigned' ? !getMember(e.memberId) : e.memberId === memberFilter));
  }
  if (ui.adminTab === 'help') renderHelp(memberFilter);
  updateHelpCount();

  // Team table — counts use the date filter only (all members)
  const teamBody = document.getElementById('aTeamTableBody');
  const teamBase = filterList(entries, range);
  const statusF = document.getElementById('tFilterStatus').value;
  const targetF = document.getElementById('tFilterTarget').value;
  const sortBy = document.getElementById('tSortBy').value;

  // Expected share of the target by today, e.g. day 21 of 31 → 68%
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expectedShare = now.getDate() / daysInMonth;

  const teamRows = members.map(m => {
    const mf = funnel(teamBase.filter(e => e.memberId === m.id));
    const monthCount = entries.filter(e => e.memberId === m.id && isThisMonth(e.date)).length;
    const target = Number(m.target) || 0;
    const progress = target > 0 ? monthCount / target : -1;
    const targetState = target <= 0 ? 'none' : progress >= 1 ? 'met' : progress >= expectedShare ? 'ontrack' : 'behind';
    return { m, mf, monthCount, target, progress, targetState, conv: mf.came ? mf.booked / mf.came : 0 };
  })
    .filter(r => statusF === 'all' || (statusF === 'active' ? r.m.active : !r.m.active))
    .filter(r => targetF === 'all' || r.targetState === targetF)
    .filter(r => ui.adminTab !== 'team' || matchesSearch(currentSearch(), r.m.name, r.m.email, r.m.phone, r.m.id));

  const sorters = {
    name: (a, b) => a.m.name.localeCompare(b.m.name),
    leads: (a, b) => b.mf.came - a.mf.came,
    booked: (a, b) => b.mf.booked - a.mf.booked,
    conversion: (a, b) => b.conv - a.conv,
    target: (a, b) => b.progress - a.progress
  };
  teamRows.sort(sorters[sortBy] || sorters.name);

  const stateLabel = { met: 'Target met', ontrack: 'On track', behind: 'Behind', none: '' };

  if (members.length === 0) {
    teamBody.innerHTML = emptyRow(9, '🧑‍💼', 'No marketing members yet.',
      'Click <strong>"+ Add Member"</strong> to build your team. Each member gets their own portal.');
  } else if (teamRows.length === 0) {
    teamBody.innerHTML = emptyRow(9, '🔍', 'No members match these filters.', 'Try changing the search, status or target filter.');
  } else {
    teamBody.innerHTML = teamRows.map(({ m, mf, monthCount, target, targetState }) => {
      const targetCell = target > 0
        ? `<div class="mini-progress"><div style="width:${Math.min(100, (monthCount / target) * 100)}%"></div></div>
           <small>${monthCount} / ${target}</small> <small class="target-state ${targetState}">${stateLabel[targetState]}</small>`
        : `<small class="muted">${monthCount} / no target</small>`;
      const contact = [m.email, m.phone].filter(Boolean).map(esc).join('<br>') || '<span class="muted">–</span>';

      return `
        <tr class="${m.active ? '' : 'row-inactive'}">
          <td><strong>${esc(m.name)}</strong><br><small class="muted">${m.id}</small></td>
          <td><small>${contact}</small></td>
          <td>${m.active ? '<span class="pill on">Active</span>' : '<span class="pill off">Inactive</span>'}</td>
          <td><span class="badge came">${mf.came}</span></td>
          <td><span class="badge form">${mf.attended}</span></td>
          <td><span class="badge quiz">${mf.booked}</span></td>
          <td><strong>${pct(mf.booked, mf.came)}%</strong></td>
          <td>${targetCell}</td>
          <td>
            <div class="action-row">
              <button class="btn btn-sm btn-outline" onclick="openMemberModal('${m.id}')">Edit</button>
              <button class="btn btn-sm btn-outline" onclick="toggleMemberActive('${m.id}')">${m.active ? 'Deactivate' : 'Activate'}</button>
              <button class="btn btn-sm btn-danger" title="Remove member" onclick="removeMember('${m.id}')">&times;</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // Breakdown
  renderBreakdown('aBreakdownTableBody', 'aBreakdownTitle', filtered, ui.modeAdmin,
    'Click <strong>"+ Add Entry"</strong> above to record your first person.');

  // All leads
  const leadsBody = document.getElementById('aEntriesTableBody');
  if (filtered.length === 0) {
    leadsBody.innerHTML = emptyRow(7, '👥', 'No entries found.', 'Add people to start tracking them.');
  } else {
    leadsBody.innerHTML = filtered.map(item => {
      const owner = getMember(item.memberId);
      // Options: Unassigned + active members (+ current owner even if inactive)
      const opts = members
        .filter(m => m.active || m.id === item.memberId)
        .map(m => `<option value="${m.id}" ${m.id === item.memberId ? 'selected' : ''}>${esc(m.name)}${m.active ? '' : ' (inactive)'}</option>`)
        .join('');
      return `
        <tr class="lead-row" data-lead="${item.id}" title="Click to see full details">
          <td>
            <button class="lead-name" onclick="openLeadDrawer('${item.id}')">${esc(item.name)}</button>
            <div class="lead-date">${fmtDate(item.date)}</div>
          </td>
          <td>${stageBadge(item.stage)}<div class="form-name-small">${esc(formOf(item).name)}</div></td>
          <td>
            <select class="inline-select ${owner ? '' : 'unassigned'}" onchange="reassignEntry('${item.id}', this.value)">
              <option value="" ${owner ? '' : 'selected'}>Unassigned</option>${opts}
            </select>
          </td>
          <td>${appointmentCell(item, true)}</td>
          <td><div class="action-row">${nextActionButton(item)}</div></td>
          <td class="col-delete">
            <button class="btn btn-sm btn-danger" title="Delete lead" onclick="askDeleteEntry('${item.id}')">&times;</button>
          </td>
        </tr>`;
    }).join('');
  }
}

/* ---------------- MARKETING PORTAL VIEW ---------------- */

function populateSignedInSelect() {
  const sel = document.getElementById('signedInAs');
  const act = activeMembers();
  if (!act.some(m => m.id === ui.memberId)) {
    ui.memberId = act.length ? act[0].id : '';
    saveUi();
  }
  if (!sel) return;
  sel.innerHTML = act.length
    ? act.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')
    : '<option value="">No members</option>';
  sel.value = ui.memberId;
  sel.disabled = act.length === 0;
}

function renderPortal() {
  populateSignedInSelect();
  const me = getMember(ui.memberId);

  document.getElementById('portalEmpty').style.display = me ? 'none' : 'block';
  document.getElementById('portalBody').style.display = me ? 'block' : 'none';
  document.getElementById('crumbRoot').textContent = 'Marketing Portal';
  document.getElementById('topbarTitle').textContent = me ? me.name : 'No members yet';
  if (!me) return;

  const range = document.getElementById('pFilterDateRange').value;

  // ONLY this member's leads
  const mine = entries.filter(e => e.memberId === me.id);
  const filtered = filterList(mine, range);

  document.getElementById('pWelcome').textContent = `Welcome, ${me.name}`;
  const f = funnel(filtered);
  setMetrics('p', f);

  // Monthly target (set by admin)
  const target = Number(me.target) || 0;
  const monthCount = mine.filter(e => isThisMonth(e.date)).length;
  document.getElementById('pTargetValue').textContent = target > 0 ? `${monthCount}/${target}` : monthCount;
  document.getElementById('pTargetBar').style.width = target > 0 ? `${Math.min(100, (monthCount / target) * 100)}%` : '0%';
  document.getElementById('pTargetSub').textContent = target > 0
    ? (monthCount >= target ? 'Target reached this month 🎉' : `${target - monthCount} more lead${target - monthCount === 1 ? '' : 's'} to go this month`)
    : 'No target set by admin';

  // Anonymous comparison — computed over active members, but no names or contacts are shown
  const teamStats = activeMembers().map(m => {
    const tf = funnel(filterList(entries.filter(e => e.memberId === m.id), range));
    return { id: m.id, came: tf.came, attended: tf.attended, booked: tf.booked };
  });
  const ranked = [...teamStats].sort((a, b) => (b.booked - a.booked) || (b.attended - a.attended) || (b.came - a.came));
  const myRank = ranked.findIndex(s => s.id === me.id) + 1;
  const withLeads = teamStats.filter(s => s.came > 0);
  const teamAvg = withLeads.length
    ? withLeads.reduce((sum, s) => sum + (s.booked / s.came) * 100, 0) / withLeads.length
    : 0;

  document.getElementById('pRank').textContent = `#${myRank}`;
  document.getElementById('pRankSub').textContent = `of ${teamStats.length} active member${teamStats.length === 1 ? '' : 's'} · by bookings`;
  document.getElementById('pMyConv').textContent = `${pct(f.booked, f.came)}%`;
  document.getElementById('pTeamConv').textContent = `${teamAvg.toFixed(1)}%`;

  // Own profile only
  document.getElementById('pProfile').innerHTML = `
    <div><span>Name</span><strong>${esc(me.name)}</strong></div>
    <div><span>Member ID</span><strong>${me.id}</strong></div>
    <div><span>Email</span><strong>${esc(me.email) || '–'}</strong></div>
    <div><span>Phone</span><strong>${esc(me.phone) || '–'}</strong></div>
    <div><span>Member since</span><strong>${me.joined ? fmtDate(me.joined) : '–'}</strong></div>
    <p class="muted small-note">To update your details, contact your admin.</p>`;

  renderBreakdown('pBreakdownTableBody', 'pBreakdownTitle', filtered, ui.modePortal,
    'Click <strong>"+ Add Lead"</strong> above to record your first person.');

  const pq = document.getElementById('pSearch').value;
  const myLeads = filtered.filter(e => leadMatches(pq, e));
  const leadsBody = document.getElementById('pEntriesTableBody');
  leadsBody.innerHTML = myLeads.length === 0
    ? emptyRow(6, '👥', pq ? 'No leads match your search.' : 'No leads found.', 'Leads you add, or the admin assigns to you, show up here.')
    : myLeads.map(item => `
      <tr>
        <td><strong>${esc(item.name)}</strong></td>
        <td>${stageBadge(item.stage)}</td>
        <td class="muted nowrap">${fmtDate(item.date)}</td>
        <td>${appointmentCell(item, false)}</td>
        <td><div class="action-row">${nextActionButton(item)}</div></td>
      </tr>`).join('');

  renderPortalTickets(me);
}

/* ---------------- Master render ---------------- */

function render() {
  const isAdmin = ui.view === 'admin';
  document.body.classList.toggle('mode-admin', isAdmin);
  document.body.classList.toggle('mode-portal', !isAdmin);

  document.getElementById('adminView').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('portalView').style.display = isAdmin ? 'none' : 'block';
  // Top bar: admin gets the search across everything; portal gets the "Signed in as" picker
  document.getElementById('globalSearchBox').style.display = isAdmin ? '' : 'none';
  document.getElementById('signedInBox').style.display = isAdmin ? 'none' : 'flex';
  if (isAdmin) document.getElementById('crumbRoot').textContent = 'Admin';
  document.title = isAdmin ? 'Marketing Tracker | Admin' : 'Marketing Tracker | Marketing Portal';

  // Breakdown view (Daily / Week-wise / Month-wise) comes from the dropdowns
  document.getElementById('aFilterView').value = ui.modeAdmin;
  document.getElementById('pFilterView').value = ui.modePortal;

  if (isAdmin) renderAdmin(); else renderPortal();
}

/* ---------------- Lead actions ---------------- */

function advanceStage(id, newStage) {
  const item = entries.find(x => x.id === id);
  if (!item) return;
  // In the portal a member may only touch their own leads
  if (ui.view === 'portal' && item.memberId !== ui.memberId) return;
  item.stage = newStage;
  // Marking "Quiz Attended" creates a quiz-form record so the lead has a form to view
  if (!item.form) item.form = { name: item.name, contact: '', email: '', submittedAt: new Date().toISOString() };
  saveEntries();
  render();
}

function deleteEntry(id) {
  if (ui.view !== 'admin') return;
  entries = entries.filter(x => x.id !== id);
  saveEntries();
  render();
}

// Ask first, then delete
function askDeleteEntry(id) {
  const item = entries.find(x => x.id === id);
  if (!item) return;
  const owner = getMember(item.memberId);
  openConfirm(
    'Delete this lead?',
    `<strong>${esc(item.name)}</strong> (${owner ? esc(owner.name) : 'Unassigned'})` +
    `${item.appointment ? ' and their appointment' : ''} will be permanently removed. This cannot be undone.`,
    'Yes, Delete',
    () => deleteEntry(id)
  );
}

/* ---------------- Forms tab ---------------- */

function formStats(form, list) {
  const leads = list.filter(e => formOf(e).id === form.id);
  const attempted = leads.filter(e => e.stage !== 'came');
  const answered = attempted.filter(e => e.quiz);
  const appts = leads.filter(e => e.appointment).map(e => e.appointment);
  const scores = answered.map(e => quizScore(e).pct);

  // Per question: how many picked each option
  const questions = form.questions.map((q, qi) => {
    const picks = q.options.map(() => 0);
    answered.forEach(e => { const a = e.quiz.answers[qi]; if (picks[a] !== undefined) picks[a] += 1; });
    const correct = picks[q.answer] || 0;
    let topWrong = -1;
    picks.forEach((n, oi) => { if (oi !== q.answer && n > 0 && (topWrong < 0 || n > picks[topWrong])) topWrong = oi; });
    return { ...q, picks, correct, total: answered.length, topWrong };
  });

  return {
    leads: leads.length,
    attempted: attempted.length,
    qualified: attempted.filter(e => isQualified(e) === true).length,
    notQualified: attempted.filter(e => isQualified(e) === false).length,
    booked: leads.filter(e => e.stage === 'booked').length,
    showed: appts.filter(a => a.status === 'Completed').length,
    noShow: appts.filter(a => a.status === 'No-show').length,
    cancelled: appts.filter(a => a.status === 'Cancelled').length,
    avgScore: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null,
    questions,
    responses: attempted.sort((a, b) => ((b.form && b.form.submittedAt) || b.date).localeCompare((a.form && a.form.submittedAt) || a.date))
  };
}

function openFormDetail(id) {
  ui.adminTab = 'forms';
  ui.formView = id;
  ui.formResp = 'all';
  saveUi();
  render();
  window.scrollTo({ top: 0 });
}

function closeFormDetail() {
  ui.formView = null;
  saveUi();
  render();
}

let lastFormResponses = [];

const FORM_PERIODS = { day: 'Today', week: 'This Week', month: 'This Month', all: 'All Time' };

// Leads whose date falls in the current day / week / month (or everything for All Time)
function inCurrentPeriod(list, period) {
  if (period === 'all') return list;
  const { start, end } = periodRange(period, toDateInput(new Date()));
  return list.filter(e => inRange(new Date(e.date), start, end));
}

function renderForms(list) {
  const panel = document.getElementById('formsPanel');
  const form = ui.formView ? getFormById(ui.formView) : null;
  const period = FORM_PERIODS[ui.formPeriod] ? ui.formPeriod : 'all';
  const periodPicker = `
    <div class="period-picker">
      <span class="control-label">Performance for:</span>
      <div class="seg" id="fPeriod">
        ${Object.entries(FORM_PERIODS).map(([k, v]) => `<button type="button" class="seg-btn ${k === period ? 'active' : ''}" data-period="${k}">${v}</button>`).join('')}
      </div>
    </div>`;
  panel.innerHTML = periodPicker + (form ? formDetailHtml(form, list, period) : formsListHtml(list, period));
  panel.querySelectorAll('#fPeriod .seg-btn').forEach(b => b.addEventListener('click', () => {
    ui.formPeriod = b.dataset.period; saveUi(); render();
  }));
  if (form) {
    const sel = document.getElementById('fRespFilter');
    sel.value = ui.formResp || 'all';
    sel.addEventListener('change', e => { ui.formResp = e.target.value; saveUi(); render(); });
  }
}

function formsListHtml(allList, period) {
  const list = inCurrentPeriod(allList, period);
  const rows = FORMS.filter(f => matchesSearch(currentSearch(), f.name, f.description, f.id))
    .map(f => ({ f, st: formStats(f, list) }));
  const totalAttempts = rows.reduce((n, r) => n + r.st.attempted, 0);
  const totalQualified = rows.reduce((n, r) => n + r.st.qualified, 0);
  const withAttempts = rows.filter(r => r.st.attempted > 0);
  const best = withAttempts.length
    ? withAttempts.reduce((a, b) => (b.st.qualified / b.st.attempted > a.st.qualified / a.st.attempted ? b : a))
    : null;

  const cards = `
    <div class="summary-grid four-up">
      ${summaryCard('Forms', FORMS.length, 'team', `${FORMS.filter(f => f.status === 'Active').length} active · ${FORM_PERIODS[period]}`)}
      ${summaryCard('Total Attempts', totalAttempts, 'form', 'People who took a quiz')}
      ${summaryCard('Qualified', totalQualified, 'quiz', `${pct(totalQualified, totalAttempts)}% of attempts`)}
      ${summaryCard('Best Qualify Rate', best ? pct(best.st.qualified, best.st.attempted) + '%' : '–', 'came', best ? esc(best.f.name) : 'No attempts yet')}
    </div>`;

  const body = rows.map(({ f, st }) => `
    <tr class="lead-row" onclick="openFormDetail('${f.id}')" title="Open this form">
      <td>
        <button class="lead-name" onclick="event.stopPropagation(); openFormDetail('${f.id}')">${esc(f.name)}</button>
        <div class="lead-date">${f.questions.length} questions · pass mark ${f.passMark}/${f.questions.length}</div>
      </td>
      <td>${f.status === 'Active' ? '<span class="pill on">Active</span>' : '<span class="pill off">Closed</span>'}</td>
      <td><span class="badge came">${st.leads}</span></td>
      <td><span class="badge form">${st.attempted}</span> <span class="muted small">${pct(st.attempted, st.leads)}%</span></td>
      <td><span class="badge quiz">${st.qualified}</span> <span class="muted small">${pct(st.qualified, st.attempted)}%</span></td>
      <td>${st.notQualified}</td>
      <td>${st.booked}</td>
      <td>${st.showed}</td>
      <td><strong>${st.avgScore == null ? '–' : st.avgScore + '%'}</strong></td>
      <td class="muted">&rsaquo;</td>
    </tr>`).join('');

  return `${cards}
    <div class="section-card">
      <div class="section-title"><span>All Forms · ${FORM_PERIODS[period]}</span><span class="section-hint">Click a form for full details</span></div>
      <div class="table-wrap">
        <table class="simple-table">
          <thead><tr>
            <th>Form</th><th>Status</th><th>Leads</th><th>Attempted</th><th>Qualified</th>
            <th>Not Qualified</th><th>Booked</th><th>Showed Up</th><th>Avg Score</th><th></th>
          </tr></thead>
          <tbody>${body || emptyRow(10, '🔍', 'No forms match your search.', 'Try another name.')}</tbody>
        </table>
      </div>
    </div>`;
}

function formDetailHtml(form, allList, period) {
  const list = inCurrentPeriod(allList, period);
  const st = formStats(form, list);

  // Same form across Today / This Week / This Month / All Time
  const overTime = Object.entries(FORM_PERIODS).map(([k, label]) => {
    const t = formStats(form, inCurrentPeriod(allList, k));
    return `<tr class="${k === period ? 'row-current' : ''}">
      <td><strong>${label}</strong></td>
      <td><span class="badge came">${t.leads}</span></td>
      <td><span class="badge form">${t.attempted}</span> <span class="muted small">${pct(t.attempted, t.leads)}%</span></td>
      <td><span class="badge quiz">${t.qualified}</span> <span class="muted small">${pct(t.qualified, t.attempted)}%</span></td>
      <td>${t.notQualified}</td>
      <td>${t.booked}</td>
      <td>${t.showed}</td>
      <td>${t.cancelled}</td>
      <td><strong>${t.avgScore == null ? '–' : t.avgScore + '%'}</strong></td>
    </tr>`;
  }).join('');
  const created = fmtDate(form.created);

  const cards = `
    <div class="summary-grid">
      ${summaryCard('Leads', st.leads, 'came', 'Clicked this form\'s link')}
      ${summaryCard('Attempted', st.attempted, 'form', `${pct(st.attempted, st.leads)}% of leads`)}
      ${summaryCard('Qualified', st.qualified, 'quiz', `${pct(st.qualified, st.attempted)}% of attempts`)}
      ${summaryCard('Not Qualified', st.notQualified, 'danger', `${pct(st.notQualified, st.attempted)}% of attempts`)}
      ${summaryCard('Booked', st.booked, 'team', `${pct(st.booked, st.qualified)}% of qualified`)}
    </div>
    <div class="summary-grid">
      ${summaryCard('Average Score', st.avgScore == null ? '–' : st.avgScore + '%', 'came', `Pass mark ${form.passMark}/${form.questions.length}`)}
      ${summaryCard('Showed Up', st.showed, 'quiz', 'Appointments attended')}
      ${summaryCard('No-show', st.noShow, 'danger', 'Booked but did not come')}
      ${summaryCard('Cancelled', st.cancelled, 'muted-card', 'Appointments cancelled')}
      ${summaryCard('Questions', form.questions.length, 'team', `${form.status === 'Active' ? 'Active' : 'Closed'} form`)}
    </div>`;

  const questions = st.questions.map((q, qi) => {
    const rate = q.total ? Math.round((q.correct / q.total) * 100) : null;
    const options = q.options.map((opt, oi) => {
      const n = q.picks[oi];
      const w = q.total ? (n / q.total) * 100 : 0;
      const isAns = oi === q.answer;
      return `<div class="opt-row ${isAns ? 'correct' : ''}">
        <div class="opt-label">${isAns ? '✓' : ''} ${esc(opt)}</div>
        <div class="opt-bar"><div style="width:${w}%"></div></div>
        <div class="opt-count">${n}</div>
      </div>`;
    }).join('');
    return `<div class="q-card">
      <div class="q-head">
        <div><span class="q-num">Q${qi + 1}</span> ${esc(q.q)}</div>
        <span class="badge ${rate == null ? 'neutral' : rate >= 70 ? 'quiz' : rate >= 45 ? 'form' : 'danger'}">${rate == null ? 'No answers' : rate + '% correct'}</span>
      </div>
      ${options}
      ${q.topWrong >= 0 ? `<div class="q-note">Most common wrong answer: <strong>${esc(q.options[q.topWrong])}</strong> (${q.picks[q.topWrong]} people)</div>` : ''}
    </div>`;
  }).join('');

  // Responses (who attempted), with a result filter
  const respFilter = ui.formResp || 'all';
  const responses = st.responses.filter(e => respFilter === 'all' ? true
    : respFilter === 'qualified' ? isQualified(e) === true
    : respFilter === 'notqualified' ? isQualified(e) === false
    : respFilter === 'booked' ? e.stage === 'booked'
    : respFilter === 'notbooked' ? isQualified(e) !== false && e.stage !== 'booked' : true)
    .filter(e => leadMatches(currentSearch(), e));
  lastFormResponses = responses;

  const respRows = responses.length === 0
    ? emptyRow(8, '📝', 'No responses for these filters.', 'Try another search, result filter or period.')
    : responses.map(e => {
        const sc = quizScore(e);
        const q = isQualified(e);
        const owner = getMember(e.memberId);
        const a = e.appointment;
        return `<tr class="lead-row" data-lead="${e.id}" onclick="openLeadDrawer('${e.id}')" title="Click to see the full response">
          <td class="nowrap muted">${e.form ? fmtDateTime(e.form.submittedAt) : fmtDate(e.date)}</td>
          <td><button class="lead-name" onclick="event.stopPropagation(); openLeadDrawer('${e.id}')">${esc((e.form && e.form.name) || e.name)}</button></td>
          <td>${esc(e.form && e.form.email) || '–'}</td>
          <td class="nowrap">${esc(e.form && e.form.contact) || '–'}</td>
          <td class="nowrap">${sc ? `<strong>${sc.correct}/${sc.total}</strong> <span class="muted small">${sc.pct}%</span>` : '<span class="muted">–</span>'}</td>
          <td>${q === true ? '<span class="badge quiz">Qualified</span>' : q === false ? '<span class="badge danger">Not qualified</span>' : '<span class="muted">Unknown</span>'}</td>
          <td>${a ? `<span class="badge ${{ Scheduled: 'came', Completed: 'quiz', 'No-show': 'danger', Cancelled: 'neutral' }[a.status] || 'neutral'}">${statusLabel(a.status)}</span>` : '<span class="muted">Not booked</span>'}</td>
          <td>${owner ? esc(owner.name) : '<span class="muted">Unassigned</span>'}</td>
        </tr>`;
      }).join('');

  return `
    <div class="form-detail-head">
      <button class="link-btn back-link" onclick="closeFormDetail()">&larr; All forms</button>
      <div class="form-detail-title">
        <div>
          <h2>${esc(form.name)} ${form.status === 'Active' ? '<span class="pill on">Active</span>' : '<span class="pill off">Closed</span>'}</h2>
          <p class="muted">${esc(form.description)} · Created ${created}${form.closed ? ` · Closed ${fmtDate(form.closed)}` : ''}</p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="exportFormCsv('${form.id}')">&#11015; Export Responses</button>
      </div>
    </div>

    ${cards}

    <div class="section-card">
      <div class="section-title"><span>Performance Over Time</span><span class="section-hint">Highlighted row = the period selected above</span></div>
      <div class="table-wrap">
        <table class="simple-table">
          <thead><tr>
            <th>Period</th><th>Leads</th><th>Attempted</th><th>Qualified</th><th>Not Qualified</th>
            <th>Booked</th><th>Showed Up</th><th>Cancelled</th><th>Avg Score</th>
          </tr></thead>
          <tbody>${overTime}</tbody>
        </table>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title"><span>Questions &amp; How People Answered · ${FORM_PERIODS[period]}</span><span class="section-hint">✓ marks the correct answer · bars show how many picked each option</span></div>
      <div class="q-grid">${questions}</div>
    </div>

    <div class="section-card">
      <div class="section-title">
        <span>Responses · ${FORM_PERIODS[period]} <span class="section-hint">· ${responses.length} shown</span></span>
        <select id="fRespFilter" class="filter-input" title="Filter responses">
          <option value="all">All Responses</option>
          <option value="qualified">Qualified</option>
          <option value="notqualified">Not Qualified</option>
          <option value="booked">Booked</option>
          <option value="notbooked">Qualified, Not Booked</option>
        </select>
      </div>
      <div class="table-wrap scroll-box tall">
        <table class="simple-table">
          <thead><tr>
            <th>Submitted</th><th>Name</th><th>Email</th><th>Contact</th><th>Score</th><th>Result</th><th>Appointment</th><th>Routed To</th>
          </tr></thead>
          <tbody>${respRows}</tbody>
        </table>
      </div>
    </div>`;
}

function exportFormCsv(id) {
  const form = getFormById(id);
  if (!form) return;
  if (lastFormResponses.length === 0) { alert('No responses to export for these filters.'); return; }
  const safe = form.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  downloadCsv(`${safe}-responses-${toDateInput(new Date())}.csv`, responseCsvRows(lastFormResponses, form));
}

/* ---------------- Help requests ----------------
   Members raise problems from the Marketing Portal (portal.html).
   Admin only sees, replies to and updates them — admin cannot raise one. */

const TICKET_STATUSES = ['Open', 'In Progress', 'Resolved'];
const ticketStatusClass = st => ({ Open: 'danger', 'In Progress': 'form', Resolved: 'quiz' }[st] || 'neutral');
const priorityClass = pr => ({ High: 'danger', Medium: 'form', Low: 'neutral' }[pr] || 'neutral');
let helpStatusFilter = 'active';

function updateHelpCount() {
  const open = tickets.filter(t => t.status !== 'Resolved').length;
  const el = document.getElementById('navCountHelp');
  el.textContent = open;
  el.classList.toggle('zero', open === 0);
}

function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days} day${days === 1 ? '' : 's'} ago` : fmtDate(iso);
}

function renderHelp(memberFilter) {
  const panel = document.getElementById('helpPanel');
  const scoped = tickets.filter(t => memberFilter === 'all' ? true
    : memberFilter === 'unassigned' ? false : t.memberId === memberFilter);
  const count = st => scoped.filter(t => t.status === st).length;
  const shown = scoped
    .filter(t => helpStatusFilter === 'all' ? true : helpStatusFilter === 'active' ? t.status !== 'Resolved' : t.status === helpStatusFilter)
    .filter(t => matchesSearch(currentSearch(), t.id, t.subject, t.description, t.category, (getMember(t.memberId) || {}).name))
    .sort((a, b) => (a.status === 'Resolved') - (b.status === 'Resolved') || b.updatedAt.localeCompare(a.updatedAt));

  const rows = shown.length === 0
    ? emptyRow(7, '🛟', 'No help requests here.', 'Requests appear when members raise a problem from their portal.')
    : shown.map(t => {
        const m = getMember(t.memberId);
        return `<tr class="lead-row" onclick="openTicketDrawer('${t.id}')" title="Open request">
          <td class="nowrap muted">${t.id}</td>
          <td><button class="lead-name" onclick="event.stopPropagation(); openTicketDrawer('${t.id}')">${esc(t.subject)}</button>
            <div class="lead-date">${esc(t.category)}${t.replies.length ? ` · ${t.replies.length} repl${t.replies.length === 1 ? 'y' : 'ies'}` : ''}</div></td>
          <td class="nowrap">${m ? esc(m.name) : '<span class="muted">Removed member</span>'}</td>
          <td><span class="badge ${priorityClass(t.priority)}">${esc(t.priority)}</span></td>
          <td><span class="badge ${ticketStatusClass(t.status)}">${esc(t.status)}</span></td>
          <td class="nowrap muted">${fmtDate(t.createdAt)}</td>
          <td class="nowrap muted">${timeAgo(t.updatedAt)}</td>
        </tr>`;
      }).join('');

  panel.innerHTML = `
    <div class="info-banner">🛟 Members raise these from the <strong>Marketing Portal</strong> (open <code>portal.html</code>).
      As admin you can reply and change the status, but you can't raise a request yourself.</div>
    <div class="summary-grid four-up">
      ${summaryCard('Open', count('Open'), 'danger', 'Waiting for a reply')}
      ${summaryCard('In Progress', count('In Progress'), 'form', 'Being worked on')}
      ${summaryCard('Resolved', count('Resolved'), 'quiz', 'Closed requests')}
      ${summaryCard('Total', scoped.length, 'team', `${scoped.filter(t => t.priority === 'High' && t.status !== 'Resolved').length} high priority still open`)}
    </div>
    <div class="section-card">
      <div class="section-title">
        <span>Requests <span class="section-hint">· ${shown.length} shown</span></span>
        <select id="hStatus" class="filter-input" title="Request status">
          <option value="active">Open &amp; In Progress</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
          <option value="all">All Requests</option>
        </select>
      </div>
      <div class="table-wrap">
        <table class="simple-table">
          <thead><tr><th>ID</th><th>Problem</th><th>Raised By</th><th>Priority</th><th>Status</th><th>Raised On</th><th>Last Update</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  const sel = document.getElementById('hStatus');
  sel.value = helpStatusFilter;
  sel.addEventListener('change', e => { helpStatusFilter = e.target.value; render(); });
}

function conversationHtml(t, viewer) {
  if (!t.replies.length) return '<p class="muted small">No replies yet.</p>';
  return `<div class="convo">${t.replies.map(r => `
    <div class="msg ${r.by === 'admin' ? 'admin' : 'member'} ${r.by === viewer ? 'mine' : ''}">
      <div class="msg-meta">${r.by === 'admin' ? 'Admin' : esc((getMember(t.memberId) || {}).name || 'Member')} · ${fmtDateTime(r.at)}</div>
      <div class="msg-text">${esc(r.text)}</div>
    </div>`).join('')}</div>`;
}

function openTicketDrawer(id) {
  const t = tickets.find(x => x.id === id);
  if (!t) return;
  const m = getMember(t.memberId);
  document.querySelector('.drawer-kicker').textContent = 'Help Request · ' + t.id;
  document.getElementById('drawerName').textContent = t.subject;
  document.getElementById('drawerSub').textContent = `Raised by ${m ? m.name : 'a removed member'} · ${fmtDateTime(t.createdAt)}`;
  document.getElementById('drawerBody').innerHTML = `
    <section class="drawer-section">
      <h4>Details</h4>
      ${detailRow('Raised by', m ? esc(m.name) : '–')}
      ${detailRow('Member email', m && m.email ? esc(m.email) : '–')}
      ${detailRow('Category', esc(t.category))}
      ${detailRow('Priority', `<span class="badge ${priorityClass(t.priority)}">${esc(t.priority)}</span>`)}
      ${detailRow('Status', `<span class="badge ${ticketStatusClass(t.status)}">${esc(t.status)}</span>`)}
      ${detailRow('Last update', fmtDateTime(t.updatedAt))}
    </section>
    <section class="drawer-section">
      <h4>Problem</h4>
      <div class="ticket-desc">${esc(t.description)}</div>
    </section>
    <section class="drawer-section">
      <h4>Conversation</h4>
      ${conversationHtml(t, 'admin')}
    </section>`;
  document.getElementById('drawerFooter').innerHTML = `
    <div class="ticket-actions">
      <textarea id="ticketReply" rows="2" placeholder="Write a reply to ${m ? esc(m.name) : 'the member'}…"></textarea>
      <div class="ticket-actions-row">
        <select id="ticketStatus" class="filter-input">${TICKET_STATUSES.map(st => `<option ${st === t.status ? 'selected' : ''}>${st}</option>`).join('')}</select>
        <button class="btn btn-primary" onclick="saveTicketUpdate('${t.id}')">Save</button>
      </div>
    </div>`;
  document.getElementById('leadDrawer').classList.add('open');
}

function saveTicketUpdate(id) {
  const t = tickets.find(x => x.id === id);
  if (!t) return;
  const text = document.getElementById('ticketReply').value.trim();
  const status = document.getElementById('ticketStatus').value;
  if (!text && status === t.status) return;
  const now = new Date().toISOString();
  if (text) t.replies.push({ by: 'admin', text, at: now });
  t.status = status;
  t.updatedAt = now;
  saveTickets();
  render();
  openTicketDrawer(id);
}

/* Portal side: a member's own requests */
function renderPortalTickets(me) {
  const mine = tickets.filter(t => t.memberId === me.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  document.getElementById('pTickets').innerHTML = mine.length === 0
    ? '<div class="placeholder-box">No problems raised yet. Use <strong>+ Raise a Problem</strong> if something isn\'t working.</div>'
    : mine.map(t => `
      <div class="ticket-card">
        <div class="ticket-card-head">
          <div><strong>${esc(t.subject)}</strong><div class="lead-date">${t.id} · ${esc(t.category)} · raised ${fmtDate(t.createdAt)}</div></div>
          <div class="nowrap"><span class="badge ${priorityClass(t.priority)}">${esc(t.priority)}</span> <span class="badge ${ticketStatusClass(t.status)}">${esc(t.status)}</span></div>
        </div>
        <div class="ticket-desc">${esc(t.description)}</div>
        ${t.replies.length ? conversationHtml(t, 'member') : '<p class="muted small">Waiting for a reply from admin.</p>'}
      </div>`).join('');
}

function openHelpModal() {
  if (ui.view !== 'portal') return; // admin cannot raise requests
  ['helpSubject', 'helpDescription'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('helpCategory').value = 'Leads';
  document.getElementById('helpPriority').value = 'Medium';
  document.getElementById('helpError').textContent = '';
  document.getElementById('helpModal').style.display = 'flex';
  document.getElementById('helpSubject').focus();
}

function handleHelpSubmit(e) {
  e.preventDefault();
  if (ui.view !== 'portal' || !getMember(ui.memberId)) return;
  const subject = document.getElementById('helpSubject').value.trim();
  const description = document.getElementById('helpDescription').value.trim();
  if (!subject || !description) { document.getElementById('helpError').textContent = 'Please fill in the subject and the description.'; return; }
  const now = new Date().toISOString();
  const next = 1001 + tickets.reduce((n, t) => Math.max(n, parseInt(String(t.id).replace(/\D/g, ''), 10) - 1000 || 0), 0);
  tickets.unshift({
    id: 'HLP-' + next, memberId: ui.memberId,
    category: document.getElementById('helpCategory').value,
    priority: document.getElementById('helpPriority').value,
    status: 'Open', subject, description, createdAt: now, updatedAt: now, replies: []
  });
  saveTickets();
  closeModal('helpModal');
  render();
}

/* ---------------- Search in the top bar (works on every admin tab) ---------------- */

function renderGlobalResults(q) {
  const box = document.getElementById('globalResults');
  const needle = q.trim();
  if (needle.length < 2) { box.classList.remove('open'); box.innerHTML = ''; return; }
  const leads = entries.filter(e => leadMatches(needle, e)).slice(0, 6);
  const mems = members.filter(m => matchesSearch(needle, m.name, m.email, m.phone, m.id)).slice(0, 4);
  const forms = FORMS.filter(f => matchesSearch(needle, f.name, f.id)).slice(0, 3);
  const helps = tickets.filter(t => matchesSearch(needle, t.id, t.subject, t.description)).slice(0, 4);
  const group = (title, items) => items.length ? `<div class="gr-title">${title}</div>${items.join('')}` : '';
  const item = (type, id, main, sub) =>
    `<button type="button" class="gr-item" data-type="${type}" data-id="${id}"><span>${main}</span><small>${sub}</small></button>`;
  const html =
    group('Team Members', mems.map(m => item('member', m.id, esc(m.name), esc(m.email || m.id)))) +
    group('Forms', forms.map(f => item('form', f.id, esc(f.name), f.status))) +
    group('Help Requests', helps.map(t => item('help', t.id, esc(t.subject), `${t.id} · ${t.status}`))) +
    group('Leads', leads.map(e => item('lead', e.id, esc(e.name), `${esc(formOf(e).name)} · ${(getMember(e.memberId) || {}).name || 'Unassigned'} · ${fmtDate(e.date)}`)));
  box.innerHTML = html || '<div class="gr-empty">No matches.</div>';
  box.classList.add('open');
}

function openGlobalResult(type, id) {
  const input = document.getElementById('globalSearch');
  document.getElementById('globalResults').classList.remove('open');
  if (type === 'lead') { openLeadDrawer(id); return; }
  if (type === 'form') { openFormDetail(id); return; }
  if (type === 'member') {
    const m = getMember(id);
    ui.adminTab = 'team'; saveUi();
    searchState.team = m ? m.name : '';
    render();
  }
  if (type === 'help') { ui.adminTab = 'help'; saveUi(); render(); openTicketDrawer(id); }
  input.blur();
}

/* ---------------- Summary (day / week / month) ---------------- */

const summaryState = { period: 'week', date: toDateInput(new Date()) };

// Start (inclusive) and end (exclusive) of the day / week (Mon–Sun) / month containing dateStr
function periodRange(period, dateStr) {
  if (period === 'all') return { start: new Date(0), end: new Date(8.64e15) };
  const d = new Date(dateStr + 'T00:00:00');
  let start, end;
  if (period === 'day') {
    start = new Date(d);
    end = new Date(d); end.setDate(end.getDate() + 1);
  } else if (period === 'week') {
    start = new Date(d); start.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
    end = new Date(start); end.setDate(start.getDate() + 7);
  } else {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return { start, end };
}

function periodLabel(period, start, end) {
  if (period === 'all') return 'All Time';
  const today = toDateInput(new Date());
  const cur = periodRange(period, today);
  const isCurrent = cur.start.getTime() === start.getTime();
  if (period === 'day') {
    const txt = start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    return isCurrent ? `Today · ${txt}` : txt;
  }
  if (period === 'week') {
    const txt = getWeekLabel(start);
    return isCurrent ? `This week · ${txt}` : txt;
  }
  const txt = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return isCurrent ? `This month · ${txt}` : txt;
}

function shiftPeriod(dir) {
  if (summaryState.period === 'all') return;
  const { start } = periodRange(summaryState.period, summaryState.date);
  const d = new Date(start);
  if (summaryState.period === 'day') d.setDate(d.getDate() + dir);
  else if (summaryState.period === 'week') d.setDate(d.getDate() + 7 * dir);
  else d.setMonth(d.getMonth() + dir);
  summaryState.date = toDateInput(d);
  render();
}

function inRange(date, start, end) { return date >= start && date < end; }
function apptDate(a) { return new Date(a.date + 'T' + (a.time || '00:00') + ':00'); }

// All summary numbers for one period (optionally one member, '' = unassigned)
function summaryStats(start, end, memberSel) {
  const pool = entries.filter(e => memberSel === 'all' ? true
    : memberSel === 'unassigned' ? !getMember(e.memberId) : e.memberId === memberSel);

  const leads = pool.filter(e => inRange(new Date(e.date), start, end));
  const attended = leads.filter(e => e.stage !== 'came');
  const appts = pool.filter(e => e.appointment && inRange(apptDate(e.appointment), start, end)).map(e => e.appointment);
  const count = st => appts.filter(a => a.status === st).length;
  const showed = count('Completed'), noShow = count('No-show');

  return {
    leads: leads.length,
    attended: attended.length,
    qualified: attended.filter(e => isQualified(e) === true).length,
    notQualified: attended.filter(e => isQualified(e) === false).length,
    booked: leads.filter(e => e.stage === 'booked').length,   // leads from this period with an active booking
    apptTotal: appts.length,
    showed,
    noShow,
    cancelled: count('Cancelled'),
    upcoming: count('Scheduled'),
    showRate: showed + noShow > 0 ? (showed / (showed + noShow)) * 100 : null
  };
}

function deltaHtml(cur, prev, goodWhenUp = true) {
  if (prev == null) return ''; // All Time has nothing to compare with
  if (prev === 0 && cur === 0) return '<span class="delta flat">no change</span>';
  const diff = cur - prev;
  if (diff === 0) return '<span class="delta flat">same as before</span>';
  const up = diff > 0;
  const good = up === goodWhenUp;
  return `<span class="delta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(diff)} vs previous</span>`;
}

function summaryCard(label, value, cls, subHtml) {
  return `<div class="metric-card ${cls}"><div class="metric-label">${label}</div>
    <div class="metric-value">${value}</div><div class="metric-sub">${subHtml}</div></div>`;
}

let lastSummaryRows = [];

function renderSummary() {
  // Controls
  const memberSel = document.getElementById('sMember');
  const currentMember = memberSel.value || 'all';
  memberSel.innerHTML = '<option value="all">All Members</option><option value="unassigned">Unassigned</option>' +
    members.map(m => `<option value="${m.id}">${esc(m.name)}${m.active ? '' : ' (inactive)'}</option>`).join('');
  memberSel.value = [...memberSel.options].some(o => o.value === currentMember) ? currentMember : 'all';
  document.getElementById('sPeriod').value = summaryState.period;
  document.getElementById('sDate').value = summaryState.date;

  const period = summaryState.period;
  const { start, end } = periodRange(period, summaryState.date);
  const prevAnchor = new Date(start); prevAnchor.setDate(prevAnchor.getDate() - 1);
  const prev = periodRange(period, toDateInput(prevAnchor));

  const names = { day: ['Daily Summary', 'previous day'], week: ['Weekly Summary', 'previous week'],
    month: ['Monthly Summary', 'previous month'], all: ['All Time Summary', ''] };
  const isAll = period === 'all';
  document.getElementById('sKicker').textContent = names[period][0];
  document.getElementById('sLabel').textContent = isAll ? 'All Time · every lead and appointment' : periodLabel(period, start, end);
  document.getElementById('sCompare').textContent = isAll ? 'Totals since the first lead' : `Arrows compare with the ${names[period][1]}`;
  document.querySelector('.period-nav').style.display = isAll ? 'none' : '';

  const sel = memberSel.value;
  const c = summaryStats(start, end, sel);
  const p = isAll ? {} : summaryStats(prev.start, prev.end, sel);
  const sep = isAll ? '' : ' · ';

  document.getElementById('sFunnelCards').innerHTML = [
    summaryCard('Leads', c.leads, 'came', deltaHtml(c.leads, p.leads)),
    summaryCard('Attended Quiz', c.attended, 'form', `${pct(c.attended, c.leads)}% of leads${sep}${deltaHtml(c.attended, p.attended)}`),
    summaryCard('Qualified', c.qualified, 'quiz', `${pct(c.qualified, c.attended)}% of quiz takers`),
    summaryCard('Not Qualified', c.notQualified, 'danger', `${pct(c.notQualified, c.attended)}% of quiz takers`),
    summaryCard('Booked', c.booked, 'team', `${pct(c.booked, c.qualified)}% of qualified${sep}${deltaHtml(c.booked, p.booked)}`)
  ].join('');

  document.getElementById('sApptCards').innerHTML = [
    summaryCard('Appointments', c.apptTotal, 'came', deltaHtml(c.apptTotal, p.apptTotal)),
    summaryCard('Showed Up', c.showed, 'quiz', deltaHtml(c.showed, p.showed)),
    summaryCard('No-show', c.noShow, 'danger', deltaHtml(c.noShow, p.noShow, false)),
    summaryCard('Cancelled', c.cancelled, 'muted-card', deltaHtml(c.cancelled, p.cancelled, false)),
    summaryCard('Show-up Rate', c.showRate == null ? '–' : `${c.showRate.toFixed(0)}%`, 'team',
      c.showRate == null ? 'No finished appointments yet' : `${c.showed} of ${c.showed + c.noShow} attended · ${c.upcoming} upcoming`)
  ].join('');

  // Per-member table (always for the whole team, so admin can compare)
  const rows = members.map(m => ({ name: m.name, inactive: !m.active, ...summaryStats(start, end, m.id) }));
  const un = summaryStats(start, end, 'unassigned');
  if (un.leads || un.apptTotal) rows.push({ name: 'Unassigned', unassigned: true, ...un });
  lastSummaryRows = rows;
  document.getElementById('sTableHint').textContent = periodLabel(period, start, end);
  const body = document.getElementById('sTableBody');
  const sq = document.getElementById('sSearch').value;
  const active = rows.filter(r => (r.leads || r.apptTotal) && matchesSearch(sq, r.name));
  body.innerHTML = active.length === 0
    ? emptyRow(10, '🗓️', sq ? 'No member matches your search.' : 'Nothing recorded in this period.', 'Use the arrows, pick another date or clear the search.')
    : active.map(r => `
      <tr class="${r.inactive ? 'row-inactive' : ''}">
        <td><strong class="${r.unassigned ? 'muted' : ''}">${esc(r.name)}</strong></td>
        <td><span class="badge came">${r.leads}</span></td>
        <td><span class="badge form">${r.attended}</span></td>
        <td>${r.qualified}</td>
        <td>${r.notQualified}</td>
        <td><span class="badge quiz">${r.booked}</span></td>
        <td>${r.showed}</td>
        <td>${r.noShow}</td>
        <td>${r.cancelled}</td>
        <td><strong>${r.showRate == null ? '–' : r.showRate.toFixed(0) + '%'}</strong></td>
      </tr>`).join('');
}

function exportSummaryCsv() {
  const { start, end } = periodRange(summaryState.period, summaryState.date);
  const label = periodLabel(summaryState.period, start, end);
  const header = ['Period', 'Member', 'Leads', 'Attended Quiz', 'Qualified', 'Not Qualified', 'Booked',
    'Appointments', 'Showed Up', 'No-show', 'Cancelled', 'Upcoming', 'Show-up Rate'];
  const total = { name: 'All Members', ...summaryStats(start, end, 'all') };
  const rows = [...lastSummaryRows, total].map(r => [label, r.name, r.leads, r.attended, r.qualified, r.notQualified,
    r.booked, r.apptTotal, r.showed, r.noShow, r.cancelled, r.upcoming,
    r.showRate == null ? '' : r.showRate.toFixed(0) + '%']);
  downloadCsv(`summary-${summaryState.period === 'all' ? 'all-time' : summaryState.period + '-' + toDateInput(start)}.csv`, [header, ...rows]);
}

/* ---------------- Lead details drawer ---------------- */

let drawerLeadId = null;

function detailRow(label, valueHtml) {
  return `<div class="detail-row"><span>${label}</span><strong>${valueHtml}</strong></div>`;
}

function openLeadDrawer(id) {
  const item = entries.find(x => x.id === id);
  if (!item) return;
  document.querySelector('.drawer-kicker').textContent = 'Lead Details';
  drawerLeadId = id;
  const owner = getMember(item.memberId);

  document.getElementById('drawerName').textContent = item.name;
  document.getElementById('drawerSub').textContent = `${item.id} · added ${fmtDate(item.date)}`;

  // Funnel progress
  const order = ['came', 'attended', 'booked'];
  const reached = order.indexOf(item.stage);
  const steps = [['came', 'Lead (Clicked)'], ['attended', 'Attended Quiz'], ['booked', 'Qualified & Booked']]
    .map(([key, label], i) => `<div class="step ${i <= reached ? 'done' : ''}"><span class="step-dot">${i <= reached ? '&#10003;' : i + 1}</span>${label}</div>`)
    .join('<div class="step-line"></div>');

  // Appointment
  const a = item.appointment;
  const apptHtml = a
    ? detailRow('Date', new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })) +
      detailRow('Time', fmtTime12(a.time)) +
      detailRow('Mode', esc(a.mode)) +
      detailRow('Status', esc(statusLabel(a.status))) +
      detailRow('Notes', a.notes ? esc(a.notes) : '–')
    : '<p class="muted">No appointment booked yet.</p>';

  // Form submission (Name, Contact number, Email address)
  const form = item.form;
  // Shown the way the form looks: each question with the person's answer filled in
  const formField = (label, value) => `
    <div class="form-view-field">
      <div class="form-view-label">${label} <span class="req">*</span></div>
      <div class="form-view-answer ${value ? '' : 'empty'}">${value ? esc(value) : 'No answer'}</div>
    </div>`;
  const formHtml = form
    ? `<div class="form-view">
         <div class="form-view-head">
           <span>${esc(formOf(item).name)}</span>
           <span class="muted small">Submitted ${form.submittedAt ? fmtDateTime(form.submittedAt) : '–'}</span>
         </div>
         <div class="form-view-body">
           ${formField('Name', form.name)}
           ${formField('Contact number', form.contact)}
           ${formField('Email address', form.email)}
         </div>
       </div>`
    : '<div class="placeholder-box">This person has not attended the quiz yet.</div>';

  // Quiz answers
  const s = quizScore(item);
  const quizHtml = s
    ? `<div class="quiz-score">
         <div class="quiz-score-num ${s.pct >= 80 ? 'good' : s.pct >= 40 ? 'mid' : 'low'}">${s.correct}/${s.total}</div>
         <div>
           <strong>${s.pct}% correct</strong>
           ${s.correct >= formOf(item).passMark ? '<span class="badge quiz">Qualified</span>' : '<span class="badge danger">Not qualified</span>'}
           <br><span class="muted small">Pass mark ${formOf(item).passMark}/${s.total} · submitted ${fmtDateTime(item.quiz.submittedAt)}</span>
         </div>
       </div>
       <ol class="quiz-list">
         ${formOf(item).questions.map((q, i) => {
           const given = item.quiz.answers[i];
           const ok = given === q.answer;
           return `<li class="${ok ? 'ok' : 'bad'}">
             <div class="quiz-q">${esc(q.q)}</div>
             <div class="quiz-a">${ok ? '✓' : '✗'} ${esc(q.options[given] ?? 'No answer')}</div>
             ${ok ? '' : `<div class="quiz-correct">Correct answer: ${esc(q.options[q.answer])}</div>`}
           </li>`;
         }).join('')}
       </ol>`
    : `<div class="placeholder-box">${item.stage !== 'came'
        ? 'Quiz marked as attended, but no answers were recorded.'
        : 'This person has not attempted the quiz yet.'}</div>`;

  document.getElementById('drawerBody').innerHTML = `
    <section class="drawer-section">
      <h4>Quiz Submission</h4>
      ${formHtml}
    </section>
    <section class="drawer-section">
      <h4>Quiz Answers <span class="demo-tag">Demo questions</span></h4>
      ${quizHtml}
    </section>
    <section class="drawer-section">
      <h4>Appointment</h4>
      ${apptHtml}
    </section>
    <section class="drawer-section">
      <h4>Funnel Progress</h4>
      <div class="steps">${steps}</div>
    </section>
    <section class="drawer-section">
      <h4>Lead Information</h4>
      ${detailRow('Lead ID', item.id)}
      ${detailRow('Form', `<button class="link-btn" onclick="closeLeadDrawer(); openFormDetail('${formOf(item).id}')">${esc(formOf(item).name)}</button>`)}
      ${detailRow('Current Stage', stageBadge(item.stage))}
      ${detailRow('Assigned To', owner ? esc(owner.name) : '<span class="muted">Unassigned</span>')}
      ${detailRow('Lead Date', fmtDate(item.date))}
    </section>`;
  document.getElementById('drawerBody').scrollTop = 0;

  document.getElementById('drawerFooter').innerHTML = `
    <button class="btn btn-outline" onclick="exportLeadCsv('${item.id}')">⬇ Export</button>
    ${canBook(item)
      ? `<button class="btn btn-outline" onclick="closeLeadDrawer(); openApptModal('${item.id}')">${a ? 'Edit Appointment' : '+ Book Appointment'}</button>`
      : ''}
    <button class="btn btn-danger" onclick="closeLeadDrawer(); askDeleteEntry('${item.id}')">Delete</button>`;

  document.getElementById('leadDrawer').classList.add('open');
}

function closeLeadDrawer() {
  document.getElementById('leadDrawer').classList.remove('open');
  drawerLeadId = null;
}

/* ---------------- Confirmation modal ---------------- */

let confirmAction = null;

function openConfirm(title, messageHtml, yesLabel, onYes) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').innerHTML = messageHtml;
  document.getElementById('confirmYesBtn').textContent = yesLabel;
  confirmAction = onYes;
  document.getElementById('confirmModal').style.display = 'flex';
}

/* ---------------- Appointments ---------------- */

let apptEntryId = null;

// Only people who attended the quiz and did not fail it can book
function canBook(item) {
  return !!item.appointment || (item.stage !== 'came' && isQualified(item) !== false);
}

function openApptModal(id) {
  const item = entries.find(x => x.id === id);
  if (!item || !canBook(item)) return;
  apptEntryId = id;
  const a = item.appointment;
  document.getElementById('apptModalTitle').textContent = a ? 'Edit Appointment' : 'Book Appointment';
  const sc = quizScore(item);
  document.getElementById('apptLeadName').textContent =
    `For ${item.name}${sc ? ` · quiz ${sc.correct}/${sc.total} (qualified)` : ''}`;
  document.getElementById('apptDate').value = a ? a.date : toDateInput(new Date(Date.now() + 86400000));
  document.getElementById('apptTime').value = a ? a.time : '11:00';
  document.getElementById('apptMode').value = a ? a.mode : 'Online';
  document.getElementById('apptStatus').value = a ? a.status : 'Scheduled';
  document.getElementById('apptNotes').value = a ? (a.notes || '') : '';
  document.getElementById('apptRemoveBtn').style.visibility = a ? 'visible' : 'hidden';
  document.getElementById('apptModal').style.display = 'flex';
}

function handleSaveAppt(e) {
  e.preventDefault();
  const item = entries.find(x => x.id === apptEntryId);
  if (!item) return;
  item.appointment = {
    date: document.getElementById('apptDate').value,
    time: document.getElementById('apptTime').value,
    mode: document.getElementById('apptMode').value,
    status: document.getElementById('apptStatus').value,
    notes: document.getElementById('apptNotes').value.trim()
  };
  syncStage(item); // a booking moves the lead to "Qualified & Booked"
  saveEntries();
  closeModal('apptModal');
  render();
}

function removeAppointment() {
  const item = entries.find(x => x.id === apptEntryId);
  if (!item) return;
  closeModal('apptModal');
  openConfirm('Remove appointment?',
    `The appointment for <strong>${esc(item.name)}</strong> will be removed. The lead itself stays.`,
    'Yes, Remove',
    () => { delete item.appointment; syncStage(item); saveEntries(); render(); });
}

function reassignEntry(id, memberId) {
  if (ui.view !== 'admin') return;
  const item = entries.find(x => x.id === id);
  if (!item) return;
  item.memberId = memberId;
  saveEntries();
  render();
}

/* ---------------- Member actions (Admin) ---------------- */

function toggleMemberActive(id) {
  const m = getMember(id);
  if (!m) return;
  m.active = !m.active;
  saveMembers();
  render();
}

function removeMember(id) {
  const m = getMember(id);
  if (!m) return;
  const owned = entries.filter(e => e.memberId === id).length;
  const msg = owned
    ? `<strong>${esc(m.name)}</strong> will be removed from the team. Their ${owned} lead${owned === 1 ? '' : 's'} will become Unassigned (not deleted).`
    : `<strong>${esc(m.name)}</strong> will be removed from the team.`;
  openConfirm('Remove this member?', msg, 'Yes, Remove', () => {
    members = members.filter(x => x.id !== id);
    entries.forEach(e => { if (e.memberId === id) e.memberId = ''; });
    saveMembers();
    saveEntries();
    render();
  });
}

/* ---------------- Modals ---------------- */

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function openEntryModal(context) {
  entryModalContext = context;
  document.getElementById('entryModalTitle').textContent = context === 'admin' ? 'Record Person / Entry' : 'Add My Lead';
  document.getElementById('entryName').value = '';
  const formSel = document.getElementById('entryForm');
  populateFormSelect(formSel, false);
  const activeForm = FORMS.find(f => f.status === 'Active');
  const preferred = ui.adminTab === 'forms' && ui.formView ? ui.formView : document.getElementById('aFilterForm').value;
  formSel.value = getFormById(preferred) ? preferred : (activeForm || FORMS[0]).id;
  document.getElementById('entryContact').value = '';
  document.getElementById('entryEmail').value = '';
  document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('entryStage').value = 'came';

  const group = document.getElementById('entryAssignGroup');
  if (context === 'admin') {
    const sel = document.getElementById('entryAssign');
    sel.innerHTML = '<option value="">Unassigned</option>' +
      activeMembers().map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    const filterVal = document.getElementById('aFilterMember').value;
    sel.value = activeMembers().some(m => m.id === filterVal) ? filterVal : '';
    group.style.display = 'block';
  } else {
    group.style.display = 'none'; // portal leads always belong to the signed-in member
  }

  document.getElementById('entryModal').style.display = 'flex';
  document.getElementById('entryName').focus();
}

function handleAddEntry(e) {
  e.preventDefault();
  const nameInput = document.getElementById('entryName').value.trim();
  const dateInput = document.getElementById('entryDate').value;
  const date = dateInput ? new Date(dateInput + 'T12:00:00').toISOString() : new Date().toISOString();

  const memberId = entryModalContext === 'admin'
    ? document.getElementById('entryAssign').value
    : ui.memberId;

  const stage = document.getElementById('entryStage').value;
  const name = nameInput || `Person #${entries.length + 1}`;
  const contact = document.getElementById('entryContact').value.trim();
  const email = document.getElementById('entryEmail').value.trim();

  const newEntry = {
    id: uid('ENT'),
    name,
    formId: document.getElementById('entryForm').value,
    stage,
    date,
    memberId
  };
  // A form-filled (or quiz) lead gets a form record so it can be viewed
  if (stage !== 'came' || contact || email) {
    newEntry.form = { name, contact, email, submittedAt: date };
  }
  entries.unshift(newEntry);
  saveEntries();
  closeModal('entryModal');
  render();
}

function openMemberModal(id) {
  editingMemberId = id || null;
  const m = id ? getMember(id) : null;
  document.getElementById('memberModalTitle').textContent = m ? 'Edit Marketing Member' : 'Add Marketing Member';
  document.getElementById('memberName').value = m ? m.name : '';
  document.getElementById('memberEmail').value = m ? (m.email || '') : '';
  document.getElementById('memberPhone').value = m ? (m.phone || '') : '';
  document.getElementById('memberTarget').value = m && m.target ? m.target : '';
  document.getElementById('memberError').textContent = '';
  document.getElementById('memberModal').style.display = 'flex';
  document.getElementById('memberName').focus();
}

function handleSaveMember(e) {
  e.preventDefault();
  const name = document.getElementById('memberName').value.trim();
  const email = document.getElementById('memberEmail').value.trim();
  const phone = document.getElementById('memberPhone').value.trim();
  const target = Math.max(0, parseInt(document.getElementById('memberTarget').value, 10) || 0);
  const errEl = document.getElementById('memberError');

  if (!name) { errEl.textContent = 'Name is required.'; return; }
  if (email && members.some(m => m.id !== editingMemberId && (m.email || '').toLowerCase() === email.toLowerCase())) {
    errEl.textContent = 'Another member already uses this email.';
    return;
  }

  if (editingMemberId) {
    const m = getMember(editingMemberId);
    Object.assign(m, { name, email, phone, target });
  } else {
    members.push({ id: uid('MEM'), name, email, phone, target, active: true, joined: new Date().toISOString() });
  }
  saveMembers();
  closeModal('memberModal');
  render();
}

/* ---------------- Light / dark mode ---------------- */

const THEME_KEY = 'clean_marketing_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const dark = theme === 'dark';
  document.getElementById('themeIcon').textContent = dark ? '☀️' : '🌙';
  document.getElementById('themeLabel').textContent = dark ? 'Light mode' : 'Dark mode';
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage unavailable: still switch */ }
  applyTheme(next);
}

/* ---------------- Init ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  loadData();

  // Search boxes
  document.getElementById('aSearch').addEventListener('input', e => { searchState[searchKey()] = e.target.value; render(); });
  document.getElementById('sSearch').addEventListener('input', render);
  document.getElementById('pSearch').addEventListener('input', render);
  const gInput = document.getElementById('globalSearch');
  const gBox = document.getElementById('globalResults');
  gInput.addEventListener('input', e => renderGlobalResults(e.target.value));
  gInput.addEventListener('focus', e => renderGlobalResults(e.target.value));
  gInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const first = gBox.querySelector('.gr-item'); if (first) first.click(); }
    if (e.key === 'Escape') { gBox.classList.remove('open'); gInput.blur(); }
  });
  gBox.addEventListener('mousedown', e => {
    const btn = e.target.closest('.gr-item');
    if (btn) { e.preventDefault(); openGlobalResult(btn.dataset.type, btn.dataset.id); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#globalSearchBox')) gBox.classList.remove('open'); });

  // Marketing Portal: who is using it, and the "Raise a Problem" form
  document.getElementById('signedInAs').addEventListener('change', e => { ui.memberId = e.target.value; saveUi(); render(); });
  document.getElementById('helpForm').addEventListener('submit', handleHelpSubmit);
  // portal.html ↔ index.html switch via the link only (no button)
  window.addEventListener('hashchange', () => { ui.view = location.hash === '#portal' ? 'portal' : 'admin'; closeLeadDrawer(); render(); });

  // Summary controls
  document.getElementById('sPeriod').addEventListener('change', e => { summaryState.period = e.target.value; render(); });
  document.getElementById('sDate').addEventListener('change', e => { if (e.target.value) { summaryState.date = e.target.value; render(); } });
  document.getElementById('sPrev').addEventListener('click', () => shiftPeriod(-1));
  document.getElementById('sNext').addEventListener('click', () => shiftPeriod(1));
  document.getElementById('sToday').addEventListener('click', () => { summaryState.date = toDateInput(new Date()); render(); });
  document.getElementById('sMember').addEventListener('change', render);

  // Light / dark switch
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Left sidebar tabs
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ui.adminTab = btn.dataset.tab;
      if (btn.dataset.tab === 'forms') ui.formView = null; // menu click always shows the list of forms
      saveUi();
      render();
      window.scrollTo({ top: 0 });
    });
  });

  // Daily / Week-wise / Month-wise dropdowns (each view remembers its own)
  document.getElementById('aFilterView').addEventListener('change', e => {
    ui.modeAdmin = e.target.value;
    saveUi();
    render();
  });
  document.getElementById('pFilterView').addEventListener('change', e => {
    ui.modePortal = e.target.value;
    saveUi();
    render();
  });

  ['aFilterMember', 'aFilterForm', 'aFilterDateRange', 'aFilterAppt', 'pFilterDateRange',
   'tFilterStatus', 'tFilterTarget', 'tSortBy']
    .forEach(id => document.getElementById(id).addEventListener('change', render));

  document.getElementById('addEntryForm').addEventListener('submit', handleAddEntry);
  document.getElementById('memberForm').addEventListener('submit', handleSaveMember);

  document.getElementById('apptForm').addEventListener('submit', handleSaveAppt);
  document.getElementById('confirmYesBtn').addEventListener('click', () => {
    const action = confirmAction;
    confirmAction = null;
    closeModal('confirmModal');
    if (action) action();
  });

  const MODALS = ['entryModal', 'memberModal', 'apptModal', 'confirmModal', 'helpModal'];
  MODALS.forEach(id => {
    document.getElementById(id).addEventListener('click', e => { if (e.target.id === id) closeModal(id); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { MODALS.forEach(closeModal); closeLeadDrawer(); }
  });

  // Click anywhere on a lead / response row (except its buttons / dropdown) to open details
  ['aEntriesTableBody'].forEach(tbodyId => {
    document.getElementById(tbodyId).addEventListener('click', e => {
      if (e.target.closest('button, select, a, input')) return;
      const row = e.target.closest('tr[data-lead]');
      if (row) openLeadDrawer(row.dataset.lead);
    });
  });
  document.getElementById('leadDrawer').addEventListener('click', e => {
    if (e.target.id === 'leadDrawer') closeLeadDrawer();
  });

  render();
});
