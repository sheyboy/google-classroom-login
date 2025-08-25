// Example configuration file
// Copy this to config.js and update with your actual values

const CONFIG = {
    // Your Google OAuth 2.0 Client ID from Google Cloud Console
    CLIENT_ID: 'your-client-id.apps.googleusercontent.com',
    
    // Your n8n webhook URL where the access token will be sent
    N8N_WEBHOOK_URL: 'https://your-n8n-instance.com/webhook/google-auth',
    
    // OAuth scopes for Google Classroom and Drive access
    SCOPES: [
        // Google Classroom scopes
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.rosters.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
        'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
        
        // Google Drive scope
        'https://www.googleapis.com/auth/drive.readonly'
    ].join(' ')
};