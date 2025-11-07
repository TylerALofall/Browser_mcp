// Global state
let ecfData = [];
let timelineData = [];
let validationResults = new Map();
let currentClaim = null;

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
}

// File upload handlers
async function handleECFUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const text = await file.text();

    try {
        if (file.name.endsWith('.jsonl')) {
            ecfData = text.split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        } else {
            ecfData = JSON.parse(text);
        }

        updateStats();
        renderClaimsList();
        showNotification('ECF data loaded successfully!', 'success');
    } catch (error) {
        showNotification('Error loading ECF data: ' + error.message, 'error');
    }
}

async function handleTimelineUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const text = await file.text();

    try {
        if (file.name.endsWith('.jsonl')) {
            timelineData = text.split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        } else {
            timelineData = JSON.parse(text);
        }

        updateStats();
        renderTimeline();
        showNotification('Timeline loaded successfully!', 'success');
    } catch (error) {
        showNotification('Error loading timeline: ' + error.message, 'error');
    }
}

// Update statistics
function updateStats() {
    const total = ecfData.length;
    const negative = ecfData.filter(c => c.position === 'Negative').length;
    const validated = validationResults.size;
    const events = timelineData.length;

    document.getElementById('total-claims').textContent = total;
    document.getElementById('negative-claims').textContent = negative;
    document.getElementById('validated-claims').textContent = validated;
    document.getElementById('timeline-events').textContent = events;
}

// Render claims list
function renderClaimsList() {
    const container = document.getElementById('claims-list');
    const searchTerm = document.getElementById('claim-search')?.value.toLowerCase() || '';
    const positionFilter = document.getElementById('position-filter')?.value || 'all';

    let filtered = ecfData;

    if (searchTerm) {
        filtered = filtered.filter(claim =>
            (claim.quoted_point || '').toLowerCase().includes(searchTerm) ||
            (claim.cited || '').toLowerCase().includes(searchTerm)
        );
    }

    if (positionFilter !== 'all') {
        filtered = filtered.filter(claim => claim.position === positionFilter);
    }

    container.innerHTML = filtered.map((claim, index) => `
        <div class="claim-item ${claim.position?.toLowerCase()}" onclick="selectClaim(${index})">
            <div class="claim-header">
                <div class="claim-meta">
                    <span><strong>ECF ${claim.ecf}</strong></span>
                    <span>Page ${claim.page}</span>
                    <span>Line ${claim.line}</span>
                </div>
                <span class="claim-badge badge-${claim.position?.toLowerCase()}">${claim.position}</span>
            </div>
            <div class="claim-text">${claim.quoted_point || 'No text'}</div>
            ${claim.cited ? `<div style="margin-top: 10px; font-size: 0.9em; color: #666;">Cited: ${claim.cited}</div>` : ''}
        </div>
    `).join('');

    if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No claims found matching your filters.</p>';
    }
}

function filterClaims() {
    renderClaimsList();
}

// Select a claim for validation
function selectClaim(index) {
    currentClaim = ecfData[index];
    switchTab('validator');
    renderValidator();
}

// Render validator view
function renderValidator() {
    const container = document.getElementById('validator-content');

    if (!currentClaim) {
        container.innerHTML = '<p>Select a claim from the Claims List to validate it.</p>';
        return;
    }

    container.innerHTML = `
        <div class="validation-section">
            <h3>Selected Claim</h3>
            <div class="claim-item ${currentClaim.position?.toLowerCase()}">
                <div class="claim-header">
                    <div class="claim-meta">
                        <span><strong>ECF ${currentClaim.ecf}</strong></span>
                        <span>Page ${currentClaim.page}</span>
                        <span>Line ${currentClaim.line}</span>
                    </div>
                    <span class="claim-badge badge-${currentClaim.position?.toLowerCase()}">${currentClaim.position}</span>
                </div>
                <div class="claim-text">${currentClaim.quoted_point}</div>
                ${currentClaim.cited ? `<div style="margin-top: 10px; font-size: 0.9em; color: #666;">Cited: ${currentClaim.cited}</div>` : ''}
            </div>
        </div>

        <div class="validation-section">
            <h3>Validation Actions</h3>
            <div class="button-group">
                <button class="btn btn-primary" onclick="findDefendantSource()">Find Defendant Source</button>
                <button class="btn btn-success" onclick="findTylerRefutations()">Find Tyler Refutations</button>
                <button class="btn btn-info" onclick="matchToTimeline()">Match to Timeline</button>
            </div>
        </div>

        <div id="validation-results"></div>
    `;
}

// Find defendant source
function findDefendantSource() {
    const resultsDiv = document.getElementById('validation-results');

    // Simple fuzzy matching simulation
    const matches = ecfData.filter(claim =>
        claim.ecf !== currentClaim.ecf &&
        ['dda', 'defendant', 'beckerman', 'west_linn'].some(author =>
            (claim.cited || '').toLowerCase().includes(author)
        ) &&
        similarityScore(claim.quoted_point, currentClaim.quoted_point) > 0.3
    );

    resultsDiv.innerHTML = `
        <div class="validation-section">
            <h3>Defendant Sources Found (${matches.length})</h3>
            ${matches.length > 0 ? matches.map(match => `
                <div class="source-match">
                    <div class="claim-meta">
                        <span><strong>ECF ${match.ecf}</strong></span>
                        <span>Page ${match.page}</span>
                        <span>Line ${match.line}</span>
                        <span class="match-score">${Math.round(similarityScore(match.quoted_point, currentClaim.quoted_point) * 100)}% match</span>
                    </div>
                    <div style="margin-top: 10px;">${match.quoted_point}</div>
                    ${match.cited ? `<div style="margin-top: 5px; font-size: 0.9em; color: #666;">Cited: ${match.cited}</div>` : ''}
                </div>
            `).join('') : '<p>No defendant sources found for this claim.</p>'}
        </div>
    `;
}

