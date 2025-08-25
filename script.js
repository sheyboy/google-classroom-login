// Configuration - Replace these with your actual values
const CONFIG = {
    CLIENT_ID: '844566981210-6e3geiet1079f9pv76pjrb7u4klq3gph.apps.googleusercontent.com',
    N8N_WEBHOOK_URL: 'https://n8n2.geekhouse.io/webhook/1fe36449-4114-4c90-b516-dff42a0f8d16',
    GEMINI_API_KEY: 'AIzaSyCSAquXebiwOSJWMsJ-z5ZTN4JPzAnTjXo',
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
            
            // Ensure all objects and arrays are properly stringified
            const stringifyDeep = (obj) => {
                if (Array.isArray(obj)) {
                    return obj.map(item => typeof item === 'object' ? JSON.stringify(item) : item);
                } else if (typeof obj === 'object' && obj !== null) {
                    const result = {};
                    for (const [key, value] of Object.entries(obj)) {
                        if (Array.isArray(value)) {
                            result[key] = value.map(item => typeof item === 'object' ? JSON.stringify(item) : item);
                        } else if (typeof value === 'object' && value !== null) {
                            result[key] = JSON.stringify(value);
                        } else {
                            result[key] = value;
                        }
                    }
                    return result;
                }
                return obj;
            };
            
            const processedPayload = stringifyDeep(payload);
            const stringifiedPayload = JSON.stringify(processedPayload, null, 2);
            console.log('Sending payload with stringified objects:', stringifiedPayload);
            
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

// Display grading results in an editable modal
function displayGradingResults(gradingData, userId, courseId, assignmentId, accessToken) {
    // Extract the content from the response structure
    const content = gradingData[0]?.message?.content;
    if (!content) {
        alert('No grading data received');
        return;
    }
    
    // Store the original data for submission
    window.currentGradingData = {
        content: JSON.parse(JSON.stringify(content)), // Deep copy
        userId,
        courseId,
        assignmentId,
        accessToken
    };
    
    // Create modal overlay
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
            <div class="grading-content">
                ${createEditableGradingTable(content)}
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
    
    // Show modal with animation
    setTimeout(() => {
        modal.classList.add('show');
        // Initialize editable field handlers
        initializeEditableFields();
    }, 10);
}

// Create a completely dynamic editable grading interface from webhook response
// Helper function to calculate total score from dynamic content
function calculateTotalScore(content) {
    let total = 0;
    Object.keys(content).forEach(key => {
        const value = content[key];
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            if (value.hasOwnProperty('score') && typeof value.score === 'number') {
                total += value.score;
            }
        }
    });
    return total;
}

// Helper function to calculate max score from dynamic content
function calculateMaxScore(content) {
    let maxTotal = 0;
    Object.keys(content).forEach(key => {
        const value = content[key];
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            if (value.hasOwnProperty('max') && typeof value.max === 'number') {
                maxTotal += value.max;
            } else if (value.hasOwnProperty('max_score') && typeof value.max_score === 'number') {
                maxTotal += value.max_score;
            }
        }
    });
    return maxTotal || 100; // Default to 100 if no max scores found
}

// Use Gemini AI to process raw JSON and create complete editable interface
async function processGradingDataWithGemini(content) {
    try {
        const prompt = `CRITICAL: You must process this raw JSON grading data and create a complete HTML interface. 

REQUIREMENTS:
1. NEVER show "[object Object]" - extract ALL actual text content from nested objects
2. For each field in the JSON, create an editable card
3. If a field contains an object, extract ALL the text values from inside that object
4. Create proper HTML input fields (input/textarea) with the actual readable content
5. Use data-field attributes for form collection
6. Make everything editable

EXAMPLE: If you see {"score": 5, "rationale": "Good work"}, create inputs for BOTH the score (5) and rationale ("Good work")

Raw JSON Data:
${JSON.stringify(content, null, 2)}

Create HTML with this structure:
<div class="grading-cards">
  <div class="grading-card">
    <h4>Field Name</h4>
    <input/textarea with actual content>
  </div>
</div>

RETURN ONLY THE HTML - NO EXPLANATIONS OR MARKDOWN`;
        
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': CONFIG.GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            let htmlStructure = result.candidates[0]?.content?.parts[0]?.text;
            
            // Clean up the response
            if (htmlStructure) {
                // Remove any markdown code blocks
                htmlStructure = htmlStructure.replace(/```html\n?/g, '').replace(/```\n?/g, '');
                // Remove any extra explanations
                htmlStructure = htmlStructure.replace(/^[^<]*/, '').replace(/[^>]*$/, '');
                
                console.log('Gemini generated HTML:', htmlStructure);
                return htmlStructure;
            }
        }
    } catch (error) {
        console.error('Error calling Gemini API:', error);
    }
    return null;
}

