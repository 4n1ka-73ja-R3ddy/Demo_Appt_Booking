import json
import logging
import re
from datetime import datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import csrf_exempt
from googleapiclient.errors import HttpError

from .google_calendar import (
    CalendarNotConfigured, busy_periods, create_event, delete_event, get_calendar_service,
)
from .models import Appointment, BookingMutex, UnavailablePeriod, WeeklyAvailability

logger = logging.getLogger(__name__)
DURATIONS = {15, 30, 45, 60}
TZ = ZoneInfo(settings.TIME_ZONE)


def _json_body(request):
    try:
        data = json.loads(request.body or b'{}')
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def _parse_day(value):
    try:
        parsed = datetime.strptime(value, '%Y-%m-%d').date()
        if parsed.isoformat() != value:
            return None
        return parsed
    except (TypeError, ValueError):
        return None


def _booking_window_error(day):
    today = timezone.localdate()
    if day < today or day > today + timedelta(days=6):
        return 'Appointments can only be booked within the configured 7-day window (today through day 7).'
    return None


def _aware_local(day, clock):
    return datetime.combine(day, clock, TZ)


def _parse_calendar_datetime(value):
    # Google FreeBusy returns RFC3339, commonly with a trailing Z.
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(TZ)


def _overlaps(start, end, other_start, other_end):
    return start < other_end and other_start < end


def _has_weekly_availability(start, end, duration):
    """Require the appointment to fit one interval and align to its duration grid."""
    if start.date() != end.date():
        return False
    intervals = WeeklyAvailability.objects.filter(weekday=start.weekday(), is_active=True)
    for interval in intervals:
        interval_start = _aware_local(start.date(), interval.start_time)
        interval_end = _aware_local(start.date(), interval.end_time)
        if start >= interval_start and end <= interval_end:
            offset_seconds = int((start - interval_start).total_seconds())
            if offset_seconds >= 0 and offset_seconds % (duration * 60) == 0:
                return True
    return False


def _blocked_period(start, end):
    return UnavailablePeriod.objects.filter(start_at__lt=end, end_at__gt=start).exists()


def _db_conflict(start, end, exclude_pk=None):
    qs = Appointment.objects.filter(status=Appointment.STATUS_CONFIRMED, start_at__lt=end, end_at__gt=start)
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    return qs.exists()


def _calendar_conflict(start, end):
    for period in busy_periods(start, end):
        busy_start = _parse_calendar_datetime(period['start'])
        busy_end = _parse_calendar_datetime(period['end'])
        if _overlaps(start, end, busy_start, busy_end):
            return True
    return False


