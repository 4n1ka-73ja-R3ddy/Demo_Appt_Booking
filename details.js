const $ = id => document.getElementById(id), sel = read(KEYS.selected, null), row = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
if (!sel) {
  $('summary').innerHTML = '<div class="empty-state"><b>No slot selected</b><p>Go back and choose a preferred slot.</p></div>';
  $('confirmBtn').disabled = true;
} else {
  $('summary').innerHTML = `<div class="summary-top"><span class="summary-icon">◷</span><div><small>YOUR SLOT</small><strong>${dayOf(sel.date)}, ${prettyDate(sel.date)}</strong></div></div><div class="summary-grid">${row('TIME', fmt(sel.time))}${row('DURATION', sel.duration + ' minutes')}</div>`;
}
function fail(message) { const e = $('formError'); e.textContent = message; e.classList.remove('hidden'); }
function clearError() { const e = $('formError'); e.textContent = ''; e.classList.add('hidden'); }

$('confirmBtn').onclick = async () => {
  clearError();
  if (!sel) return fail('No slot selected. Please go back and choose a slot.');
  const name = $('name').value.trim(), email = $('email').value.trim().toLowerCase(), phone = $('phone').value.trim();
  if (!name || !email || !phone) return fail('Please fill in your name, email and phone number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email address.');
  if (phone.replace(/\D/g, '').length < 10) return fail('Please enter a valid phone number.');
  const button = $('confirmBtn');
  button.disabled = true; button.textContent = 'Booking…';
  try {
    const idem = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `ah-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const booking = await apiFetch('/api/appointments/', {
      method: 'POST',
      headers: { 'Idempotency-Key': idem },
      body: JSON.stringify({ name, email, phone, date: sel.date, time: sel.time, duration: sel.duration })
    });
    localStorage.removeItem(KEYS.selected);
    location.href = 'status.html?id=' + encodeURIComponent(booking.appointment_id);
  } catch (err) {
    fail(err.message);
    button.disabled = false; button.innerHTML = 'Confirm appointment <span>→</span>';
  }
};