// Create a completely dynamic editable grading interface using AI
async function createEditableGradingTable(content) {
    console.log('Raw content received:', content);
    
    // Show loading message while AI processes
    const loadingHTML = `
        <div class="ai-processing">
            <div class="loading-spinner"></div>
            <p>🤖 AI is processing your grading data...</p>
        </div>
    `;
    
    // First, let Gemini AI process the raw JSON and create the complete HTML structure
    const aiGeneratedHTML = await processGradingDataWithGemini(content);
    
    if (aiGeneratedHTML && aiGeneratedHTML.trim()) {
        console.log('Using AI-generated HTML');
        return aiGeneratedHTML;
    }
    
    // If AI fails, create a very simple fallback that shows raw data
    console.log('AI failed, creating emergency fallback');
    
    let fallbackHTML = `
        <div class="emergency-fallback">
            <h4>⚠️ AI Processing Failed - Raw Data View</h4>
            <p>The AI couldn't process the grading data. Here's the raw content:</p>
            <div class="raw-data-container">
    `;
    
    // Process each field manually as a last resort
    Object.entries(content).forEach(([key, value]) => {
        const displayName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        fallbackHTML += `
            <div class="raw-field">
                <h5>${displayName}</h5>
        `;
        
        if (typeof value === 'object' && value !== null) {
            // For objects, show each property
            Object.entries(value).forEach(([subKey, subValue]) => {
                const subDisplayName = subKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                let displayValue = '';
                
                if (typeof subValue === 'string') {
                    displayValue = subValue;
                } else if (typeof subValue === 'number') {
                    displayValue = String(subValue);
                } else if (Array.isArray(subValue)) {
                    displayValue = subValue.join(', ');
                } else {
                    displayValue = JSON.stringify(subValue, null, 2);
                }
                
                fallbackHTML += `
                    <div class="sub-field">
                        <label>${subDisplayName}:</label>
                        <textarea class="editable-field" data-field="${key}.${subKey}">${displayValue}</textarea>
                    </div>
                `;
            });
        } else {
            // For simple values
            let displayValue = '';
            if (typeof value === 'string') {
                displayValue = value;
            } else if (typeof value === 'number') {
                displayValue = String(value);
            } else if (Array.isArray(value)) {
                displayValue = value.join(', ');
            } else {
                displayValue = JSON.stringify(value, null, 2);
            }
            
            fallbackHTML += `
                <textarea class="editable-field" data-field="${key}">${displayValue}</textarea>
            `;
        }
        
        fallbackHTML += `</div>`;
    });
    
    fallbackHTML += `
            </div>
        </div>
    `;
    
    return fallbackHTML;
}

// Submit updated grades to Google Classroom
async function submitGradesToClassroom() {
    const button = document.querySelector('.submit-grades-btn');
    const originalText = button.textContent;
    
    try {
        // Show loading state
        button.textContent = '⏳ Submitting...';
        button.disabled = true;
        
        // Collect all edited data
        const updatedData = collectEditedData();
        const { userId, courseId, assignmentId, accessToken } = window.currentGradingData;
        
        // Calculate total score from individual criteria
        let totalScore = 0;
        if (updatedData.criteria && Array.isArray(updatedData.criteria)) {
            totalScore = updatedData.criteria.reduce((sum, criterion) => {
                return sum + (parseInt(criterion.score) || 0);
            }, 0);
        }
        
        // Override with manual total score if provided
        const manualTotalScore = document.getElementById('total-score').value;
        if (manualTotalScore) {
            totalScore = parseInt(manualTotalScore);
        }
        
        // Prepare grade data for Google Classroom
        const gradeData = {
            assignedGrade: totalScore,
            draftGrade: totalScore
        };
        
        // Submit grade to Google Classroom
        const gradeResponse = await fetch(
            `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${assignmentId}/studentSubmissions/${userId}:modifyAttachments`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gradeData)
            }
        );
        
        // Also try to patch the submission with the grade
        const patchResponse = await fetch(
            `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${assignmentId}/studentSubmissions/${userId}?updateMask=assignedGrade,draftGrade`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gradeData)
            }
        );
        
        if (patchResponse.ok) {
            // Create detailed feedback comment
            const feedbackComment = createFeedbackComment(updatedData);
            
            // Add private comment with detailed feedback
            const commentData = {
                text: feedbackComment
            };
            
            const commentResponse = await fetch(
                `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${assignmentId}/studentSubmissions/${userId}/addOnAttachments`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(commentData)
                }
            );
            
            button.textContent = '✅ Submitted Successfully!';
            button.style.backgroundColor = '#34a853';
            
            // Show success message
            showSuccessMessage('Grades and feedback submitted to Google Classroom successfully!');
            
            // Close modal after a delay
            setTimeout(() => {
                closeGradingModal();
            }, 2000);
            
        } else {
            throw new Error(`Failed to submit grade: ${patchResponse.status} ${patchResponse.statusText}`);
        }
        
    } catch (error) {
        console.error('Error submitting grades:', error);
        button.textContent = '❌ Submission Failed';
        button.style.backgroundColor = '#ea4335';
        alert('Failed to submit grades to Google Classroom: ' + error.message);
        
        // Reset button after delay
        setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '';
            button.disabled = false;
        }, 3000);
    }
}

