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
            
            console.log('Sending payload:', payload);
            
            // Send to n8n webhook
            const webhookResponse = await fetch(CONFIG.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
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
        content: structuredClone(content), // Deep copy
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
                <button class="styled-feedback-btn" onclick="showStyledFeedback()" style="background: linear-gradient(135deg, #6f42c1 0%, #e83e8c 100%); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; font-size: 1rem; margin-right: 1rem; font-weight: 600;">
                    🎨 View Styled Feedback
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



// Calculate total score from criteria
function calculateTotalScore(content) {
    if (content.total_score) return content.total_score;
    if (content.criteria && Array.isArray(content.criteria)) {
        return content.criteria.reduce((total, criterion) => total + (criterion.score || 0), 0);
    }
    return 0;
}

// Calculate maximum possible score
function calculateMaxScore(content) {
    if (content.max_score) return content.max_score;
    if (content.criteria && Array.isArray(content.criteria)) {
        return content.criteria.reduce((total, criterion) => total + (criterion.max_score || 0), 0);
    }
    return 100;
}

// Create editable grading interface using AI
async function createEditableGradingTable(content) {
    // Create a beautiful, editable interface based on the content structure
    let html = `
        <div class="grading-interface">
            <div class="criteria-section">
                <h3>📋 Grading Criteria</h3>
    `;
    
    if (content.criteria && Array.isArray(content.criteria)) {
        content.criteria.forEach((criterion, index) => {
            html += `
                <div class="criterion-card" data-index="${index}">
                    <div class="criterion-header">
                        <h4 contenteditable="true" data-field="title">${criterion.title || 'Untitled Criterion'}</h4>
                        <div class="score-input">
                            <input type="number" data-field="score" value="${criterion.score || 0}" min="0" max="${criterion.max_score || 10}">
                            <span>/${criterion.max_score || 10}</span>
                        </div>
                    </div>
                    <div class="criterion-content">
                        <div class="field-group">
                            <label>Evidence:</label>
                            <textarea data-field="evidence" rows="3">${criterion.evidence || ''}</textarea>
                        </div>
                        <div class="field-group">
                            <label>Areas for Improvement:</label>
                            <textarea data-field="areas_for_improvement" rows="2">${criterion.areas_for_improvement || ''}</textarea>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    html += `
            </div>
    `;
    
    // Add case study alignment section if it exists
    if (content.case_study_alignment_and_final_note) {
        html += `
            <div class="alignment-section">
                <h3>📊 Case Study Analysis</h3>
                <div class="field-group">
                    <label>Alignment Summary:</label>
                    <textarea data-field="alignment_summary" rows="3">${content.case_study_alignment_and_final_note.alignment_summary || ''}</textarea>
                </div>
                <div class="field-group">
                    <label>Rubric Notes:</label>
                    <textarea data-field="notes_on_rubric" rows="3">${content.case_study_alignment_and_final_note.notes_on_rubric || ''}</textarea>
                </div>
            </div>
        `;
    }
    
    html += `
        </div>
    `;
    
    return html;
}

// Initialize editable field handlers
function initializeEditableFields() {
    // Handle score inputs
    document.querySelectorAll('input[data-field="score"]').forEach(input => {
        input.addEventListener('change', updateTotalScore);
    });
    
    // Handle all editable fields
    document.querySelectorAll('[data-field]').forEach(element => {
        element.addEventListener('input', saveFieldChange);
    });
}

// Update total score when individual scores change
function updateTotalScore() {
    const scoreInputs = document.querySelectorAll('input[data-field="score"]');
    let total = 0;
    scoreInputs.forEach(input => {
        total += parseInt(input.value) || 0;
    });
    
    const totalScoreInput = document.getElementById('total-score');
    if (totalScoreInput) {
        totalScoreInput.value = total;
    }
}

// Save field changes to the current grading data
function saveFieldChange(event) {
    const element = event.target;
    const field = element.getAttribute('data-field');
    const value = element.value || element.textContent;
    
    if (!window.currentGradingData) return;
    
    // Handle criterion fields
    const criterionCard = element.closest('.criterion-card');
    if (criterionCard) {
        const index = parseInt(criterionCard.getAttribute('data-index'));
        if (window.currentGradingData.content.criteria && window.currentGradingData.content.criteria[index]) {
            window.currentGradingData.content.criteria[index][field] = value;
        }
    }
    
    // Handle alignment fields
    if (field === 'alignment_summary' || field === 'notes_on_rubric') {
        if (!window.currentGradingData.content.case_study_alignment_and_final_note) {
            window.currentGradingData.content.case_study_alignment_and_final_note = {};
        }
        window.currentGradingData.content.case_study_alignment_and_final_note[field] = value;
    }
}

// Show styled feedback using Gemini AI to generate beautiful interface
async function showStyledFeedback() {
    if (!window.currentGradingData) {
        alert('No grading data available');
        return;
    }
    
    // Create loading modal first
    const modal = document.createElement('div');
    modal.className = 'styled-feedback-modal';
    modal.innerHTML = `
        <div class="styled-feedback-content">
            <div class="feedback-header">
                <h2>🎨 AI-Generated Feedback Report</h2>
                <span class="close-feedback" onclick="this.closest('.styled-feedback-modal').remove()">&times;</span>
            </div>
            <div class="feedback-body">
                <div class="ai-generating">
                    <div class="loading-spinner"></div>
                    <h3>🤖 Gemini AI is creating your beautiful feedback report...</h3>
                    <p>Analyzing grading data and generating a stunning presentation...</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
    
    try {
        // Generate AI feedback using Gemini
        const aiGeneratedHTML = await generateAIFeedback(window.currentGradingData.content);
        
        // Update modal with AI-generated content
        const feedbackBody = modal.querySelector('.feedback-body');
        feedbackBody.innerHTML = aiGeneratedHTML;
        
    } catch (error) {
        console.error('Error generating AI feedback:', error);
        
        // Fallback to manual generation if AI fails
        const feedbackBody = modal.querySelector('.feedback-body');
        feedbackBody.innerHTML = generateFallbackFeedback(window.currentGradingData.content);
    }
}

// Generate AI feedback using Gemini
async function generateAIFeedback(gradingData) {
    try {
        // Check if Gemini AI is available
        if (!window.ai || !window.ai.languageModel) {
            throw new Error('Gemini AI not available');
        }
        
        const session = await window.ai.languageModel.create({
            systemPrompt: `You are an expert educational feedback designer. Your task is to create beautiful, professional HTML for student feedback reports.

CONTEXT: You will receive JSON grading data and must create a stunning, card-based HTML interface that presents this information in an engaging, educational way.

REQUIREMENTS:
1. Create a visually appealing, modern design using HTML and inline CSS
2. Use cards, gradients, icons, and professional styling
3. Make it suitable for students, teachers, and parents
4. Include interactive elements where appropriate
5. Use emojis and visual indicators for better engagement
6. Color-code performance levels (green=excellent, yellow=good, orange=needs work, red=poor)
7. Make it print-friendly and shareable

STRUCTURE TO FOLLOW:
- Overall score summary with circular progress indicator
- Individual criteria cards with scores and feedback
- Strengths and improvement areas clearly highlighted
- Professional typography and spacing
- Action buttons for print/share functionality

STYLING GUIDELINES:
- Use modern CSS with gradients, shadows, and rounded corners
- Responsive design that works on all devices
- Professional color scheme with good contrast
- Clear hierarchy with proper headings and sections
- Engaging visual elements like progress bars or score circles

OUTPUT: Return ONLY the HTML content for the feedback body (no <html>, <head>, or <body> tags). Include all CSS inline for immediate rendering.`
        });
        
        const prompt = `Create a beautiful, professional student feedback report from this grading data:

${JSON.stringify(gradingData, null, 2)}

Generate stunning HTML with inline CSS that presents this information in an engaging, educational format. Include:
1. A prominent overall score display
2. Individual criterion cards with visual score indicators
3. Evidence and improvement sections clearly highlighted
4. Professional styling with colors, gradients, and modern design
5. Action buttons for print and share functionality
6. Responsive design elements

Make it visually appealing and suitable for educational settings.`;
        
        const result = await session.prompt(prompt);
        
        // Clean up the session
        session.destroy();
        
        return result;
        
    } catch (error) {
        console.error('Gemini AI generation failed:', error);
        throw error;
    }
}

// Fallback feedback generation if AI fails
function generateFallbackFeedback(content) {
    const totalScore = calculateTotalScore(content);
    const maxScore = calculateMaxScore(content);
    const percentage = Math.round((totalScore / maxScore) * 100);
    
    // Determine grade color based on percentage
    let gradeColor = '#dc3545';
    if (percentage >= 80) gradeColor = '#28a745';
    else if (percentage >= 70) gradeColor = '#ffc107';
    else if (percentage >= 60) gradeColor = '#fd7e14';
    
    return `
        <div style="padding: 2rem; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 16px; margin-bottom: 2rem;">
            <div style="text-align: center; margin-bottom: 2rem;">
                <div style="display: inline-block; width: 120px; height: 120px; border: 6px solid ${gradeColor}; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: white; box-shadow: 0 8px 16px rgba(0,0,0,0.1); margin-bottom: 1rem;">
                    <div style="font-size: 2.5rem; font-weight: 900; color: ${gradeColor}; line-height: 1;">${totalScore}</div>
                    <div style="font-size: 1rem; color: #6c757d; font-weight: 600;">/ ${maxScore}</div>
                </div>
                <h2 style="margin: 0; color: #495057; font-size: 1.8rem;">Overall Performance</h2>
                <div style="font-size: 2rem; font-weight: 900; color: ${gradeColor}; margin: 0.5rem 0;">${percentage}%</div>
                <div style="font-size: 1.2rem; font-weight: 600; color: #6c757d; text-transform: uppercase; letter-spacing: 1px;">${getGradeLabel(percentage)}</div>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
            ${(content.criteria || []).map((criterion, index) => {
                const score = criterion.score || 0;
                const maxScore = criterion.max_score || 10;
                const percentage = Math.round((score / maxScore) * 100);
                
                let scoreColor = '#dc3545';
                if (percentage >= 80) scoreColor = '#28a745';
                else if (percentage >= 70) scoreColor = '#ffc107';
                else if (percentage >= 60) scoreColor = '#fd7e14';
                
                return `
                    <div style="background: white; border: 2px solid #e9ecef; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 8px rgba(0,0,0,0.1); transition: all 0.3s ease;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 2px solid #f8f9fa;">
                            <h4 style="margin: 0; color: #495057; font-size: 1.1rem; font-weight: 600;">${criterion.title || `Criterion ${index + 1}`}</h4>
                            <div style="padding: 0.5rem 1rem; border-radius: 20px; color: white; font-weight: 700; font-size: 0.9rem; background-color: ${scoreColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                ${score}/${maxScore}
                            </div>
                        </div>
                        ${criterion.evidence ? `
                            <div style="padding: 1rem; border-radius: 8px; background: #d4edda; border-left: 4px solid #28a745; margin-bottom: 1rem;">
                                <h5 style="margin: 0 0 0.5rem 0; font-size: 0.9rem; font-weight: 600; color: #495057;">✅ Evidence of Achievement</h5>
                                <p style="margin: 0; line-height: 1.5; color: #495057;">${criterion.evidence}</p>
                            </div>
                        ` : ''}
                        ${criterion.areas_for_improvement ? `
                            <div style="padding: 1rem; border-radius: 8px; background: #fff3cd; border-left: 4px solid #ffc107;">
                                <h5 style="margin: 0 0 0.5rem 0; font-size: 0.9rem; font-weight: 600; color: #495057;">🎯 Areas for Improvement</h5>
                                <p style="margin: 0; line-height: 1.5; color: #495057;">${criterion.areas_for_improvement}</p>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')}
        </div>
        
        ${content.case_study_alignment_and_final_note ? `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                <div style="background: white; border: 2px solid #e9ecef; border-left: 6px solid #17a2b8; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 1rem 0; color: #495057; font-size: 1.1rem; font-weight: 600;">🎯 Case Study Alignment</h4>
                    <p style="margin: 0; line-height: 1.6; color: #6c757d;">${content.case_study_alignment_and_final_note.alignment_summary || 'No alignment summary provided.'}</p>
                </div>
                <div style="background: white; border: 2px solid #e9ecef; border-left: 6px solid #fd7e14; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 1rem 0; color: #495057; font-size: 1.1rem; font-weight: 600;">📝 Rubric Notes</h4>
                    <p style="margin: 0; line-height: 1.6; color: #6c757d;">${content.case_study_alignment_and_final_note.notes_on_rubric || 'No rubric notes provided.'}</p>
                </div>
            </div>
        ` : ''}
        
        <div style="display: flex; gap: 1rem; justify-content: center; padding-top: 2rem; border-top: 2px solid #f8f9fa;">
            <button onclick="printAIFeedback()" style="padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s ease;">
                🖨️ Print Feedback
            </button>
            <button onclick="shareAIFeedback()" style="padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; background: linear-gradient(135deg, #007bff 0%, #6610f2 100%); color: white; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s ease;">
                📤 Share Feedback
            </button>
            <button onclick="this.closest('.styled-feedback-modal').remove()" style="padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; background: #6c757d; color: white; transition: all 0.2s ease;">
                Close
            </button>
        </div>
    `;
}

// Generate criteria cards for the styled feedback
function generateCriteriaCards(criteria) {
    if (!criteria || criteria.length === 0) {
        return '<p class="no-criteria">No detailed criteria available.</p>';
    }
    
    return criteria.map((criterion, index) => {
        const score = criterion.score || 0;
        const maxScore = criterion.max_score || 10;
        const percentage = Math.round((score / maxScore) * 100);
        
        let scoreColor = '#dc3545';
        if (percentage >= 80) scoreColor = '#28a745';
        else if (percentage >= 70) scoreColor = '#ffc107';
        else if (percentage >= 60) scoreColor = '#fd7e14';
        
        return `
            <div class="criterion-feedback-card">
                <div class="criterion-header">
                    <h4>${criterion.title || `Criterion ${index + 1}`}</h4>
                    <div class="criterion-score" style="background-color: ${scoreColor};">
                        ${score}/${maxScore}
                    </div>
                </div>
                <div class="criterion-body">
                    ${criterion.evidence ? `
                        <div class="evidence-section">
                            <h5>✅ Evidence of Achievement</h5>
                            <p>${criterion.evidence}</p>
                        </div>
                    ` : ''}
                    ${criterion.areas_for_improvement ? `
                        <div class="improvement-section">
                            <h5>🎯 Areas for Improvement</h5>
                            <p>${criterion.areas_for_improvement}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Get grade label based on percentage
function getGradeLabel(percentage) {
    if (percentage >= 90) return 'Excellent';
    if (percentage >= 80) return 'Good';
    if (percentage >= 70) return 'Satisfactory';
    if (percentage >= 60) return 'Needs Improvement';
    return 'Unsatisfactory';
}

// Print AI-generated feedback function
function printAIFeedback() {
    const feedbackContent = document.querySelector('.styled-feedback-content');
    if (!feedbackContent) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>AI-Generated Student Feedback Report</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; line-height: 1.6; }
                .feedback-header { text-align: center; margin-bottom: 30px; padding: 20px; background: linear-gradient(135deg, #6f42c1 0%, #e83e8c 100%); color: white; border-radius: 12px; }
                .feedback-header h2 { margin: 0; font-size: 1.8rem; }
                @media print { 
                    .feedback-actions, button { display: none !important; }
                    .feedback-header { background: #6f42c1 !important; -webkit-print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            ${feedbackContent.innerHTML.replace(/<button[^>]*>.*?<\/button>/g, '')}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// Share AI-generated feedback function
function shareAIFeedback() {
    if (!window.currentGradingData) return;
    
    const content = window.currentGradingData.content;
    const totalScore = calculateTotalScore(content);
    const maxScore = calculateMaxScore(content);
    const percentage = Math.round((totalScore / maxScore) * 100);
    
    const shareText = `🎓 AI-Generated Student Feedback Report

📊 Overall Performance: ${totalScore}/${maxScore} (${percentage}%)
🏆 Grade: ${getGradeLabel(percentage)}

📋 Detailed Assessment:
${content.criteria ? content.criteria.map((criterion, index) => 
    `${criterion.title || `Criterion ${index + 1}`}: ${criterion.score || 0}/${criterion.max_score || 10}
    ✅ Evidence: ${criterion.evidence || 'N/A'}
    🎯 Areas for Improvement: ${criterion.areas_for_improvement || 'N/A'}`
).join('\n\n') : ''}

${content.case_study_alignment_and_final_note ? `
📋 Case Study Analysis:
🎯 Alignment: ${content.case_study_alignment_and_final_note.alignment_summary || 'N/A'}
📝 Notes: ${content.case_study_alignment_and_final_note.notes_on_rubric || 'N/A'}` : ''}

Generated by AI-Powered Grading System 🤖`;

    if (navigator.share) {
        navigator.share({
            title: 'AI-Generated Student Feedback Report',
            text: shareText
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareText).then(() => {
            alert('AI-generated feedback copied to clipboard! 📋✨');
        }).catch(() => {
            // Final fallback: show in alert
            alert('Share Text:\n\n' + shareText);
        });
    }
}

// Print feedback function (legacy)
function printFeedback() {
    printAIFeedback();
}

// Share feedback function
function shareFeedback() {
    if (!window.currentGradingData) return;
    
    const content = window.currentGradingData.content;
    const totalScore = calculateTotalScore(content);
    const maxScore = calculateMaxScore(content);
    const percentage = Math.round((totalScore / maxScore) * 100);
    
    const shareText = `Student Feedback Report
    
Overall Score: ${totalScore}/${maxScore} (${percentage}%)
Grade: ${getGradeLabel(percentage)}

${content.criteria ? content.criteria.map((criterion, index) => 
    `${criterion.title || `Criterion ${index + 1}`}: ${criterion.score || 0}/${criterion.max_score || 10}
    Evidence: ${criterion.evidence || 'N/A'}
    Areas for Improvement: ${criterion.areas_for_improvement || 'N/A'}`
).join('\n\n') : ''}

${content.case_study_alignment_and_final_note ? `
Case Study Analysis:
${content.case_study_alignment_and_final_note.alignment_summary || ''}

Rubric Notes:
${content.case_study_alignment_and_final_note.notes_on_rubric || ''}` : ''}`;

    if (navigator.share) {
        navigator.share({
            title: 'Student Feedback Report',
            text: shareText
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareText).then(() => {
            alert('Feedback copied to clipboard!');
        }).catch(() => {
            // Final fallback: show in alert
            alert('Share Text:\n\n' + shareText);
        });
    }
}

// Preview edited data
function previewEditedData() {
    if (!window.currentGradingData) {
        alert('No grading data available');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'preview-modal';
    modal.innerHTML = `
        <div class="preview-modal-content">
            <div class="preview-header">
                <h2>📋 Preview Changes</h2>
                <span class="close-preview" onclick="this.closest('.preview-modal').remove()">&times;</span>
            </div>
            <pre class="preview-json">${JSON.stringify(window.currentGradingData.content, null, 2)}</pre>
        </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
}

// Submit grades to Google Classroom
async function submitGradesToClassroom() {
    if (!window.currentGradingData) {
        alert('No grading data available');
        return;
    }
    
    const button = document.querySelector('.submit-grades-btn');
    const originalText = button.textContent;
    
    try {
        button.textContent = 'Submitting...';
        button.disabled = true;
        
        const { userId, courseId, assignmentId, accessToken, content } = window.currentGradingData;
        
        // Calculate final score
        const totalScore = calculateTotalScore(content);
        const maxScore = calculateMaxScore(content);
        
        // Submit grade to Google Classroom
        const gradePayload = {
            assignedGrade: totalScore,
            draftGrade: totalScore
        };
        
        const response = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${assignmentId}/studentSubmissions/${userId}:modifyAttachments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gradePayload)
        });
        
        if (response.ok) {
            alert(`Grade submitted successfully! Score: ${totalScore}/${maxScore}`);
            closeGradingModal();
        } else {
            throw new Error(`Failed to submit grade: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error submitting grades:', error);
        alert('Failed to submit grades: ' + error.message);
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
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