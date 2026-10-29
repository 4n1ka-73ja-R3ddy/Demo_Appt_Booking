# AppointmentHub — Project Requirement & Responsibility Notes

> **Updated Oct 2026** after sir reviewed the UI prototype on the Google Meet call (Oct 8, 2026).
> The intended flow is a smart-routing form → eligible candidate → calendar-based booking. No payment is required. Confirm with the mentor if a separate approval step was intended.

## Confirmed workflow (current)

1. Candidate first completes the separate smart-routing form. The form uses mentor-defined screening questions (radio buttons/drop-downs) and routes only eligible candidates to the calendar. Exact questions/rules are supplied by the form teammate; this booking UI must not invent them.
2. Eligible candidate selects a preferred date (within the next 7 days), duration (15, 30, 45 or 60 minutes, subject to mentor confirmation) and time slot.
3. Candidate enters contact details (name, email, phone — each marked required with a red asterisk) and submits.
4. The appointment is **confirmed immediately** if the selected slot is still available. There is no payment step. A separate approval step is not part of the recalled Calendly-like workflow; confirm with the mentor if he intended one.
5. The candidate sees a confirmation screen with their appointment details and an appointment ID.
6. The confirmed appointment appears on the trainer's portal.
7. Trainer availability (weekly schedule + specific busy/leave/holiday blocks) can be viewed and modified by the trainer at any time; a blocked time no longer shows up as bookable to candidates.
8. A Django backend scaffold for Google Calendar FreeBusy checks, event creation and Meet-link requests is included under `backend/`. It is not live until the team configures the service-account JSON, target calendar ID and sharing permissions, then verifies the integration. The static frontend is not yet wired to these API endpoints.
9. A confirmation email is expected once a notification service is wired up — not yet connected in the frontend prototype.

## What changed from the earlier version of this document

- **Removed:** payment step and the old trainer accept/reject workflow. **Retained upstream:** a separate smart-routing form is part of the intended journey; the form teammate owns the questions and eligibility logic.
- **Added:** required-field red-asterisk indicators, a hard 7-day booking window, and 15-, 30-, 45- and 60-minute duration options based on the Calendly walkthrough recalled by the student (confirm final choices with the mentor).
- **Kept as-is:** weekly availability management and specific-date/time blocking on the trainer side — sir specifically praised the "block specific time" feature for handling holidays/busy days, so this was preserved rather than rebuilt.

## Prototype decisions made deliberately

- Candidate pages do not expose a prominent Trainer Panel link; `trainer.html` is a separate internal prototype page opened directly, with no authentication implemented (whether the trainer side needs a login has not been confirmed either way).
- A booking is confirmed the moment it's submitted and the slot is still free at that moment — there is no intermediate state where two candidates can be compared against each other for the same slot, because there's no approval step left to compare them during.
- LocalStorage is only a frontend demonstration substitute for the future backend/database (Django + PostgreSQL per the meeting decision).
- The smart-routing form is an upstream step in the intended journey. Its questions and qualification rules belong to another teammate and are not invented in this package. See `ROUTING_INTEGRATION.md`.

## Responsibilities

### Appointment/booking implementation (this prototype)
- Candidate booking UI (direct booking, no request/approval/payment)
- Confirmation screen + appointment lookup by ID
- Trainer confirmed-appointments view
- Filters/search/sorting on the trainer side
- Availability management (weekly schedule + specific blocks)
- Google Calendar backend scaffold (requires credentials/configuration); frontend-to-API wiring and notifications remain outstanding

### Smart-routing form teammate
- Build/maintain the real form and define the mentor-approved screening questions/qualification rules
- Use radio buttons/dropdowns for the routing logic as described in the walkthrough
- Provide the form URL, eligible-candidate redirect URL and alternate outcome for ineligible candidates
- Share the conversion/export mechanism needed for analytics

The booking implementation must not claim ownership of the external form itself, and must not route candidates through it until the team says it's still part of the flow.

## Items to confirm with ma'am before production integration

1. Is the Google API specifically Google Calendar API?
2. Which calendar/account should be checked and used for event creation?
3. What are the exact screening questions, eligibility criteria and destination for candidates who do not qualify?
4. What notification channel is required for the confirmation message?
5. Is there one trainer or multiple trainers, and how would requests be split if there's more than one?
6. Are the final selectable appointment durations 15, 30, 45 and 60 minutes? This prototype offers those four options based on the student's recollection of the Calendly walkthrough.
7. Is the 7-day booking window inclusive of today as day 1, or does it mean the next 7 full calendar days starting tomorrow?
8. Does the trainer side need a login at all?
9. What backend/database/authentication stack should the internship use beyond the already-agreed Python/Django/PostgreSQL?
10. If appointments can be cancelled later, who can cancel them and what happens to the calendar event?
11. What exactly does "every day" availability mean — literally every calendar day, or only the weekdays the trainer selects?

## Suggested production architecture

Candidate → Smart-routing form → (eligible only) Candidate Frontend → Backend API → Database

Trainer Frontend → Backend API → Database

Backend → Notification service
Backend → Google Calendar API
Form → eligible-candidate redirect to booking calendar; form analytics/export integration as agreed

The frontend should not connect directly to the database or Google Calendar credentials.


## Google Calendar scaffold status

The `backend/` folder contains a Django API scaffold and server-side Google Calendar service. Read `backend/README_GOOGLE_CALENDAR.md` for setup. This is not a completed live integration until the target calendar is configured and tested. The frontend still uses localStorage and does not yet call the API.
