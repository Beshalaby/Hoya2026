/**
 * AI Insights Page JavaScript
 * Generates infrastructure recommendations based on actual analytics data only
 */
import { dataStore } from './services/DataStore.js';
import { OFFICIAL_CAMERAS } from './config/cameras.js';
import { UIUtils } from './utils/UIUtils.js';
import './style.css';

class InsightsPage {
    constructor() {
        this.selectedCameraId = '';
        this.suggestions = [];
        this.init();
    }

    init() {
        this.populateCameraFilter();
        UIUtils.setupCustomDropdowns();
        this.loadInsights();
        this.setupEventListeners();
        console.log('💡 AI Insights page initialized');
    }

    populateCameraFilter() {
        const filter = document.getElementById('insightsCameraFilter');
        if (!filter) return;

        const storedCameras = Object.keys(dataStore.data.analytics.intersectionStats || {});
        
        filter.innerHTML = '<option value="">All Roads</option>';

        storedCameras.forEach(camId => {
            const officialCam = OFFICIAL_CAMERAS.find(c => c.id === camId || c.name === camId);
            const name = officialCam?.name || camId;

            const option = document.createElement('option');
            option.value = camId;
            option.textContent = name;
            filter.appendChild(option);
        });

        UIUtils.updateCustomDropdownOptions(filter.closest('.custom-select-wrapper'));
    }

    loadInsights() {
        this.generateSuggestions();
        this.updateStats();
        this.updateHighPriorityList();
        this.updateAllSuggestionsList();
        this.updateImpact();
        this.updateLocationList();
    }

    /**
     * Generate suggestions based ONLY on actual analytics data
     * No hallucinations - if no data exists, no suggestions are made
     */
    generateSuggestions() {
        const analytics = dataStore.data.analytics;
        const intersectionStats = analytics.intersectionStats || {};
        const suggestions = [];

        Object.entries(intersectionStats).forEach(([location, stats]) => {
            // Filter by selected camera
            if (this.selectedCameraId && location !== this.selectedCameraId) {
                const cameraName = OFFICIAL_CAMERAS.find(c => c.id === this.selectedCameraId)?.name;
                if (location !== cameraName) return;
            }

            const vehicles = stats.vehicles || 0;
            const avgWait = stats.avgWait || 0;
            const incidents = stats.incidents || 0;

            // Skip if no meaningful data
            if (vehicles < 10 && avgWait === 0 && incidents === 0) return;

            // High traffic + high wait → Signal optimization
            if (vehicles >= 100 && avgWait >= 25) {
                suggestions.push({
                    id: `signal-${location}`,
                    type: 'traffic-signal',
                    priority: avgWait >= 45 ? 'high' : 'medium',
                    title: `Optimize Signal Timing`,
                    description: `${avgWait}s average wait with ${vehicles.toLocaleString()} vehicles. Adaptive signals recommended.`,
                    location,
                    impact: Math.min(30, Math.round(avgWait * 0.4))
                });
            }

            // Very high volume → Capacity review
            if (vehicles >= 300) {
                suggestions.push({
                    id: `road-${location}`,
                    type: 'road-improvement',
                    priority: vehicles >= 800 ? 'high' : 'medium',
                    title: `Evaluate Capacity`,
                    description: `${vehicles.toLocaleString()} vehicles recorded. Consider turn lane or expansion.`,
                    location,
                    impact: Math.min(25, Math.round(vehicles / 50))
                });
            }

            // Incidents → Safety review
            if (incidents >= 2) {
                suggestions.push({
                    id: `safety-${location}`,
                    type: 'new-infrastructure',
                    priority: incidents >= 4 ? 'high' : 'medium',
                    title: `Safety Review`,
                    description: `${incidents} incidents recorded. Review signage and markings.`,
                    location,
                    impact: Math.min(20, incidents * 4)
                });
            }

            // Moderate congestion → Fine-tuning
            if (vehicles >= 50 && avgWait >= 15 && avgWait < 25) {
                suggestions.push({
                    id: `timing-${location}`,
                    type: 'timing-optimization',
                    priority: 'low',
                    title: `Fine-tune Cycle`,
                    description: `${avgWait}s wait time could be reduced with cycle optimization.`,
                    location,
                    impact: Math.round(avgWait * 0.2)
                });
            }
        });

        // Sort by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        this.suggestions = suggestions;
    }

    updateStats() {
        const total = this.suggestions.length;
        const highPriority = this.suggestions.filter(s => s.priority === 'high').length;
        const signals = this.suggestions.filter(s => 
            s.type === 'traffic-signal' || s.type === 'timing-optimization'
        ).length;
        const infra = this.suggestions.filter(s => 
            s.type === 'road-improvement' || s.type === 'new-infrastructure'
        ).length;

        document.getElementById('totalSuggestions').textContent = total;
        document.getElementById('highPriorityCount').textContent = highPriority;
        document.getElementById('signalCount').textContent = signals;
        document.getElementById('infraCount').textContent = infra;
    }

