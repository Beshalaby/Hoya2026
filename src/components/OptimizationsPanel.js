/**
 * OptimizationsPanel Component
 * Displays AI-generated optimization suggestions with frequency tracking
 */
export class OptimizationsPanel {
    constructor() {
        this.container = document.getElementById('optimizationsList');
        this.suggestionCounts = new Map(); // Track frequency of each suggestion type
        this.maxSuggestions = 4;
        this.lastUpdateTime = 0;
        this.updateThrottleMs = 3000; // Update every 3 seconds
    }

    /**
     * Update suggestions from AI data (throttled, with frequency tracking)
     */
    update(suggestionsData) {
        if (!Array.isArray(suggestionsData) || suggestionsData.length === 0) return;
        
        // Throttle updates
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateThrottleMs) return;
        this.lastUpdateTime = now;

        // Update frequency counts for each suggestion type
        suggestionsData.forEach(text => {
            const key = this.normalizeKey(text);
            const existing = this.suggestionCounts.get(key) || { text, count: 0, lastSeen: 0 };
            existing.count++;
            existing.lastSeen = now;
            existing.text = text; // Update with latest wording
            this.suggestionCounts.set(key, existing);
        });

        this.render();
    }

    /**
     * Normalize suggestion text to a key for deduplication
     */
    normalizeKey(text) {
        return text.toLowerCase()
            .replace(/\d+/g, 'N') // Replace numbers with placeholder
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 50); // Limit key length
    }

    /**
     * Get top suggestions sorted by frequency
     */
    getTopSuggestions() {
        const suggestions = Array.from(this.suggestionCounts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, this.maxSuggestions);
        
        return suggestions.map(s => this.parseSuggestion(s.text, s.count));
    }

    /**
     * Parse suggestion text to extract details
     */
    parseSuggestion(text, count = 1) {
        const lowerText = text.toLowerCase();
        let icon = this.getIcon('default');
        let priority = 'medium';

        if (lowerText.includes('green') || lowerText.includes('extend')) {
            icon = this.getIcon('extend');
            priority = count > 2 ? 'high' : 'medium';
        } else if (lowerText.includes('reduce') || lowerText.includes('decrease')) {
            icon = this.getIcon('reduce');
            priority = 'medium';
        } else if (lowerText.includes('reroute') || lowerText.includes('redirect')) {
            icon = this.getIcon('reroute');
            priority = 'high';
        } else if (lowerText.includes('pedestrian')) {
            icon = this.getIcon('pedestrian');
            priority = 'medium';
        } else if (lowerText.includes('priority') || lowerText.includes('prioritize')) {
            icon = this.getIcon('priority');
            priority = 'high';
        } else if (lowerText.includes('congestion') || lowerText.includes('traffic')) {
            icon = this.getIcon('traffic');
            priority = count > 2 ? 'high' : 'medium';
        }

        return { icon, priority, text, count };
    }

    getIcon(type) {
        const commonAttrs = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
        
        switch (type) {
            case 'extend': // Trending Up
                return `<svg ${commonAttrs} style="color: var(--color-success)"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
            case 'reduce': // Trending Down
                return `<svg ${commonAttrs} style="color: var(--color-error)"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`;
            case 'reroute': // Corner Up Left
                return `<svg ${commonAttrs} style="color: var(--color-warning)"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;
            case 'pedestrian': // User
                return `<svg ${commonAttrs}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
            case 'priority': // Zap
                return `<svg ${commonAttrs} style="color: var(--color-warning)"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
            case 'traffic': // Car
                return `<svg ${commonAttrs}><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M14 17H9"/></svg>`;
            default: // Lightbulb
                return `<svg ${commonAttrs}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2 1.5-3.5 0-3-2.5-5.5-5.5-5.5S7 5 7 8c0 1.5.5 2.5 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`;
        }
    }

    /**
     * Render the suggestions list
     */
    render() {
        if (!this.container) return;

        const suggestions = this.getTopSuggestions();

        if (suggestions.length === 0) {
            this.container.innerHTML = `
                <div class="recommendation-empty">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span>AI suggestions will appear here</span>
                </div>
            `;
            return;
        }

        this.container.innerHTML = suggestions.map(sug => `
            <div class="recommendation-item">
                <span class="recommendation-item__icon">${sug.icon}</span>
                <span class="recommendation-item__text">${sug.text}</span>
                ${sug.count > 1 ? `<span class="recommendation-item__badge">${sug.count}x</span>` : ''}
            </div>
        `).join('');
    }

    /**
     * Clear all suggestions
     */
    clear() {
        this.suggestionCounts.clear();
        this.render();
    }
}

export default OptimizationsPanel;
