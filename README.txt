APPOINTMENTHUB — FRONTEND PROTOTYPE (UPDATED OCT 2026)
=======================================================

Purpose
-------
This is a frontend prototype for the appointment-booking workflow, updated after sir reviewed
the earlier version on the Oct 8, 2026 Google Meet call. The previous approval/payment workflow is not part of the recalled Calendly-like flow. The intended full journey begins with a separate smart-routing form maintained by a teammate; only eligible candidates should reach this calendar, then booking is confirmed directly if the slot remains free.

WHAT CHANGED IN THIS UPDATE
---------------------------
- Removed: trainer accept/reject, payment step, pending-approval status, priority-score indicator.
- Added: red-asterisk required-field markers on name/email/phone, a 7-day max booking window,
  duration options of 15, 30, 45 or 60 minutes (confirm the final list with the mentor),
  and a confirmed-appointments view on the trainer side (replacing the request inbox).
- Fixed a real bug: trainer.js was writing availability changes under a key that didn't exist
  (KEYS.avail instead of KEYS.availability), so trainer edits never actually reached the booking
  page. This is now fixed — availability changes made on the trainer side immediately affect
  what candidates see.
- Kept unchanged: weekly availability management and specific busy/leave/holiday blocking on the
  trainer side (sir specifically liked this feature).
- Added `ROUTING_INTEGRATION.md`: the upstream smart-routing form is part of the intended journey, but its questions and qualification rules belong to another teammate and are not invented in this package.

IMPORTANT RESPONSIBILITY BOUNDARY
----------------------------------
The real external application form is NOT created in this package. It is owned/provided by
another project team member. The actual form URL, eligibility rules and redirect must still be supplied by the form teammate; see `ROUTING_INTEGRATION.md`.

Candidate flow
--------------
External smart-routing form (owned by teammate; eligibility logic not included here)
  -> eligible candidates are redirected to index.html
  -> choose a date (within the next 7 days), duration (15/30/45/60 minutes) and available time
  -> details.html
  -> enter name / email / phone (all required, marked with a red *)
  -> appointment is CONFIRMED immediately
  -> status.html
  -> confirmation details + appointment ID

Trainer flow
------------
trainer.html
  -> Confirmed appointments
     - search candidate/email/appointment ID
     - filter by exact date, month, or time
     - sort by date/time or newest
     - view appointment details (read-only — there's no accept/reject anymore)
  -> Availability
     - view weekly schedule
     - modify weekly timings
     - mark full dates or time ranges unavailable (busy / on leave / holiday)

Demo behavior
-------------
- Data is stored in localStorage only. This is NOT the production backend.
- Only a CONFIRMED appointment can block a slot — there's no other status left to consider.
- Notification (confirmation email) is represented in the UI copy only, not actually sent.
- The candidate booking pages are wired to the Django API. The backend uses SQLite by default for this phase and requires trainer OAuth authorization plus schedule setup before live calendar booking works. The trainer dashboard schedule editor and appointment list remain localStorage demo features.

How to run
-----------
1. Open this folder in VS Code.
2. Use Live Server (recommended) on index.html.
3. Candidate flow: index.html -> details.html -> status.html.
4. For the trainer demonstration, open trainer.html directly. It is intentionally not linked
   from the candidate pages.
5. Click "Load demo appointments" in the trainer portal to populate sample confirmed bookings.
6. Use the Availability tab to change timings or mark a day unavailable, then go back to
   index.html and pick that date — the change is reflected immediately.

Files
-----
index.html              Candidate slot selection
details.html/js         Candidate details + direct booking confirmation
status.html/js          Candidate confirmation screen / appointment lookup by ID
application.html        External-form integration placeholder (untouched, see note above)
trainer.html/js         Trainer portal and availability management
trainer-requests.js     Trainer confirmed-appointments list, filters (no accept/reject)
shared.js               Shared demo data, status model, slot logic and integration configuration
style.css               UI styling
Updated_System_Use_Case_Diagram.png  Regenerated to remove the old accept/reject + payment use
                         cases and reflect direct booking
API_CONTRACT.md         Backend handoff contract, including smart-routing and calendar flow
ROUTING_INTEGRATION.md  Handoff contract for the external screening/routing form
PROJECT_REQUIREMENTS.md Updated scope, responsibilities, assumptions and open questions

NOT PRODUCTION YET — IMPORTANT
------------------
The following must be connected in the backend stage:
- database (PostgreSQL, per the meeting decision)
- production PostgreSQL setup (next step; SQLite is used locally for this phase)
- trainer authentication (if confirmed as needed)
- real external-form role, if the team decides it still applies
- notification service (confirmation email)
- Configure OAuth credentials and verify a real Google Calendar event + Meet link (see backend/README_GOOGLE_CALENDAR.md)
- a real double-booking check that isn't just localStorage on one browser

Do not present the demo localStorage behavior as the final backend implementation.

GOOGLE CALENDAR API SCAFFOLD
----------------------------
See backend/README_GOOGLE_CALENDAR.md for setup, service-account sharing, API endpoints, and limitations. The API integration is not live until the team configures valid credentials and tests it against the actual trainer calendar.

IMPORTANT PROTOTYPE LIMITATIONS
- The candidate-facing HTML/JavaScript prototype uses browser localStorage unless explicitly connected to the Django API.
- Google Calendar integration requires a configured Google Cloud project, API credentials, and access to the target calendar.
- The Django API is not production-ready; trainer authentication, CSRF protection, deployment hardening, separate confirmation emails, and trainer-dashboard/API integration remain future work.
- Current selectable durations are 15, 30, 45 and 60 minutes based on the student’s recollection of the Calendly walkthrough; confirm the final list with the mentor.
