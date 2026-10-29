# Initial AppointmentHub backend schema.
import uuid
from django.db import migrations, models
from django.db.models import F, Q


def create_booking_mutex(apps, schema_editor):
    BookingMutex = apps.get_model('appointment_api', 'BookingMutex')
    BookingMutex.objects.get_or_create(pk=1, defaults={'purpose': 'Serialize appointment bookings'})


def remove_booking_mutex(apps, schema_editor):
    BookingMutex = apps.get_model('appointment_api', 'BookingMutex')
    BookingMutex.objects.filter(pk=1).delete()


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name='BookingMutex',
            fields=[
                ('id', models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ('purpose', models.CharField(default='Serialize appointment bookings', max_length=80)),
            ],
            options={'verbose_name': 'Booking lock (system)', 'verbose_name_plural': 'Booking lock (system)'},
        ),
        migrations.CreateModel(
            name='UnavailablePeriod',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('start_at', models.DateTimeField(db_index=True)),
                ('end_at', models.DateTimeField(db_index=True)),
                ('reason', models.CharField(blank=True, max_length=160)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['start_at']},
        ),
        migrations.CreateModel(
            name='WeeklyAvailability',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('weekday', models.PositiveSmallIntegerField(choices=[(0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'), (3, 'Thursday'), (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday')])),
                ('start_time', models.TimeField()),
                ('end_time', models.TimeField()),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={'ordering': ['weekday', 'start_time']},
        ),
        migrations.CreateModel(
            name='Appointment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('public_id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, unique=True)),
                ('name', models.CharField(max_length=160)),
                ('email', models.EmailField(max_length=254)),
                ('phone', models.CharField(max_length=40)),
                ('start_at', models.DateTimeField(db_index=True)),
                ('end_at', models.DateTimeField(db_index=True)),
                ('duration_minutes', models.PositiveSmallIntegerField(choices=[(15, '15 minutes'), (30, '30 minutes'), (45, '45 minutes'), (60, '60 minutes')])),
                ('status', models.CharField(choices=[('CONFIRMED', 'Confirmed')], default='CONFIRMED', max_length=20)),
                ('google_event_id', models.CharField(blank=True, max_length=255)),
                ('google_event_url', models.URLField(blank=True)),
                ('google_meet_url', models.URLField(blank=True)),
                ('idempotency_key', models.CharField(blank=True, max_length=100, null=True, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['start_at']},
        ),
        migrations.AddConstraint(
            model_name='unavailableperiod',
            constraint=models.CheckConstraint(condition=Q(('start_at__lt', F('end_at'))), name='unavailable_start_before_end'),
        ),
        migrations.AddConstraint(
            model_name='weeklyavailability',
            constraint=models.CheckConstraint(condition=Q(('weekday__gte', 0), ('weekday__lte', 6)), name='availability_weekday_0_6'),
        ),
        migrations.AddConstraint(
            model_name='weeklyavailability',
            constraint=models.CheckConstraint(condition=Q(('start_time__lt', F('end_time'))), name='availability_start_before_end'),
        ),
        migrations.AddConstraint(
            model_name='weeklyavailability',
            constraint=models.UniqueConstraint(fields=('weekday', 'start_time', 'end_time'), name='unique_weekly_availability_interval'),
        ),
        migrations.AddIndex(
            model_name='appointment',
            index=models.Index(fields=['status', 'start_at', 'end_at'], name='appt_status_interval_idx'),
        ),
        migrations.AddConstraint(
            model_name='appointment',
            constraint=models.CheckConstraint(condition=Q(('duration_minutes__in', [15, 30, 45, 60])), name='appointment_duration_15_30_45_60'),
        ),
        migrations.AddConstraint(
            model_name='appointment',
            constraint=models.CheckConstraint(condition=Q(('start_at__lt', F('end_at'))), name='appointment_start_before_end'),
        ),
        migrations.RunPython(create_booking_mutex, remove_booking_mutex),
    ]
