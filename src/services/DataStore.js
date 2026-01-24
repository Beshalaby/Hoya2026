/**
 * DataStore Service
 * Handles localStorage persistence for TrafiQ application
 */
export class DataStore {
    constructor() {
        this.baseKey = 'traffiq_data';
        this.data = this.load();
    }

    get storageKey() {
        try {
            const session = localStorage.getItem('traffiq_session');
            if (session) {
                const user = JSON.parse(session).email;
                if (user) return `${this.baseKey}_${user}`;
            }
        } catch (e) {
            // ignore
        }
        return this.baseKey;
    }

    /**
     * Load all data from localStorage
     */
    load() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                let parsed = JSON.parse(stored);
                // Sanitize NaNs
                if (parsed?.analytics?.totalVehicles !== undefined && isNaN(parsed.analytics.totalVehicles)) {
                    parsed.analytics.totalVehicles = 0;
                }
                // Update internal state so gets() reflect latest data
                this.data = parsed;
                return parsed;
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
                recommendations: [],
                emergencyEvents: [], // Emergency vehicle detections
                hourlyData: {},
                cameraHourlyData: {},
                intersectionStats: {},
                dailyTotals: {},
                // Queue tracking (replaced speed)
                queueData: {
                    totalReadings: 0,
                    totalQueueSum: 0,
                    hourlyQueue: {}, // { hour: { sum, count } }
                    cameraQueue: {} // { cameraId: { sum, count } }
                },
                // CO2 and time savings
                savingsData: {
                    totalTimeSavedMinutes: 0,
                    totalCO2SavedKg: 0,
                    optimizationsApplied: 0
                }
            },
            session: {
                lastActive: null,
                currentIntersection: null
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
     * Record queue length data point
     * @param {number} queueMeters - Average queue length in meters
     */
    recordQueueLength(queueMeters) {
        if (queueMeters < 0) return;

        // Initialize if missing
        if (!this.data.analytics.queueData) {
            this.data.analytics.queueData = {
                totalReadings: 0,
                totalQueueSum: 0,
                hourlyQueue: {},
                cameraQueue: {}
            };
        }

        const hour = new Date().getHours();
        const camId = this.data.session.currentIntersection || 'unknown';

        // Update totals
        this.data.analytics.queueData.totalReadings += 1;
        this.data.analytics.queueData.totalQueueSum += queueMeters;

        // Update hourly queue
        if (!this.data.analytics.queueData.hourlyQueue[hour]) {
            this.data.analytics.queueData.hourlyQueue[hour] = { sum: 0, count: 0 };
        }
        this.data.analytics.queueData.hourlyQueue[hour].sum += queueMeters;
        this.data.analytics.queueData.hourlyQueue[hour].count += 1;

        // Update camera queue
        if (!this.data.analytics.queueData.cameraQueue[camId]) {
            this.data.analytics.queueData.cameraQueue[camId] = { sum: 0, count: 0 };
        }
        this.data.analytics.queueData.cameraQueue[camId].sum += queueMeters;
        this.data.analytics.queueData.cameraQueue[camId].count += 1;

        this.save();
    }

    /**
     * Record emergency vehicle event
     */
    recordEmergencyEvent(type, lane, direction) {
        if (!this.data.analytics.emergencyEvents) {
            this.data.analytics.emergencyEvents = [];
        }

        const event = {
            id: Date.now(),
            type, // ambulance, fire_truck, police
            lane,
            direction,
            timestamp: new Date().toISOString(),
            intersection: this.data.session.currentIntersection,
            clearedAt: null,
            responseTimeSeconds: null
        };

        this.data.analytics.emergencyEvents.unshift(event);

        // Keep only last 50
        if (this.data.analytics.emergencyEvents.length > 50) {
            this.data.analytics.emergencyEvents = this.data.analytics.emergencyEvents.slice(0, 50);
        }

        this.save();
        return event.id;
    }

    /**
     * Mark emergency event as cleared
     */
    clearEmergencyEvent(eventId) {
        const event = this.data.analytics.emergencyEvents?.find(e => e.id === eventId);
        if (event && !event.clearedAt) {
            event.clearedAt = new Date().toISOString();
            event.responseTimeSeconds = Math.round((new Date(event.clearedAt) - new Date(event.timestamp)) / 1000);
            this.save();
        }
    }

    /**
     * Record optimization savings (time, CO2)
     */
    recordSavings(timeSavedMinutes, co2SavedKg) {
        if (!this.data.analytics.savingsData) {
            this.data.analytics.savingsData = {
                totalTimeSavedMinutes: 0,
                totalCO2SavedKg: 0,
                optimizationsApplied: 0
            };
        }

        this.data.analytics.savingsData.totalTimeSavedMinutes += timeSavedMinutes || 0;
        this.data.analytics.savingsData.totalCO2SavedKg += co2SavedKg || 0;
        this.data.analytics.savingsData.optimizationsApplied += 1;

        this.save();
    }

    /**
     * Get speed statistics
     */
    getSpeedStats(cameraId = null) {
        const speedData = this.data.analytics.speedData || {};

        if (cameraId && speedData.cameraSpeed?.[cameraId]) {
            const cam = speedData.cameraSpeed[cameraId];
            return {
                avgSpeed: cam.count > 0 ? Math.round(cam.sum / cam.count) : 0,
                readings: cam.count
            };
        }

        return {
            avgSpeed: speedData.totalReadings > 0
                ? Math.round(speedData.totalSpeedSum / speedData.totalReadings)
                : 0,
            readings: speedData.totalReadings || 0
        };
    }

    /**
     * Get hourly speed data for charts
     */
    getHourlySpeedData() {
        const hourlySpeed = this.data.analytics.speedData?.hourlySpeed || {};
        return Object.entries(hourlySpeed).map(([hour, data]) => ({
            hour: parseInt(hour),
            avgSpeed: data.count > 0 ? Math.round(data.sum / data.count) : 0
        }));
    }



    /**
     * Get analytics summary, optionally filtered by camera
     * @param {string|null} cameraId - Optional camera ID to filter by
     */
    getAnalyticsSummary(cameraId = null) {
        const today = new Date().toISOString().split('T')[0];
        const todayData = this.data.analytics.dailyTotals[today] || { vehicles: 0, incidents: 0, sessions: 0 };

        // Get incidents filtered by camera
        let incidentCount = todayData.incidents;
        if (cameraId) {
            const cameraName = this.getCameraName(cameraId);
            incidentCount = (this.data.analytics.incidents || []).filter(i =>
                i.intersection === cameraId || i.intersection === cameraName
            ).length;
        }

        // Calculate efficiency
        const efficiency = totalVehicles > 0 ? Math.min(99, Math.max(70, 94 - incidentCount * 2)) : 0;

        // Get average queue length - camera-specific if provided
        let avgQueue = 0;
        const queueData = this.data.analytics.queueData || {};
        if (cameraId && queueData.cameraQueue?.[cameraId]) {
            const cam = queueData.cameraQueue[cameraId];
            avgQueue = cam.count > 0 ? Math.round(cam.sum / cam.count) : 0;
        } else if (!cameraId && queueData.totalReadings > 0) {
            avgQueue = Math.round(queueData.totalQueueSum / queueData.totalReadings);
        }

        // Get savings data - currently global, but can be extended per-camera
        const savings = this.data.analytics.savingsData || { totalTimeSavedMinutes: 0, totalCO2SavedKg: 0 };
        let timeSaved = savings.totalTimeSavedMinutes;
        let co2Saved = savings.totalCO2SavedKg;

        // If camera selected, estimate proportional savings based on vehicle ratio
        if (cameraId && todayData.vehicles > 0) {
            const ratio = totalVehicles / todayData.vehicles;
            timeSaved = Math.round(timeSaved * ratio);
            co2Saved = Math.round(co2Saved * ratio * 10) / 10;
        }

        // Get emergency events filtered by camera
        let emergencyCount = (this.data.analytics.emergencyEvents || []).length;
        if (cameraId) {
            const cameraName = this.getCameraName(cameraId);
            emergencyCount = (this.data.analytics.emergencyEvents || []).filter(e =>
                e.intersection === cameraId || e.intersection === cameraName
            ).length;
        }

        // Calculate congestion score
        let congestionScore = 'Low';
        if (efficiency < 60) congestionScore = 'High';
        else if (efficiency < 85) congestionScore = 'Medium';

        return {
            totalVehiclesToday: totalVehicles,
            congestionScore: congestionScore,
            incidentsToday: incidentCount,
            flowEfficiency: efficiency,
            totalSessions: this.data.analytics.totalSessions,
            avgQueueLength: avgQueue,
            timeSavedMinutes: Math.round(timeSaved),
            co2SavedKg: Math.round(co2Saved * 10) / 10,
            emergencyEvents: emergencyCount
        };
    }

    /**
     * Helper to get camera name from ID (for matching in incidents/events)
     */
    getCameraName(cameraId) {
        // Try to find in intersection stats keys or return the ID itself
        return cameraId;
    }

    /**
     * Get peak hours data, optionally filtered by camera
     * @param {string|null} cameraId - Optional camera ID to filter by
     */
    getPeakHours(cameraId = null) {
        let hourlyData = this.data.analytics.hourlyData;

        // Use camera specific data if requested and available
        if (cameraId && this.data.analytics.cameraHourlyData && this.data.analytics.cameraHourlyData[cameraId]) {
            hourlyData = this.data.analytics.cameraHourlyData[cameraId];
        }

        const hours = Object.entries(hourlyData)
            .map(([hour, data]) => ({
                hour: parseInt(hour),
                avgVehicles: data.count > 0 ? Math.round(data.vehicles / data.count) : 0
            }))
            .sort((a, b) => b.avgVehicles - a.avgVehicles)
            .slice(0, 5);

        // If no data, return default peak hours with 0 values
        if (hours.length === 0) {
            return [];
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
            return [];
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

        // 5. Generate Speed Data
        this.data.analytics.speedData = {
            totalReadings: 0,
            totalSpeedSum: 0,
            hourlySpeed: {},
            cameraSpeed: {}
        };

        // Generate hourly speed data (higher at night, lower during rush)
        for (let h = 0; h < 24; h++) {
            let avgSpeed;
            if (h >= 7 && h < 10) avgSpeed = 25 + Math.random() * 15; // Morning rush
            else if (h >= 16 && h < 19) avgSpeed = 20 + Math.random() * 15; // Evening rush
            else if (h >= 22 || h < 6) avgSpeed = 55 + Math.random() * 15; // Night
            else avgSpeed = 40 + Math.random() * 15; // Midday

            const readings = 10 + Math.floor(Math.random() * 20);
            this.data.analytics.speedData.hourlySpeed[h] = {
                sum: avgSpeed * readings,
                count: readings
            };
            this.data.analytics.speedData.totalReadings += readings;
            this.data.analytics.speedData.totalSpeedSum += avgSpeed * readings;
        }

        // Speed per camera
        targetCameras.forEach(cam => {
            const avgSpeed = 30 + Math.random() * 30;
            const readings = 50 + Math.floor(Math.random() * 100);
            this.data.analytics.speedData.cameraSpeed[cam.id] = {
                sum: avgSpeed * readings,
                count: readings
            };
        });

        // 6. Generate Emergency Events
        this.data.analytics.emergencyEvents = [];
        const emergencyTypes = ['ambulance', 'fire_truck', 'police'];
        for (let i = 0; i < 5; i++) {
            const cam = targetCameras[Math.floor(Math.random() * targetCameras.length)];
            const time = new Date(now);
            time.setHours(Math.floor(Math.random() * 24));
            time.setMinutes(Math.floor(Math.random() * 60));

            const clearedTime = new Date(time);
            clearedTime.setSeconds(clearedTime.getSeconds() + 20 + Math.floor(Math.random() * 60));

            this.data.analytics.emergencyEvents.push({
                id: Date.now() + i + 1000,
                type: emergencyTypes[Math.floor(Math.random() * emergencyTypes.length)],
                lane: Math.floor(Math.random() * 4) + 1,
                direction: ['Northbound', 'Southbound', 'Eastbound', 'Westbound'][Math.floor(Math.random() * 4)],
                timestamp: time.toISOString(),
                intersection: cam.name,
                clearedAt: clearedTime.toISOString(),
                responseTimeSeconds: Math.floor((clearedTime - time) / 1000)
            });
        }

        // 7. Generate Savings Data
        this.data.analytics.savingsData = {
            totalTimeSavedMinutes: Math.floor(150 + Math.random() * 200),
            totalCO2SavedKg: Math.round((50 + Math.random() * 100) * 10) / 10,
            optimizationsApplied: Math.floor(20 + Math.random() * 30)
        };

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
