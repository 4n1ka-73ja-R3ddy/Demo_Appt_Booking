import json
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import Appointment, BookingMutex, UnavailablePeriod, WeeklyAvailability

TEST_TZ = ZoneInfo('Asia/Kolkata')


@override_settings(TIME_ZONE='Asia/Kolkata', GOOGLE_CALENDAR_ID='test-calendar')
class AppointmentApiTests(TestCase):
    def setUp(self):
        BookingMutex.objects.get_or_create(pk=1)
        self.day = timezone.localdate() + timedelta(days=2)
        self.weekday = self.day.weekday()
        WeeklyAvailability.objects.create(weekday=self.weekday, start_time=time(9, 0), end_time=time(12, 0))
        self.start = datetime.combine(self.day, time(9, 0), TEST_TZ)
        self.payload = {
            'name': 'Test Candidate', 'email': 'candidate@example.com', 'phone': '+91 9876543210',
            'date': self.day.isoformat(), 'time': '09:00', 'duration': 30,
        }

    @patch('appointment_api.views.busy_periods', return_value=[])
    def test_slots_are_generated_from_weekly_availability(self, _busy):
        response = self.client.get(reverse('slots'), {'date': self.day.isoformat(), 'duration': 30})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([slot['time'] for slot in response.json()['slots']], ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'])
        self.assertTrue(all(slot['status'] in {'available', 'booked', 'unavailable'} for slot in response.json()['slots']))

    @patch('appointment_api.views.busy_periods', return_value=[])
    def test_slots_mark_database_conflicts_as_booked(self, _busy):
        Appointment.objects.create(
            name='Existing', email='existing@example.com', phone='9876543210',
            start_at=self.start, end_at=self.start + timedelta(minutes=30), duration_minutes=30,
        )
        response = self.client.get(reverse('slots'), {'date': self.day.isoformat(), 'duration': 30})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['slots'][0], {'time': '09:00', 'status': 'booked'})

    @patch('appointment_api.views.busy_periods', return_value=[])
    def test_slots_mark_trainer_blocks_unavailable(self, _busy):
        UnavailablePeriod.objects.create(
            start_at=self.start + timedelta(minutes=30), end_at=self.start + timedelta(minutes=60), reason='Leave',
        )
        response = self.client.get(reverse('slots'), {'date': self.day.isoformat(), 'duration': 30})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['slots'][1], {'time': '09:30', 'status': 'unavailable'})

    def test_slots_reject_invalid_duration(self):
        response = self.client.get(reverse('slots'), {'date': self.day.isoformat(), 'duration': 20})
        self.assertEqual(response.status_code, 400)

    @patch('appointment_api.views.busy_periods', return_value=[])
    @patch('appointment_api.views.create_event', return_value={'id': 'event-1', 'htmlLink': 'https://calendar.google.com/event', 'meetUrl': 'https://meet.google.com/test-room'})
    def test_booking_persists_and_returns_opaque_reference(self, _create_event, _busy):
        response = self.client.post(reverse('create-appointment'), data=json.dumps(self.payload), content_type='application/json', HTTP_IDEMPOTENCY_KEY='test-key-1')
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body['status'], 'CONFIRMED')
        self.assertTrue(body['appointment_id'].startswith('AH-'))
        self.assertEqual(Appointment.objects.count(), 1)
        detail = self.client.get(reverse('appointment-detail', args=[body['appointment_id']]))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()['email'], self.payload['email'])

    @patch('appointment_api.views.busy_periods', return_value=[])
    @patch('appointment_api.views.create_event', return_value={'id': 'event-1', 'htmlLink': '', 'meetUrl': ''})
    def test_idempotency_key_returns_same_booking_for_same_request(self, _create_event, _busy):
        first = self.client.post(reverse('create-appointment'), data=json.dumps(self.payload), content_type='application/json', HTTP_IDEMPOTENCY_KEY='same-key')
        second = self.client.post(reverse('create-appointment'), data=json.dumps(self.payload), content_type='application/json', HTTP_IDEMPOTENCY_KEY='same-key')
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertTrue(second.json()['idempotent_replay'])
        self.assertEqual(Appointment.objects.count(), 1)
        self.assertEqual(_create_event.call_count, 1)

    @patch('appointment_api.views.busy_periods', return_value=[])
    @patch('appointment_api.views.create_event', return_value={'id': 'event-1', 'htmlLink': '', 'meetUrl': ''})
    def test_same_idempotency_key_cannot_be_reused_for_different_request(self, _create_event, _busy):
        first = self.client.post(reverse('create-appointment'), data=json.dumps(self.payload), content_type='application/json', HTTP_IDEMPOTENCY_KEY='same-key')
        changed = dict(self.payload, name='Different Candidate')
        second = self.client.post(reverse('create-appointment'), data=json.dumps(changed), content_type='application/json', HTTP_IDEMPOTENCY_KEY='same-key')
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(Appointment.objects.count(), 1)

    @patch('appointment_api.views.busy_periods', return_value=[])
    @patch('appointment_api.views.create_event', return_value={'id': 'event-1', 'htmlLink': '', 'meetUrl': ''})
    def test_overlapping_booking_is_rejected(self, _create_event, _busy):
        first = self.client.post(reverse('create-appointment'), data=json.dumps(self.payload), content_type='application/json')
        self.assertEqual(first.status_code, 201, first.content)
        overlap = dict(self.payload, time='09:15')
        second = self.client.post(reverse('create-appointment'), data=json.dumps(overlap), content_type='application/json')
        self.assertEqual(second.status_code, 409)
        self.assertEqual(Appointment.objects.count(), 1)

    @patch('appointment_api.views.busy_periods', return_value=[])
    @patch('appointment_api.views.create_event', return_value={'id': 'event-1', 'htmlLink': '', 'meetUrl': ''})
    @patch('appointment_api.views.delete_event')
    def test_calendar_event_is_compensated_if_database_write_fails(self, delete_event, _create_event, _busy):
        with patch('appointment_api.views.Appointment.objects.create', side_effect=RuntimeError('simulated database failure')):
            response = self.client.post(reverse('create-appointment'), data=json.dumps(self.payload), content_type='application/json')
        self.assertEqual(response.status_code, 502)
        delete_event.assert_called_once_with('event-1')
        self.assertEqual(Appointment.objects.count(), 0)

    def test_appointment_lookup_does_not_accept_sequential_database_ids(self):
        response = self.client.get(reverse('appointment-detail', args=['1']))
        self.assertEqual(response.status_code, 404)
