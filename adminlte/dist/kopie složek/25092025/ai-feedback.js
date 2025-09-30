/**
 * AI Feedback Manager
 * Manages communication between web UI and AI agent
 * WITHOUT touching renderer.js or FUSED_GPS.js
 */

class AIFeedbackManager {
    constructor() {
        this.isActive = false;
        this.websocket = null;
        this.currentLog = null;
        this.panel = null;
        
        this.init();
    }
    
    init() {
        // Emergency restore console.debug if something went wrong
        if (window.originalConsoleLog && typeof window.originalConsoleLog === 'function') {
            console.debug = window.originalConsoleLog;
            console.debug('🚨 [AI-FEEDBACK] Emergency console.debug restore');
        }
        
        console.debug('🤖 [AI-FEEDBACK] Initializing AI Feedback Manager...');
        
        // Get panel elements
        this.panel = document.getElementById('ai-feedback-panel');
        this.statusElement = document.getElementById('ai-status');
        this.logsElement = document.getElementById('ai-logs');
        this.feedbackForm = document.getElementById('ai-feedback-form');
        this.suggestionsPanel = document.getElementById('ai-suggestions');
        
        // Debug: Check if elements exist
        console.debug('🔍 [AI-FEEDBACK] Panel found:', !!this.panel);
        console.debug('🔍 [AI-FEEDBACK] Status element found:', !!this.statusElement);
        console.debug('🔍 [AI-FEEDBACK] Logs element found:', !!this.logsElement);
        console.debug('🔍 [AI-FEEDBACK] Feedback form found:', !!this.feedbackForm);
        console.debug('🔍 [AI-FEEDBACK] Suggestions panel found:', !!this.suggestionsPanel);
        
        // Setup event listeners
        this.setupEventListeners();
        
        console.debug('✅ [AI-FEEDBACK] AI Feedback Manager initialized');
        
        // Test: Force show panel for debugging
        setTimeout(() => {
            console.debug('🧪 [AI-FEEDBACK] Test: Forcing panel to show...');
            if (this.panel) {
                this.panel.style.display = 'block';
                console.debug('🧪 [AI-FEEDBACK] Test panel should be visible now');
            }
        }, 2000);
    }
    
