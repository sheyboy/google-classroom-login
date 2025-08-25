# Google Classroom OAuth Login

A simple web application that handles Google OAuth authentication for Google Classroom and Drive access, then sends the access token to an n8n webhook.

## Setup Instructions

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Classroom API
   - Google Drive API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Configure the OAuth consent screen
6. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized JavaScript origins: Add your domain (e.g., `http://localhost:3000` for local testing)
   - Authorized redirect URIs: Not needed for this implementation

### 2. Configure the Application

1. Open `script.js`
2. Replace `YOUR_GOOGLE_CLIENT_ID` with your actual Google OAuth Client ID
3. Replace `YOUR_N8N_WEBHOOK_URL` with your n8n webhook URL

### 3. OAuth Scopes Included

The application requests the following scopes:
- `classroom.courses.readonly` - Read course information
- `classroom.rosters.readonly` - Read class rosters
- `classroom.coursework.students.readonly` - Read student coursework
- `classroom.student-submissions.students.readonly` - Read student submissions
- `drive.readonly` - Read Google Drive files

### 4. Running the Application

1. Serve the files using a web server (required for OAuth to work):
   ```bash
   # Using Python
   python -m http.server 3000
   
   # Using Node.js (if you have http-server installed)
   npx http-server -p 3000
   
   # Using PHP
   php -S localhost:3000
   ```

2. Open your browser and navigate to `http://localhost:3000`

### 5. n8n Webhook Payload

When a user successfully authenticates, the webhook will receive a POST request with this payload:

```json
{
  "access_token": "ya29.a0AfH6SMC...",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "scopes": "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly ..."
}
```

## Security Notes

- Never expose your client secret in frontend code
- Use HTTPS in production
- Consider implementing token refresh logic for long-running applications
- Validate the access token on your backend before processing

## Troubleshooting

- **"Please configure your Google Client ID"**: Update the CLIENT_ID in script.js
- **OAuth errors**: Check that your domain is added to authorized origins in Google Cloud Console
- **CORS errors**: Make sure you're serving the files through a web server, not opening the HTML file directly