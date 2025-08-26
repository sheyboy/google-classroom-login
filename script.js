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

    // Handle nested structure: check if data is under message.content
    if (content.message && content.message.content) {
        console.log('Found nested structure under message.content');
        content = content.message.content;
    }

    // Handle other possible nested structures
    if (content.content && !content.criteria && !content.overall) {
        console.log('Found nested structure under content');
        content = content.content;
    }

    console.log('Final extracted content for grading:', content);

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
                <button class="ai-preview-btn" onclick="showAIPreview()" style="background: linear-gradient(135deg, #ff6b6b 0%, #feca57 100%); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; font-size: 1rem; margin-right: 1rem; font-weight: 600;">
                    🤖 AI Preview Layout
                </button>
                <button class="preview-btn" onclick="previewEditedData()" style="background: #17a2b8; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; font-size: 1rem; margin-right: 1rem;">
                    👁️ Preview JSON
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
    // Check for direct total_score
    if (content.total_score) return content.total_score;

    // Check for overall.score structure
    if (content.overall && content.overall.score) return content.overall.score;

    // Calculate from criteria array
    if (content.criteria && Array.isArray(content.criteria)) {
        return content.criteria.reduce((total, criterion) => total + (criterion.score || 0), 0);
    }

    return 0;
}

// Calculate maximum possible score
function calculateMaxScore(content) {
    // Check for direct max_score
    if (content.max_score) return content.max_score;

    // Check for overall.maxScore structure
    if (content.overall && content.overall.maxScore) return content.overall.maxScore;

    // Calculate from criteria array
    if (content.criteria && Array.isArray(content.criteria)) {
        return content.criteria.reduce((total, criterion) => total + (criterion.maxScore || criterion.max_score || 0), 0);
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
            // Handle different field name variations
            const title = criterion.title || criterion.name || `Criterion ${index + 1}`;
            const score = criterion.score || 0;
            const maxScore = criterion.maxScore || criterion.max_score || 10;
            const evidence = criterion.evidence || '';
            const notes = criterion.notes || criterion.areas_for_improvement || '';

            html += `
                <div class="criterion-card" data-index="${index}">
                    <div class="criterion-header">
                        <h4 contenteditable="true" data-field="title">${title}</h4>
                        <div class="score-input">
                            <input type="number" data-field="score" value="${score}" min="0" max="${maxScore}">
                            <span>/${maxScore}</span>
                        </div>
                    </div>
                    <div class="criterion-content">
                        <div class="field-group">
                            <label>Evidence:</label>
                            <textarea data-field="evidence" rows="3">${evidence}</textarea>
                        </div>
                        <div class="field-group">
                            <label>Notes/Areas for Improvement:</label>
                            <textarea data-field="notes" rows="2">${notes}</textarea>
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
            // Map field names to the correct property names
            let targetField = field;
            if (field === 'title' && !window.currentGradingData.content.criteria[index].title) {
                targetField = 'name'; // Use 'name' if 'title' doesn't exist
            }
            if (field === 'notes' && !window.currentGradingData.content.criteria[index].notes) {
                targetField = 'areas_for_improvement'; // Fallback to areas_for_improvement
            }
            
            window.currentGradingData.content.criteria[index][targetField] = value;
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

DATA STRUCTURE NOTES:
- Scores may be in "overall.score" and "overall.maxScore" OR direct "total_score" and "max_score"
- Criteria may have "name" OR "title" for the criterion name
- Criteria may have "maxScore" OR "max_score" for maximum points
- Evidence may be in "evidence" field
- Notes/improvements may be in "notes" OR "areas_for_improvement"
- Handle missing or null fields gracefully

REQUIREMENTS:
1. Create a visually appealing, modern design using HTML and inline CSS
2. Use cards, gradients, icons, and professional styling
3. Make it suitable for students, teachers, and parents
4. Include interactive elements where appropriate
5. Use emojis and visual indicators for better engagement
6. Color-code performance levels (green=excellent, yellow=good, orange=needs work, red=poor)
7. Make it print-friendly and shareable
8. Handle flexible data structures - adapt to whatever fields are available

STRUCTURE TO FOLLOW:
- Overall score summary with circular progress indicator
- Individual criteria cards with scores and feedback
- Evidence and notes sections clearly highlighted
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
        const maxScore = criterion.maxScore || criterion.max_score || 10;
        const percentage = Math.round((score / maxScore) * 100);
        
        // Handle different field name variations
        const title = criterion.title || criterion.name || `Criterion ${index + 1}`;
        const evidence = criterion.evidence || '';
        const notes = criterion.notes || criterion.areas_for_improvement || '';

        let scoreColor = '#dc3545';
        if (percentage >= 80) scoreColor = '#28a745';
        else if (percentage >= 70) scoreColor = '#ffc107';
        else if (percentage >= 60) scoreColor = '#fd7e14';

        return `
                    <div style="background: white; border: 2px solid #e9ecef; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 8px rgba(0,0,0,0.1); transition: all 0.3s ease;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 2px solid #f8f9fa;">
                            <h4 style="margin: 0; color: #495057; font-size: 1.1rem; font-weight: 600;">${title}</h4>
                            <div style="padding: 0.5rem 1rem; border-radius: 20px; color: white; font-weight: 700; font-size: 0.9rem; background-color: ${scoreColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                ${score}/${maxScore}
                            </div>
                        </div>
                        ${evidence ? `
                            <div style="padding: 1rem; border-radius: 8px; background: #d4edda; border-left: 4px solid #28a745; margin-bottom: 1rem;">
                                <h5 style="margin: 0 0 0.5rem 0; font-size: 0.9rem; font-weight: 600; color: #495057;">✅ Evidence of Achievement</h5>
                                <p style="margin: 0; line-height: 1.5; color: #495057;">${evidence}</p>
                            </div>
                        ` : ''}
                        ${notes ? `
                            <div style="padding: 1rem; border-radius: 8px; background: #fff3cd; border-left: 4px solid #ffc107;">
                                <h5 style="margin: 0 0 0.5rem 0; font-size: 0.9rem; font-weight: 600; color: #495057;">🎯 Notes & Areas for Improvement</h5>
                                <p style="margin: 0; line-height: 1.5; color: #495057;">${notes}</p>
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

// Show AI-generated preview layout using Gemini
async function showAIPreview() {
    if (!window.currentGradingData) {
        alert('No grading data available');
        return;
    }
    
    // Create loading modal first
    const modal = document.createElement('div');
    modal.className = 'ai-preview-modal';
    modal.innerHTML = `
        <div class="ai-preview-content">
            <div class="ai-preview-header">
                <h2>🤖 AI-Generated Rubric Layout</h2>
                <span class="close-ai-preview" onclick="this.closest('.ai-preview-modal').remove()">&times;</span>
            </div>
            <div class="ai-preview-body">
                <div class="ai-generating-preview">
                    <div class="loading-spinner"></div>
                    <h3>🎨 Gemini AI is creating your beautiful rubric layout...</h3>
                    <p>Analyzing rubric data and generating a stunning visual presentation...</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
    
    try {
        // Generate AI layout using Gemini
        const aiGeneratedHTML = await generateAIRubricLayout(window.currentGradingData.content);
        
        // Update modal with AI-generated content
        const previewBody = modal.querySelector('.ai-preview-body');
        previewBody.innerHTML = aiGeneratedHTML;
        
    } catch (error) {
        console.error('Error generating AI rubric layout:', error);
        
        // Fallback to manual generation if AI fails
        const previewBody = modal.querySelector('.ai-preview-body');
        previewBody.innerHTML = generateFallbackRubricLayout(window.currentGradingData.content);
    }
}

// Generate AI rubric layout using Gemini
async function generateAIRubricLayout(rubricData) {
    try {
        // Check if Gemini AI is available
        if (!window.ai || !window.ai.languageModel) {
            throw new Error('Gemini AI not available');
        }
        
        const session = await window.ai.languageModel.create({
            systemPrompt: `You are an expert educational assessment designer specializing in creating beautiful, professional rubric presentations.

CONTEXT: You will receive JSON rubric data and must create a stunning, visually appealing HTML layout that presents grading information in a clear, professional manner suitable for educators, students, and administrators.

DATA STRUCTURE EXPECTATIONS:
- "rubric" array with criterion objects containing: criterion, score, max_score, rationale
- "total_score" and "max_total_score" for overall performance
- "evidence_feedback" array with improvement suggestions
- "case_study_alignment" object with summary information
- "notes" field with additional information

DESIGN REQUIREMENTS:
1. Create a modern, professional dashboard-style layout
2. Use cards, progress bars, and visual score indicators
3. Color-code performance levels (green=excellent, yellow=good, orange=needs improvement, red=poor)
4. Make it visually engaging with icons, gradients, and modern CSS
5. Ensure excellent readability and professional appearance
6. Include interactive elements and hover effects
7. Make it suitable for presentations and reports

LAYOUT STRUCTURE:
- Header with overall score summary and performance indicator
- Individual criterion cards with scores, progress bars, and detailed rationale
- Evidence feedback section with actionable recommendations
- Case study alignment summary
- Professional footer with notes and additional information

STYLING GUIDELINES:
- Use modern CSS with flexbox/grid layouts
- Professional color palette with good contrast
- Consistent spacing and typography
- Responsive design principles
- Engaging visual elements like progress circles, badges, and cards
- Smooth transitions and hover effects

OUTPUT: Return ONLY the HTML content (no <html>, <head>, or <body> tags). Include all CSS inline for immediate rendering.`
        });
        
        const prompt = `Create a stunning, professional rubric presentation layout from this data:

${JSON.stringify(rubricData, null, 2)}

Generate beautiful HTML with inline CSS that presents this rubric information in a visually appealing, dashboard-style format. Include:

1. A prominent overall score display with visual indicators
2. Individual criterion cards with progress bars and detailed rationale
3. Evidence feedback section with clear recommendations
4. Case study alignment information
5. Professional styling with modern design elements
6. Color-coded performance indicators
7. Interactive hover effects and smooth animations

Make it look like a professional educational assessment dashboard that would impress educators and administrators.`;
        
        const result = await session.prompt(prompt);
        
        // Clean up the session
        session.destroy();
        
        return result;
        
    } catch (error) {
        console.error('Gemini AI rubric generation failed:', error);
        throw error;
    }
}

// Fallback rubric layout generation if AI fails
function generateFallbackRubricLayout(data) {
    const totalScore = data.total_score || 0;
    const maxTotalScore = data.max_total_score || 100;
    const percentage = Math.round((totalScore / maxTotalScore) * 100);
    
    // Determine overall grade color
    let gradeColor = '#dc3545';
    if (percentage >= 80) gradeColor = '#28a745';
    else if (percentage >= 70) gradeColor = '#ffc107';
    else if (percentage >= 60) gradeColor = '#fd7e14';
    
    return `
        <div style="padding: 2rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 16px; margin-bottom: 2rem; text-align: center;">
            <h1 style="margin: 0 0 1rem 0; font-size: 2.5rem; font-weight: 900;">📊 Rubric Assessment</h1>
            <div style="display: flex; justify-content: center; align-items: center; gap: 2rem; margin-top: 2rem;">
                <div style="width: 150px; height: 150px; border: 8px solid white; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.1);">
                    <div style="font-size: 3rem; font-weight: 900;">${totalScore}</div>
                    <div style="font-size: 1.2rem; opacity: 0.9;">/ ${maxTotalScore}</div>
                </div>
                <div style="text-align: left;">
                    <h2 style="margin: 0; font-size: 2rem;">Overall Performance</h2>
                    <div style="font-size: 3rem; font-weight: 900; margin: 0.5rem 0;">${percentage}%</div>
                    <div style="font-size: 1.3rem; opacity: 0.9; text-transform: uppercase; letter-spacing: 2px;">${getGradeLabel(percentage)}</div>
                </div>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2rem; margin-bottom: 2rem;">
            ${(data.rubric || []).map((criterion, index) => {
                const score = criterion.score || 0;
                const maxScore = criterion.max_score || 5;
                const percentage = Math.round((score / maxScore) * 100);
                
                let scoreColor = '#dc3545';
                if (percentage >= 80) scoreColor = '#28a745';
                else if (percentage >= 70) scoreColor = '#ffc107';
                else if (percentage >= 60) scoreColor = '#fd7e14';
                
                return `
                    <div style="background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 8px 24px rgba(0,0,0,0.1); border-left: 6px solid ${scoreColor}; transition: all 0.3s ease;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                            <h3 style="margin: 0; color: #2c3e50; font-size: 1.3rem; font-weight: 700;">${criterion.criterion}</h3>
                            <div style="background: ${scoreColor}; color: white; padding: 0.75rem 1.5rem; border-radius: 25px; font-weight: 900; font-size: 1.1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                                ${score}/${maxScore}
                            </div>
                        </div>
                        
                        <div style="background: #f8f9fa; border-radius: 12px; height: 12px; margin-bottom: 1.5rem; overflow: hidden;">
                            <div style="background: ${scoreColor}; height: 100%; width: ${percentage}%; border-radius: 12px; transition: width 0.8s ease;"></div>
                        </div>
                        
                        <div style="background: #f8f9fa; border-radius: 12px; padding: 1.5rem; border-left: 4px solid ${scoreColor};">
                            <h4 style="margin: 0 0 1rem 0; color: #495057; font-size: 1rem; font-weight: 600;">📝 Detailed Rationale</h4>
                            <p style="margin: 0; line-height: 1.6; color: #6c757d; font-size: 0.95rem;">${criterion.rationale || 'No rationale provided.'}</p>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        
        ${data.evidence_feedback && data.evidence_feedback.length > 0 ? `
            <div style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); border-radius: 16px; padding: 2rem; margin-bottom: 2rem;">
                <h2 style="margin: 0 0 1.5rem 0; color: #8b4513; font-size: 1.8rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
                    💡 Evidence & Improvement Recommendations
                </h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
                    ${data.evidence_feedback.map((feedback, index) => `
                        <div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-left: 4px solid #ff6b6b;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
                                <span style="background: #ff6b6b; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.9rem;">${index + 1}</span>
                                <h4 style="margin: 0; color: #2c3e50; font-size: 1.1rem; font-weight: 600;">Recommendation</h4>
                            </div>
                            <p style="margin: 0; line-height: 1.6; color: #495057;">${feedback}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${data.case_study_alignment ? `
            <div style="background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); border-radius: 16px; padding: 2rem; margin-bottom: 2rem;">
                <h2 style="margin: 0 0 1.5rem 0; color: #2c3e50; font-size: 1.8rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
                    🎯 Case Study Alignment
                </h2>
                <div style="background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <p style="margin: 0; line-height: 1.8; color: #495057; font-size: 1.1rem;">${data.case_study_alignment.summary || 'No alignment summary provided.'}</p>
                </div>
            </div>
        ` : ''}
        
        ${data.notes ? `
            <div style="background: #f8f9fa; border-radius: 16px; padding: 2rem; border: 2px dashed #dee2e6;">
                <h3 style="margin: 0 0 1rem 0; color: #6c757d; font-size: 1.3rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                    📌 Additional Notes
                </h3>
                <p style="margin: 0; line-height: 1.6; color: #6c757d; font-style: italic;">${data.notes}</p>
            </div>
        ` : ''}
        
        <div style="text-align: center; margin-top: 3rem; padding-top: 2rem; border-top: 2px solid #e9ecef;">
            <button onclick="printAIRubric()" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 1rem 2rem; border-radius: 12px; font-size: 1.1rem; font-weight: 600; cursor: pointer; margin-right: 1rem; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);">
                🖨️ Print Rubric
            </button>
            <button onclick="shareAIRubric()" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; border: none; padding: 1rem 2rem; border-radius: 12px; font-size: 1.1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(240, 147, 251, 0.3);">
                📤 Share Rubric
            </button>
        </div>
    `;
}

// Preview edited data (JSON format)
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
            <div class="preview-content-wrapper">
                <pre class="preview-json">${JSON.stringify(window.currentGradingData.content, null, 2)}</pre>
                <div class="preview-actions">
                    <button class="render-json-btn" onclick="renderJSONPreview()" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; margin-top: 1rem; display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);">
                        🎨 Render JSON
                    </button>
                </div>
                <div class="rendered-content" id="rendered-json-content" style="display: none; margin-top: 2rem; border-top: 2px solid #e9ecef; padding-top: 2rem;">
                    <!-- AI-rendered content will appear here -->
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
}

// Render JSON preview using Gemini API
async function renderJSONPreview() {
    const renderButton = document.querySelector('.render-json-btn');
    const renderedContent = document.getElementById('rendered-json-content');
    
    if (!window.currentGradingData || !renderButton || !renderedContent) {
        alert('Unable to render JSON preview');
        return;
    }
    
    // Show loading state
    const originalText = renderButton.innerHTML;
    renderButton.innerHTML = '<div class="loading-spinner" style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></div>Rendering with Gemini AI...';
    renderButton.disabled = true;
    
    try {
        // Send raw JSON to Gemini API for rendering
        const aiRenderedHTML = await callGeminiAPIForJSONRender(window.currentGradingData.content);
        
        // Show the rendered content
        renderedContent.innerHTML = aiRenderedHTML;
        renderedContent.style.display = 'block';
        
        // Update button to show success
        renderButton.innerHTML = '✅ Rendered by Gemini AI';
        renderButton.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        
        // Scroll to rendered content
        renderedContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } catch (error) {
        console.error('Error rendering JSON with Gemini API:', error);
        
        // Fallback to manual rendering
        const fallbackHTML = generateFallbackJSONPreview(window.currentGradingData.content);
        renderedContent.innerHTML = fallbackHTML;
        renderedContent.style.display = 'block';
        
        // Update button to show fallback
        renderButton.innerHTML = '⚠️ Rendered (Fallback)';
        renderButton.style.background = 'linear-gradient(135deg, #ffc107 0%, #fd7e14 100%)';
        
        // Scroll to rendered content
        renderedContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } finally {
        renderButton.disabled = false;
    }
}

// Call Gemini API directly for JSON rendering
async function callGeminiAPIForJSONRender(jsonData) {
    const GEMINI_API_KEY = 'AIzaSyCSAquXebiwOSJWMsJ-z5ZTN4JPzAnTjXo';
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    
    // Create the prompt for Gemini
    const systemPrompt = `You are an expert data visualization designer specializing in creating beautiful, readable presentations of JSON data for educational grading systems.

TASK: Transform the provided JSON data into a stunning, professional HTML presentation with inline CSS.

DESIGN REQUIREMENTS:
1. Create a modern, clean layout that makes JSON data easy to understand
2. Use cards, sections, and visual hierarchy to organize information
3. Color-code different data types (scores=blue, text=gray, arrays=green, objects=purple)
4. Make it visually engaging with icons, gradients, and modern CSS
5. Ensure excellent readability and professional appearance
6. Handle nested objects and arrays gracefully
7. Make it suitable for educational and professional contexts

LAYOUT STRUCTURE:
- Header with title and summary
- Organized sections for different data categories
- Score displays with visual indicators (progress bars, badges)
- Arrays displayed as organized cards or lists
- Nested objects in collapsible or well-structured sections
- Professional typography and consistent spacing

STYLING GUIDELINES:
- Use modern CSS with gradients, shadows, and rounded corners
- Professional color palette: blues, greens, purples, grays
- Consistent spacing (1rem, 1.5rem, 2rem)
- Responsive design principles
- Visual elements: badges, progress bars, cards, icons
- Smooth transitions and hover effects

CRITICAL: Return ONLY HTML content with inline CSS (no <html>, <head>, or <body> tags). Make it immediately renderable.`;

    const userPrompt = `Transform this JSON grading data into a beautiful visual presentation:

${JSON.stringify(jsonData, null, 2)}

Create a stunning HTML layout that:
1. Shows overall scores prominently with visual indicators
2. Displays criteria/rubric items as organized cards
3. Presents feedback and evidence clearly
4. Uses modern design with appropriate colors and spacing
5. Makes the data easy to read and understand
6. Includes icons and visual elements for engagement

Generate professional HTML with inline CSS suitable for educational contexts.`;

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${systemPrompt}\n\n${userPrompt}`
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
            let htmlContent = data.candidates[0].content.parts[0].text;
            
            // Clean up the response - remove any markdown code blocks
            htmlContent = htmlContent.replace(/```html\n?/g, '').replace(/```\n?/g, '');
            
            // Add a header indicating it was generated by Gemini
            const geminiHeader = `
                <div style="background: linear-gradient(135deg, #4285f4 0%, #34a853 50%, #fbbc05 75%, #ea4335 100%); color: white; padding: 1rem 2rem; border-radius: 12px; margin-bottom: 2rem; text-align: center; box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);">
                    <h2 style="margin: 0; font-size: 1.5rem; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                        🤖 Generated by Gemini AI
                    </h2>
                    <p style="margin: 0.5rem 0 0 0; opacity: 0.9; font-size: 1rem;">Beautiful visualization of your JSON data</p>
                </div>
            `;
            
            return geminiHeader + htmlContent;
        } else {
            throw new Error('Invalid response format from Gemini API');
        }
        
    } catch (error) {
        console.error('Gemini API call failed:', error);
        throw new Error(`Failed to render with Gemini AI: ${error.message}`);
    }
}

