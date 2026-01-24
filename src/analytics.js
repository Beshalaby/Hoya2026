/**
 * Analytics Page JavaScript
 * Handles analytics display and data visualization
 */
import { dataStore } from './services/DataStore.js';
import { OFFICIAL_CAMERAS } from './config/cameras.js'; // Import official cameras for names
import './style.css';

class AnalyticsPage {
    constructor() {
        this.selectedCameraId = '';
        this.init();
    }

    init() {
        // Auto-generate realistic demo data if sparse (using official cameras only)
        // Relaxed threshold: if < 50 vehicles, overwrite with demo data for better UX
        if (dataStore.data.analytics.totalVehicles < 50) {
            console.log('⚠️ Sparse analytics data found (<50), auto-generating sample data...');
            dataStore.generateComplexDemoData(OFFICIAL_CAMERAS);
        }

        this.populateCameraFilter();
        this.loadAnalytics();
        this.setupEventListeners();
        console.log('📊 Analytics page initialized');
    }

    populateCameraFilter() {
        const filter = document.getElementById('analyticsCameraFilter');
        if (!filter) return;

        // Get unique camera names from data store keys
        const storedCameras = Object.keys(dataStore.data.analytics.cameraHourlyData || {});

        // Merge with official list to get nice names
        const allCameras = new Set([...storedCameras, ...OFFICIAL_CAMERAS.map(c => c.id)]);

        // Clear (keep "All")
        filter.innerHTML = '<option value="">All Cameras</option>';

        allCameras.forEach(camId => {
            const officialName = OFFICIAL_CAMERAS.find(c => c.id === camId)?.name;
            const name = officialName || camId; // Fallback to ID if custom/unknown

            const option = document.createElement('option');
            option.value = camId;
            option.textContent = name;
            filter.appendChild(option);
        });
    }

    loadAnalytics() {
        this.updateRoadSpecificCardsVisibility();
        this.updateSummaryCards();
        this.updatePeakHours();
        this.updateBusiestIntersections();
        this.updateChart();
        this.updateIncidentLog();
        this.updateSuggestionsLog();
    }

    updateRoadSpecificCardsVisibility() {
        // Show/hide cards that should only appear when viewing a specific road
        const avgSpeedCard = document.getElementById('avgSpeedCard');
        const emergencyCard = document.getElementById('emergencyCard');
        
        const isSpecificRoad = this.selectedCameraId !== '';
        
        if (avgSpeedCard) {
            avgSpeedCard.style.display = isSpecificRoad ? 'flex' : 'none';
        }
        if (emergencyCard) {
            emergencyCard.style.display = isSpecificRoad ? 'flex' : 'none';
        }
    }

    updateSummaryCards() {
        // Pass selected camera to filter metrics
        const summary = dataStore.getAnalyticsSummary(this.selectedCameraId || null);

        // Update summary card values by ID
        const totalVehicles = document.getElementById('totalVehicles');
        const avgWaitTime = document.getElementById('avgWaitTime');
        const avgSpeed = document.getElementById('avgSpeed');
        const flowEfficiency = document.getElementById('flowEfficiency');
        const incidentsToday = document.getElementById('incidentsToday');
        const timeSaved = document.getElementById('timeSaved');
        const co2Saved = document.getElementById('co2Saved');
        const emergencyEvents = document.getElementById('emergencyEvents');

        if (totalVehicles) totalVehicles.textContent = summary.totalVehiclesToday.toLocaleString();
        if (avgWaitTime) avgWaitTime.textContent = `${summary.avgWaitTime}s`;
        if (avgSpeed) avgSpeed.textContent = summary.avgSpeedKmh || '—';
        if (flowEfficiency) flowEfficiency.textContent = `${summary.flowEfficiency}%`;
        if (incidentsToday) incidentsToday.textContent = summary.incidentsToday;
        if (timeSaved) timeSaved.textContent = summary.timeSavedMinutes || 0;
        if (co2Saved) co2Saved.textContent = summary.co2SavedKg || 0;
        if (emergencyEvents) emergencyEvents.textContent = summary.emergencyEvents || 0;
    }

