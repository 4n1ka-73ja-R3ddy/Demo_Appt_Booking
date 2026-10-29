# AppointmentHub — Google Calendar API integration (local prototype)

This integration uses **server-side OAuth 2.0 for the trainer/calendar owner**. It does not put credentials in browser JavaScript. The candidate booking pages call Django endpoints, which query Google Calendar FreeBusy and create a Calendar event with a request for a unique Google Meet link.

## What is connected in this version

- `GET /api/calendar/status/` — verifies OAuth credentials and access to the configured calendar.
- `GET /api/calendar/busy/?date=YYYY-MM-DD` — reads Google Calendar busy intervals.
- `GET /api/slots/?date=YYYY-MM-DD&duration=15|30|45|60` — combines Google Calendar busy time with backend trainer availability, blocked periods and confirmed appointments.
- `POST /api/appointments/` — rechecks availability, creates a real Google Calendar event, invites the candidate, requests a Google Meet link, and persists the booking in the current Django database (SQLite by default; PostgreSQL is a later step).
- `GET /api/appointments/<appointment_ref>/` — retrieves the real confirmation and Calendar/Meet links.
- `index.html`, `booking.js`, `details.js` and `status.js` are wired to those endpoints. The browser no longer invents a confirmed booking in localStorage.

The trainer dashboard's schedule editor and appointment list still use localStorage for the demo. For this phase, configure real weekly availability and unavailable periods in Django admin. Connecting the trainer UI to backend management endpoints is separate integration work.

## A. Create Google OAuth credentials (one time)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select the project approved by your team/trainer.
2. In **APIs & Services → Library**, enable **Google Calendar API**.
3. Configure **Google Auth Platform / OAuth consent screen**. For a personal student project, choose External if applicable, add your account as a test user while the app is in Testing, and save.
4. Go to **Clients / Credentials → Create OAuth client** and choose **Desktop app** for this local-development setup.
5. Download the OAuth JSON file. In the project, create `backend/secrets/` and save it as `credentials.json`.
6. Do not upload `credentials.json` or `token.json` to GitHub. `.gitignore` excludes the `secrets/` folder.

Use the Google account that owns or has access to the trainer calendar. The default calendar ID is `primary`, meaning the calendar of the account that authorizes OAuth. If using a separate shared calendar, put its exact Calendar ID in `.env` and ensure the authorizing account can edit it.

## B. Configure and authorize the backend (Windows PowerShell)

Open PowerShell in the `AppointmentHub` project folder:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Open `backend/.env` and confirm:

```dotenv
GOOGLE_OAUTH_CLIENT_FILE=secrets/credentials.json
GOOGLE_OAUTH_TOKEN_FILE=secrets/token.json
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:5501,http://localhost:5501
```

Then run:

```powershell
python manage.py check
python manage.py migrate
python manage.py createsuperuser
python manage.py authorize_google_calendar
```

A browser opens. Sign in as the trainer/calendar owner and approve Calendar access. The command writes the refresh token to `backend/secrets/token.json`. Keep it private. The backend refreshes access tokens when needed.

## C. Configure the trainer schedule

1. Keep the backend running and open `http://127.0.0.1:8000/admin/`.
2. Sign in using the Django superuser.
3. Add `Weekly availability` rows for the trainer's working weekdays and times. Use local time in `Asia/Kolkata`; don't create overlapping intervals.
4. Add `Unavailable periods` for holidays, leave or busy periods.
5. The slot endpoint combines those settings with real Google Calendar busy intervals. If no weekly availability rows exist, no slots will be shown.

## D. Start backend and frontend

In the backend terminal:

```powershell
python manage.py runserver 127.0.0.1:8000
```

In VS Code, open the project root and run `index.html` using Live Server (default port 5500). Do not open the HTML as `file://`; browser requests need an HTTP origin permitted in `CORS_ALLOWED_ORIGINS`.

## E. Test the real integration

1. Open `http://127.0.0.1:8000/api/health/` — expect `status: ok`.
2. Open `http://127.0.0.1:8000/api/calendar/status/` — expect HTTP 200 and `configured: true`.
3. Check `http://127.0.0.1:8000/api/calendar/busy/?date=YYYY-MM-DD` for a date within the next seven days.
4. Open the frontend. It should show the Calendar connection status and load slots from Django, not localStorage.
5. Select a free slot, submit name/email/phone, and confirm. Verify the new event in the actual Google Calendar and check the candidate invitation.
6. Confirm the appointment page shows the same appointment reference and, if Google returns one, the Google Meet URL.
7. Try booking the same slot again; the backend should reject the conflict.
8. Run automated tests: `python manage.py test appointment_api`.

## Troubleshooting

- `calendar_not_configured`: check the OAuth JSON path, run the authorization command, and verify `.env` values.
- `invalid_grant` or token errors: run `python manage.py authorize_google_calendar` again and approve access.
- 403/404 for calendar: check `GOOGLE_CALENDAR_ID` and whether the authorized account can access it.
- CORS error in the browser: check Live Server's actual origin and add it to `CORS_ALLOWED_ORIGINS`, then restart Django.
- No slots: create weekly availability rows in Django admin and choose a date within the seven-day booking window.
- No Meet URL: open the event in Google Calendar, check the conference creation status and account permissions. Calendar event creation and Meet conference generation are separate API outcomes; do not claim Meet is working until a test event contains a Meet URL.

## Important limitations

- This is a local development OAuth setup. A deployed website should use a Web application OAuth client, HTTPS redirect URIs, secure token storage, and the appropriate authorization/review setup.
- The API currently has prototype-level CSRF/authentication protections. Do not publish it publicly until browser writes, trainer admin access, rate limiting, logging and deployment security are hardened.
- SQLite is used by default for this phase. PostgreSQL setup/migration is the next step.
- Confirmation emails beyond the Calendar invite are not implemented.
- The trainer HTML availability editor and appointments list are still localStorage demo features; manage real availability in Django admin for now.