// Fallback JSON preview rendering if AI fails
function generateFallbackJSONPreview(data) {
    return `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 16px; margin-bottom: 2rem; text-align: center;">
            <h1 style="margin: 0; font-size: 2rem; font-weight: 700;">📊 Rendered JSON Preview</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9; font-size: 1.1rem;">Beautiful presentation of your grading data</p>
        </div>
        
        <div style="display: grid; gap: 2rem;">
            ${renderJSONSection('Overall Information', extractOverallInfo(data))}
            ${data.criteria ? renderJSONSection('Criteria Details', data.criteria) : ''}
            ${data.rubric ? renderJSONSection('Rubric Assessment', data.rubric) : ''}
            ${data.evidence_feedback ? renderJSONSection('Evidence & Feedback', data.evidence_feedback) : ''}
            ${data.case_study_alignment ? renderJSONSection('Case Study Alignment', data.case_study_alignment) : ''}
            ${renderJSONSection('Additional Data', extractAdditionalData(data))}
        </div>
        
        <div style="text-align: center; margin-top: 3rem; padding-top: 2rem; border-top: 2px solid #e9ecef;">
            <button onclick="copyRenderedData()" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; border: none; padding: 1rem 2rem; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-right: 1rem; box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);">
                📋 Copy Data
            </button>
            <button onclick="printRenderedData()" style="background: linear-gradient(135deg, #007bff 0%, #6610f2 100%); color: white; border: none; padding: 1rem 2rem; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);">
                🖨️ Print
            </button>
        </div>
    `;
}

