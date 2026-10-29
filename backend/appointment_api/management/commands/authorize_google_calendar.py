import os
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from google_auth_oauthlib.flow import InstalledAppFlow

from appointment_api.google_calendar import SCOPES, oauth_client_path, oauth_token_path


class Command(BaseCommand):
    help = "Authorize AppointmentHub to access the trainer's Google Calendar."

    def handle(self, *args, **options):
        client_path = oauth_client_path()
        token_path = oauth_token_path()
        if not client_path or not client_path.is_file():
            raise CommandError(
                'OAuth client JSON was not found. Download a Desktop app OAuth JSON from Google Cloud '
                'and place it at backend/secrets/credentials.json (or set GOOGLE_OAUTH_CLIENT_FILE).'
            )
        token_path.parent.mkdir(parents=True, exist_ok=True)
        flow = InstalledAppFlow.from_client_secrets_file(str(client_path), SCOPES)
        self.stdout.write('A browser will open. Sign in as the trainer/calendar owner and grant Calendar access.')
        credentials = flow.run_local_server(port=0, access_type='offline', prompt='consent')
        token_path.write_text(credentials.to_json(), encoding='utf-8')
        self.stdout.write(self.style.SUCCESS(f'Google Calendar authorization saved to {token_path}.'))
        self.stdout.write('Keep this token private and never commit it to Git.')
