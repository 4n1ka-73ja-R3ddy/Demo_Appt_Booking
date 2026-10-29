# AppointmentHub — Phase 1 backend foundation

This phase adds the server-side scheduling foundation. It does **not** connect the static HTML/JavaScript frontend to the API yet, and it does not implement trainer authentication or confirmation email delivery.

## Included

- `WeeklyAvailability`: recurring weekly local-time windows, stored per weekday.
- `UnavailablePeriod`: explicit leave/holiday/busy blocks.
- `BookingMutex`: singleton database row used to serialize booking attempts on PostgreSQL.
- `Appointment`: confirmed bookings with opaque UUID-based public references and optional idempotency keys.
- `GET /api/slots/?date=YYYY-MM-DD&duration=15|30|45|60`: generates slots from weekly availability and labels them `available`, `booked`, or `unavailable`.
- `POST /api/appointments/`: validates a booking, checks the schedule/block/database/Google Calendar, creates the event, and compensates by deleting the event if the database operation fails.
- `GET /api/appointments/<appointment_ref>/`: retrieves a booking by `AH-<UUID>` public reference. Treat this reference as a bearer secret.
- Django admin registration for configuring availability and viewing appointments.
- Initial migration and backend tests.
- PostgreSQL URL parsing, including URL-encoded credentials. SQLite remains the local fallback when `DATABASE_URL` is unset.

## Important limitations

1. Google Calendar still requires a real service-account key and shared target calendar. No credentials are included.
2. The external calendar cannot be locked atomically with PostgreSQL. The code checks FreeBusy immediately before event creation, but an unrelated person/application can still book the calendar in the tiny gap after that check.
3. The singleton lock serializes bookings only when using a database with effective row-level locks, such as PostgreSQL. SQLite is for local development, not concurrent production booking.
4. The appointment creation view remains CSRF-exempt for the prototype. Do not expose it publicly until the frontend authentication/CSRF approach, rate limiting, and trainer authorization are implemented.
5. The trainer schedule and block records can currently be managed through Django admin. Dedicated trainer APIs and frontend integration are later integration work; do not expose trainer data publicly without authentication.
6. Email notifications are not implemented in Phase 1.
7. The first migration creates the schema and seeds the booking lock. If an existing database already contains the earlier prototype `Appointment` table but no migration history, back up the database before applying this new initial migration. Do not delete an existing database to fix migration errors.

## Local setup (Windows PowerShell)

From the `AppointmentHub\backend` folder:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` for local development. Keep the placeholder `DJANGO_SECRET_KEY` only for local testing. If using Google Calendar, put the service-account JSON at `backend\secrets\google-service-account.json`, configure the correct shared calendar ID, and never commit either secret file.

### SQLite local prototype

Leave `DATABASE_URL` unset. Then run:

```powershell
python manage.py check
python manage.py migrate
python manage.py createsuperuser
python manage.py test appointment_api
python manage.py runserver 127.0.0.1:8000
```

Open `http://127.0.0.1:8000/admin/` and add the trainer's weekly availability and any unavailable periods. Weekly availability is stored in local calendar time and uses 24-hour time. Intervals must not overlap; overnight intervals are not supported.

Health endpoint: `http://127.0.0.1:8000/api/health/`

Calendar status endpoint: `http://127.0.0.1:8000/api/calendar/status/`

Example slots endpoint (replace date with a date within the seven-day window):
`http://127.0.0.1:8000/api/slots/?date=YYYY-MM-DD&duration=30`

### PostgreSQL (recommended for realistic concurrency tests)

Create the database and database user first. Then set `DATABASE_URL`, for example:

```dotenv
DATABASE_URL=postgresql://appointment_user:URL_ENCODED_PASSWORD@localhost:5432/appointmenthub
```

If the password contains reserved URL characters (such as `@`, `:`, `/`, `#`, or `%`), URL-encode the password. Then run the same `check`, `migrate`, `createsuperuser`, and `test` commands. Ensure PostgreSQL is running and the database user can create/alter tables.

## API notes

- Slot date must be `YYYY-MM-DD` and duration one of `15`, `30`, `45`, `60`.
- The booking window is today through today + 6 calendar days, inclusive, in the configured timezone.
- Appointment detail references are `AH-` followed by a UUID hex token. Do not replace this with sequential database IDs in public URLs.
- `Idempotency-Key` is optional but recommended for booking retries. Repeating the same key and same booking returns the existing appointment; reusing the key for different booking details returns HTTP 409.
- Expected conflict responses use HTTP 409; malformed requests use HTTP 400; missing calendar configuration uses HTTP 503; Google Calendar failures use HTTP 502.
- No appointment is reported as confirmed unless both the Calendar event creation and database persistence succeed.