// Helper function to render JSON sections
function renderJSONSection(title, data) {
    if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && Object.keys(data).length === 0)) {
        return '';
    }
    
    return `
        <div style="background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 8px 24px rgba(0,0,0,0.1); border-left: 6px solid #667eea;">
            <h2 style="margin: 0 0 1.5rem 0; color: #2c3e50; font-size: 1.5rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
                📋 ${title}
            </h2>
            ${renderJSONContent(data)}
        </div>
    `;
}

// Helper function to render JSON content
function renderJSONContent(data) {
    if (Array.isArray(data)) {
        return `
            <div style="display: grid; gap: 1rem;">
                ${data.map((item, index) => `
                    <div style="background: #f8f9fa; border-radius: 12px; padding: 1.5rem; border-left: 4px solid #28a745;">
                        <h4 style="margin: 0 0 1rem 0; color: #495057; font-size: 1.1rem; font-weight: 600;">Item ${index + 1}</h4>
                        ${typeof item === 'object' ? renderObjectContent(item) : `<p style="margin: 0; color: #6c757d;">${item}</p>`}
                    </div>
                `).join('')}
            </div>
        `;
    } else if (typeof data === 'object') {
        return renderObjectContent(data);
    } else {
        return `<p style="margin: 0; color: #6c757d; font-size: 1.1rem;">${data}</p>`;
    }
}