// Collect all edited data from the form
function collectEditedData() {
    const updatedData = JSON.parse(JSON.stringify(window.currentGradingData.content)); // Deep copy
    
    // Update all editable fields
    document.querySelectorAll('.editable-field').forEach(field => {
        const fieldPath = field.dataset.field;
        let value = field.value;
        const isArray = field.dataset.isArray === 'true';
        
        // Handle nested field paths like "Understanding of Case.score"
        const pathParts = fieldPath.split('.');
        let current = updatedData;
        
        // Navigate to the parent object
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        }
        
        const lastPart = pathParts[pathParts.length - 1];
        
        // Handle different value types
        if (field.type === 'number') {
            current[lastPart] = parseInt(value) || 0;
        } else if (isArray) {
            // Try to parse as JSON array
            try {
                current[lastPart] = JSON.parse(value);
            } catch (e) {
                // If parsing fails, split by lines or keep as string
                current[lastPart] = value.split('\n').filter(line => line.trim());
            }
        } else if (field.tagName === 'SELECT') {
            current[lastPart] = value;
        } else {
            current[lastPart] = value;
        }
    });
    
    // Update total score from the main input
    const totalScoreInput = document.getElementById('total-score');
    if (totalScoreInput && updatedData['Total Score']) {
        updatedData['Total Score'].score = parseInt(totalScoreInput.value) || 0;
    }
    
    // Ensure all arrays and objects are properly stringified for submission
    const stringifyArraysAndObjects = (obj) => {
        if (Array.isArray(obj)) {
            return obj.map(item => {
                if (typeof item === 'object' && item !== null) {
                    return JSON.stringify(stringifyArraysAndObjects(item));
                }
                return item;
            });
        } else if (typeof obj === 'object' && obj !== null) {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                if (Array.isArray(value)) {
                    result[key] = value.map(item => {
                        if (typeof item === 'object' && item !== null) {
                            return JSON.stringify(stringifyArraysAndObjects(item));
                        }
                        return item;
                    });
                } else if (typeof value === 'object' && value !== null) {
                    result[key] = JSON.stringify(stringifyArraysAndObjects(value));
                } else {
                    result[key] = value;
                }
            }
            return result;
        }
        return obj;
    };
    
    console.log('Updated data before stringification:', updatedData);
    const finalData = stringifyArraysAndObjects(updatedData);
    console.log('Final data with stringified arrays/objects:', finalData);
    
    return finalData;
}

