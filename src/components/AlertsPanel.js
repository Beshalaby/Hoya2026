/**
 * AlertsPanel Component
 * Displays safety alerts and warnings
 */
export class AlertsPanel {
    constructor() {
        this.container = document.getElementById('alertsList');
        this.countBadge = document.getElementById('alertCount');
        this.alerts = [];
        this.maxAlerts = 20; // Keep last 20 alerts
        this.lastUpdateTime = 0;
        this.updateThrottleMs = 2000; // Only accept new alerts every 2 seconds
    }

    /**
     * Update alerts from AI data (throttled)
     */
    update(alertsData) {
        if (!Array.isArray(alertsData) || alertsData.length === 0) return;
        
        // Throttle updates to limit alert rate
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateThrottleMs) {
            return; // Skip this batch
        }
        this.lastUpdateTime = now;

        const timestamp = new Date().toLocaleTimeString();
        
        // Filter out duplicates first
        const newAlerts = alertsData.filter(alert => {
            const isDuplicate = this.alerts.slice(0, 5).some(
                existing => existing.text.toLowerCase() === alert.toLowerCase()
            );
            return !isDuplicate;
        });
        
        // Limit to max 2 new alerts per update to prevent overwhelming
        const limitedAlerts = newAlerts.slice(0, 2);
        
        // Add alerts one by one with staggered delay
        limitedAlerts.forEach((alert, index) => {
            setTimeout(() => {
                this.addAlert(alert, timestamp);
                this.updateCount();
            }, index * 400); // 400ms delay between each alert
        });
    }

    /**
     * Add a single alert
     */
    addAlert(alertText, timestamp) {
        // Parse alert type and details
        const { type, icon, title, severity } = this.parseAlert(alertText);

        const alert = {
            id: Date.now() + Math.random(),
            type,
            icon,
            title,
            severity,
            timestamp,
            text: alertText
        };

        // Add to beginning of array
        this.alerts.unshift(alert);

        // Trim to max alerts
        if (this.alerts.length > this.maxAlerts) {
            this.alerts = this.alerts.slice(0, this.maxAlerts);
        }

        // Prepend new alert to DOM instead of re-rendering all
        this.prependAlert(alert);
    }
    
    /**
     * Prepend a single alert element to the container (no full re-render)
     */
    prependAlert(alert) {
        if (!this.container) return;
        
        // Remove empty state if present
        const emptyState = this.container.querySelector('.alert-empty');
        if (emptyState) {
            emptyState.remove();
        }
        
        // Create new alert element
        const alertEl = document.createElement('div');
        alertEl.className = 'alert-item';
        alertEl.innerHTML = `
            <div class="alert-item__icon alert-item__icon--${alert.type === 'danger' ? 'danger' : 'warning'}">
                <span>${alert.icon}</span>
            </div>
            <div>
                <div class="alert-item__text">${alert.title}</div>
                <div class="alert-item__time">${alert.timestamp}</div>
            </div>
        `;
        
        // Insert at the beginning
        this.container.insertBefore(alertEl, this.container.firstChild);
        
        // Remove excess alerts from DOM
        while (this.container.children.length > this.maxAlerts) {
            this.container.removeChild(this.container.lastChild);
        }
    }

    /**
     * Parse alert text to extract type and details
     */
    parseAlert(text) {
        const lowerText = text.toLowerCase();

        if (lowerText.includes('red') && lowerText.includes('light')) {
            return {
                type: 'danger',
                icon: '🚨',
                title: this.formatAlertTitle(text),
                severity: 'high'
            };
        }

        if (lowerText.includes('collision') || lowerText.includes('near miss')) {
            return {
                type: 'danger',
                icon: this.getIcon('danger'),
                title: this.formatAlertTitle(text),
                severity: 'high'
            };
        }

        if (lowerText.includes('pedestrian') || lowerText.includes('jaywalking')) {
            return {
                type: 'warning',
                icon: this.getIcon('pedestrian'),
                title: this.formatAlertTitle(text),
                severity: 'medium'
            };
        }

        if (lowerText.includes('congestion') || lowerText.includes('queue')) {
            return {
                type: 'info',
                icon: this.getIcon('car'),
                title: this.formatAlertTitle(text),
                severity: 'low'
            };
        }

        return {
            type: 'warning',
            icon: this.getIcon('warning'),
            title: this.formatAlertTitle(text),
            severity: 'medium'
        };
    }

    getIcon(type) {
        const commonAttrs = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
        
        switch (type) {
            case 'danger': 
            case 'warning': 
                return `<svg ${commonAttrs}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
            case 'pedestrian': 
                return `<svg ${commonAttrs}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
            case 'car':
                return `<svg ${commonAttrs}><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M14 17H9"/></svg>`;
            default: 
                return `<svg ${commonAttrs}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }
    }

    /**
     * Format alert title for display
     */
    formatAlertTitle(text) {
        // Convert snake_case to readable format
        return text
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .replace(/Lane (\d+)/gi, 'Lane $1');
    }

    /**
     * Render the alerts list
     */
    render() {
        if (!this.container) return;

        if (this.alerts.length === 0) {
            this.container.innerHTML = `
        <div class="alert-empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span>No alerts - traffic flowing smoothly</span>
        </div>
      `;
            return;
        }

        this.container.innerHTML = this.alerts.map(alert => `
      <div class="alert-item">
        <div class="alert-item__icon alert-item__icon--${alert.type === 'danger' ? 'danger' : 'warning'}">
          <span>${alert.icon}</span>
        </div>
        <div>
          <div class="alert-item__text">${alert.title}</div>
          <div class="alert-item__time">${alert.timestamp}</div>
        </div>
      </div>
    `).join('');
    }

    /**
     * Update the alert count badge
     */
    updateCount() {
        if (!this.countBadge) return;

        const highSeverityCount = this.alerts.filter(a => a.severity === 'high').length;
        this.countBadge.textContent = highSeverityCount;

        if (highSeverityCount > 0) {
            this.countBadge.classList.add('badge--danger');
            this.countBadge.classList.remove('badge--warning', 'badge--success');
        } else if (this.alerts.length > 0) {
            this.countBadge.classList.add('badge--warning');
            this.countBadge.classList.remove('badge--danger', 'badge--success');
        } else {
            this.countBadge.classList.add('badge--success');
            this.countBadge.classList.remove('badge--danger', 'badge--warning');
        }
    }

    /**
     * Clear all alerts
     */
    clear() {
        this.alerts = [];
        this.render();
        this.updateCount();
    }

    /**
     * Get current alert count
     */
    getCount() {
        return this.alerts.length;
    }
}

export default AlertsPanel;
