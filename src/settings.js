/**
 * Settings Page JavaScript
 * Handles settings UI and persistence
 */
import { dataStore } from './services/DataStore.js';
import { UIUtils } from './utils/UIUtils.js';
import './style.css';

class SettingsPage {
    constructor() {
        this.init();
    }

    init() {
        this.loadSettings();
        UIUtils.setupCustomDropdowns();
        this.setupEventListeners();
        console.log('⚙️ Settings page initialized');
    }

    loadSettings() {
        const settings = dataStore.getAllSettings();

        // Toggles
        this.setToggle('audioAlerts', settings.audioAlerts);
        this.setToggle('incidentNotifications', settings.incidentNotifications);
        this.setToggle('congestionWarnings', settings.congestionWarnings);
        this.setToggle('heatmapEnabled', settings.heatmapEnabled);
        this.setToggle('liveVehicleCounts', settings.liveVehicleCounts);
        this.setToggle('saveHistoricalData', settings.saveHistoricalData);

        // Selects
        this.setSelect('mapStyle', settings.mapStyle);
        this.setSelect('defaultCamera', settings.defaultCamera);
        this.setSelect('frameRate', settings.frameRate);
        this.setSelect('dataRetention', settings.dataRetentionDays);

        // Sync custom dropdowns
        document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
            UIUtils.updateCustomDropdownOptions(wrapper);
        });
    }

    setToggle(name, value) {
        const toggles = document.querySelectorAll('.toggle input');
        toggles.forEach(toggle => {
            const label = toggle.closest('.setting-row')?.querySelector('.setting-row__label')?.textContent;
            if (label) {
                const labelMap = {
                    'Audio Alerts': 'audioAlerts',
                    'Incident Notifications': 'incidentNotifications',
                    'Congestion Warnings': 'congestionWarnings',
                    'Heatmap Overlay': 'heatmapEnabled',
                    'Live Vehicle Counts': 'liveVehicleCounts',
                    'Save Historical Data': 'saveHistoricalData'
                };
                if (labelMap[label] === name) {
                    toggle.checked = value;
                }
            }
        });
    }

    setSelect(name, value) {
        const selects = document.querySelectorAll('select.input');
        selects.forEach(select => {
            const label = select.closest('.form-group')?.querySelector('.form-label')?.textContent;
            if (label) {
                const labelMap = {
                    'Map Style': 'mapStyle',
                    'Default Camera': 'defaultCamera',
                    'Analysis Frame Rate': 'frameRate',
                    'Data Retention': 'dataRetention'
                };
                if (labelMap[label] === name) {
                    select.value = value;
                }
            }
        });
    }

    setupEventListeners() {
        // Toggle changes
        document.querySelectorAll('.toggle input').forEach(toggle => {
            toggle.addEventListener('change', (e) => this.handleToggleChange(e));
        });

        // Select changes
        document.querySelectorAll('select.input').forEach(select => {
            select.addEventListener('change', (e) => this.handleSelectChange(e));
        });



        // Export data
        const exportBtn = document.querySelector('[onclick*="export"], .btn--outline:has(svg)');
        document.querySelectorAll('.action-buttons .btn').forEach(btn => {
            if (btn.textContent.includes('Export')) {
                btn.addEventListener('click', () => this.exportData());
            }
            if (btn.textContent.includes('Clear')) {
                btn.addEventListener('click', () => this.clearData());
            }
        });

        // Export buttons in action section
        document.querySelectorAll('.export-section__actions .btn, .action-buttons .btn').forEach(btn => {
            const text = btn.textContent.toLowerCase();
            if (text.includes('export') && text.includes('csv')) {
                btn.addEventListener('click', () => this.exportCSV());
            } else if (text.includes('export') && text.includes('pdf')) {
                btn.addEventListener('click', () => this.exportPDF());
            } else if (text.includes('export') && text.includes('data')) {
                btn.addEventListener('click', () => this.exportData());
            } else if (text.includes('clear')) {
                btn.addEventListener('click', () => this.clearData());
            }
        });
    }

    handleToggleChange(e) {
        const label = e.target.closest('.setting-row')?.querySelector('.setting-row__label')?.textContent;
        const labelMap = {
            'Audio Alerts': 'audioAlerts',
            'Incident Notifications': 'incidentNotifications',
            'Congestion Warnings': 'congestionWarnings',
            'Heatmap Overlay': 'heatmapEnabled',
            'Live Vehicle Counts': 'liveVehicleCounts',
            'Save Historical Data': 'saveHistoricalData'
        };

        const settingKey = labelMap[label];
        if (settingKey) {
            dataStore.setSetting(settingKey, e.target.checked);
            this.showToast(`${label} ${e.target.checked ? 'enabled' : 'disabled'}`);
        }
    }

    handleSelectChange(e) {
        const label = e.target.closest('.form-group')?.querySelector('.form-label')?.textContent;
        const labelMap = {
            'Map Style': 'mapStyle',
            'Default Camera': 'defaultCamera',
            'Analysis Frame Rate': 'frameRate',
            'Data Retention': 'dataRetentionDays'
        };

        const settingKey = labelMap[label];
        if (settingKey) {
            let value = e.target.value;
            if (settingKey === 'frameRate' || settingKey === 'dataRetentionDays') {
                value = parseInt(value);
            }
            dataStore.setSetting(settingKey, value);
            this.showToast(`${label} updated`);
        }
    }



    exportData() {
        const data = dataStore.exportData();
        this.downloadFile(data, 'trafiq-data.json', 'application/json');
        this.showToast('Data exported successfully');
    }

    exportCSV() {
        const analytics = dataStore.data.analytics;
        let csv = 'Date,Vehicles,Incidents,Sessions\n';

        Object.entries(analytics.dailyTotals).forEach(([date, data]) => {
            csv += `${date},${data.vehicles},${data.incidents},${data.sessions}\n`;
        });

        if (Object.keys(analytics.dailyTotals).length === 0) {
            csv += `${new Date().toISOString().split('T')[0]},0,0,0\n`;
        }

        this.downloadFile(csv, 'trafiq-analytics.csv', 'text/csv');
        this.showToast('CSV exported successfully');
    }

    exportPDF() {
        // For now, create a printable report
        const summary = dataStore.getAnalyticsSummary();
        const report = `
TrafiQ Traffic Analysis Report
Generated: ${new Date().toLocaleString()}

SUMMARY
-------
Total Vehicles Today: ${summary.totalVehiclesToday}
Average Wait Time: ${summary.avgWaitTime}s
Incidents Today: ${summary.incidentsToday}
Flow Efficiency: ${summary.flowEfficiency}%
Total Sessions: ${summary.totalSessions}

PEAK HOURS
----------
${dataStore.getPeakHours().map((h, i) => `${i + 1}. ${h.hour}:00 - ${h.avgVehicles} vehicles`).join('\n')}

BUSIEST INTERSECTIONS
---------------------
${dataStore.getBusiestIntersections().map((int, i) => `${i + 1}. ${int.name} - ${int.vehicles} vehicles (${int.congestion})`).join('\n')}
        `;

        this.downloadFile(report, 'trafiq-report.txt', 'text/plain');
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

    clearData() {
        if (confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
            dataStore.clearAnalytics();
            this.showToast('All data cleared');
        }
    }

    showToast(message) {
        // Create toast notification
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
            background: #10b981;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 1000;
            animation: fadeInUp 0.3s ease;
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
    document.addEventListener('DOMContentLoaded', () => new SettingsPage());
} else {
    new SettingsPage();
}

export default SettingsPage;
