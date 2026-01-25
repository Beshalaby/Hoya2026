/**
 * Voice Assistant Service
 * Uses native Web Speech API for reliable speech recognition
 * Falls back to a simple voice interface that works in all modern browsers
 */

class VoiceAssistantService {
    constructor() {
        // Agent ID from environment or localStorage (no default fallback)
        this.agentId = localStorage.getItem('elevenlabs_agent_id') ||
            import.meta.env?.VITE_ELEVENLABS_AGENT_ID ||
            '';
        this.enabled = localStorage.getItem('voice_assistant_enabled') !== 'false';

        this.isConnected = false;
        this.isSpeaking = false;
        this.isListening = false;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;

        // Callbacks
        this.onStatusChange = () => { };
        this.onMessage = () => { };
        this.onError = () => { };

        // Traffic data context
        this.trafficContext = {
            totalVehicles: 0,
            lanes: [],
            alerts: [],
            congestionLevel: 'low',
            avgWaitTime: 0,
            lastUpdate: null
        };

        // Check for speech recognition support
        this.speechRecognitionSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

        console.log('VoiceAssistantService initialized (Native Speech API)');
    }

    /**
     * Configure the service
     */
    configure({ agentId, enabled }) {
        if (agentId !== undefined) {
            this.agentId = agentId;
            localStorage.setItem('elevenlabs_agent_id', agentId);
        }
        if (enabled !== undefined) {
            this.enabled = enabled;
            localStorage.setItem('voice_assistant_enabled', enabled.toString());
        }
    }

    /**
     * Check if service is properly configured
     */
    isConfigured() {
        return this.speechRecognitionSupported;
    }

    /**
     * Update traffic context for the AI to reference
     */
    updateTrafficContext(data) {
        if (!data) return;

        this.trafficContext = {
            totalVehicles: data.lanes?.reduce((sum, l) => sum + (l.vehicle_count || 0), 0) || 0,
            lanes: data.lanes || [],
            alerts: data.alerts || [],
            congestionLevel: this.calculateOverallCongestion(data.lanes),
            avgWaitTime: data.avg_wait_seconds || 0,
            lastUpdate: new Date().toISOString()
        };
    }

    /**
     * Calculate overall congestion from lane data
     */
    calculateOverallCongestion(lanes) {
        if (!lanes || lanes.length === 0) return 'unknown';

        const congestionScores = { low: 1, medium: 2, high: 3 };
        const avgScore = lanes.reduce((sum, l) => {
            return sum + (congestionScores[l.congestion] || 1);
        }, 0) / lanes.length;

        if (avgScore >= 2.5) return 'high';
        if (avgScore >= 1.5) return 'medium';
        return 'low';
    }

