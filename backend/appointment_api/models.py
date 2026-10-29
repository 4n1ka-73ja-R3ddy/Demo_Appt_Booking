import uuid
from datetime import datetime

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q


DURATION_CHOICES = [(15, '15 minutes'), (30, '30 minutes'), (45, '45 minutes'), (60, '60 minutes')]
WEEKDAY_CHOICES = [
    (0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'), (3, 'Thursday'),
    (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday'),
]


class WeeklyAvailability(models.Model):
    """A recurring local-time interval when the trainer can accept appointments."""
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['weekday', 'start_time']
        constraints = [
            models.CheckConstraint(condition=Q(weekday__gte=0, weekday__lte=6), name='availability_weekday_0_6'),
            models.CheckConstraint(condition=Q(start_time__lt=F('end_time')), name='availability_start_before_end'),
            models.UniqueConstraint(fields=['weekday', 'start_time', 'end_time'], name='unique_weekly_availability_interval'),
        ]

    def clean(self):
        super().clean()
        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError({'end_time': 'End time must be later than start time; overnight intervals are not supported.'})
        overlaps = WeeklyAvailability.objects.filter(
            weekday=self.weekday, is_active=True, start_time__lt=self.end_time, end_time__gt=self.start_time,
        ).exclude(pk=self.pk)
        if self.is_active and overlaps.exists():
            raise ValidationError('Weekly availability intervals on the same weekday cannot overlap.')

    def __str__(self):
        day = dict(WEEKDAY_CHOICES).get(self.weekday, self.weekday)
        return f'{day}: {self.start_time:%H:%M}-{self.end_time:%H:%M}'


class UnavailablePeriod(models.Model):
    """A specific local-time period during which bookings must not be accepted."""
    start_at = models.DateTimeField(db_index=True)
    end_at = models.DateTimeField(db_index=True)
    reason = models.CharField(max_length=160, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start_at']
        constraints = [
            models.CheckConstraint(condition=Q(start_at__lt=F('end_at')), name='unavailable_start_before_end'),
        ]

    def clean(self):
        super().clean()
        if self.start_at and self.end_at and self.start_at >= self.end_at:
            raise ValidationError({'end_at': 'End time must be later than start time.'})

    def __str__(self):
        return f'{self.start_at.isoformat()} – {self.end_at.isoformat()}'


class BookingMutex(models.Model):
    """A singleton row locked by PostgreSQL to serialize booking attempts."""
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    purpose = models.CharField(max_length=80, default='Serialize appointment bookings')

    class Meta:
        verbose_name = 'Booking lock (system)'
        verbose_name_plural = 'Booking lock (system)'

    def save(self, *args, **kwargs):
        if self.pk != 1:
            raise ValidationError('Only the singleton booking lock (id=1) is permitted.')
        return super().save(*args, **kwargs)


class Appointment(models.Model):
    STATUS_CONFIRMED = 'CONFIRMED'
    STATUS_CHOICES = [(STATUS_CONFIRMED, 'Confirmed')]

    # UUID is a private lookup token, so the status endpoint does not expose records
    # through predictable sequential IDs. Treat it as a bearer secret.
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    name = models.CharField(max_length=160)
    email = models.EmailField()
    phone = models.CharField(max_length=40)
    start_at = models.DateTimeField(db_index=True)
    end_at = models.DateTimeField(db_index=True)
    duration_minutes = models.PositiveSmallIntegerField(choices=DURATION_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_CONFIRMED)
    google_event_id = models.CharField(max_length=255, blank=True)
    google_event_url = models.URLField(blank=True)
    google_meet_url = models.URLField(blank=True)
    idempotency_key = models.CharField(max_length=100, blank=True, null=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start_at']
        indexes = [models.Index(fields=['status', 'start_at', 'end_at'], name='appt_status_interval_idx')]
        constraints = [
            models.CheckConstraint(condition=Q(duration_minutes__in=[15, 30, 45, 60]), name='appointment_duration_15_30_45_60'),
            models.CheckConstraint(condition=Q(start_at__lt=F('end_at')), name='appointment_start_before_end'),
        ]

    def clean(self):
        super().clean()
        if self.start_at and self.end_at and self.start_at >= self.end_at:
            raise ValidationError({'end_at': 'Appointment end must be after its start.'})
        if self.start_at and self.end_at and self.duration_minutes:
            seconds = (self.end_at - self.start_at).total_seconds()
            if seconds != self.duration_minutes * 60:
                raise ValidationError({'end_at': 'Appointment interval must match duration_minutes.'})

    @property
    def appointment_id(self):
        return f'AH-{self.public_id.hex.upper()}'

    def __str__(self):
        return f'{self.name} - {self.start_at.isoformat()}'
