// Example configuration file
// Copy this to config.js and update with your actual values

const CONFIG = {
    // Your Google OAuth 2.0 Client ID from Google Cloud Console
    CLIENT_ID: '844566981210-6e3geiet1079f9pv76pjrb7u4klq3gph.apps.googleusercontent.com',
    
    // Your n8n webhook URL for grading submissions
    N8N_WEBHOOK_URL: 'https://n8n2.geekhouse.io/webhook/1fe36449-4114-4c90-b516-dff42a0f8d16',
    
    // OAuth scopes for Google Classroom access and grading
    SCOPES: [
        // Google Classroom read scopes
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.rosters.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
        'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
        
        // Google Classroom write scopes for grading
        'https://www.googleapis.com/auth/classroom.coursework.students',
        'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly'
    ].join(' ')
};