/**
 * StatsPanel Component
 * Displays real-time traffic statistics
 */
export class StatsPanel {
    constructor() {
        this.elements = {
            carCount: document.getElementById('carCount'),
            busCount: document.getElementById('busCount'),
            truckCount: document.getElementById('truckCount'),
            motorcycleCount: document.getElementById('motorcycleCount'),
            pedestrianCount: document.getElementById('pedestrianCount'),
            avgWaitTime: document.getElementById('avgWaitTime')
        };

        this.previousValues = {};
        this.cameraNameElement = document.getElementById('activeIntersectionName');
    }

    /**
     * Set the name of the currently selected camera/intersection
     */
    setCameraName(name) {
        if (this.cameraNameElement) {
            this.cameraNameElement.textContent = name || 'No camera selected';
        }
    }

    /**
     * Update statistics from AI data
     */
    update(data) {
        if (!data) return;

        // Calculate totals from lanes
        let totalCars = 0;
        let totalBuses = 0;
        let totalTrucks = 0;
        let totalMotorcycles = 0;

        if (Array.isArray(data.lanes)) {
            data.lanes.forEach(lane => {
                const types = lane.vehicle_types || {};
                totalCars += types.car || 0;
                totalBuses += types.bus || 0;
                totalTrucks += types.truck || 0;
                totalMotorcycles += types.motorcycle || 0;
            });
        }

        // Calculate average wait time
        let avgWait = 0;
        if (typeof data.avg_wait_seconds === 'number') {
            avgWait = Math.round(data.avg_wait_seconds);
        } else if (data.predicted_wait_seconds) {
            const waitTimes = Object.values(data.predicted_wait_seconds).filter(v => typeof v === 'number');
            if (waitTimes.length > 0) {
                avgWait = Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length);
            }
        }

        // Update UI with animation
        this.animateValue('carCount', totalCars);
        this.animateValue('busCount', totalBuses);
        this.animateValue('truckCount', totalTrucks);
        this.animateValue('motorcycleCount', totalMotorcycles);
        this.animateValue('pedestrianCount', data.pedestrians || 0);
        this.updateWaitTime(avgWait);
    }

    /**
     * Animate value change
     */
    animateValue(key, newValue) {
        const element = this.elements[key];
        if (!element) return;

        const oldValue = this.previousValues[key] || 0;
        this.previousValues[key] = newValue;

        if (oldValue !== newValue) {
            // Add animation class
            element.classList.add('animate-slide-up');
            element.textContent = newValue;

            // Remove animation class after animation completes
            setTimeout(() => {
                element.classList.remove('animate-slide-up');
            }, 250);
        }
    }

    /**
     * Update wait time display
     */
    updateWaitTime(seconds) {
        const element = this.elements.avgWaitTime;
        if (!element) return;

        element.innerHTML = `${seconds}<small>s</small>`;
    }

    /**
     * Reset all stats to zero
     */
    reset() {
        Object.keys(this.elements).forEach(key => {
            if (key === 'avgWaitTime') {
                this.elements[key].innerHTML = '0<small>s</small>';
            } else {
                this.elements[key].textContent = '0';
            }
        });
        this.previousValues = {};
    }
}

export default StatsPanel;