    /**
     * Start the voice conversation
     */
    async startConversation() {
        if (!this.enabled) {
            return { success: false, reason: 'disabled' };
        }

        if (!this.speechRecognitionSupported) {
            return { success: false, error: 'Speech recognition not supported in this browser. Try Chrome.' };
        }

        if (this.isConnected) {
            return { success: true, alreadyConnected: true };
        }

        try {
            this.onStatusChange('connecting');

            // Request microphone permission
            await navigator.mediaDevices.getUserMedia({ audio: true });

            // Create the voice UI
            this.createVoiceUI();

            // Initialize speech recognition
            this.initSpeechRecognition();

            this.isConnected = true;
            this.onStatusChange('connected');

            // Speak greeting
            this.speak(`TrafiQ Assistant online. How can I assist you?`);

            return { success: true };

        } catch (error) {
            console.error('Failed to start voice assistant:', error);
            this.onStatusChange('error');
            this.onError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Initialize Web Speech API recognition
     */
    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            this.onStatusChange('listening');
            this.updateUIStatus('Listening...');
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Update UI with what user is saying
            this.updateTranscript(interimTranscript || finalTranscript, !event.results[event.results.length - 1].isFinal);

            // Process final transcript
            if (finalTranscript) {
                this.processUserInput(finalTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            if (event.error !== 'no-speech') {
                this.updateUIStatus('Error: ' + event.error);
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;

            // Restart if still connected
            if (this.isConnected && !this.isSpeaking) {
                setTimeout(() => {
                    if (this.isConnected) {
                        this.recognition.start();
                    }
                }, 100);
            }
        };

        // Start listening
        this.recognition.start();
    }

    /**
     * Process user's voice input and generate response
     */
    processUserInput(text) {
        const lowerText = text.toLowerCase();
        const ctx = this.trafficContext;
        let response = '';

        // Traffic status queries
        if (lowerText.includes('traffic') || lowerText.includes('status') || lowerText.includes('condition')) {
            response = `Current traffic conditions are ${ctx.congestionLevel}. We are detecting ${ctx.totalVehicles} vehicles with an average wait time of ${ctx.avgWaitTime} seconds.`;
        }
        // Vehicle count queries
        else if (lowerText.includes('vehicle') || lowerText.includes('car') || lowerText.includes('count')) {
            response = `There are currently ${ctx.totalVehicles} vehicles tracked at this intersection.`;
        }
        // Coongestion queries
        else if (lowerText.includes('congestion') || lowerText.includes('busy')) {
            response = `Congestion is currently classified as ${ctx.congestionLevel}.`;
        }
        // Alert queries
        else if (lowerText.includes('alert') || lowerText.includes('incident')) {
            const alerts = ctx.alerts;
            if (alerts.length > 0) {
                response = `There are ${alerts.length} active alerts. ${alerts.slice(0, 3).join('. ')}`;
            } else {
                response = 'There are no active alerts reported at this time.';
            }
        }
        // Help
        else if (lowerText.includes('help') || lowerText.includes('can you')) {
            response = 'I can provide information on traffic status, vehicle counts, congestion levels, and active alerts.';
        }
        // Greeting
        else if (lowerText.includes('hello') || lowerText.includes('hi ') || lowerText.includes('hey')) {
            response = `Good day. I am the TrafiQ Assistant. How may I help you?`;
        }
        // Fallback
        else {
            response = 'I apologize, but I did not understand your request. Please ask about traffic conditions, vehicle counts, or system status.';
        }

        // Display and speak the response
        this.displayResponse(response);
        this.speak(response);
    }

    /**
     * Speak text using Web Speech Synthesis
     */
    speak(text) {
        if (!this.synthesis) return;

        // Stop any ongoing speech
        this.synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to use a good voice
        const voices = this.synthesis.getVoices();
        const preferredVoice = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google') || v.lang === 'en-US');
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        utterance.onstart = () => {
            this.isSpeaking = true;
            this.onStatusChange('speaking');
            this.updateUIStatus('Speaking...');
            // Pause recognition while speaking
            if (this.recognition) {
                this.recognition.stop();
            }
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            this.onStatusChange('listening');
            this.updateUIStatus('Listening...');
            // Resume recognition
            if (this.isConnected && this.recognition) {
                setTimeout(() => this.recognition.start(), 100);
            }
        };

        this.synthesis.speak(utterance);
    }

    /**
     * Create the voice assistant UI
     */
    createVoiceUI() {
        this.removeVoiceUI();

        const container = document.createElement('div');
        container.id = 'voice-assistant-ui';
        container.innerHTML = `
            <div class="voice-ui-header">
                <div class="voice-ui-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                    TrafiQ Assistant
                </div>
                <button class="voice-ui-close" onclick="window.trafiQ?.voiceAssistantService?.endConversation()">×</button>
            </div>
            <div class="voice-ui-status" id="voice-ui-status">Initializing...</div>
            <div class="voice-ui-transcript" id="voice-ui-transcript"></div>
            <div class="voice-ui-response" id="voice-ui-response"></div>
            <div class="voice-ui-hint">Try: "What is the traffic status?" or "How many vehicles?"</div>
        `;

        const style = document.createElement('style');
        style.id = 'voice-ui-styles';
        style.textContent = `
            #voice-assistant-ui {
                position: fixed;
                bottom: 100px;
                right: 24px;
                width: 340px;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(99, 102, 241, 0.3);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                overflow: hidden;
            }
            .voice-ui-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px;
                background: rgba(99, 102, 241, 0.1);
                border-bottom: 1px solid rgba(99, 102, 241, 0.2);
            }
            .voice-ui-title {
                display: flex;
                align-items: center;
                gap: 8px;
                color: #a5b4fc;
                font-weight: 600;
                font-size: 14px;
            }
            .voice-ui-close {
                background: rgba(255,255,255,0.1);
                border: none;
                color: white;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .voice-ui-close:hover {
                background: rgba(255,255,255,0.2);
            }
            .voice-ui-status {
                padding: 12px 16px;
                color: #10b981;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .voice-ui-status::before {
                content: '';
                width: 8px;
                height: 8px;
                background: #10b981;
                border-radius: 50%;
                animation: pulse 1.5s infinite;
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            .voice-ui-transcript {
                padding: 12px 16px;
                color: #94a3b8;
                font-size: 14px;
                min-height: 24px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .voice-ui-transcript:empty::before {
                content: 'Listening...';
                opacity: 0.5;
            }
            .voice-ui-transcript.interim {
                color: #64748b;
                font-style: italic;
            }
            .voice-ui-response {
                padding: 16px;
                color: #e2e8f0;
                font-size: 14px;
                line-height: 1.5;
                min-height: 60px;
                max-height: 150px;
                overflow-y: auto;
            }
            .voice-ui-response:empty::before {
                content: 'Response pending...';
                opacity: 0.3;
            }
            .voice-ui-hint {
                padding: 12px 16px;
                background: rgba(0,0,0,0.2);
                color: #64748b;
                font-size: 12px;
                text-align: center;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(container);

        window.trafiQ = window.trafiQ || {};
        window.trafiQ.voiceAssistantService = this;
    }

    /**
     * Update the UI status text
     */
    updateUIStatus(text) {
        const statusEl = document.getElementById('voice-ui-status');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    /**
     * Update the transcript display
     */
    updateTranscript(text, isInterim = false) {
        const transcriptEl = document.getElementById('voice-ui-transcript');
        if (transcriptEl) {
            transcriptEl.textContent = text;
            transcriptEl.classList.toggle('interim', isInterim);
        }
    }

    /**
     * Display the assistant's response
     */
    displayResponse(text) {
        const responseEl = document.getElementById('voice-ui-response');
        if (responseEl) {
            responseEl.textContent = text;
        }
    }

    /**
     * Remove the voice UI from DOM
     */
    removeVoiceUI() {
        const ui = document.getElementById('voice-assistant-ui');
        const styles = document.getElementById('voice-ui-styles');
        if (ui) ui.remove();
        if (styles) styles.remove();
    }

    /**
     * End the voice conversation
     */
    async endConversation() {
        if (this.recognition) {
            this.recognition.stop();
            this.recognition = null;
        }

        if (this.synthesis) {
            this.synthesis.cancel();
        }

        this.removeVoiceUI();
        this.isConnected = false;
        this.isSpeaking = false;
        this.isListening = false;
        this.onStatusChange('disconnected');
    }

    /**
     * Toggle the conversation on/off
     */
    async toggle() {
        if (this.isConnected) {
            await this.endConversation();
            return { connected: false };
        } else {
            const result = await this.startConversation();
            return { connected: result.success, ...result };
        }
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return {
            agentIdSet: !!this.agentId,
            enabled: this.enabled,
            isConfigured: this.isConfigured(),
            isConnected: this.isConnected,
            isSpeaking: this.isSpeaking,
            isListening: this.isListening
        };
    }
}

export const voiceAssistantService = new VoiceAssistantService();
export default VoiceAssistantService;