    updatePeakHours() {
        const peakHours = dataStore.getPeakHours();
        const container = document.querySelector('.peak-hours-list');
        if (!container) return;

        const maxVehicles = Math.max(...peakHours.map(h => h.avgVehicles));

        container.innerHTML = peakHours.map(hour => {
            const timeStr = this.formatHour(hour.hour);
            const barWidth = maxVehicles > 0 ? (hour.avgVehicles / maxVehicles * 100) : 0;

            return `
                <div class="peak-hour-item">
                    <span class="peak-hour-item__time">${timeStr}</span>
                    <div class="peak-hour-item__bar" style="width: ${barWidth}%"></div>
                    <span class="peak-hour-item__value">${hour.avgVehicles.toLocaleString()}</span>
                </div>
            `;
        }).join('');
    }

    formatHour(hour) {
        const h = hour % 12 || 12;
        const ampm = hour < 12 ? 'AM' : 'PM';
        return `${h}:00 ${ampm}`;
    }

    updateBusiestIntersections() {
        const intersections = dataStore.getBusiestIntersections();
        const container = document.querySelector('.intersections-list');
        if (!container) return;

        container.innerHTML = intersections.map((int, index) => `
            <div class="intersection-item">
                <span class="intersection-item__rank">${index + 1}</span>
                <div class="intersection-item__info">
                    <span class="intersection-item__name">${int.name}</span>
                    <span class="intersection-item__stats">${int.vehicles.toLocaleString()} vehicles</span>
                </div>
                <span class="intersection-item__status intersection-item__status--${int.congestion}">${this.capitalizeFirst(int.congestion)}</span>
            </div>
        `).join('');
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    updateIncidentLog() {
        const incidents = dataStore.getIncidents(20);
        const container = document.getElementById('incidentLogList');
        if (!container) return;

        // Filter by camera if selected
        let filtered = incidents;
        if (this.selectedCameraId) {
            // Look for ID match in intersection name or ID field? 
            // Note: Incident log currently saves 'intersection' name, not ID. 
            // This is a limitation, but we can fuzzy match or skip for now.
            // Best effort:
            const cameraName = OFFICIAL_CAMERAS.find(c => c.id === this.selectedCameraId)?.name;
            if (cameraName) {
                filtered = incidents.filter(i => i.intersection === cameraName || i.intersection === this.selectedCameraId);
            }
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state">No recent incidents</div>';
            return;
        }

        container.innerHTML = filtered.map(item => `
            <div class="log-item">
                <div class="alert-item__icon alert-item__icon--warning">⚠️</div>
                <div class="log-item__content">
                    <span class="log-item__text">${item.description}</span>
                    <div class="log-item__meta">
                        <span>${item.intersection || 'Unknown Location'}</span> • 
                        <span>${new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateSuggestionsLog() {
        const suggestions = dataStore.getRecommendations(20);
        const container = document.getElementById('aiInsightsList');
        if (!container) return;

        // Filter
        let filtered = suggestions;
        if (this.selectedCameraId) {
            const cameraName = OFFICIAL_CAMERAS.find(c => c.id === this.selectedCameraId)?.name;
            if (cameraName) {
                filtered = suggestions.filter(i => i.intersection === cameraName || i.intersection === this.selectedCameraId);
            }
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state">No active suggestions</div>';
            return;
        }

        container.innerHTML = filtered.map(item => `
            <div class="log-item">
                 <div class="recommendation-item__badge">AI</div>
                <div class="log-item__content">
                    <span class="log-item__text">${item.text}</span>
                    <div class="log-item__meta">
                        <span>${item.intersection || 'System'}</span> • 
                        <span>${new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateChart() {
        const chartContainer = document.querySelector('.chart-container');
        if (!chartContainer) return;

        // Use filtered or global data
        const hourlyData = dataStore.getHourlyData(this.selectedCameraId);
        const hasData = Object.keys(hourlyData).length > 0;

        if (!hasData) {
            chartContainer.innerHTML = `
                <div class="chart-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <line x1="18" y1="20" x2="18" y2="10"/>
                        <line x1="12" y1="20" x2="12" y2="4"/>
                        <line x1="6" y1="20" x2="6" y2="14"/>
                    </svg>
                    <p>No data for this period</p>
                    <span class="chart-placeholder__note">Run analysis to generate stats</span>
                </div>
            `;
            return;
        }

        // Create simple bar chart
        const hours = Array.from({ length: 24 }, (_, i) => i);
        const maxVehicles = Math.max(1, ...Object.values(hourlyData).map(d => d.count > 0 ? d.vehicles / d.count : 0));

        chartContainer.innerHTML = `
            <div class="simple-chart">
                <div class="chart-bars">
                    ${hours.map(hour => {
            const data = hourlyData[hour];
            // If data is just a number (simple sum) vs object (avg) - dataStore changed
            // Global: {vehicles, count}. Camera: {vehicles, count}
            const avgVehicles = data && data.count > 0 ? Math.round(data.vehicles / data.count) : 0;

            const height = maxVehicles > 0 ? (avgVehicles / maxVehicles * 100) : 0;

            // Adjust current hour
            const isNow = new Date().getHours() === hour;
            return `
                            <div class="chart-bar ${isNow ? 'chart-bar--current' : ''}" 
                                 style="height: ${Math.max(2, height)}%"
                                 title="${this.formatHour(hour)}: ${avgVehicles} vehicles">
                            </div>
                        `;
        }).join('')}
                </div>
                <div class="chart-labels">
                    <span>12AM</span>
                    <span>6AM</span>
                    <span>12PM</span>
                    <span>6PM</span>
                    <span>12AM</span>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Camera Filter
        const filter = document.getElementById('analyticsCameraFilter');
        filter?.addEventListener('change', (e) => {
            this.selectedCameraId = e.target.value;
            this.loadAnalytics();
        });

        // Time period buttons
        document.querySelectorAll('.card--chart .chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                document.querySelectorAll('.card--chart .chip').forEach(c => c.classList.remove('chip--active'));
                e.target.classList.add('chip--active');
                this.showToast(`Showing ${e.target.textContent.toLowerCase()} data`);
            });
        });

        // Export buttons
        document.querySelectorAll('.export-section__actions .btn').forEach(btn => {
            const text = btn.textContent.toLowerCase();
            if (text.includes('csv')) {
                btn.addEventListener('click', () => this.exportCSV());
            } else if (text.includes('pdf')) {
                btn.addEventListener('click', () => this.exportPDF());
            }
        });

        // Refresh data more frequently (every 5 seconds)
        setInterval(() => this.loadAnalytics(), 5000);

        // Listen for storage events from other tabs (dashboard)
        window.addEventListener('storage', (e) => {
            if (e.key === 'traffiq_data') {
                // Reload data from localStorage
                dataStore.data = dataStore.load();
                this.populateCameraFilter(); // Reload filter in case new camera appeared
                this.loadAnalytics();
                console.log('📊 Analytics updated from dashboard data');
            }
        });
    }

    exportCSV() {
        const analytics = dataStore.data.analytics;
        let csv = 'Date,Vehicles,Incidents,Sessions\n';

        Object.entries(analytics.dailyTotals).forEach(([date, data]) => {
            csv += `${date},${data.vehicles},${data.incidents},${data.sessions}\n`;
        });

        this.downloadFile(csv, 'traffiq-analytics.csv', 'text/csv');
        this.showToast('CSV exported successfully');
    }

    exportPDF() {
        const summary = dataStore.getAnalyticsSummary();
        const report = `
TraffiQ Traffic Analysis Report
Generated: ${new Date().toLocaleString()}

SUMMARY
-------
Total Vehicles Today: ${summary.totalVehiclesToday}
Average Wait Time: ${summary.avgWaitTime}s
Incidents Today: ${summary.incidentsToday}
Flow Efficiency: ${summary.flowEfficiency}%

PEAK HOURS
----------
${dataStore.getPeakHours().map((h, i) => `${i + 1}. ${this.formatHour(h.hour)} - ${h.avgVehicles} vehicles`).join('\n')}

BUSIEST INTERSECTIONS
---------------------
${dataStore.getBusiestIntersections().map((int, i) => `${i + 1}. ${int.name} - ${int.vehicles} vehicles`).join('\n')}
        `;

        this.downloadFile(report, 'traffiq-report.txt', 'text/plain');
        this.showToast('Report exported successfully');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showToast(message) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #3b82f6;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 1000;
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new AnalyticsPage());
} else {
    new AnalyticsPage();
}

export default AnalyticsPage;
