/**
 * DataStore Service
 * Handles localStorage persistence for TraffiQ application
 */
export class DataStore {
    constructor() {
        this.storageKey = 'traffiq_data';
        this.data = this.load();
    }

    /**
     * Load all data from localStorage
     */
    load() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('Error loading data:', e);
        }
        return this.getDefaultData();
    }

    /**
     * Default data structure
     */
    getDefaultData() {
        return {
            settings: {
                apiKey: import.meta.env.VITE_OVERSHOOT_API_KEY || '',
                audioAlerts: true,
                incidentNotifications: true,
                congestionWarnings: true,
                heatmapEnabled: true,
                liveVehicleCounts: true,
                mapStyle: 'dark',
                defaultCamera: 'environment',
                frameRate: 2,
                saveHistoricalData: true,
                dataRetentionDays: 30
            },
            analytics: {
                totalVehicles: 0,
                totalSessions: 0,
                incidents: [],
                recommendations: [], // New: AI Suggestions
                hourlyData: {},
                cameraHourlyData: {}, // New: Hourly data per camera
                intersectionStats: {},
                dailyTotals: {}
            },
            session: {
                lastActive: null,
                currentIntersection: 'Times Square'
            }
        };
    }

    /**
     * Save data to localStorage
     */
    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        } catch (e) {
            console.error('Error saving data:', e);
        }
    }

    // ========== Settings Methods ==========

    getSetting(key) {
        return this.data.settings[key];
    }

    setSetting(key, value) {
        this.data.settings[key] = value;
        this.save();
    }

    getAllSettings() {
        return { ...this.data.settings };
    }

    updateSettings(updates) {
        this.data.settings = { ...this.data.settings, ...updates };
        this.save();
    }

    // ========== Analytics Methods ==========

    /**
     * Record traffic data point
     */
    recordTrafficData(data) {
        if (!this.data.settings.saveHistoricalData) return;

        const now = new Date();
        const hour = now.getHours();
        const dateKey = now.toISOString().split('T')[0];

        // Update hourly data
        if (!this.data.analytics.hourlyData[hour]) {
            this.data.analytics.hourlyData[hour] = { vehicles: 0, count: 0 };
        }
        const vehicleCount = (data.car || 0) + (data.bus || 0) + (data.truck || 0) + (data.motorcycle || 0);
        this.data.analytics.hourlyData[hour].vehicles += vehicleCount;
        this.data.analytics.hourlyData[hour].count += 1;

        // Update hourly data per camera
        if (this.data.session.currentIntersection) {
            const camId = this.data.session.currentIntersection;

            if (!this.data.analytics.cameraHourlyData) {
                this.data.analytics.cameraHourlyData = {};
            }
            if (!this.data.analytics.cameraHourlyData[camId]) {
                this.data.analytics.cameraHourlyData[camId] = {};
            }
            if (!this.data.analytics.cameraHourlyData[camId][hour]) {
                this.data.analytics.cameraHourlyData[camId][hour] = { vehicles: 0, count: 0 };
            }

            this.data.analytics.cameraHourlyData[camId][hour].vehicles += vehicleCount;
            this.data.analytics.cameraHourlyData[camId][hour].count += 1;
        }

        // Update daily totals
        if (!this.data.analytics.dailyTotals[dateKey]) {
            this.data.analytics.dailyTotals[dateKey] = { vehicles: 0, incidents: 0, sessions: 0 };
        }
        this.data.analytics.dailyTotals[dateKey].vehicles += vehicleCount;

        // Update intersection stats
        const intersection = this.data.session.currentIntersection || 'Unknown';
        if (!this.data.analytics.intersectionStats[intersection]) {
            this.data.analytics.intersectionStats[intersection] = { vehicles: 0, avgWait: 0, count: 0 };
        }

        // Update average wait time
        const stats = this.data.analytics.intersectionStats[intersection];
        const newWait = data.avgWaitTime || 0;
        if (newWait > 0) {
            // Update running average
            stats.avgWait = Math.round(((stats.avgWait * stats.count) + newWait) / (stats.count + 1));
        }

        stats.vehicles += vehicleCount;
        stats.count += 1;

        // Update totals
        this.data.analytics.totalVehicles += vehicleCount;

        this.save();
    }

    /**
     * Record an incident/alert
     */
    recordIncident(type, description) {
        const incident = {
            id: Date.now(),
            type,
            description,
            timestamp: new Date().toISOString(),
            intersection: this.data.session.currentIntersection
        };
        this.data.analytics.incidents.unshift(incident);

        // Keep only last 100 incidents
        if (this.data.analytics.incidents.length > 100) {
            this.data.analytics.incidents = this.data.analytics.incidents.slice(0, 100);
        }

        // Update daily incident count
        const dateKey = new Date().toISOString().split('T')[0];
        if (this.data.analytics.dailyTotals[dateKey]) {
            this.data.analytics.dailyTotals[dateKey].incidents += 1;
        }

        this.save();
    }

    /**
     * Record an AI recommendation
     */
    recordRecommendation(text) {
        if (!this.data.analytics.recommendations) {
            this.data.analytics.recommendations = [];
        }

        // Prevent duplicates
        if (this.data.analytics.recommendations.some(r => r.text === text && (Date.now() - new Date(r.timestamp).getTime() < 300000))) {
            return; // Ignore duplicate within 5 mins
        }

        const recommendation = {
            id: Date.now(),
            text,
            timestamp: new Date().toISOString(),
            intersection: this.data.session.currentIntersection
        };

        this.data.analytics.recommendations.unshift(recommendation);

        // Keep only last 50
        if (this.data.analytics.recommendations.length > 50) {
            this.data.analytics.recommendations = this.data.analytics.recommendations.slice(0, 50);
        }

        this.save();
    }

    /**
     * Start a new session
     */
    startSession() {
        this.data.analytics.totalSessions += 1;
        this.data.session.lastActive = new Date().toISOString();

        const dateKey = new Date().toISOString().split('T')[0];
        if (!this.data.analytics.dailyTotals[dateKey]) {
            this.data.analytics.dailyTotals[dateKey] = { vehicles: 0, incidents: 0, sessions: 0 };
        }
        this.data.analytics.dailyTotals[dateKey].sessions += 1;

        this.save();
    }

    /**
     * Set current intersection
     */
    setCurrentIntersection(name) {
        this.data.session.currentIntersection = name;
        this.save();
    }

    /**
     * Get analytics summary
     */
    getAnalyticsSummary() {
        const today = new Date().toISOString().split('T')[0];
        const todayData = this.data.analytics.dailyTotals[today] || { vehicles: 0, incidents: 0, sessions: 0 };

        // Get average wait time from current intersection
        const intersection = this.data.session.currentIntersection || 'Times Square';
        const stats = this.data.analytics.intersectionStats[intersection];
        const avgWait = stats ? stats.avgWait : 0;

        // Calculate efficiency
        const efficiency = Math.min(99, Math.max(70, 94 - todayData.incidents * 2));

        return {
            totalVehiclesToday: todayData.vehicles,
            avgWaitTime: avgWait,
            incidentsToday: todayData.incidents,
            flowEfficiency: efficiency,
            totalSessions: this.data.analytics.totalSessions
        };
    }

    /**
     * Get peak hours data
     */
    getPeakHours() {
        const hourlyData = this.data.analytics.hourlyData;
        const hours = Object.entries(hourlyData)
            .map(([hour, data]) => ({
                hour: parseInt(hour),
                avgVehicles: data.count > 0 ? Math.round(data.vehicles / data.count) : 0
            }))
            .sort((a, b) => b.avgVehicles - a.avgVehicles)
            .slice(0, 5);

        // If no data, return default peak hours with 0 values
        if (hours.length === 0) {
            return [
                { hour: 8, avgVehicles: 0 },
                { hour: 17, avgVehicles: 0 },
                { hour: 18, avgVehicles: 0 },
                { hour: 9, avgVehicles: 0 },
                { hour: 12, avgVehicles: 0 }
            ];
        }

        return hours;
    }

    /**
     * Get busiest intersections
     */
    getBusiestIntersections() {
        const stats = this.data.analytics.intersectionStats;
        const intersections = Object.entries(stats)
            .map(([name, data]) => ({
                name,
                vehicles: data.vehicles,
                congestion: data.vehicles > 3000 ? 'high' : data.vehicles > 1500 ? 'medium' : 'low'
            }))
            .sort((a, b) => b.vehicles - a.vehicles)
            .slice(0, 4);

        // If no data, return defaults with 0 values
        if (intersections.length === 0) {
            return [
                { name: 'Times Square', vehicles: 0, congestion: 'low' },
                { name: 'Herald Square', vehicles: 0, congestion: 'low' },
                { name: 'Penn Station', vehicles: 0, congestion: 'low' },
                { name: 'Bryant Park', vehicles: 0, congestion: 'low' }
            ];
        }

        return intersections;
    }

    /**
     * Get hourly data for chart, optionally filtered by camera
     */
    getHourlyData(cameraId = null) {
        // If specific camera selected
        if (cameraId && this.data.analytics.cameraHourlyData && this.data.analytics.cameraHourlyData[cameraId]) {
            return this.data.analytics.cameraHourlyData[cameraId];
        }

        // Use global if no camera or no data for camera
        return this.data.analytics.hourlyData;
    }

    /**
     * Get recent recommendations
     */
    getRecommendations(limit = 10) {
        return (this.data.analytics.recommendations || []).slice(0, limit);
    }

    /**
     * Get recent incidents
     */
    getIncidents(limit = 10) {
        return (this.data.analytics.incidents || []).slice(0, limit);
    }

    /**
     * Clear all analytics data
     */
    clearAnalytics() {
        this.data.analytics = this.getDefaultData().analytics;
        this.save();
    }

    /**
     * Export all data as JSON
     */
    exportData() {
        return JSON.stringify(this.data, null, 2);
    }

    /**
     * Cleanup old data based on retention policy
     */
    cleanupOldData() {
        const retentionDays = this.data.settings.dataRetentionDays;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const cutoffKey = cutoffDate.toISOString().split('T')[0];

        // Remove old daily totals
        Object.keys(this.data.analytics.dailyTotals).forEach(dateKey => {
            if (dateKey < cutoffKey) {
                delete this.data.analytics.dailyTotals[dateKey];
            }
        });

        // Remove old incidents
        this.data.analytics.incidents = this.data.analytics.incidents.filter(incident => {
            return incident.timestamp.split('T')[0] >= cutoffKey;
        });

        this.save();
    }

    /**
     * Generate complex demo data for analytics
     */
    generateComplexDemoData(cameras = []) {
        console.log('🧪 Generating complex demo data...');
        const now = new Date();
        const hour = now.getHours();

        // 1. Reset current data
        this.clearAnalytics();

        // 2. Generate data for each camera (or default list if empty)
        const targetCameras = cameras.length > 0 ? cameras : [
            { id: 'i695_balt_natl', name: 'I-695 @ Balt Natl Pike' },
            { id: 'i97_md178', name: 'I-97 @ MD 178' },
            { id: 'i97_md32', name: 'I-97 N of MD 32' }
        ];

        targetCameras.forEach(cam => {
            // Generate 24 hours of data
            for (let h = 0; h < 24; h++) {
                // Realistic traffic curve: low at night, peak 8am/5pm
                let volume = 0;
                if (h >= 6 && h < 10) volume = 1500 + Math.random() * 1000; // Morning rush
                else if (h >= 15 && h < 19) volume = 1800 + Math.random() * 1200; // Evening rush
                else if (h >= 10 && h < 15) volume = 800 + Math.random() * 500; // Midday
                else volume = 100 + Math.random() * 300; // Night

                // Add noise
                volume = Math.round(volume);

                // Add to global hourly
                if (!this.data.analytics.hourlyData[h]) {
                    this.data.analytics.hourlyData[h] = { vehicles: 0, count: 0 };
                }
                this.data.analytics.hourlyData[h].vehicles += volume;
                this.data.analytics.hourlyData[h].count += 1; // simulation of 1 hour

                // Add to camera hourly
                if (!this.data.analytics.cameraHourlyData[cam.id]) {
                    this.data.analytics.cameraHourlyData[cam.id] = {};
                }
                this.data.analytics.cameraHourlyData[cam.id][h] = { vehicles: volume, count: 1 };

                // Add to daily totals
                const dateKey = now.toISOString().split('T')[0];
                if (!this.data.analytics.dailyTotals[dateKey]) {
                    this.data.analytics.dailyTotals[dateKey] = { vehicles: 0, incidents: 0, sessions: 0 };
                }
                this.data.analytics.dailyTotals[dateKey].vehicles += volume;

                // Update stats
                if (!this.data.analytics.intersectionStats[cam.id]) {
                    this.data.analytics.intersectionStats[cam.id] = { vehicles: 0, avgWait: 0, count: 0 };
                }
                const stats = this.data.analytics.intersectionStats[cam.id];
                stats.vehicles += volume;
                stats.count += 1;
                // Random avg wait (higher during rush)
                let wait = 15;
                if (volume > 1500) wait = 45 + Math.random() * 30;
                else if (volume > 800) wait = 25 + Math.random() * 15;

                stats.avgWait = Math.round(((stats.avgWait * (stats.count - 1)) + wait) / stats.count);
            }
        });

        // 3. Generate Incidents
        const incidentTypes = ['accident', 'congestion', 'debris', 'stall', 'pedestrian_hazard'];
        for (let i = 0; i < 15; i++) {
            const cam = targetCameras[Math.floor(Math.random() * targetCameras.length)];
            const type = incidentTypes[Math.floor(Math.random() * incidentTypes.length)];
            const labels = {
                accident: 'Minor collision detected',
                congestion: 'Severe congestion backup',
                debris: 'Debris reported in lane 2',
                stall: 'Stalled vehicle on shoulder',
                pedestrian_hazard: 'Pedestrian in roadway'
            };

            // Random time today
            const time = new Date(now);
            time.setHours(Math.floor(Math.random() * 24));
            time.setMinutes(Math.floor(Math.random() * 60));

            this.data.analytics.incidents.push({
                id: Date.now() + i,
                type: type,
                description: labels[type],
                intersection: cam.name, // analytics uses name for display mostly
                timestamp: time.toISOString()
            });
        }
        // Sor incidents desc
        this.data.analytics.incidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        this.data.analytics.dailyTotals[now.toISOString().split('T')[0]].incidents = 15;

        // 4. Generate AI Recommendations
        const recs = [
            'Adjust signal timing: +5s green for Northbound',
            'Deploy responder unit to I-695 (congestion)',
            'Warning: Rain detected, reduce speed limits',
            'Optimize cycle length for current load',
            'Extend turning lane green phase by 3s',
            'Queue spillback risk: Divert traffic to alternate route'
        ];

        for (let i = 0; i < 8; i++) {
            const cam = targetCameras[Math.floor(Math.random() * targetCameras.length)];
            this.recordRecommendationWithMeta(recs[Math.floor(Math.random() * recs.length)], cam.name);
        }

        this.save();
        console.log('✅ Complex demo data generated');
    }

    recordRecommendationWithMeta(text, location) {
        if (!this.data.analytics.recommendations) this.data.analytics.recommendations = [];
        this.data.analytics.recommendations.unshift({
            id: Date.now() + Math.random(),
            text,
            timestamp: new Date().toISOString(),
            intersection: location
        });
    }
}

// Global instance
export const dataStore = new DataStore();
export default dataStore;