// Helper function to render object content
function renderObjectContent(obj) {
    return `
        <div style="display: grid; gap: 1rem;">
            ${Object.entries(obj).map(([key, value]) => `
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <strong style="color: #495057; font-size: 1rem; text-transform: capitalize;">${key.replace(/_/g, ' ')}:</strong>
                    <div style="padding-left: 1rem; border-left: 3px solid #e9ecef;">
                        ${typeof value === 'object' && value !== null ? 
                            (Array.isArray(value) ? 
                                `<ul style="margin: 0; padding-left: 1rem;">${value.map(item => `<li style="margin-bottom: 0.5rem; color: #6c757d;">${item}</li>`).join('')}</ul>` :
                                renderObjectContent(value)
                            ) :
                            `<span style="color: #6c757d;">${value}</span>`
                        }
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Helper functions to extract data sections
function extractOverallInfo(data) {
    const overall = {};
    if (data.total_score !== undefined) overall.total_score = data.total_score;
    if (data.max_total_score !== undefined) overall.max_total_score = data.max_total_score;
    if (data.overall) overall.overall = data.overall;
    return Object.keys(overall).length > 0 ? overall : null;
}

function extractAdditionalData(data) {
    const excluded = ['criteria', 'rubric', 'evidence_feedback', 'case_study_alignment', 'total_score', 'max_total_score', 'overall'];
    const additional = {};
    Object.keys(data).forEach(key => {
        if (!excluded.includes(key)) {
            additional[key] = data[key];
        }
    });
    return Object.keys(additional).length > 0 ? additional : null;
}

// Helper functions for rendered data actions
function copyRenderedData() {
    if (!window.currentGradingData) return;
    
    const jsonText = JSON.stringify(window.currentGradingData.content, null, 2);
    navigator.clipboard.writeText(jsonText).then(() => {
        alert('JSON data copied to clipboard! 📋');
    }).catch(() => {
        alert('Unable to copy to clipboard');
    });
}

function printRenderedData() {
    const renderedContent = document.getElementById('rendered-json-content');
    if (!renderedContent) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Rendered JSON Preview</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; line-height: 1.6; }
                @media print { button { display: none !important; } }
            </style>
        </head>
        <body>
            ${renderedContent.innerHTML.replace(/<button[^>]*>.*?<\/button>/g, '')}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// Print AI-generated rubric
function printAIRubric() {
    const rubricContent = document.querySelector('.ai-preview-content');
    if (!rubricContent) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>AI-Generated Rubric Assessment</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; line-height: 1.6; }
                .ai-preview-header { text-align: center; margin-bottom: 30px; padding: 20px; background: linear-gradient(135deg, #ff6b6b 0%, #feca57 100%); color: white; border-radius: 12px; }
                .ai-preview-header h2 { margin: 0; font-size: 2rem; }
                @media print { 
                    button { display: none !important; }
                    .ai-preview-header { background: #ff6b6b !important; -webkit-print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            ${rubricContent.innerHTML.replace(/<button[^>]*>.*?<\/button>/g, '')}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// Share AI-generated rubric
function shareAIRubric() {
    if (!window.currentGradingData) return;
    
    const data = window.currentGradingData.content;
    const totalScore = data.total_score || 0;
    const maxTotalScore = data.max_total_score || 100;
    const percentage = Math.round((totalScore / maxTotalScore) * 100);
    
    const shareText = `🤖 AI-Generated Rubric Assessment

📊 Overall Performance: ${totalScore}/${maxTotalScore} (${percentage}%)
🏆 Grade: ${getGradeLabel(percentage)}

📋 Detailed Rubric Breakdown:
${data.rubric ? data.rubric.map((criterion, index) => 
    `${index + 1}. ${criterion.criterion}: ${criterion.score}/${criterion.max_score}
    📝 Rationale: ${criterion.rationale || 'N/A'}`
).join('\n\n') : ''}

${data.evidence_feedback && data.evidence_feedback.length > 0 ? `
💡 Key Recommendations:
${data.evidence_feedback.map((feedback, index) => `${index + 1}. ${feedback}`).join('\n')}` : ''}

${data.case_study_alignment ? `
🎯 Case Study Alignment: ${data.case_study_alignment.summary}` : ''}

${data.notes ? `📌 Notes: ${data.notes}` : ''}

Generated by AI-Powered Assessment System 🤖✨`;

    if (navigator.share) {
        navigator.share({
            title: 'AI-Generated Rubric Assessment',
            text: shareText
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareText).then(() => {
            alert('AI-generated rubric copied to clipboard! 📋🤖');
        }).catch(() => {
            // Final fallback: show in alert
            alert('Share Text:\n\n' + shareText);
        });
    }
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
document.addEventListener('DOMContentLoaded', function () {
    // Initialize Google Auth when the page loads
    if (typeof google !== 'undefined') {
        initializeGoogleAuth();
    } else {
        // Wait for Google API to load
        window.addEventListener('load', initializeGoogleAuth);
    }

    // Login button click handler
    document.getElementById('loginBtn').addEventListener('click', function () {
        if (!CONFIG.CLIENT_ID.includes('YOUR_')) {
            tokenClient.requestAccessToken();
        } else {
            showError('Please configure your Google Client ID in script.js');
        }
    });
});

// Handle Google API load
window.onload = function () {
    if (typeof google !== 'undefined') {
        initializeGoogleAuth();
    }
};