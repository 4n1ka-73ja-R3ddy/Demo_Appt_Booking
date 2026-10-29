const $ = id => document.getElementById(id);
const dateInput = $('date'), grid = $('slots'), nextBtn = $('continueBtn'), empty = $('noSlots'), durGroup = $('durationGroup');
let duration = CONFIG.DURATIONS[0], selected = null, renderSequence = 0;

durGroup.innerHTML = CONFIG.DURATIONS.map((d, i) => `<button class="duration${i === 0 ? ' active' : ''}" data-duration="${d}">${d} min</button>`).join('');

function setStatus(message, isError = false) {
  const el = $('calendarApiStatus');
  el.textContent = message;
  el.style.color = isError ? '#b42318' : '';
}

async function checkCalendarStatus() {
  try {
    const status = await apiFetch('/api/calendar/status/');
    setStatus(`Connected to Google Calendar (${status.calendarId}). Times shown in ${status.timezone || 'Asia/Kolkata'}.`);
  } catch (err) {
    setStatus(`Google Calendar is not connected: ${err.message}`, true);
  }
}

function showError(message) {
  grid.innerHTML = '';
  empty.classList.remove('hidden');
  empty.querySelector('b').textContent = 'Calendar unavailable';
  empty.querySelector('p').textContent = message;
  $('liveStatus').textContent = 'Unable to load slots';
  $('liveStatus').classList.add('none');
}

async function render() {
  const sequence = ++renderSequence;
  selected = null;
  nextBtn.disabled = true;
  const iso = dateInput.value;
  if (!iso) { grid.innerHTML = ''; empty.classList.add('hidden'); return; }
  grid.innerHTML = '<p class="muted">Loading live availability…</p>';
  empty.classList.add('hidden');
  try {
    const result = await apiFetch(`/api/slots/?date=${encodeURIComponent(iso)}&duration=${duration}`);
    if (sequence !== renderSequence) return;
    const slots = result.slots || [];
    const free = slots.filter(s => s.status === 'available').length;
    $('slotSubtitle').textContent = `${dayOf(iso)} • ${prettyDate(iso)} • ${duration} minute appointment`;
    const labels = { booked: 'Booked', unavailable: 'Unavailable' };
    grid.innerHTML = slots.map(s => `<button class="slot ${escapeHTML(s.status)}" data-time="${escapeHTML(s.time)}" ${s.status !== 'available' ? 'disabled' : ''}>${fmt(s.time)}${labels[s.status] ? `<small>${labels[s.status]}</small>` : ''}</button>`).join('');
    $('liveStatus').textContent = free ? `${free} slot${free > 1 ? 's' : ''} available` : 'No slots available';
    $('liveStatus').classList.toggle('none', !free);
    empty.classList.toggle('hidden', free > 0);
    empty.querySelector('b').textContent = 'No slots available';
    empty.querySelector('p').textContent = slots.length ? 'All times are booked or unavailable. Try another date or duration.' : 'No trainer availability is configured for this date. Ask the trainer to set weekly hours in Django admin.';
  } catch (err) {
    if (sequence !== renderSequence) return;
    showError(err.message);
    setStatus(`Google Calendar/API error: ${err.message}`, true);
  }
}

grid.addEventListener('click', e => {
  const btn = e.target.closest('.slot:not([disabled])');
  if (!btn) return;
  grid.querySelectorAll('.slot').forEach(x => x.classList.remove('selected'));
  btn.classList.add('selected');
  selected = btn.dataset.time;
  nextBtn.disabled = false;
});

durGroup.addEventListener('click', e => {
  const btn = e.target.closest('.duration');
  if (!btn) return;
  durGroup.querySelectorAll('.duration').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  duration = Number(btn.dataset.duration);
  render();
});

dateInput.min = localISO(new Date());
dateInput.max = maxBookableDate();
dateInput.value = dateInput.min;
dateInput.addEventListener('change', () => {
  if (dateInput.value < dateInput.min) dateInput.value = dateInput.min;
  if (dateInput.value > dateInput.max) dateInput.value = dateInput.max;
  render();
});
nextBtn.addEventListener('click', () => {
  if (!selected) return;
  write(KEYS.selected, { date: dateInput.value, time: selected, duration });
  location.href = 'details.html';
});
checkCalendarStatus();
render();
