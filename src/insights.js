/**
 * AI Insights Page JavaScript
 * Generates infrastructure recommendations based on actual analytics data only
 */
import { geminiService } from './services/GeminiService.js';
import { dataStore } from './services/DataStore.js';
import { OFFICIAL_CAMERAS } from './config/cameras.js';
import { UIUtils } from './utils/UIUtils.js';



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
                    <button id="seedDataBtn" class="btn btn--outline btn--sm" style="margin-top: 1rem;">
                        Populate Demo Data
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.suggestions.map(s => this.renderItem(s)).join('');
    }

    renderItem(s) {
        const icons = {
            'traffic-signal': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M12 2l4 4s0 0 0 0M12 2l-4 4s0 0 0 0M12 22l4-4s0 0 0 0M12 22l-4-4s0 0 0 0"/></svg>', // signal/switch direction? Using zap for now or traffic light shape
            'road-improvement': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16M4 2h16M9 2v20M15 2v20"/></svg>', // Road
            'new-infrastructure': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0l-8 5-8-5h16zm0 12l-8-5-8 5V6l8 5 8-5v12z"/></svg>', // Construction/cone substitute -> using generic box/structure or traffic cone
            'timing-optimization': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' // Timer
        };
        // Refined icons
        icons['traffic-signal'] = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'; // Zap for optimization
        icons['new-infrastructure'] = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 22h20M7 21.9V11h10v10.9M5.6 11h12.8M12 4l-4 7h8l-4-7z"/></svg>'; // Cone-ish / structure
        const iconClass = {
            'traffic-signal': 'signal',
            'road-improvement': 'road',
            'new-infrastructure': 'infra',
            'timing-optimization': 'timing'
        };

        return `
            <div class="insight-item">
                <div class="insight-item__icon insight-item__icon--${iconClass[s.type]}">
                    ${icons[s.type]}
                </div>
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

        document.getElementById('generateAiReportBtn')?.addEventListener('click', () => this.generateAiReport());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportReport());

        // Seed Data Button (Header)
        document.getElementById('seedDataBtnHeader')?.addEventListener('click', () => {
            if (confirm('This will clear current data and generate demo scenarios. Continue?')) {
                try {
                    dataStore.generateComplexDemoData();
                    alert('Demo data generated! Reloading...');
                    window.location.reload();
                } catch (err) {
                    console.error(err);
                    alert('Error generating data: ' + err.message);
                }
            }
        });

        // Auto-refresh
        setInterval(() => this.loadInsights(), 30000);

        // Sync across tabs
        window.addEventListener('storage', (e) => {
            if (e.key === 'trafiq_data') {
                dataStore.data = dataStore.load();
                this.populateCameraFilter();
                this.loadInsights();
            }
        });
    }

    async generateAiReport() {
        const btn = document.getElementById('generateAiReportBtn');
        const originalText = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = `<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 16v-4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4m16 0h-4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Generating...`;

            // Get data
            const summary = dataStore.getAnalyticsSummary(this.selectedCameraId);

            // Call AI
            const report = await geminiService.generateTrafficReport(summary);

            // Show result
            this.showReportModal(report);

        } catch (error) {
            console.error(error);
            this.showToast(error.message || 'Failed to generate report');
            if (error.message.includes('API Key')) {
                setTimeout(() => window.location.href = '/settings.html', 2000);
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    showReportModal(reportText) {
        // Simple Markdown parsing (headers and lists)
        const htmlContent = reportText
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^\- (.*$)/gim, '<li>$1</li>')
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
            .replace(/\n/gim, '<br>');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>Traffic Engineering Report</h2>
                    <button class="btn-close">&times;</button>
                </div>
                <div class="modal-body" style="line-height: 1.6;">
                    ${htmlContent}
                </div>
                <div class="modal-footer">
                    <button class="btn btn--primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    <button class="btn btn--outline" onclick="navigator.clipboard.writeText('${reportText.replace(/'/g, "\\'").replace(/\n/g, "\\n")}'); alert('Copied!')">Copy Text</button>
                </div>
            </div>
            <style>
                .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; align-items: center; justify-content: center; }
                .modal-content { background: var(--color-bg-card); padding: 2rem; border-radius: 12px; border: 1px solid var(--color-border); width: 100%; margin: 2rem; display: flex; flex-direction: column; gap: 1rem; }
                .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 1rem; }
                .btn-close { background: none; border: none; font-size: 1.5rem; color: var(--color-text-muted); cursor: pointer; }
                .spin { animation: spin 1s linear infinite; margin-right: 6px; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            </style>
        `;

        document.body.appendChild(modal);
        modal.querySelector('.btn-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    exportReport() {
        if (this.suggestions.length === 0) {
            this.showToast('No recommendations to export');
            return;
        }

        const report = `TRAFIQ AI INSIGHTS REPORT
Generated: ${new Date().toLocaleString()}

RECOMMENDATIONS
${this.suggestions.map((s, i) => `${i + 1}. [${s.priority.toUpperCase()}] ${s.title} - ${s.location}
   ${s.description}
   Impact: +${s.impact}%
`).join('\n')}`;

        const blob = new Blob([report], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `trafiq-insights-${new Date().toISOString().split('T')[0]}.txt`;
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
