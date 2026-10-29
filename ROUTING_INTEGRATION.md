# Smart-routing form → AppointmentHub calendar handoff

## Intended candidate journey

1. Candidate opens the mentorship-routing form maintained by the form teammate.
2. The form asks the mentor-approved screening questions. The described routing logic uses radio-button and dropdown answers; exact questions and qualification criteria must come from the mentor/form owner.
3. If eligible, the form redirects the candidate to the AppointmentHub calendar page (`index.html`).
4. If not eligible, the form owner/mentor must define the correct alternate destination or message. This package does not invent that behavior.
5. Eligible candidate selects a date, session duration and free slot, then enters required contact details.
6. The booking is confirmed if the slot remains free. The backend must perform the authoritative conflict check and create the Google Calendar event.
7. A confirmation email should state the scheduled date/time and duration once email delivery is implemented.

## Integration contract for the form teammate

- Supply the real form URL and its configured post-qualification redirect URL.
- Send only eligible candidates to the calendar page.
- Do not pass private screening answers in a URL query string.
- If the form supports a signed/verified eligibility token, the backend should validate it; a plain `?eligible=true` flag is not secure and must not be trusted for production access.
- Define the ineligible-candidate outcome and share the mentor-approved screening criteria with the team.
- Keep the form's analytics/conversion tracking with the form owner/team analytics component, then document how counts will be exported or integrated.

## Prototype boundary

The calendar page is intentionally usable directly for a local UI demonstration. That does **not** mean the upstream smart-routing form is integrated. `shared.js` contains `CONFIG.EXTERNAL_FORM_URL` as a configuration placeholder; the actual form owner must provide the URL and agree the redirect behavior. Do not put screening questions or eligibility rules into this booking component without the mentor's specification.

## Booking/calendar behavior

- Duration choices currently shown: 15, 30, 45 and 60 minutes, based on the student's recollection of the Calendly walkthrough. Confirm the final list with the mentor.
- The candidate should see only free times after combining trainer-defined availability, blocked dates/times, existing bookings and Google Calendar busy intervals.
- The server must recheck availability on submission to prevent race-condition/double bookings.
- No payment step is required.
- The current frontend still uses `localStorage` for demonstration and is not yet wired to the Django API. Live Google Calendar and email behavior are not complete until credentials/services are configured and tested.
