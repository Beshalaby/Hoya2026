/**
 * Audio Alert Utility
 * Provides audio notifications for critical traffic events
 */
export class AudioAlerts {
    constructor(options = {}) {
        this.enabled = options.enabled ?? true;
        this.volume = options.volume ?? 0.5;
        this.audioContext = null;
        this.lastAlertTime = 0;
        this.minAlertInterval = 3000; // Minimum 3 seconds between alerts

        // Initialize audio context on first user interaction
        this.initOnInteraction();
    }

    /**
     * Initialize AudioContext on first user interaction (required by browsers)
     */
    initOnInteraction() {
        const initAudio = () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            document.removeEventListener('click', initAudio);
            document.removeEventListener('keydown', initAudio);
        };

        document.addEventListener('click', initAudio, { once: true });
        document.addEventListener('keydown', initAudio, { once: true });
    }

    /**
     * Play a tone with specified parameters
     */
    playTone(frequency, duration, type = 'sine') {
        if (!this.enabled || !this.audioContext) return;

        const now = Date.now();
        if (now - this.lastAlertTime < this.minAlertInterval) return;
        this.lastAlertTime = now;

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

            gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        } catch (e) {
            console.warn('Audio alert failed:', e);
        }
    }

    /**
     * Play danger alert (high-pitched urgent tone)
     */
    danger() {
        this.playTone(880, 0.3, 'square'); // A5
        setTimeout(() => this.playTone(880, 0.3, 'square'), 200);
    }

    /**
     * Play warning alert (medium tone)
     */
    warning() {
        this.playTone(587, 0.4, 'triangle'); // D5
    }

    /**
     * Play info/notification sound
     */
    info() {
        this.playTone(440, 0.2, 'sine'); // A4
    }

    /**
     * Play success sound
     */
    success() {
        this.playTone(523, 0.15, 'sine'); // C5
        setTimeout(() => this.playTone(659, 0.15, 'sine'), 100); // E5
    }

    /**
     * Process alerts and play appropriate sounds
     */
    processAlerts(alerts) {
        if (!alerts || alerts.length === 0) return;

        // Check for critical alerts
        const criticalKeywords = ['violation', 'collision', 'near-miss', 'incident'];
        const warningKeywords = ['congestion', 'backup', 'high', 'unsafe'];

        for (const alert of alerts) {
            const lowerAlert = alert.toLowerCase();

            if (criticalKeywords.some(kw => lowerAlert.includes(kw))) {
                this.danger();
                return; // Only play one sound
            }

            if (warningKeywords.some(kw => lowerAlert.includes(kw))) {
                this.warning();
                return;
            }
        }
    }

    /**
     * Toggle audio alerts on/off
     */
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    /**
     * Set volume (0-1)
     */
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
    }
}

export default AudioAlerts;