// Find Tyler refutations
function findTylerRefutations() {
    const resultsDiv = document.getElementById('validation-results');

    // Find Tyler's responses
    const refutations = ecfData.filter(claim =>
        claim.ecf !== currentClaim.ecf &&
        (claim.cited || '').toLowerCase().includes('tyler') &&
        claim.position === 'Positive' &&
        similarityScore(claim.quoted_point, currentClaim.quoted_point) > 0.2
    );

    const existingContent = resultsDiv.innerHTML;
    resultsDiv.innerHTML = existingContent + `
        <div class="validation-section">
            <h3>Tyler's Refutations Found (${refutations.length})</h3>
            ${refutations.length > 0 ? refutations.map(ref => `
                <div class="refutation">
                    <div class="claim-meta">
                        <span><strong>ECF ${ref.ecf}</strong></span>
                        <span>Page ${ref.page}</span>
                        <span>Line ${ref.line}</span>
                        <span class="match-score">${Math.round(similarityScore(ref.quoted_point, currentClaim.quoted_point) * 100)}% relevance</span>
                    </div>
                    <div style="margin-top: 10px;">${ref.quoted_point}</div>
                    ${ref.cited ? `<div style="margin-top: 5px; font-size: 0.9em; color: #666;">Cited: ${ref.cited}</div>` : ''}
                </div>
            `).join('') : '<p>No refutations found yet. Tyler may need to address this claim.</p>'}
        </div>
    `;
}

// Match to timeline
function matchToTimeline() {
    const resultsDiv = document.getElementById('validation-results');

    // Find related timeline events
    const relatedEvents = timelineData.filter(event =>
        event.primary_ecf === currentClaim.ecf ||
        (event.cross_referenced_ecfs || []).includes(currentClaim.ecf)
    );

    const existingContent = resultsDiv.innerHTML;
    resultsDiv.innerHTML = existingContent + `
        <div class="validation-section">
            <h3>Related Timeline Events (${relatedEvents.length})</h3>
            ${relatedEvents.length > 0 ? relatedEvents.map(event => `
                <div class="timeline-event">
                    <div class="timeline-date">${event.date}</div>
                    <div class="timeline-title">${event.title}</div>
                    <div class="timeline-description">${event.description}</div>
                    <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
                        Primary ECF: ${event.primary_ecf} | Type: ${event.event_type}
                    </div>
                </div>
            `).join('') : '<p>No timeline events found for this ECF.</p>'}
        </div>
    `;
}

// Render timeline
function renderTimeline() {
    const container = document.getElementById('timeline-view');

    if (timelineData.length === 0) {
        container.innerHTML = '<p>No timeline data loaded. Upload a timeline file to view events.</p>';
        return;
    }

    // Sort by date
    const sorted = [...timelineData].sort((a, b) => new Date(a.date) - new Date(b.date));

    container.innerHTML = sorted.map(event => `
        <div class="timeline-event">
            <div class="timeline-date">${formatDate(event.date)}</div>
            <div class="timeline-title">${event.title}</div>
            <div class="timeline-description">${event.description}</div>
            <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
                <strong>ECF ${event.primary_ecf}</strong> |
                Type: ${event.event_type} |
                Importance: ${event.importance || 'medium'}
                ${event.cross_referenced_ecfs && event.cross_referenced_ecfs.length > 0 ?
                    `<br>Cross-refs: ${event.cross_referenced_ecfs.join(', ')}` : ''}
            </div>
        </div>
    `).join('');
}

// Helper: Simple similarity score (Jaccard similarity)
function similarityScore(str1, str2) {
    if (!str1 || !str2) return 0;

    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
}

// Helper: Format date
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Show notification
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#28a745' : '#dc3545'};
        color: white;
        border-radius: 6px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Quick action buttons
function loadECF60Data() {
    document.getElementById('ecf-upload').click();
}

function loadTimeline() {
    document.getElementById('timeline-upload').click();
}

function startValidation() {
    const negativeClaims = ecfData.filter(c => c.position === 'Negative');
    if (negativeClaims.length === 0) {
        showNotification('No negative claims found. Load ECF 60 data first.', 'error');
        return;
    }

    currentClaim = negativeClaims[0];
    switchTab('validator');
    renderValidator();
    showNotification(`Starting validation with ${negativeClaims.length} negative claims`, 'success');
}

function exportReport() {
    const report = {
        total_claims: ecfData.length,
        negative_claims: ecfData.filter(c => c.position === 'Negative').length,
        validated: validationResults.size,
        timeline_events: timelineData.length,
        timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecf60-report-${Date.now()}.json`;
    a.click();

    showNotification('Report exported successfully!', 'success');
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);
