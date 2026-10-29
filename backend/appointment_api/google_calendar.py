"""Server-side Google Calendar adapter using the trainer's OAuth authorization.

Never send OAuth client secrets or refresh tokens to the browser. Configure the
OAuth client JSON and authorize it with `python manage.py authorize_google_calendar`.
"""
import logging
import os
import time as time_module
from pathlib import Path
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)
SCOPES = ['https://www.googleapis.com/auth/calendar']


class CalendarNotConfigured(RuntimeError):
    pass


def calendar_id():
    return os.getenv('GOOGLE_CALENDAR_ID', 'primary').strip() or 'primary'


def _backend_path(env_name, default):
    value = os.getenv(env_name, default).strip()
    if not value:
        return None
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / path
    return path


def oauth_client_path():
    return _backend_path('GOOGLE_OAUTH_CLIENT_FILE', 'secrets/credentials.json')


def oauth_token_path():
    return _backend_path('GOOGLE_OAUTH_TOKEN_FILE', 'secrets/token.json')


def get_calendar_service():
    """Return an authorized Calendar v3 service or a clear setup error."""
    client_path = oauth_client_path()
    token_path = oauth_token_path()
    if not client_path or not client_path.is_file():
        raise CalendarNotConfigured(
            'Google OAuth client JSON is missing. Put the Desktop OAuth credentials at '
            'backend/secrets/credentials.json or configure GOOGLE_OAUTH_CLIENT_FILE.'
        )
    if not token_path or not token_path.is_file():
        raise CalendarNotConfigured(
            'Google Calendar has not been authorized yet. Run '
            '`python manage.py authorize_google_calendar` from the backend folder.'
        )
    try:
        credentials = Credentials.from_authorized_user_file(str(token_path), SCOPES)
    except (ValueError, OSError) as exc:
        raise CalendarNotConfigured(
            'Google OAuth token could not be read. Run `python manage.py authorize_google_calendar` again.'
        ) from exc

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(credentials.to_json(), encoding='utf-8')
    if not credentials.valid:
        raise CalendarNotConfigured(
            'Google OAuth authorization is invalid or expired. Run '
            '`python manage.py authorize_google_calendar` again.'
        )
    return build('calendar', 'v3', credentials=credentials, cache_discovery=False)


def busy_periods(start, end):
    """Return Google Calendar busy intervals; start/end must be timezone-aware."""
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError('Calendar query datetimes must be timezone-aware.')
    service = get_calendar_service()
    result = service.freebusy().query(body={
        'timeMin': start.isoformat(),
        'timeMax': end.isoformat(),
        'timeZone': os.getenv('GOOGLE_CALENDAR_TIMEZONE', 'Asia/Kolkata'),
        'items': [{'id': calendar_id()}],
    }).execute()
    cal = result.get('calendars', {}).get(calendar_id(), {})
    if cal.get('errors'):
        logger.error('Google Calendar FreeBusy returned an error for configured calendar.')
        raise RuntimeError('Google Calendar FreeBusy failed. Check the configured calendar ID and permissions.')
    return cal.get('busy', [])


def _meet_url(event):
    for entry in event.get('conferenceData', {}).get('entryPoints', []):
        if entry.get('entryPointType') == 'video' and entry.get('uri'):
            return entry['uri']
    return ''


def create_event(*, name, email, phone, start, end, duration):
    """Create an event, invite the candidate and request a unique Google Meet link."""
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError('Calendar event datetimes must be timezone-aware.')
    service = get_calendar_service()
    tz = ZoneInfo(os.getenv('GOOGLE_CALENDAR_TIMEZONE', 'Asia/Kolkata'))
    start = start.astimezone(tz)
    end = end.astimezone(tz)
    event = {
        'summary': f'Mentorship appointment — {name}',
        'description': f'Candidate: {name}\nEmail: {email}\nPhone: {phone}\nDuration: {duration} minutes',
        'start': {'dateTime': start.isoformat(), 'timeZone': str(tz)},
        'end': {'dateTime': end.isoformat(), 'timeZone': str(tz)},
        'attendees': [{'email': email}],
        'conferenceData': {'createRequest': {
            'requestId': f'ah-{start.timestamp():.0f}-{os.urandom(8).hex()}',
            'conferenceSolutionKey': {'type': 'hangoutsMeet'},
        }},
    }
    created = service.events().insert(
        calendarId=calendar_id(), body=event, conferenceDataVersion=1, sendUpdates='all'
    ).execute()

    # Google may initially return conferenceData status=PENDING. Poll briefly for the Meet URL.
    meet_url = _meet_url(created)
    event_id = created.get('id', '')
    for _ in range(8):
        if meet_url or not event_id:
            break
        request = created.get('conferenceData', {}).get('createRequest', {})
        if request.get('status', {}).get('statusCode') == 'failure':
            break
        time_module.sleep(1)
        created = service.events().get(calendarId=calendar_id(), eventId=event_id).execute()
        meet_url = _meet_url(created)

    if not meet_url:
        # Do not report a complete remote session if Meet generation failed. Remove the event
        # where possible so the slot is not silently blocked by a partial booking.
        try:
            service.events().delete(calendarId=calendar_id(), eventId=event_id, sendUpdates='all').execute()
        except Exception:
            logger.exception('Meet generation failed and the incomplete Calendar event could not be deleted.')
        raise RuntimeError('Google Calendar did not return a Google Meet URL. Check calendar account permissions and Meet availability, then try again.')

    return {'id': event_id, 'htmlLink': created.get('htmlLink', ''), 'meetUrl': meet_url}


def delete_event(event_id):
    """Best-effort compensation when the DB write fails after event creation."""
    if not event_id:
        return
    service = get_calendar_service()
    try:
        service.events().delete(calendarId=calendar_id(), eventId=event_id, sendUpdates='all').execute()
    except HttpError as exc:
        if getattr(exc, 'status_code', None) != 404 and getattr(getattr(exc, 'resp', None), 'status', None) != 404:
            logger.exception('Could not compensate Google Calendar event after database failure.')
            raise