    updateHighPriorityList() {
        const container = document.getElementById('highPriorityList');
        if (!container) return;

        const highPriority = this.suggestions.filter(s => s.priority === 'high');

        if (highPriority.length === 0) {
            container.innerHTML = `
                <div class="insights-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span>No high priority issues</span>
                </div>
            `;
            return;
        }

        container.innerHTML = highPriority.map(s => this.renderItem(s)).join('');
    }

    updateAllSuggestionsList() {
        const container = document.getElementById('allSuggestionsList');
        if (!container) return;

        if (this.suggestions.length === 0) {
            container.innerHTML = `
                <div class="insights-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <span>Run traffic analysis to generate recommendations</span>
                </div>
            `;
            return;
        }

        container.innerHTML = this.suggestions.map(s => this.renderItem(s)).join('');
    }

    renderItem(s) {
        const icons = {
            'traffic-signal': '🚦',
            'road-improvement': '🛣️',
            'new-infrastructure': '🏗️',
            'timing-optimization': '⏱️'
        };
        const iconClass = {
            'traffic-signal': 'signal',
            'road-improvement': 'road',
            'new-infrastructure': 'infra',
            'timing-optimization': 'timing'
        };

        return `
            <div class="insight-item">
                <div class="insight-item__icon insight-item__icon--${iconClass[s.type]}">${icons[s.type]}</div>
                <div class="insight-item__content">
                    <div class="insight-item__header">
                        <span class="insight-item__title">${s.title}</span>
                        <span class="insight-item__priority insight-item__priority--${s.priority}">${s.priority}</span>
                    </div>
                    <p class="insight-item__description">${s.description}</p>
                    <div class="insight-item__meta">
                        <span class="insight-item__location">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                            ${s.location}
                        </span>
                        <span class="insight-item__impact">+${s.impact}% improvement</span>
                    </div>
                </div>
            </div>
        `;
    }

    updateImpact() {
        const waitEl = document.getElementById('waitReduction');
        const throughputEl = document.getElementById('throughputIncrease');
        const co2El = document.getElementById('co2Reduction');

        if (this.suggestions.length === 0) {
            waitEl.textContent = '--';
            throughputEl.textContent = '--';
            co2El.textContent = '--';
            return;
        }

        const signalSuggestions = this.suggestions.filter(s => 
            s.type === 'traffic-signal' || s.type === 'timing-optimization'
        );
        const infraSuggestions = this.suggestions.filter(s => 
            s.type === 'road-improvement' || s.type === 'new-infrastructure'
        );

        const wait = signalSuggestions.length > 0
            ? Math.round(signalSuggestions.reduce((sum, s) => sum + s.impact, 0) / signalSuggestions.length)
            : 0;

        const throughput = infraSuggestions.length > 0
            ? Math.round(infraSuggestions.reduce((sum, s) => sum + s.impact, 0) / infraSuggestions.length)
            : 0;

        const co2 = Math.round((wait + throughput) * 0.5);

        waitEl.textContent = wait > 0 ? `-${wait}%` : '--';
        throughputEl.textContent = throughput > 0 ? `+${throughput}%` : '--';
        co2El.textContent = co2 > 0 ? `-${co2} kg` : '--';
    }

    updateLocationList() {
        const container = document.getElementById('locationList');
        if (!container) return;

        const counts = {};
        this.suggestions.forEach(s => {
            counts[s.location] = (counts[s.location] || 0) + 1;
        });

        const locations = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        if (locations.length === 0) {
            container.innerHTML = `
                <div class="insights-empty insights-empty--sm">
                    <span>No location data</span>
                </div>
            `;
            return;
        }

        container.innerHTML = locations.map(([name, count]) => `
            <div class="location-row">
                <span class="location-row__name">${name}</span>
                <span class="location-row__count">${count}</span>
            </div>
        `).join('');
    }

    setupEventListeners() {
        document.getElementById('insightsCameraFilter')?.addEventListener('change', (e) => {
            this.selectedCameraId = e.target.value;
            this.loadInsights();
        });

        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportReport());

        // Auto-refresh
        setInterval(() => this.loadInsights(), 30000);

        // Sync across tabs
        window.addEventListener('storage', (e) => {
            if (e.key === 'traffiq_data') {
                dataStore.data = dataStore.load();
                this.populateCameraFilter();
                this.loadInsights();
            }
        });
    }

    exportReport() {
        if (this.suggestions.length === 0) {
            this.showToast('No recommendations to export');
            return;
        }

        const report = `TRAFFIQ AI INSIGHTS REPORT
Generated: ${new Date().toLocaleString()}

RECOMMENDATIONS
${this.suggestions.map((s, i) => `${i + 1}. [${s.priority.toUpperCase()}] ${s.title} - ${s.location}
   ${s.description}
   Impact: +${s.impact}%
`).join('\n')}`;

        const blob = new Blob([report], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `traffiq-insights-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        this.showToast('Report exported');
    }

    showToast(msg) {
        document.querySelector('.toast')?.remove();
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        toast.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#3b82f6;color:white;padding:12px 24px;border-radius:8px;font-size:14px;z-index:1000;`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2000);
    }
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new InsightsPage());
} else {
    new InsightsPage();
}

export default InsightsPage;
