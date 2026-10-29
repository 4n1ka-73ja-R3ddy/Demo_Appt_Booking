/* AppointmentHub frontend prototype. localStorage is demo-only; real shared availability
   must be supplied by the Django backend + Google Calendar integration. The intended candidate
   journey begins with a separate smart-routing form. Eligible candidates are redirected to index.html.
   Payment is not required. */
const KEYS = { availability:'ah_availability_v2', bookings:'ah_bookings_v3', selected:'ah_selected_v2' };
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const WEEK_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const CONFIG = {
  EXTERNAL_FORM_URL: '', // Teammate supplies the smart-routing form URL; see ROUTING_INTEGRATION.md.
  BOOKING_WINDOW_DAYS: 7, // Candidates can only book within the next 7 days (meeting decision, Oct 8 2026).
  // Durations shown in the mentor's Calendly-style walkthrough: 15, 30, 45 and 60 minutes.
  DURATIONS: [15, 30, 45, 60]
};
// Booking is confirmed immediately after the eligible candidate chooses a still-free slot.
// Candidate qualification belongs to the separate smart-routing form, not this calendar UI.
const STATUS = {
  CONFIRMED:{label:'Confirmed',cls:'confirmed'}
};
const DEFAULT_AVAIL = {weekly:{
  Monday:{on:true,start:'10:00',end:'13:00'}, Tuesday:{on:true,start:'10:00',end:'13:00'},
  Wednesday:{on:false}, Thursday:{on:true,start:'14:00',end:'17:00'}, Friday:{on:true,start:'10:00',end:'13:00'},
  Saturday:{on:false}, Sunday:{on:false}
}, leaves:[]};
function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}}
function write(key,val){localStorage.setItem(key,JSON.stringify(val))}
function clone(x){return JSON.parse(JSON.stringify(x))}
function getAvail(){return read(KEYS.availability,clone(DEFAULT_AVAIL))}
function getBookings(){return read(KEYS.bookings,[])}
function saveBookings(v){write(KEYS.bookings,v)}
function getBooking(id){return getBookings().find(b=>b.id===id)}
function updateBooking(id,patch){const a=getBookings();const i=a.findIndex(b=>b.id===id);if(i<0)return null;a[i]={...a[i],...patch};saveBookings(a);return a[i]}
function newId(){return 'AH-'+Math.random().toString(36).slice(2,7).toUpperCase()+'-'+Date.now().toString().slice(-4)}
function toMin(t){const [h,m]=t.split(':').map(Number);return h*60+m}
function toTime(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function fmt(t){const [h,m]=t.split(':').map(Number);return ((h%12)||12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'PM':'AM')}
function localISO(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function dayOf(iso){return DAYS[new Date(iso+'T00:00:00').getDay()]}
function prettyDate(iso){return new Date(iso+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}
function monthLabel(iso){return new Date(iso+'T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}
function overlaps(aStart,aDuration,bStart,bDuration){return toMin(aStart)<toMin(bStart)+bDuration && toMin(bStart)<toMin(aStart)+aDuration}
// Only a CONFIRMED booking can block a slot now — there is no ACCEPTED/pending state to check.
function confirmedConflict(date,time,duration,ignoreId=''){return getBookings().some(b=>b.id!==ignoreId&&b.date===date&&b.status==='CONFIRMED'&&overlaps(time,duration,b.time,b.duration))}
// Last 7-day booking window, per the Oct 8 2026 meeting decision. Convention used here: "today"
// counts as day 1, so the window runs through today + (BOOKING_WINDOW_DAYS - 1). Confirm the
// exact inclusive/exclusive convention with ma'am before this becomes the backend rule too.
function maxBookableDate(){const d=new Date();d.setDate(d.getDate()+CONFIG.BOOKING_WINDOW_DAYS-1);return localISO(d)}
function getSlots(iso,duration){
  const a=getAvail(),w=a.weekly[dayOf(iso)]; if(!w||!w.on)return [];
  const leaves=a.leaves.filter(l=>l.date===iso), bookings=getBookings().filter(b=>b.date===iso&&b.status==='CONFIRMED');
  const now=new Date(), today=iso===localISO(now), nowMin=now.getHours()*60+now.getMinutes(); const out=[];
  for(let s=toMin(w.start);s+duration<=toMin(w.end);s+=duration){
    if(today&&s<=nowMin)continue; const e=s+duration, clash=(x,y)=>s<y&&x<e;
    let status='available';
    if(bookings.some(b=>clash(toMin(b.time),toMin(b.time)+b.duration)))status='booked';
    else if(leaves.some(l=>!l.start||clash(toMin(l.start),toMin(l.end))))status='unavailable';
    out.push({time:toTime(s),status});
  }
  return out;
}
function resetDemo(){localStorage.removeItem(KEYS.availability);localStorage.removeItem(KEYS.bookings);localStorage.removeItem(KEYS.selected)}


// Live backend API. Serve this frontend with VS Code Live Server (not file://).
const API_BASE_URL = window.APPOINTMENT_API_BASE_URL || 'http://127.0.0.1:8000';
async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  let payload = {};
  try { payload = await response.json(); } catch { /* empty/non-JSON response */ }
  if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
  return payload;
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
