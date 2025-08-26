// Configuration - Replace these with your actual values
const CONFIG = {
    CLIENT_ID: '844566981210-6e3geiet1079f9pv76pjrb7u4klq3gph.apps.googleusercontent.com',
    N8N_WEBHOOK_URL: 'https://n8n2.geekhouse.io/webhook/1fe36449-4114-4c90-b516-dff42a0f8d16',
    SCOPES: [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.rosters.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
        'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students',
        'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly'
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
        loadClassroomData(response.access_token);
    }
}

// Load classroom data directly
async function loadClassroomData(accessToken) {
    try {
        // Hide login form and show dashboard
        document.querySelector('.login-container').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        // Get courses
        const coursesResponse = await fetch('https://classroom.googleapis.com/v1/courses', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const coursesData = await coursesResponse.json();
        
        if (coursesData.courses) {
            displayCourses(coursesData.courses, accessToken);
        } else {
            showError('No courses found');
        }
    } catch (error) {
        console.error('Error loading classroom data:', error);
        showError('Failed to load classroom data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Display courses and their assignments
async function displayCourses(courses, accessToken) {
    const coursesContainer = document.getElementById('courses');
    coursesContainer.innerHTML = '';
    
    for (const course of courses) {
        const courseDiv = document.createElement('div');
        courseDiv.className = 'course';
        courseDiv.innerHTML = `
            <h3>${course.name}</h3>
            <p>${course.description || 'No description'}</p>
            <div class="assignments" id="assignments-${course.id}">
                <p>Loading assignments...</p>
            </div>
        `;
        coursesContainer.appendChild(courseDiv);
        
        // Load assignments for this course
        loadAssignments(course.id, accessToken);
    }
}

// Load assignments and submissions for a course
async function loadAssignments(courseId, accessToken) {
    try {
        // Get course work (assignments)
        const assignmentsResponse = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const assignmentsData = await assignmentsResponse.json();
        
        const assignmentsContainer = document.getElementById(`assignments-${courseId}`);
        
        if (assignmentsData.courseWork) {
            assignmentsContainer.innerHTML = '';
            
            for (const assignment of assignmentsData.courseWork) {
                const assignmentDiv = document.createElement('div');
                assignmentDiv.className = 'assignment';
                assignmentDiv.innerHTML = `
                    <h4>${assignment.title}</h4>
                    <p>${assignment.description || 'No description'}</p>
                    <div class="submissions" id="submissions-${assignment.id}">
                        <p>Loading submissions...</p>
                    </div>
                `;
                assignmentsContainer.appendChild(assignmentDiv);
                
                // Load submissions for this assignment
                loadSubmissions(courseId, assignment.id, accessToken);
            }
        } else {
            assignmentsContainer.innerHTML = '<p>No assignments found</p>';
        }
    } catch (error) {
        console.error('Error loading assignments:', error);
        document.getElementById(`assignments-${courseId}`).innerHTML = '<p>Error loading assignments</p>';
    }
}

// Load student submissions for an assignment
async function loadSubmissions(courseId, assignmentId, accessToken) {
    try {
        const submissionsResponse = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${assignmentId}/studentSubmissions?states=TURNED_IN`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const submissionsData = await submissionsResponse.json();
        
        const submissionsContainer = document.getElementById(`submissions-${assignmentId}`);
        
        if (submissionsData.studentSubmissions && submissionsData.studentSubmissions.length > 0) {
            submissionsContainer.innerHTML = '';
            
            for (const submission of submissionsData.studentSubmissions) {
                const submissionDiv = document.createElement('div');
                submissionDiv.className = 'submission';
                
                let attachments = '';
                if (submission.assignmentSubmission && submission.assignmentSubmission.attachments) {
                    attachments = submission.assignmentSubmission.attachments.map(att => {
                        if (att.driveFile) {
                            return `<a href="#" onclick="downloadFile('${att.driveFile.id}', '${accessToken}')">${att.driveFile.title}</a>`;
                        }
                        return 'Attachment';
                    }).join(', ');
                }
                
                submissionDiv.innerHTML = `
                    <p><strong>Student ID:</strong> ${submission.userId}</p>
                    <p><strong>State:</strong> ${submission.state}</p>
                    <p><strong>Attachments:</strong> ${attachments || 'None'}</p>
                    <button class="grade-btn" onclick="submitForGrading('${courseId}', '${assignmentId}', '${submission.userId}', '${accessToken}')">
                        Submit for Grading
                    </button>
                `;
                submissionsContainer.appendChild(submissionDiv);
            }
        } else {
            submissionsContainer.innerHTML = '<p>No submissions found</p>';
        }
    } catch (error) {
        console.error('Error loading submissions:', error);
        document.getElementById(`submissions-${assignmentId}`).innerHTML = '<p>Error loading submissions</p>';
    }
}

// Submit assignment for grading via n8n webhook
async function submitForGrading(courseId, assignmentId, userId, accessToken) {
    const button = event.target;
    const originalText = button.textContent;
    
    try {
        // Show loading state
        button.textContent = 'Grading...';
        button.disabled = true;
        
        // Get the specific submission data
        const submissionResponse = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${assignmentId}/studentSubmissions?userId=${userId}&states=TURNED_IN`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const submissionData = await submissionResponse.json();
        
        if (submissionData.studentSubmissions && submissionData.studentSubmissions.length > 0) {
            const submission = submissionData.studentSubmissions[0];
            
            // Create the JSON payload matching your n8n workflow structure
            const payload = {
                google_access_token: accessToken,
                body: {
                    courses: [{
                        google_course_id: courseId,
                        assignments: [{
                            google_assignment_id: assignmentId
                        }]
                    }]
                },
                studentSubmissions: [submission]
            };
            
            // Stringify all objects to ensure proper serialization
            const stringifiedPayload = JSON.stringify(payload, null, 2);
            console.log('Sending payload:', stringifiedPayload);
            
            // Send to n8n webhook
            const webhookResponse = await fetch(CONFIG.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: stringifiedPayload
            });
            
            if (webhookResponse.ok) {
                const gradingResult = await webhookResponse.json();
                displayGradingResults(gradingResult, userId, courseId, assignmentId, accessToken);
                button.textContent = 'Graded ✓';
                button.style.backgroundColor = '#1a73e8';
            } else {
                throw new Error(`Webhook failed with status: ${webhookResponse.status}`);
            }
        }
    } catch (error) {
        console.error('Error submitting for grading:', error);
        alert('Failed to submit for grading: ' + error.message);
        button.textContent = originalText;
        button.disabled = false;
    }
}

// Display grading results in a beautiful table
function displayGradingResults(gradingData, userId, courseId, assignmentId, accessToken) {
    console.log('Raw grading data received from n8n:', gradingData);
    
    // Handle the response from your n8n workflow
    // The Output Parser1 node returns the parsed JSON structure
    let content = gradingData;
    
    // If it's wrapped in an array or has a specific structure, extract it
    if (Array.isArray(gradingData) && gradingData.length > 0) {
        content = gradingData[0];
    }
    
    // Store the data for editing
    window.currentGradingData = {
        content: JSON.parse(JSON.stringify(content)), // Deep copy
        userId,
        courseId,
        assignmentId,
        accessToken
    };
    
    if (!content) {
        alert('No grading data received from n8n workflow');
        return;
    }
    
    // Create modal overlay with AI-generated interface
    const modal = document.createElement('div');
    modal.className = 'grading-modal';
    modal.innerHTML = `
        <div class="grading-modal-content">
            <div class="grading-header">
                <h2>📊 Grading Results (Editable)</h2>
                <span class="close-modal" onclick="closeGradingModal()">&times;</span>
            </div>
            <div class="student-info">
                <p><strong>Student ID:</strong> ${userId}</p>
                <div class="total-score">
                    <span class="score-label">Total Score:</span>
                    <input type="number" id="total-score" value="${calculateTotalScore(content)}" min="0" max="${calculateMaxScore(content)}">
                    <span>/${calculateMaxScore(content)}</span>
                </div>
            </div>
            <div class="grading-content" id="grading-content-container">
                <div class="loading-ai">🤖 AI is creating your editable interface...</div>
            </div>
            <div class="grading-actions">
                <button class="submit-grades-btn" onclick="submitGradesToClassroom()">
                    📤 Submit Grades to Google Classroom
                </button>
                <button class="preview-btn" onclick="previewEditedData()" style="background: #17a2b8; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; font-size: 1rem; margin-right: 1rem;">
                    👁️ Preview Changes
                </button>
                <button class="cancel-btn" onclick="closeGradingModal()">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Show modal with animation and then load AI interface
    setTimeout(async () => {
        modal.classList.add('show');
        
        // Generate the AI interface
        const aiInterface = await createEditableGradingTable(content);
        const contentContainer = document.getElementById('grading-content-container');
        if (contentContainer) {
            contentContainer.innerHTML = aiInterface;
            // Initialize editable field handlers
            initializeEditableFields();
        }
    }, 10);
}

// Create the grading table based on the actual webhook response structure
function createGradingTable(content) {
    let tableHTML = `
        <div class="grading-table-container">
            <table class="grading-table">
                <thead>
                    <tr>
                        <th>Criteria</th>
                        <th>Score</th>
                        <th>Evidence</th>
                        <th>Areas for Improvement</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Add criteria rows from the dynamic criteria array
    if (content.criteria && Array.isArray(content.criteria)) {
        content.criteria.forEach(criterion => {
            tableHTML += `
                <tr>
                    <td class="criteria-name">${criterion.title || 'N/A'}</td>
                    <td class="score-cell">
                        <div class="score-display">
                            <span class="score">${criterion.score || 0}</span>
                            <span class="max-score">/${criterion.max_score || 0}</span>
                        </div>
                    </td>
                    <td class="evidence-text">${criterion.evidence || 'No evidence provided'}</td>
                    <td class="improvement-text">${criterion.areas_for_improvement || 'No improvements noted'}</td>
                </tr>
            `;
        });
    }
    
    tableHTML += `
                </tbody>
            </table>
        </div>
    `;
    
    // Add case study alignment section if it exists
    if (content.case_study_alignment_and_final_note) {
        tableHTML += `
            <div class="summary-section">
                <div class="summary-card alignment">
                    <h4>📋 Case Study Alignment</h4>
                    <p>${content.case_study_alignment_and_final_note.alignment_summary || 'N/A'}</p>
                </div>
                
                <div class="summary-card notes">
                    <h4>📝 Rubric Notes</h4>
                    <p>${content.case_study_alignment_and_final_note.notes_on_rubric || 'N/A'}</p>
                </div>
            </div>
        `;
    }
    
    // Add any other dynamic fields that might exist in the content
    const excludedFields = ['total_score', 'max_score', 'criteria', 'case_study_alignment_and_final_note'];
    const otherFields = Object.keys(content).filter(key => !excludedFields.includes(key));
    
    if (otherFields.length > 0) {
        tableHTML += `<div class="additional-fields">`;
        otherFields.forEach(field => {
            tableHTML += `
                <div class="summary-card additional">
                    <h4>📌 ${field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h4>
                    <p>${content[field]}</p>
                </div>
            `;
        });
        tableHTML += `</div>`;
    }
    
    return tableHTML;
}

// Close grading modal
function closeGradingModal() {
    const modal = document.querySelector('.grading-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

// Download file content (similar to your n8n workflow)
async function downloadFile(fileId, accessToken) {
    try {
        // First, get file metadata
        const fileResponse = await fetch(`https://www.googleapis.com/drive/v2/files/${fileId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const fileData = await fileResponse.json();
        
        if (fileData.exportLinks && fileData.exportLinks['text/html']) {
            // Download as HTML
            const contentResponse = await fetch(fileData.exportLinks['text/html'], {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const content = await contentResponse.text();
            
            // Display content in a new window or modal
            const newWindow = window.open('', '_blank');
            newWindow.document.write(content);
            newWindow.document.close();
        } else {
            alert('File cannot be previewed');
        }
    } catch (error) {
        console.error('Error downloading file:', error);
        alert('Error downloading file');
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