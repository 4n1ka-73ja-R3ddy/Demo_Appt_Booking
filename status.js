const root = document.getElementById('statusRoot');
const id = new URLSearchParams(location.search).get('id') || '';

function showLookup(message = '') {
  root.innerHTML = `<div class="section-kicker">CHECK STATUS</div><h1 class="page-title">Find your appointment</h1><p class="hero-copy compact">Enter the appointment ID you received when you booked.</p><div class="details-form"><div class="field-card full"><label for="rid">APPOINTMENT ID</label><input id="rid" placeholder="AH-UUID" value="${escapeHTML(id)}"></div></div><p id="lookupError" class="form-error ${message ? '' : 'hidden'}">${escapeHTML(message)}</p><div class="form-actions"><span></span><button class="primary-btn" id="go">View status</button></div>`;
  document.getElementById('go').onclick = () => {
    const ref = document.getElementById('rid').value.trim();
    if (!ref) return;
    location.search = '?id=' + encodeURIComponent(ref);
  };
}

async function draw() {
  if (!id) { showLookup(); return; }
  root.innerHTML = '<p class="muted">Loading appointment details…</p>';
  try {
    const b = await apiFetch('/api/appointments/' + encodeURIComponent(id) + '/');
    const meet = b.meet_url ? `<p class="form-actions"><a class="primary-btn link-btn" href="${escapeHTML(b.meet_url)}" target="_blank" rel="noopener">Join Google Meet ↗</a></p>` : '<p class="muted">The booking was saved, but Google has not returned a Meet link yet. Check the Calendar event and OAuth permissions.</p>';
    const calendar = b.calendar_url ? `<p><a href="${escapeHTML(b.calendar_url)}" target="_blank" rel="noopener">Open Google Calendar event ↗</a></p>` : '';
    root.innerHTML = `<div class="success-icon">✓</div><div class="confirmation"><div class="section-kicker">APPOINTMENT ${escapeHTML(b.appointment_id)}</div><h1 class="page-title">Appointment confirmed</h1><p class="hero-copy compact">Your appointment has been booked directly. No trainer approval or payment is required.</p><div class="appointment-summary"><div class="summary-top"><span class="summary-icon">◷</span><div><small>APPOINTMENT</small><strong>${escapeHTML(dayOf(b.date))}, ${escapeHTML(prettyDate(b.date))}</strong></div><span class="status confirmed" style="margin-left:auto">Confirmed</span></div><div class="summary-grid">${[['TIME', fmt(b.time)], ['DURATION', b.duration + ' minutes'], ['NAME', b.name], ['EMAIL', b.email], ['PHONE', b.phone], ['TIME ZONE', b.timezone]].map(([l,v]) => `<div><small>${l}</small><b>${escapeHTML(v)}</b></div>`).join('')}</div></div>${meet}${calendar}<div class="form-actions"><span class="muted">Appointment ID: <b>${escapeHTML(b.appointment_id)}</b></span><a class="secondary-btn link-btn" href="index.html">Book another appointment</a></div></div>`;
  } catch (err) {
    showLookup(err.message);
  }
}
draw();