// Create detailed feedback comment from grading data
function createFeedbackComment(gradingData) {
    let feedback = `📊 DETAILED GRADING FEEDBACK\n\n`;
    
    // Add total score if available
    if (gradingData['Total Score']) {
        feedback += `Total Score: ${gradingData['Total Score'].score}/${gradingData['Total Score'].max}\n`;
        if (gradingData['Total Score'].rationale) {
            feedback += `Total Score Rationale: ${gradingData['Total Score'].rationale}\n`;
        }
        feedback += `\n`;
    }
    
    // Add criteria breakdown
    feedback += `📋 CRITERIA BREAKDOWN:\n`;
    const excludedFields = ['Total Score', 'Case study alignment', 'Evidence from submission', 'Recommendations for improvement'];
    const criteriaFields = Object.keys(gradingData).filter(key => !excludedFields.includes(key));
    
    criteriaFields.forEach((criteriaName, index) => {
        const criterion = gradingData[criteriaName];
        if (typeof criterion === 'object' && criterion !== null) {
            feedback += `\n${index + 1}. ${criteriaName}\n`;
            feedback += `   Score: ${criterion.score || 0}/${criterion.max || 0}\n`;
            feedback += `   Rationale: ${criterion.rationale || 'No rationale provided'}\n`;
        }
    });
    
    // Add case study alignment
    if (gradingData['Case study alignment']) {
        feedback += `\n📋 CASE STUDY ALIGNMENT:\n`;
        feedback += `Status: ${gradingData['Case study alignment'].status || 'N/A'}\n`;
        feedback += `Reason: ${gradingData['Case study alignment'].reason || 'N/A'}\n`;
    }
    
    // Add evidence from submission
    if (gradingData['Evidence from submission']) {
        feedback += `\n📄 EVIDENCE FROM SUBMISSION:\n`;
        if (gradingData['Evidence from submission'].contents) {
            feedback += `Contents: ${JSON.stringify(gradingData['Evidence from submission'].contents)}\n`;
        }
        if (gradingData['Evidence from submission'].analysis) {
            feedback += `Analysis: ${gradingData['Evidence from submission'].analysis}\n`;
        }
    }
    
    // Add recommendations
    if (gradingData['Recommendations for improvement']) {
        feedback += `\n💡 RECOMMENDATIONS FOR IMPROVEMENT:\n`;
        feedback += `${gradingData['Recommendations for improvement'].text || 'No recommendations provided'}\n`;
    }
    
    return feedback;
}

// Show success message
function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <div class="success-content">
            <span class="success-icon">✅</span>
            <span class="success-text">${message}</span>
        </div>
    `;
    
    document.body.appendChild(successDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// Initialize editable field handlers
function initializeEditableFields() {
    // Add event listeners to all editable fields
    document.querySelectorAll('.editable-field').forEach(field => {
        // Add visual feedback on focus
        field.addEventListener('focus', function() {
            this.style.transform = 'scale(1.02)';
            this.style.zIndex = '10';
        });
        
        field.addEventListener('blur', function() {
            this.style.transform = 'scale(1)';
            this.style.zIndex = '1';
        });
        
        // Auto-resize textareas
        if (field.tagName === 'TEXTAREA') {
            field.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = this.scrollHeight + 'px';
            });
            
            // Initial resize
            field.style.height = 'auto';
            field.style.height = field.scrollHeight + 'px';
        }
        
        // Update total score when individual scores change
        if (field.classList.contains('score-input')) {
            field.addEventListener('input', updateTotalScore);
        }
    });
    
    // Make the interface more responsive
    console.log('Editable fields initialized:', document.querySelectorAll('.editable-field').length);
}

// Update total score based on individual criteria scores
function updateTotalScore() {
    let total = 0;
    document.querySelectorAll('.score-input').forEach(input => {
        // Skip the total score field itself
        if (input.dataset.field !== 'Total Score.score') {
            total += parseInt(input.value) || 0;
        }
    });
    
    const totalScoreInput = document.getElementById('total-score');
    if (totalScoreInput) {
        totalScoreInput.value = total;
        totalScoreInput.style.background = total > 0 ? '#e8f5e8' : '#fff3cd';
        
        // Also update the Total Score field in the form
        const totalScoreField = document.querySelector('[data-field="Total Score.score"]');
        if (totalScoreField) {
            totalScoreField.value = total;
        }
    }
}

// Preview edited data for debugging
function previewEditedData() {
    const updatedData = collectEditedData();
    
    // Create a preview modal
    const previewModal = document.createElement('div');
    previewModal.className = 'grading-modal';
    previewModal.style.zIndex = '1002';
    previewModal.innerHTML = `
        <div class="grading-modal-content" style="max-width: 80vw;">
            <div class="grading-header">
                <h2>📋 Preview of Edited Data</h2>
                <span class="close-modal" onclick="this.closest('.grading-modal').remove()">&times;</span>
            </div>
            <div style="padding: 2rem;">
                <h3>Edited Grading Data:</h3>
                <pre style="background: #f8f9fa; padding: 1rem; border-radius: 4px; overflow: auto; max-height: 60vh; font-size: 0.9rem;">${JSON.stringify(updatedData, null, 2)}</pre>
                <div style="margin-top: 1rem;">
                    <button onclick="this.closest('.grading-modal').remove()" style="background: #6c757d; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">
                        Close Preview
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(previewModal);
    setTimeout(() => previewModal.classList.add('show'), 10);
    
    console.log('Preview of edited data:', updatedData);
}

// Close grading modal
function closeGradingModal() {
    const modal = document.querySelector('.grading-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
    
    // Clean up global data
    if (window.currentGradingData) {
        delete window.currentGradingData;
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