    setupEventListeners() {
        // Sidebar button
        const aiFeedbackBtn = document.getElementById('ai-feedback-btn');
        console.debug('🔍 [AI-FEEDBACK] AI Feedback button found:', !!aiFeedbackBtn);
        
        if (aiFeedbackBtn) {
            aiFeedbackBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.debug('🤖 [AI-FEEDBACK] AI Feedback button clicked!');
                this.togglePanel();
            });
        } else {
            console.error('❌ [AI-FEEDBACK] AI Feedback button not found!');
        }
        
        // Panel controls
        const startBtn = document.getElementById('start-ai-agent');
        const stopBtn = document.getElementById('stop-ai-agent');
        const closeBtn = document.querySelector('.ai-panel-close');
        const collapseBtn = document.querySelector('.ai-panel-collapse');
        
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startAIAgent());
        }
        
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopAIAgent());
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hidePanel());
        }
        
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => this.toggleCollapse());
        }
        
        // Drag functionality
        this.setupDrag();
        
        // Apply suggestion button
        const applyBtn = document.getElementById('apply-suggestion');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applySuggestion());
        }
    }
    
    togglePanel() {
        console.debug('🤖 [AI-FEEDBACK] togglePanel called');
        console.debug('🔍 [AI-FEEDBACK] Panel exists:', !!this.panel);
        
        if (this.panel) {
            console.debug('🔍 [AI-FEEDBACK] Current display:', this.panel.style.display);
            if (this.panel.style.display === 'none') {
                this.showPanel();
            } else {
                this.hidePanel();
            }
        } else {
            console.error('❌ [AI-FEEDBACK] Panel not found!');
        }
    }
    
    showPanel() {
        if (this.panel) {
            this.panel.style.display = 'block';
            console.debug('🤖 [AI-FEEDBACK] Panel shown');
            console.debug('🔍 [AI-FEEDBACK] Panel position:', this.panel.style.position);
            console.debug('🔍 [AI-FEEDBACK] Panel z-index:', window.getComputedStyle(this.panel).zIndex);
            console.debug('🔍 [AI-FEEDBACK] Panel dimensions:', this.panel.offsetWidth + 'x' + this.panel.offsetHeight);
        }
    }
    
    hidePanel() {
        if (this.panel) {
            this.panel.style.display = 'none';
            console.debug('🤖 [AI-FEEDBACK] Panel hidden');
        }
    }
    
    startAIAgent() {
        console.debug('🚀 [AI-FEEDBACK] Starting AI Agent...');
        
        this.isActive = true;
        this.updateStatus('Running', 'info');
        this.updateLogsCount(0);
        
        // Show/hide buttons
        const startBtn = document.getElementById('start-ai-agent');
        const stopBtn = document.getElementById('stop-ai-agent');
        
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'inline-block';
        
        // Start monitoring debug logs
        this.startLogMonitoring();
        
        console.debug('✅ [AI-FEEDBACK] AI Agent started');
        console.debug('✅ [AI-FEEDBACK] Monitoring for CROSS-MODE-EXIT logs...');
    }
    
    stopAIAgent() {
        console.debug('⏹️ [AI-FEEDBACK] Stopping AI Agent...');
        
        this.isActive = false;
        this.updateStatus('Stopped', 'warning');
        
        // Show/hide buttons
        const startBtn = document.getElementById('start-ai-agent');
        const stopBtn = document.getElementById('stop-ai-agent');
        
        if (startBtn) startBtn.style.display = 'inline-block';
        if (stopBtn) stopBtn.style.display = 'none';
        
        // Hide feedback form and suggestions
        if (this.feedbackForm) this.feedbackForm.style.display = 'none';
        if (this.suggestionsPanel) this.suggestionsPanel.style.display = 'none';
        
        // Restore original console.debug
        if (window.originalConsoleLog) {
            console.debug = window.originalConsoleLog;
            console.debug('✅ [AI-FEEDBACK] console.debug restored to original');
        }
        
        // Force restore console.debug if something went wrong
        if (typeof window.originalConsoleLog === 'function') {
            console.debug = window.originalConsoleLog;
        }
        
        console.debug('✅ [AI-FEEDBACK] AI Agent stopped');
    }
    
    isRelevantLog(args) {
        const message = args.join(' ');
        
        // Look for CROSS-DECISION logs and crossing events
        return message.includes('CROSS-DECISION') || 
               message.includes('CROSS-DEBUG') ||
               message.includes('matched_ids') ||
               message.includes('CROSS MODE ACTIVE') ||
               message.includes('CROSS MODE EXIT') ||
               message.includes('crossing:');
    }
    
    processLog(args) {
        const message = args.join(' ');
        console.debug('🤖 [AI-FEEDBACK] Processing log:', message);
        
        // Check if this is a crossing exit (kulička projela křižovatku)
        if (message.includes('CROSS-MODE-EXIT') || message.includes('CROSS MODE EXIT') || message.includes('crossing: null')) {
            this.askCrossingFeedback(message);
            return;
        }
        
        // Extract information from log
        const logData = this.extractLogData(message);
        
        if (logData) {
            this.currentLog = logData;
            this.showFeedbackForm(logData);
        }
    }
    
    onLog(logEntry) {
    // Vytáhneme text zprávy
    const msg = (typeof logEntry?.message === 'string')
        ? logEntry.message
        : Array.isArray(logEntry) ? logEntry.join(' ') : String(logEntry || '');

    // 🚫 OCHRANA: ignoruj logy, které si AI-FEEDBACK píše samo
    if (msg.includes('[AI-FEEDBACK]') || msg.includes('[AIFB]')) {
        return;
    }

    if (!this.isActive) return;

    if (this.isRelevantLog([msg])) {
        try {
            this.processLog([msg]);
        } catch (err) {
            console.error('❌ [AI-FEEDBACK] processLog error:', err);
        }
    }
}


    extractLogData(message) {
        try {
            // Extract time
            const timeMatch = message.match(/(\d{2}:\d{2}:\d{2})/);
            const time = timeMatch ? timeMatch[1] : 'N/A';
            
            // Extract anchors
            const anchorMatch = message.match(/\[([\d,\s]+)\]/);
            const anchors = anchorMatch ? anchorMatch[1].split(',').map(a => a.trim()) : [];
            
            // Extract crossing
            const crossingMatch = message.match(/([A-Z]+\/[A-Z]+\/[A-Z]+)/);
            const crossing = crossingMatch ? crossingMatch[1] : 'N/A';
            
            // Calculate certainty
            const certainty = this.calculateCertainty(message);
            
            return {
                time: time,
                anchors: anchors,
                crossing: crossing,
                message: message,
                certainty: certainty
            };
        } catch (error) {
            console.error('❌ [AI-FEEDBACK] Error extracting log data:', error);
            return null;
        }
    }
    
    calculateCertainty(message) {
        // Simple certainty calculation based on message content
        if (message.includes('CRITICAL') || message.includes('ERROR')) {
            return 0.1;
        } else if (message.includes('CROSS-DECISION') || message.includes('CROSS-DEBUG')) {
            return 0.3;
        } else if (message.includes('STATUS') || message.includes('CONFIG')) {
            return 0.8;
        }
        return 0.5;
    }
    
    showFeedbackForm(logData) {
        if (!this.feedbackForm) return;
        
        // Update context
        const timeElement = document.getElementById('ai-time');
        const anchorsElement = document.getElementById('ai-anchors');
        const crossingElement = document.getElementById('ai-crossing');
        
        if (timeElement) timeElement.textContent = logData.time;
        if (anchorsElement) anchorsElement.textContent = `[${logData.anchors.join(', ')}]`;
        if (crossingElement) crossingElement.textContent = logData.crossing;
        
        // Show feedback form
        this.feedbackForm.style.display = 'block';
        
        console.debug('🤖 [AI-FEEDBACK] Feedback form shown for:', logData);
    }
    
    giveFeedback(decision) {
        if (!this.currentLog) return;
        
        console.debug('🤖 [AI-FEEDBACK] User feedback:', decision);
        
        // Hide feedback form
        if (this.feedbackForm) this.feedbackForm.style.display = 'none';
        
        // Show reason input if PROČ
        if (decision === 'PROČ') {
            const reasonInput = document.getElementById('reason-input');
            if (reasonInput) {
                reasonInput.style.display = 'block';
                reasonInput.focus();
                return;
            }
        }
        
        // Process feedback
        this.processFeedback(decision, '');
    }
    
    processFeedback(decision, reason) {
        if (!this.currentLog) return;
        
        // Create feedback entry
        const feedbackEntry = {
            timestamp: new Date().toISOString(),
            log_time: this.currentLog.time,
            message: this.currentLog.message,
            anchors: this.currentLog.anchors,
            crossing: this.currentLog.crossing,
            user_decision: decision,
            reason: reason,
            type: this.currentLog.type || 'decision'
        };
        
        console.debug('🤖 [AI-FEEDBACK] Processing feedback:', feedbackEntry);
        
        // Save feedback to file
        this.saveFeedbackToFile(feedbackEntry);
        
        // Send to AI agent (simulate for now)
        this.sendToAIAgent(feedbackEntry);
        
        // Update logs count
        this.updateLogsCount(1);
    }
    
    saveFeedbackToFile(feedbackEntry) {
        try {
            // Get existing feedbacks
            let feedbacks = [];
            const existingData = localStorage.getItem('ai_feedback_logs');
            if (existingData) {
                feedbacks = JSON.parse(existingData);
            }
            
            // Add new feedback
            feedbacks.push(feedbackEntry);
            
            // Save back to localStorage
            localStorage.setItem('ai_feedback_logs', JSON.stringify(feedbacks));
            
            console.debug('✅ [AI-FEEDBACK] Feedback saved to localStorage');
            
            // Also try to save to file (if possible)
            this.exportFeedbackToFile(feedbacks);
            
        } catch (error) {
            console.error('❌ [AI-FEEDBACK] Error saving feedback:', error);
        }
    }
    
    exportFeedbackToFile(feedbacks) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const filename = `ai_feedback_${today}.json`;
            
            const blob = new Blob([JSON.stringify(feedbacks, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.debug('✅ [AI-FEEDBACK] Feedback exported to file:', filename);
            
        } catch (error) {
            console.error('❌ [AI-FEEDBACK] Error exporting feedback:', error);
        }
    }
    
    sendToAIAgent(feedbackEntry) {
        // For now, simulate AI response
        // In real implementation, this would send to Python AI agent
        console.debug('🤖 [AI-FEEDBACK] Sending to AI agent:', feedbackEntry);
        
        // Simulate AI suggestion after delay
        setTimeout(() => {
            this.showAISuggestion(feedbackEntry);
        }, 1000);
    }
    
    showAISuggestion(feedbackEntry) {
        if (!this.suggestionsPanel) return;
        
        // Generate mock suggestion
        const suggestion = this.generateMockSuggestion(feedbackEntry);
        
        // Update suggestion content
        const contentElement = document.getElementById('suggestion-content');
        if (contentElement) {
            contentElement.innerHTML = suggestion;
        }
        
        // Show suggestions panel
        this.suggestionsPanel.style.display = 'block';
        
        console.debug('🤖 [AI-FEEDBACK] AI suggestion shown');
    }
    
    generateMockSuggestion(feedbackEntry) {
        const { anchors, user_decision, crossing } = feedbackEntry;
        
        if (user_decision === 'NE') {
            return `
                <p><strong>AI Analysis:</strong> Overlap anchors detected</p>
                <p><strong>Recommendation:</strong> Wait for segment-specific anchors</p>
                <pre><code>// Add validation in FUSED_GPS.js
function validateAnchors(anchors) {
    const overlapAnchors = [37, 38, 45];
    const segmentAAnchors = [11, 12, 13];
    
    if (anchors.every(a => overlapAnchors.includes(parseInt(a)))) {
        console.debug('⏳ Waiting for segment A anchors...');
        return false;
    }
    return true;
}</code></pre>
            `;
        } else if (user_decision === 'ANO') {
            return `
                <p><strong>AI Analysis:</strong> Valid segment A anchors detected</p>
                <p><strong>Recommendation:</strong> Proceed to segment A</p>
                <pre><code>// Update decision logic in FUSED_GPS.js
if (anchors.some(a => [11, 12, 13].includes(parseInt(a)))) {
    console.debug('✅ Segment A anchors detected - proceeding');
    return "A";
}</code></pre>
            `;
        } else {
            return `
                <p><strong>AI Analysis:</strong> Situation requires clarification</p>
                <p><strong>Recommendation:</strong> Review anchor configuration</p>
                <pre><code>// Add debug logging in FUSED_GPS.js
console.debug('🔍 [DEBUG] Anchors:', anchors, 'Crossing:', crossing);
console.debug('🔍 [DEBUG] Context:', context);</code></pre>
            `;
        }
    }
    
    applySuggestion() {
        console.debug('🤖 [AI-FEEDBACK] Applying suggestion...');
        
        // In real implementation, this would apply the code suggestion
        // For now, just show a message
        if (window.toastr) {
            window.toastr.success('Suggestion applied successfully!', 'AI Feedback');
        } else {
            alert('Suggestion applied successfully!');
        }
        
        // Hide suggestions panel
        if (this.suggestionsPanel) this.suggestionsPanel.style.display = 'none';
    }
    
    updateStatus(status, type) {
        if (this.statusElement) {
            this.statusElement.textContent = `Status: ${status}`;
            this.statusElement.className = `badge badge-${type}`;
        }
    }
    
    updateLogsCount(count) {
        if (this.logsElement) {
            this.logsElement.textContent = `Logs: ${count}`;
        }
    }
    
    startLogMonitoring() {
        // Start monitoring for new logs
        console.debug('🔍 [AI-FEEDBACK] Log monitoring started');
        
        // Store original console.debug
        if (!window.originalConsoleLog) {
            window.originalConsoleLog = console.debug;
        }
        
        // Override console.debug to intercept logs
        const self = this;
        console.debug = function(...args) {
            // Call original console.debug FIRST
            window.originalConsoleLog.apply(console, args);
            
            // Process log for AI feedback ONLY if active
            if (self.isActive && self.isRelevantLog(args)) {
                try {
                    self.processLog(args);
                } catch (error) {
                    console.error('❌ [AI-FEEDBACK] Error processing log:', error);
                }
            }
        };
        
        console.debug('✅ [AI-FEEDBACK] console.debug interception active');
    }
    
    setupDrag() {
        if (!this.panel) return;
        
        const header = this.panel.querySelector('.ai-panel-header');
        if (!header) return;
        
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return; // Don't drag when clicking buttons
            
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            
            if (e.target === header || header.contains(e.target)) {
                isDragging = true;
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                
                xOffset = currentX;
                yOffset = currentY;
                
                this.panel.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }
        });
        
        document.addEventListener('mouseup', () => {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        });
    }
    
    toggleCollapse() {
        if (!this.panel) return;
        
        const content = this.panel.querySelector('.ai-panel-content');
        const collapseBtn = this.panel.querySelector('.ai-panel-collapse');
        
        if (content && collapseBtn) {
            if (content.style.display === 'none') {
                content.style.display = 'block';
                collapseBtn.textContent = '−';
                collapseBtn.title = 'Collapse';
            } else {
                content.style.display = 'none';
                collapseBtn.textContent = '+';
                collapseBtn.title = 'Expand';
            }
        }
    }
    
    askCrossingFeedback(message) {
        console.debug('🤖 [AI-FEEDBACK] Kulička projela křižovatku - ptám se na feedback');
        console.debug('🤖 [AI-FEEDBACK] Message:', message);
        
        // Extract crossing info from message
        const crossingMatch = message.match(/crossing: ([^,]+)/);
        const crossing = crossingMatch ? crossingMatch[1] : 'Unknown';
        
        console.debug('🤖 [AI-FEEDBACK] Extracted crossing:', crossing);
        
        // Show crossing feedback form
        this.showCrossingFeedbackForm(crossing, message);
    }
    
    showCrossingFeedbackForm(crossing, message) {
        if (!this.feedbackForm) return;
        
        // Update context for crossing feedback
        const timeElement = document.getElementById('ai-time');
        const anchorsElement = document.getElementById('ai-anchors');
        const crossingElement = document.getElementById('ai-crossing');
        
        if (timeElement) timeElement.textContent = new Date().toLocaleTimeString();
        if (anchorsElement) anchorsElement.textContent = 'Křižovatka projeta';
        if (crossingElement) crossingElement.textContent = crossing;
        
        // Update form title
        const formTitle = this.feedbackForm.querySelector('h6');
        if (formTitle) formTitle.textContent = 'Křižovatka projeta - byla správně?';
        
        // Show feedback form
        this.feedbackForm.style.display = 'block';
        
        // Store crossing data
        this.currentLog = {
            time: new Date().toLocaleTimeString(),
            anchors: ['Křižovatka projeta'],
            crossing: crossing,
            message: message,
            type: 'crossing_exit'
        };
        
        console.debug('🤖 [AI-FEEDBACK] Crossing feedback form shown for:', crossing);
    }
}

// Global function for feedback buttons
function giveFeedback(decision) {
    if (window.aiFeedbackManager) {
        window.aiFeedbackManager.giveFeedback(decision);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.debug('🤖 [AI-FEEDBACK] DOM ready, initializing...');
    window.aiFeedbackManager = new AIFeedbackManager();
});

// Export for global access
window.AIFeedbackManager = AIFeedbackManager;
