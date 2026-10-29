from django.contrib import admin

from .models import Appointment, BookingMutex, UnavailablePeriod, WeeklyAvailability


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ('appointment_id', 'name', 'email', 'start_at', 'duration_minutes', 'status')
    list_filter = ('status', 'duration_minutes', 'start_at')
    search_fields = ('name', 'email', 'phone', 'public_id', 'google_event_id')
    readonly_fields = ('public_id', 'created_at', 'google_event_id', 'google_event_url', 'google_meet_url')
    ordering = ('-start_at',)


@admin.register(WeeklyAvailability)
class WeeklyAvailabilityAdmin(admin.ModelAdmin):
    list_display = ('weekday', 'start_time', 'end_time', 'is_active')
    list_filter = ('weekday', 'is_active')


@admin.register(UnavailablePeriod)
class UnavailablePeriodAdmin(admin.ModelAdmin):
    list_display = ('start_at', 'end_at', 'reason', 'created_at')
    list_filter = ('start_at',)
    search_fields = ('reason',)


@admin.register(BookingMutex)
class BookingMutexAdmin(admin.ModelAdmin):
    list_display = ('id', 'purpose')
    readonly_fields = ('id', 'purpose')

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
