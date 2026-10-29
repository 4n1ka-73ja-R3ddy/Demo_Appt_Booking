from django.contrib import admin
from django.urls import path
from . import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', views.health, name='health'),
    path('api/calendar/status/', views.calendar_status, name='calendar-status'),
    path('api/calendar/busy/', views.calendar_busy, name='calendar-busy'),
    path('api/slots/', views.slots, name='slots'),
    path('api/appointments/', views.create_appointment, name='create-appointment'),
    path('api/appointments/<str:appointment_ref>/', views.appointment_detail, name='appointment-detail'),
]
