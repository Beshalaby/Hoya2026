/**
 * SignalControl Component
 * Simulates traffic signal timing controls
 */
export class SignalControl {
    constructor(options = {}) {
        this.container = document.getElementById('signalControls');
        this.signalMode = document.getElementById('signalMode');
        this.lanes = 4;
        this.timings = {
            1: 45,
            2: 30,
            3: 45,
            4: 30
        };
        this.currentGreen = 1;
        this.cycleInterval = null;
        this.onTimingChange = options.onTimingChange || (() => { });

        this.init();
    }

    init() {
        // Setup slider event listeners
        for (let i = 1; i <= this.lanes; i++) {
            const slider = document.getElementById(`greenTime${i}`);
            const valueDisplay = slider?.parentElement?.querySelector('.signal-slider__value');

            if (slider) {
                slider.addEventListener('input', (e) => {
                    const value = e.target.value;
                    this.timings[i] = parseInt(value);
                    if (valueDisplay) {
                        valueDisplay.textContent = `${value}s`;
                    }
                });
            }
        }

        // Reset button
        const resetBtn = document.getElementById('resetSignalsBtn');
        resetBtn?.addEventListener('click', () => this.resetToDefault());

        // Apply button
        const applyBtn = document.getElementById('applySignalsBtn');
        applyBtn?.addEventListener('click', () => this.applyChanges());

        // Simulate button
        const simulateBtn = document.getElementById('simulateTrafficBtn');
        simulateBtn?.addEventListener('click', () => this.toggleSimulation());

        // Start the signal cycle animation
        this.startCycle();
    }

    /**
     * Start the signal cycle animation
     */
    startCycle() {
        if (this.cycleInterval) {
            clearInterval(this.cycleInterval);
        }

        this.updateLights();

        // Cycle through lanes
        this.cycleInterval = setInterval(() => {
            this.currentGreen = (this.currentGreen % this.lanes) + 1;
            this.updateLights();
        }, 3000); // Change every 3 seconds for demo
    }

    /**
     * Update the signal lights display
     */
    updateLights() {
        for (let i = 1; i <= this.lanes; i++) {
            const light = document.getElementById(`signalLight${i}`);
            if (light) {
                light.classList.remove('signal-light--green', 'signal-light--red', 'signal-light--yellow');

                if (i === this.currentGreen) {
                    light.classList.add('signal-light--green');
                } else if (i === ((this.currentGreen % this.lanes) + 1)) {
                    // Next lane to go green shows yellow briefly
                    light.classList.add('signal-light--red');
                } else {
                    light.classList.add('signal-light--red');
                }
            }
        }
    }

    /**
     * Reset timings to default values
     */
    resetToDefault() {
        this.timings = {
            1: 45,
            2: 30,
            3: 45,
            4: 30
        };

        for (let i = 1; i <= this.lanes; i++) {
            const slider = document.getElementById(`greenTime${i}`);
            const valueDisplay = slider?.parentElement?.querySelector('.signal-slider__value');

            if (slider) {
                slider.value = this.timings[i];
            }
            if (valueDisplay) {
                valueDisplay.textContent = `${this.timings[i]}s`;
            }
        }

        console.log('🔄 Signal timings reset to default');
    }

    /**
     * Apply the current timing changes
     */
    applyChanges() {
        console.log('✅ Signal timings applied:', this.timings);
        this.onTimingChange(this.timings);

        // Visual feedback
        const modeEl = this.signalMode;
        if (modeEl) {
            modeEl.textContent = 'Manual';
            modeEl.classList.remove('badge--success');
            modeEl.classList.add('badge--warning');

            setTimeout(() => {
                modeEl.textContent = 'Applied';
                modeEl.classList.remove('badge--warning');
                modeEl.classList.add('badge--success');
            }, 1000);
        }
    }

    /**
     * Toggle traffic simulation
     */
    toggleSimulation() {
        // This triggers the map simulation
        if (window.trafiQ?.interactiveMap) {
            window.trafiQ.interactiveMap.simulateTraffic();
        }
    }

    /**
     * Update signal recommendation based on AI data
     */
    updateRecommendation(data) {
        if (!data || !data.lanes) return;

        // Find the most congested lane
        let maxCongestion = 'low';
        let congestedLane = null;

        data.lanes.forEach(lane => {
            if (lane.congestion === 'high') {
                maxCongestion = 'high';
                congestedLane = lane.lane_id;
            } else if (lane.congestion === 'medium' && maxCongestion !== 'high') {
                maxCongestion = 'medium';
                congestedLane = lane.lane_id;
            }
        });

        // If there's congestion, recommend increasing green time
        if (congestedLane && maxCongestion !== 'low') {
            const slider = document.getElementById(`greenTime${congestedLane}`);
            if (slider) {
                // Highlight the recommended lane
                const laneEl = slider.closest('.signal-lane');
                if (laneEl) {
                    laneEl.style.borderColor = maxCongestion === 'high' ? 'var(--color-danger)' : 'var(--color-warning)';
                    setTimeout(() => {
                        laneEl.style.borderColor = '';
                    }, 3000);
                }
            }
        }
    }

    /**
     * Get current timing settings
     */
    getTimings() {
        return { ...this.timings };
    }

    /**
     * Stop the signal cycle
     */
    stop() {
        if (this.cycleInterval) {
            clearInterval(this.cycleInterval);
            this.cycleInterval = null;
        }
    }
}

export default SignalControl;
