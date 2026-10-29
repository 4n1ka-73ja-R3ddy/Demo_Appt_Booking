# AppointmentHub — Backend API Handoff Contract

This is an implementation contract for the future backend. It intentionally avoids choosing a backend framework/database until ma'am confirms the stack (the Oct 8, 2026 team meeting specified Python + Django + PostgreSQL for the overall project — see PROJECT_REQUIREMENTS.md).

> **Updated Oct 2026:** per sir's feedback on the UI prototype, the appointment-approval and payment
> workflow described in the older version of this file has been removed. A booking is now confirmed
> directly when the candidate submits their details. `PENDING_APPROVAL`, `ACCEPTED` and `/payments/*` are not part of the appointment flow. A separate
> smart-routing form qualifies candidates before they reach this calendar; the form logic is owned by another teammate.

## Candidate APIs

### GET /slots?date=YYYY-MM-DD&duration=15|30|45|60
Returns slots derived from trainer availability, blocked/unavailable periods, and already-confirmed appointments. The prototype offers 15-, 30-, 45- and 60-minute appointments, matching the durations recalled from the Calendly walkthrough. Confirm the final allowed options with the mentor.

Suggested response:
```json
{
  "date": "2026-10-10",
  "duration": 30,
  "slots": [
    {"time":"10:00","status":"available"},
    {"time":"10:30","status":"booked"},
    {"time":"11:00","status":"unavailable"}
  ]
}
```
Only `available`, `booked` (an existing confirmed appointment) and `unavailable` (a trainer-blocked period) are valid slot statuses now — there is no `requested` status.

The backend must also enforce the booking window (next 7 days from today) and reject a `date` outside it, matching the frontend's `dateInput.max`.

### POST /appointments
Books an appointment **directly** — no separate request/approval step.

Minimum data:
- date
- time
- duration
- candidate name
- email
- phone

The backend must re-check availability atomically before writing the appointment (the frontend's own check is advisory only and cannot prevent two people racing for the same slot). On success, it returns a unique `appointment_id` and status `CONFIRMED`. On conflict, it returns an error indicating the slot is no longer available — the frontend must not blindly show "confirmed" without this round trip.

### GET /appointments/:id
Returns the appointment details for the candidate's confirmation/status page.

### POST /appointments/:id/cancel
**Not yet implemented in the frontend.** Cancellation was mentioned as a possibility but who can cancel, when, and how the calendar event is removed have not been confirmed. Do not build this until that's agreed.

## Trainer APIs

### POST /trainer/login
Authentication method is TBD — whether the trainer side needs a login at all has not been confirmed (candidates confirmed do not need one, per the hospital-booking example).

### GET /trainer/appointments
Returns confirmed appointments only. Suggested filters:
- candidate/user search
- exact date
- month
- time
- sort by date/time or newest

### GET /trainer/appointments/:id
Returns candidate details and the appointment's date/time/duration.

### GET /trainer/availability
Returns weekly availability and date/time blocks.

### PUT /trainer/availability
Updates weekly availability.

### POST /trainer/unavailable-periods
Creates a busy/leave/holiday block.

### DELETE /trainer/unavailable-periods/:id
Removes a future block.

## External integrations

### Smart-routing form
The intended journey starts with a separate form that asks screening/mentorship questions. Its radio-button/drop-down logic filters candidates; only eligible candidates are redirected to this calendar. The exact questions, qualification rules, destination for ineligible candidates, form platform and return URL are owned by the teammate responsible for the form and must be supplied before production integration. Do not invent the screening criteria. See `ROUTING_INTEGRATION.md`.

### Notification
The channel is TBD. The backend should expose one internal notification service (confirmation email) so the channel can change without changing appointment logic.

### Payment
**Removed from this flow per the Oct 2026 feedback.** No payment integration is needed for appointment booking.

### Google Calendar
The backend should own all Google Calendar credentials and API calls — never the frontend. The exact account/calendar must be configured. The event is created after an eligible candidate selects a still-free slot and submits contact details.

## Status model

Updated:

`CONFIRMED` — the only state a booking exists in right now.

Previously proposed states (`PENDING_FORM`, `PENDING_APPROVAL`, `ACCEPTED`, `REJECTED`, `EXPIRED`) belonged to the old approval/payment workflow and have been removed. If a cancellation flow is agreed later, a `CANCELLED` status would need to be added back in — don't invent it in advance.


## Included Django scaffold endpoints (prototype stage)

- `GET /api/health/` — server health check.
- `GET /api/calendar/status/` — checks server-side Google Calendar access.
- `GET /api/calendar/busy/?date=YYYY-MM-DD` — returns Google Calendar busy intervals for the selected date.
- `POST /api/appointments/` — validates details, checks Google Calendar busy intervals, requests event/Meet creation, and stores an appointment in the configured Django database.

These endpoints require credentials and calendar sharing to be configured. The static frontend does not yet call them; its localStorage behavior remains demo-only. The included endpoints are not production-hardened and must not be exposed publicly without authentication, CSRF protection, rate limiting, logging and robust transaction/compensation handling. See `backend/README_GOOGLE_CALENDAR.md`.

## Phase 1 implementation notes (Django backend)

The concrete route prefix in the included Django project is `/api/`: use `GET /api/slots/?date=YYYY-MM-DD&duration=30`, `POST /api/appointments/`, and `GET /api/appointments/<appointment_ref>/`. The detail route accepts the opaque public reference returned by booking (`AH-` plus a UUID hex token), not a sequential database ID.

Phase 1 adds database-backed `WeeklyAvailability` and `UnavailablePeriod` records, slot generation, appointment detail lookup, an idempotency key, a PostgreSQL row-locking strategy, and best-effort Google Calendar event cleanup if database persistence fails. The schedule and blocks are configured through Django admin in this phase.

For the exact setup commands, limitations, and local/PostgreSQL configuration, see `backend/PHASE1_BACKEND_SETUP.md`. The static frontend is still not connected to these endpoints.
