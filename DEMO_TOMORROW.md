# AppointmentHub — demo checklist

## What is implemented

- Responsive candidate booking pages with 15-, 30-, 45- and 60-minute options.
- Required name/email/phone fields with red asterisks and client-side validation.
- Django API endpoints for Calendar status, Google Calendar FreeBusy, slot generation, booking creation and appointment lookup.
- Candidate pages (`index.html`, `booking.js`, `details.js`, `status.js`) call the Django API. A booking is only confirmed when the backend returns success.
- Backend rechecks Google Calendar busy time, backend availability and booking conflicts before creating the Calendar event.
- Event creation requests a unique Google Meet conference and sends a Calendar invitation to the candidate.
- Backend schedule models can be configured through Django admin; SQLite is the local default database for this phase.

## What must be configured before calling it live

- A Google Cloud project with Calendar API enabled.
- OAuth consent setup and a Desktop OAuth client JSON file, stored privately at `backend/secrets/credentials.json`.
- Trainer/calendar owner authorization via `python manage.py authorize_google_calendar`.
- Correct calendar ID and timezone in `backend/.env`.
- Weekly availability and unavailable periods entered in Django admin.
- A real end-to-end test confirming that the event appears in Google Calendar and includes the expected Meet link.

## Still not complete

- The trainer HTML dashboard still uses localStorage for its schedule editor and appointment list; use Django admin for the real backend schedule in this phase.
- PostgreSQL migration/deployment is next.
- Confirmation emails separate from Google Calendar invitations are not implemented.
- Trainer authentication/authorization, production CSRF strategy, rate limiting and deployment hardening remain.
- The external smart-routing form is owned by a teammate and is not included here.

## Demo sequence

1. Start Django and verify `/api/calendar/status/` reports `configured: true`.
2. Open `index.html` with VS Code Live Server.
3. Select a date, duration and available slot from live backend results.
4. Enter candidate details and book.
5. Show the appointment reference and Calendar/Meet links on the confirmation page.
6. Verify the event in the trainer's actual Google Calendar.
7. Explain that the trainer UI is still demo-only for schedule editing; actual backend hours/blocks are configured in Django admin.
