/**
 * Heatmap Component
 * Visualizes congestion levels across lanes - Updated for new UI
 */
export class Heatmap {
    constructor(options = {}) {
        this.container = document.getElementById('heatmapGrid');
        this.laneCount = options.laneCount || 4;
        this.lanes = [];
        this.lastUpdateTime = 0;
        this.updateThrottleMs = 1000; // Only update once per second

        this.init();
    }

    init() {
        if (!this.container) return;
        this.isConfigured = false;
        // Initial clean state handled by HTML placeholder
    }

    /**
     * Update all lanes with new data (throttled)
     */
    update(lanesData) {
        if (!Array.isArray(lanesData)) return;
        
        // Throttle updates to prevent too-rapid changes
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateThrottleMs) {
            return; // Skip this update
        }
        this.lastUpdateTime = now;

        // "Lock" the configuration after the first valid data packet
        // This ensures lanes don't disappear if the AI misses one in a frame
        if (!this.isConfigured && lanesData.length > 0) {
            this.renderLanes(lanesData);
            this.isConfigured = true;
        }

        // Always update the statistics for existing cards
        // Identify cards by data-lane attribute to ensure correct mapping
        lanesData.forEach(laneData => {
            const laneId = laneData.lane_id;
            const card = this.container.querySelector(`.lane-card[data-lane="${laneId}"]`);
            if (card) {
                this.updateLane(card, laneData);
            }
        });
    }

    /**
     * Render the lane grid from scratch
     * Supports grouping by direction
     */
    renderLanes(lanesData) {
        if (!this.container) return;

        this.container.innerHTML = '';
        
        if (lanesData.length === 0) {
            this.container.innerHTML = `
                <div class="loading-placeholder" style="grid-column: 1 / -1; text-align: center; color: var(--color-text-muted); padding: 2rem;">
                    Waiting for analysis...
                </div>`;
            return;
        }

        // Group lanes by direction
        const lanesByDirection = lanesData.reduce((acc, lane) => {
            const dir = lane.direction || 'Unknown';
            if (!acc[dir]) acc[dir] = [];
            acc[dir].push(lane);
            return acc;
        }, {});

        const directions = Object.keys(lanesByDirection);

        // If multiple directions, render groups
        if (directions.length > 1 || (directions.length === 1 && directions[0] !== 'Unknown')) {
            directions.forEach(dir => {
                const group = document.createElement('div');
                group.className = 'lane-group';
                group.style.display = 'contents'; // Use contents to keep grid layout or handle locally
                
                // Add header if useful, or just render cards in order
                // For now, we'll just render them in order but maybe we can add a visual divider later if needed
                // Currently just appending cards to the main grid in direction groups
                
                lanesByDirection[dir].forEach(lane => {
                   this.createLaneCard(lane, dir);
                });
            });
        } else {
            // Flat list
            lanesData.forEach(lane => {
                this.createLaneCard(lane);
            });
        }
    }

    createLaneCard(lane, directionLabel) {
        const laneId = lane.lane_id;
        const card = document.createElement('div');
        card.className = 'lane-card';
        card.dataset.lane = laneId;
        
        let headerText = `L${laneId}`;
        if (directionLabel && directionLabel !== 'Unknown') {
             // Maybe add a small badge or abbreviation for direction?
             // For now keeping it simple as requested
        }

        card.innerHTML = `
            <div class="lane-card__header">
                <span class="lane-card__name">${headerText}</span>
                <span class="lane-card__status lane-card__status--low">Clear</span>
            </div>
            <div class="lane-card__stats">
                <span class="lane-vehicles">0 vehicles</span>
                <span class="lane-queue">0m queue</span>
            </div>
        `;
        
        // Add direction badge if sensible
        if (directionLabel && directionLabel !== 'Unknown') {
             const badge = document.createElement('span');
             badge.className = 'lane-direction-badge';
             badge.style.fontSize = '0.7rem';
             badge.style.opacity = '0.7';
             badge.textContent = directionLabel;
             card.querySelector('.lane-card__header').insertBefore(badge, card.querySelector('.lane-card__status'));
        }

        this.container.appendChild(card);
        this.updateLane(card, lane);
    }

    /**
     * Update a single lane card
     */
    updateLane(card, data) {
        if (!card || !data) return;

        // Update status badge
        const statusEl = card.querySelector('.lane-card__status');
        if (statusEl) {
            statusEl.className = 'lane-card__status'; // reset
            statusEl.classList.add(`lane-card__status--${data.congestion || 'low'}`);

            const statusText = {
                'low': 'Clear',
                'medium': 'Busy',
                'high': 'Congested'
            };
            statusEl.textContent = statusText[data.congestion] || 'Clear';
        }

        // Update vehicle count
        const vehiclesEl = card.querySelector('.lane-vehicles');
        if (vehiclesEl) {
            const count = data.vehicle_count || 0;
            vehiclesEl.textContent = `${count} vehicles`;
        }

        // Update queue length
        const queueEl = card.querySelector('.lane-queue');
        if (queueEl) {
            const queue = data.queue_length_meters || 0;
            queueEl.textContent = `${queue}m queue`;
        }
    }

    /**
     * Reset all lanes to default state
     */
    reset() {
        this.container.innerHTML = `
            <div class="loading-placeholder" style="grid-column: 1 / -1; text-align: center; color: var(--color-text-muted); padding: 2rem;">
                Waiting for analysis...
            </div>`;
        this.lanes = [];
        this.isConfigured = false;
    }
}

export default Heatmap;