def _public_id(value):
    """Accept AH-<UUID> or a raw UUID; do not expose sequential database IDs."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if text.upper().startswith('AH-'):
        text = text[3:]
    try:
        return UUID(text)
    except (ValueError, AttributeError, TypeError):
        return None


def _appointment_response(appt):
    return {
        'id': appt.pk,
        'appointment_id': appt.appointment_id,
        'status': appt.status,
        'name': appt.name,
        'email': appt.email,
        'phone': appt.phone,
        'date': timezone.localtime(appt.start_at, TZ).date().isoformat(),
        'time': timezone.localtime(appt.start_at, TZ).strftime('%H:%M'),
        'end_time': timezone.localtime(appt.end_at, TZ).strftime('%H:%M'),
        'duration': appt.duration_minutes,
        'timezone': settings.TIME_ZONE,
        'calendar_url': appt.google_event_url,
        'meet_url': appt.google_meet_url,
    }


@require_GET
def health(request):
    return JsonResponse({'status': 'ok', 'service': 'AppointmentHub API', 'mode': 'phase-1 backend'})


@require_GET
def calendar_status(request):
    try:
        service = get_calendar_service()
        service.calendars().get(calendarId=settings.GOOGLE_CALENDAR_ID).execute()
        return JsonResponse({
            'configured': True,
            'calendarId': settings.GOOGLE_CALENDAR_ID,
            'message': 'Google Calendar API authentication and calendar access succeeded.',
        })
    except CalendarNotConfigured as exc:
        return JsonResponse({'configured': False, 'message': str(exc)}, status=503)
    except Exception:
        logger.exception('Google Calendar status check failed.')
        return JsonResponse({
            'configured': False,
            'message': 'Calendar authentication or permission check failed. Check server logs and configuration.',
        }, status=502)


@require_GET
def calendar_busy(request):
    date_text = request.GET.get('date', '')
    day = _parse_day(date_text)
    if day is None:
        return JsonResponse({'error': 'Provide date as YYYY-MM-DD.'}, status=400)
    start = _aware_local(day, time.min)
    end = start + timedelta(days=1)
    try:
        return JsonResponse({'date': date_text, 'timezone': settings.TIME_ZONE, 'busy': busy_periods(start, end)})
    except CalendarNotConfigured as exc:
        return JsonResponse({'error': str(exc), 'code': 'calendar_not_configured'}, status=503)
    except Exception:
        logger.exception('Could not retrieve Google Calendar busy periods.')
        return JsonResponse({'error': 'Could not retrieve Google Calendar availability.'}, status=502)


@require_GET
def slots(request):
    date_text = request.GET.get('date', '')
    day = _parse_day(date_text)
    if day is None:
        return JsonResponse({'error': 'Provide date as YYYY-MM-DD.'}, status=400)
    try:
        duration = int(request.GET.get('duration', ''))
    except (TypeError, ValueError):
        return JsonResponse({'error': 'Duration must be 15, 30, 45 or 60 minutes.'}, status=400)
    if duration not in DURATIONS:
        return JsonResponse({'error': 'Duration must be 15, 30, 45 or 60 minutes.'}, status=400)
    window_error = _booking_window_error(day)
    if window_error:
        return JsonResponse({'error': window_error}, status=400)

    intervals = list(WeeklyAvailability.objects.filter(weekday=day.weekday(), is_active=True).order_by('start_time'))
    if not intervals:
        return JsonResponse({'date': date_text, 'duration': duration, 'timezone': settings.TIME_ZONE, 'slots': []})

    day_start = _aware_local(day, time.min)
    day_end = day_start + timedelta(days=1)
    try:
        calendar_busy = busy_periods(day_start, day_end)
    except CalendarNotConfigured as exc:
        return JsonResponse({'error': str(exc), 'code': 'calendar_not_configured'}, status=503)
    except Exception:
        logger.exception('Slot generation failed while reading Google Calendar.')
        return JsonResponse({'error': 'Could not retrieve Google Calendar availability.'}, status=502)

    busy_intervals = [(_parse_calendar_datetime(p['start']), _parse_calendar_datetime(p['end'])) for p in calendar_busy]
    appointments = list(Appointment.objects.filter(
        status=Appointment.STATUS_CONFIRMED, start_at__lt=day_end, end_at__gt=day_start,
    ).only('start_at', 'end_at'))
    blocked = list(UnavailablePeriod.objects.filter(start_at__lt=day_end, end_at__gt=day_start).only('start_at', 'end_at'))
    now = timezone.now().astimezone(TZ)
    results = []
    seen = set()
    for interval in intervals:
        cursor = _aware_local(day, interval.start_time)
        interval_end = _aware_local(day, interval.end_time)
        step = timedelta(minutes=duration)
        while cursor + step <= interval_end:
            slot_end = cursor + step
            key = cursor.strftime('%H:%M')
            if key not in seen:
                seen.add(key)
                appointment_conflict = any(_overlaps(cursor, slot_end, a.start_at.astimezone(TZ), a.end_at.astimezone(TZ)) for a in appointments)
                unavailable_conflict = (
                    any(_overlaps(cursor, slot_end, b.start_at.astimezone(TZ), b.end_at.astimezone(TZ)) for b in blocked)
                    or any(_overlaps(cursor, slot_end, bs, be) for bs, be in busy_intervals)
                    or cursor <= now
                )
                status = 'booked' if appointment_conflict else ('unavailable' if unavailable_conflict else 'available')
                results.append({'time': key, 'status': status})
            cursor += step
    return JsonResponse({'date': date_text, 'duration': duration, 'timezone': settings.TIME_ZONE, 'slots': results})


@require_GET
def appointment_detail(request, appointment_ref):
    public_id = _public_id(appointment_ref)
    if public_id is None:
        return JsonResponse({'error': 'Appointment was not found.'}, status=404)
    try:
        appt = Appointment.objects.get(public_id=public_id)
    except Appointment.DoesNotExist:
        return JsonResponse({'error': 'Appointment was not found.'}, status=404)
    return JsonResponse(_appointment_response(appt))


@csrf_exempt  # Prototype-only API. Add the approved browser authentication/CSRF strategy before deployment.
@require_POST
def create_appointment(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({'error': 'Request body must be a valid JSON object.'}, status=400)
    name = str(data.get('name', '')).strip()
    email = str(data.get('email', '')).strip().lower()
    phone = str(data.get('phone', '')).strip()
    date_text = str(data.get('date', '')).strip()
    time_text = str(data.get('time', '')).strip()
    raw_duration = data.get('duration')
    try:
        if isinstance(raw_duration, bool):
            raise ValueError
        if isinstance(raw_duration, float) and not raw_duration.is_integer():
            raise ValueError
        duration = int(raw_duration)
        day = _parse_day(date_text)
        if day is None:
            raise ValueError
        start_clock = datetime.strptime(time_text, '%H:%M').time()
        if start_clock.strftime('%H:%M') != time_text:
            raise ValueError
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Provide date YYYY-MM-DD, time HH:MM and a numeric duration.'}, status=400)
    if duration not in DURATIONS:
        return JsonResponse({'error': 'Duration must be 15, 30, 45 or 60 minutes.'}, status=400)
    if not name or len(name) > 160 or len(email) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(re.sub(r'\D', '', phone)) < 10 or len(phone) > 40:
        return JsonResponse({'error': 'Enter a name, valid email and phone number with at least 10 digits.'}, status=400)
    window_error = _booking_window_error(day)
    if window_error:
        return JsonResponse({'error': window_error}, status=400)
    start = _aware_local(day, start_clock)
    end = start + timedelta(minutes=duration)
    if start <= timezone.now().astimezone(TZ):
        return JsonResponse({'error': 'The selected time is in the past.'}, status=400)

    idempotency_key = (request.headers.get('Idempotency-Key') or str(data.get('idempotency_key', '')).strip() or '').strip()
    if idempotency_key and (len(idempotency_key) > 100 or not re.fullmatch(r'[A-Za-z0-9._:-]+', idempotency_key)):
        return JsonResponse({'error': 'Idempotency-Key must be at most 100 characters and contain only letters, numbers, dots, underscores, colons or hyphens.'}, status=400)
    calendar_event = None
    try:
        # BookingMutex is seeded by migration. On PostgreSQL, locking this one row serializes
        # every booking attempt, including when no conflicting appointment row exists yet.
        with transaction.atomic():
            BookingMutex.objects.select_for_update().get(pk=1)
            if idempotency_key:
                previous = Appointment.objects.filter(idempotency_key=idempotency_key).first()
                if previous:
                    same_request = (
                        previous.name == name and previous.email == email and previous.phone == phone
                        and previous.start_at == start and previous.end_at == end
                        and previous.duration_minutes == duration
                    )
                    if not same_request:
                        return JsonResponse({'error': 'This Idempotency-Key was already used for a different booking.'}, status=409)
                    response = _appointment_response(previous)
                    response['idempotent_replay'] = True
                    return JsonResponse(response, status=200)

            if not _has_weekly_availability(start, end, duration):
                return JsonResponse({'error': 'The selected time is outside the trainer availability schedule.'}, status=409)
            if _blocked_period(start, end):
                return JsonResponse({'error': 'The selected time is blocked by the trainer.'}, status=409)
            if _db_conflict(start, end):
                return JsonResponse({'error': 'This slot has already been booked. Please choose another.'}, status=409)
            # Recheck the external calendar immediately before event creation. The app lock
            # serializes this application's requests, but cannot lock a separate Google client.
            if _calendar_conflict(start, end):
                return JsonResponse({'error': 'This time is busy in Google Calendar. Please choose another slot.'}, status=409)

            calendar_event = create_event(name=name, email=email, phone=phone, start=start, end=end, duration=duration)
            appt = Appointment.objects.create(
                name=name, email=email, phone=phone, start_at=start, end_at=end,
                duration_minutes=duration, status=Appointment.STATUS_CONFIRMED,
                google_event_id=calendar_event.get('id', ''),
                google_event_url=calendar_event.get('htmlLink', ''),
                google_meet_url=calendar_event.get('meetUrl', ''),
                idempotency_key=idempotency_key or None,
            )
        response = _appointment_response(appt)
        response['idempotent_replay'] = False
        return JsonResponse(response, status=201)
    except CalendarNotConfigured as exc:
        return JsonResponse({'error': str(exc), 'code': 'calendar_not_configured'}, status=503)
    except HttpError:
        logger.exception('Google Calendar API request failed during booking.')
        return JsonResponse({'error': 'Google Calendar request failed; booking was not confirmed.'}, status=502)
    except Exception:
        logger.exception('Booking failed. Any created calendar event will be compensated where possible.')
        if calendar_event and calendar_event.get('id'):
            try:
                delete_event(calendar_event['id'])
            except Exception:
                logger.exception('Manual cleanup may be required for orphaned calendar event %s.', calendar_event.get('id'))
        return JsonResponse({'error': 'Booking could not be completed; no success confirmation was returned.'}, status=502)
