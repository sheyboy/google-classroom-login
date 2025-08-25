// Configuration - Replace these with your actual values
const CONFIG = {
    CLIENT_ID: '466835705244-sgg58ip9v1jvgnutg7popod26d5u4ekm.apps.googleusercontent.com',
    N8N_WEBHOOK_URL: 'https://n8n2.geekhouse.io/webhook/classroom',
    SCOPES: [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.rosters.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
        'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
    ].join(' ')
};

let tokenClient;

// Initialize Google OAuth
function initializeGoogleAuth() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: handleAuthResponse,
    });
}

// Handle authentication response
function handleAuthResponse(response) {
    if (response.error) {
        showError('Authentication failed: ' + response.error);
        return;
    }

    if (response.access_token) {
        showLoading(true);
        sendTokenToWebhook(response.access_token);
    }
}

// Send access token to n8n webhook
async function sendTokenToWebhook(accessToken) {
    try {
        const response = await fetch(CONFIG.N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                access_token: accessToken,
                timestamp: new Date().toISOString(),
                scopes: CONFIG.SCOPES
            })
        });

        if (response.ok) {
            const result = await response.text();
            showSuccess('Authentication successful! Webhook triggered.');
            console.log('Webhook response:', result);
        } else {
            throw new Error(`Webhook failed with status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error sending token to webhook:', error);
        showError('Failed to send token to webhook: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// UI Helper functions
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
    document.getElementById('loginBtn').disabled = show;
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    document.getElementById('success').style.display = 'none';
}

function showSuccess(message) {
    const successDiv = document.getElementById('success');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    document.getElementById('error').style.display = 'none';
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Google Auth when the page loads
    if (typeof google !== 'undefined') {
        initializeGoogleAuth();
    } else {
        // Wait for Google API to load
        window.addEventListener('load', initializeGoogleAuth);
    }

    // Login button click handler
    document.getElementById('loginBtn').addEventListener('click', function() {
        if (!CONFIG.CLIENT_ID.includes('YOUR_')) {
            tokenClient.requestAccessToken();
        } else {
            showError('Please configure your Google Client ID in script.js');
        }
    });
});

// Handle Google API load
window.onload = function() {
    if (typeof google !== 'undefined') {
        initializeGoogleAuth();
    }
};