/**
 * HistoricalChart Component
 * Visualizes historical traffic trends
 */
export class HistoricalChart {
    constructor() {
        this.barsContainer = document.getElementById('trendsBars');
        this.labelsContainer = document.getElementById('trendsLabels');
        this.periodButtons = document.querySelectorAll('[data-period]');

        this.currentPeriod = 'hour';

        // Base key
        this.baseKey = 'trafiq_historical_data';

        // Initial load
        this.data = this.loadFromStorage() || {
            hour: this.initHourlyData(),
            day: this.initDailyData()
        };

        this.init();
    }

    get storageKey() {
        try {
            const session = localStorage.getItem('trafiq_session');
            if (session) {
                const user = JSON.parse(session).email;
                if (user) return `${this.baseKey}_${user}`;
            }
        } catch (e) {
            // ignore
        }
        return this.baseKey;
    }

    init() {
        // Period toggle buttons
        this.periodButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.periodButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentPeriod = btn.dataset.period;
                this.render();
            });
        });

        this.render();
    }

    /**
     * Initialize hourly data structure (last 24 hours)
     */
    initHourlyData() {
        const hours = [];
        const now = new Date();

        for (let i = 23; i >= 0; i--) {
            const hour = (now.getHours() - i + 24) % 24;
            hours.push({
                label: `${hour.toString().padStart(2, '0')}:00`,
                value: 0,
                congestionSum: 0,
                samples: 0
            });
        }

        return hours;
    }

    /**
     * Initialize daily data structure (last 7 days)
     */
    initDailyData() {
        const days = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const now = new Date();

        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            days.push({
                label: dayNames[date.getDay()],
                value: 0,
                congestionSum: 0,
                samples: 0
            });
        }

        return days;
    }

    /**
     * Record a data point from AI analysis
     */
    recordDataPoint(data) {
        if (!data || !Array.isArray(data.lanes)) return;

        // Calculate average congestion level
        const congestionMap = { low: 1, medium: 2, high: 3 };
        let totalCongestion = 0;
        let laneCount = 0;

        data.lanes.forEach(lane => {
            if (lane.congestion) {
                totalCongestion += congestionMap[lane.congestion] || 1;
                laneCount++;
            }
        });

        const avgCongestion = laneCount > 0 ? totalCongestion / laneCount : 0;
        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay();

        // Update hourly data
        const hourIndex = this.data.hour.findIndex(h =>
            h.label === `${currentHour.toString().padStart(2, '0')}:00`
        );
        if (hourIndex !== -1) {
            this.data.hour[hourIndex].congestionSum += avgCongestion;
            this.data.hour[hourIndex].samples++;
            this.data.hour[hourIndex].value = Math.round(
                (this.data.hour[hourIndex].congestionSum / this.data.hour[hourIndex].samples) * 33
            );
        }

        // Update daily data
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayIndex = this.data.day.findIndex(d => d.label === dayNames[currentDay]);
        if (dayIndex !== -1) {
            this.data.day[dayIndex].congestionSum += avgCongestion;
            this.data.day[dayIndex].samples++;
            this.data.day[dayIndex].value = Math.round(
                (this.data.day[dayIndex].congestionSum / this.data.day[dayIndex].samples) * 33
            );
        }

        this.saveToStorage();
        this.render();
    }

    /**
     * Render the chart based on current period
     */
    render() {
        const data = this.data[this.currentPeriod];
        if (!this.barsContainer || !this.labelsContainer) return;

        // Find max value for scaling
        const maxValue = Math.max(...data.map(d => d.value), 100);

        // Render bars
        this.barsContainer.innerHTML = data.map(item => {
            const height = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
            return `<div class="trends-bar" style="height: ${Math.max(height, 2)}%;" data-value="${item.value}%"></div>`;
        }).join('');

        // Render labels
        this.labelsContainer.innerHTML = data.map(item =>
            `<div class="trends-label">${item.label}</div>`
        ).join('');
    }

    /**
     * Save data to localStorage
     */
    saveToStorage() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        } catch (e) {
            console.warn('Could not save historical data:', e);
        }
    }

    /**
     * Load data from localStorage
     */
    loadFromStorage() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Validate and merge with current structure
                if (parsed.hour && parsed.day) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('Could not load historical data:', e);
        }
        return null;
    }

    /**
     * Reset all historical data
     */
    reset() {
        this.data = {
            hour: this.initHourlyData(),
            day: this.initDailyData()
        };
        this.saveToStorage();
        this.render();
    }

    /**
     * Export data as JSON
     */
    exportData() {
        return JSON.stringify(this.data, null, 2);
    }
}

export default HistoricalChart;
