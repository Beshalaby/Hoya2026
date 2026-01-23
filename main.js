import './src/style.css';
import 'leaflet/dist/leaflet.css';
import { TrafficAnalyzer } from './src/ai/TrafficAnalyzer.js';
import { VideoFeed } from './src/components/VideoFeed.js';
import { Heatmap } from './src/components/Heatmap.js';
import { StatsPanel } from './src/components/StatsPanel.js';
import { AlertsPanel } from './src/components/AlertsPanel.js';
import { OptimizationsPanel } from './src/components/OptimizationsPanel.js';
import { HistoricalChart } from './src/components/HistoricalChart.js';
import { InteractiveMap } from './src/components/InteractiveMap.js';
import { SignalControl } from './src/components/SignalControl.js';
import { DemoDataGenerator } from './src/utils/DemoDataGenerator.js';
import { AudioAlerts } from './src/utils/AudioAlerts.js';
import { dataStore } from './src/services/DataStore.js';
import { authService } from './src/services/AuthService.js';

/**
 * TraffiQ - Traffic Optimization Dashboard
 * Main application entry point
 */
class TraffiQApp {
    constructor() {
        // Check if user is logged in
        if (!authService.requireAuth('/login.html')) {
            return; // Will redirect to login
        }

        // Setup user menu
        this.setupUserMenu();

        // Default API key (can be overridden via modal)
        this.defaultApiKey = import.meta.env.VITE_OVERSHOOT_API_KEY;

        // Initialize components
        this.analyzer = null;
        this.videoFeed = null;
        this.heatmap = null;
        this.statsPanel = null;
        this.alertsPanel = null;
        this.optimizationsPanel = null;
        this.historicalChart = null;
        this.interactiveMap = null;
        this.signalControl = null;
        this.demoGenerator = null;
        this.isDemoMode = false;
        this.audioAlerts = null;

        // UI elements
        this.connectionStatus = document.getElementById('connectionStatus');
        this.apiKeyBtn = document.getElementById('apiKeyBtn');
        this.apiKeyModal = document.getElementById('apiKeyModal');
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.apiKeyCancel = document.getElementById('apiKeyCancel');
        this.apiKeySave = document.getElementById('apiKeySave');
        this.loadingOverlay = document.getElementById('statsLoadingOverlay');

        this.init();
    }

    async init() {
        console.log('🚦 TraffiQ Dashboard initializing...');

        // Initialize AI analyzer
        this.analyzer = new TrafficAnalyzer({
            apiKey: this.defaultApiKey,
            onResult: (data) => this.handleAIResult(data),
            onError: (error) => this.handleError(error),
            onStatusChange: (status) => this.updateConnectionStatus(status)
        });

        // Check for saved API key
        const savedKey = this.analyzer.getSavedApiKey();
        if (savedKey) {
            this.analyzer.setApiKey(savedKey);
        } else {
            // Use default key
            this.analyzer.setApiKey(this.defaultApiKey);
        }

        // Initialize UI components
        this.videoFeed = new VideoFeed({
            onCameraSelect: () => this.startCameraAnalysis(),
            onVideoUpload: (file) => this.startVideoAnalysis(file),
            onStreamSelect: (url, cameraId) => this.handleStreamSelect(url, cameraId)
        });

        this.heatmap = new Heatmap({ laneCount: 4 });
        this.statsPanel = new StatsPanel();
        this.alertsPanel = new AlertsPanel();
        this.optimizationsPanel = new OptimizationsPanel();
        this.historicalChart = new HistoricalChart();

        // Initialize map and signal control
        this.interactiveMap = new InteractiveMap({
            onCameraSelect: (camera) => this.handleMapCameraSelect(camera)
        });
        this.signalControl = new SignalControl({
            onTimingChange: (timings) => this.handleTimingChange(timings)
        });

        // Initialize demo generator
        this.demoGenerator = new DemoDataGenerator();

        // Initialize audio alerts
        this.audioAlerts = new AudioAlerts({ enabled: true, volume: 0.3 });

        // Setup event listeners
        this.setupEventListeners();
        this.setupResizer();

        console.log('✅ TraffiQ Dashboard ready');
        console.log('⌨️  Keyboard shortcuts: D=Demo, C=Camera, E=Export, M=Mute, ?=Help');
        this.updateConnectionStatus('ready');
    }

    /**
     * Setup resizer for split pane and map/video vertical split
     */
    setupResizer() {
        // Horizontal Resizer (Sidebar)
        const resizer = document.getElementById('layoutResizer');
        if (resizer) {
            let isResizing = false;

            const startResize = (e) => {
                isResizing = true;
                resizer.classList.add('is-resizing');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            };

            const stopResize = () => {
                if (isResizing) {
                    isResizing = false;
                    resizer.classList.remove('is-resizing');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                }
            };

            const resize = (e) => {
                if (!isResizing) return;
                const newWidth = window.innerWidth - e.clientX - 6;

                if (newWidth > 250 && newWidth < 800) {
                    document.documentElement.style.setProperty('--right-panel-width', `${newWidth}px`);
                }
            };

            resizer.addEventListener('mousedown', startResize);
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
        }

        // Vertical Resizer (Map Height)
        const vResizer = document.getElementById('verticalResizer');
        if (vResizer) {
            let isVResizing = false;

            const startVResize = (e) => {
                isVResizing = true;
                vResizer.classList.add('is-resizing');
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
            };

            const stopVResize = () => {
                if (isVResizing) {
                    isVResizing = false;
                    vResizer.classList.remove('is-resizing');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                }
            };

            const vResize = (e) => {
                if (!isVResizing) return;
                // Calculate height based on mouse Y relative to top of main layout
                // But simpler: just use e.clientY minus header height (approx 60px) minus padding
                const headerHeight = 60;
                const padding = 32; // 2rem
                const newHeight = e.clientY - headerHeight - padding;

                if (newHeight > 200 && newHeight < 1000) {
                    document.documentElement.style.setProperty('--map-height', `${newHeight}px`);
                    // Trigger map resize if Leaflet needs it
                    if (window.traffiQ?.interactiveMap?.map) {
                        window.traffiQ.interactiveMap.map.invalidateSize();
                    }
                }
            };

            vResizer.addEventListener('mousedown', startVResize);
            document.addEventListener('mousemove', vResize);
            document.addEventListener('mouseup', stopVResize);
        }
    }

    /**
     * Setup user menu in header
     */
    setupUserMenu() {
        const user = authService.getCurrentUser();
        if (!user) return;

        // Find header actions
        const headerActions = document.querySelector('.header__actions');
        if (!headerActions) return;

        // Create user menu
        const existingMenu = headerActions.querySelector('.user-menu');
        if (existingMenu) existingMenu.remove();

        const userMenu = document.createElement('div');
        userMenu.className = 'user-menu';
        userMenu.innerHTML = `
            <span class="user-menu__name">${user.name}</span>
            <div class="user-menu__avatar">${user.name.charAt(0).toUpperCase()}</div>
            <button class="btn btn--ghost btn--sm" id="logoutBtn">Logout</button>
        `;

        // Insert before API key button
        const apiKeyBtn = headerActions.querySelector('#apiKeyBtn');
        if (apiKeyBtn) {
            headerActions.insertBefore(userMenu, apiKeyBtn);
        } else {
            headerActions.appendChild(userMenu);
        }

        // Add logout handler
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            authService.logout();
            window.location.href = '/login.html';
        });
    }

    setupEventListeners() {
        // API Key modal
        this.apiKeyBtn?.addEventListener('click', () => this.openApiKeyModal());
        this.apiKeyCancel?.addEventListener('click', () => this.closeApiKeyModal());
        this.apiKeySave?.addEventListener('click', () => this.saveApiKey());
        this.apiKeyModal?.querySelector('.modal__backdrop')?.addEventListener('click', () => this.closeApiKeyModal());

        // Demo button
        const demoBtn = document.getElementById('demoBtn');
        demoBtn?.addEventListener('click', () => this.toggleDemoMode());

        // Export button
        const exportBtn = document.getElementById('exportDataBtn');
        exportBtn?.addEventListener('click', () => this.exportData());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key.toLowerCase()) {
                case 'escape':
                    this.closeApiKeyModal();
                    if (this.isDemoMode) this.stopDemoMode();
                    break;
                case 'd':
                    // D = Toggle demo mode
                    this.toggleDemoMode();
                    break;
                case 'c':
                    // C = Start camera
                    if (!this.isDemoMode) this.startCameraAnalysis();
                    break;
                case 'e':
                    // E = Export data
                    this.exportData();
                    break;
                case 'm':
                    // M = Mute/unmute audio alerts
                    if (this.audioAlerts) {
                        const enabled = this.audioAlerts.toggle();
                        console.log(`🔊 Audio alerts ${enabled ? 'enabled' : 'disabled'}`);
                    }
                    break;
                case '?':
                    // ? = Show help
                    this.showKeyboardHelp();
                    break;
            }
        });
    }

    /**
     * Show keyboard shortcuts help
     */
    showKeyboardHelp() {
        console.log(`
⌨️ TraffiQ Keyboard Shortcuts:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
D     - Toggle demo mode
C     - Start camera analysis
E     - Export historical data
M     - Mute/unmute audio alerts
ESC   - Stop demo / close modals
?     - Show this help
        `);
    }

    /**
     * Export historical data as CSV
     */
    exportData() {
        if (!this.historicalChart) {
            console.warn('No historical data to export');
            return;
        }

        const data = JSON.parse(this.historicalChart.exportData());

        // Convert to CSV format
        let csv = 'Period,Label,Congestion Value,Samples\n';

        // Hourly data
        data.hour?.forEach(item => {
            csv += `Hourly,${item.label},${item.value},${item.samples}\n`;
        });

        // Daily data
        data.day?.forEach(item => {
            csv += `Daily,${item.label},${item.value},${item.samples}\n`;
        });

        // Create download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `traffiq_data_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('📊 Historical data exported successfully');
        this.audioAlerts?.success();
    }

    /**
     * Open API key modal
     */
    openApiKeyModal() {
        this.apiKeyModal?.classList.add('modal--open');
        this.apiKeyInput.value = this.analyzer?.getSavedApiKey() || this.defaultApiKey;
        this.apiKeyInput?.focus();
    }

    /**
     * Close API key modal
     */
    closeApiKeyModal() {
        this.apiKeyModal?.classList.remove('modal--open');
    }

    /**
     * Save API key and close modal
     */
    saveApiKey() {
        const key = this.apiKeyInput?.value?.trim();
        if (key) {
            this.analyzer?.setApiKey(key);
            this.closeApiKeyModal();
            this.updateConnectionStatus('ready');
        }
    }

    /**
     * Start analysis with camera
     */
    async startCameraAnalysis() {
        try {
            // Stop any existing analysis
            await this.stopAnalysis();
            this.resetDashboardState();

            this.updateConnectionStatus('connecting');
            this.videoFeed.setStatus('processing', 'Connecting...');

            // Initialize with camera
            await this.analyzer.initWithCamera('environment');

            // Start analysis
            await this.analyzer.start();

            // Get the video element from SDK and display it
            const videoEl = this.analyzer.getVideoElement();
            if (videoEl) {
                this.videoFeed.setSDKVideoElement(videoEl);
            }

            this.videoFeed.setStatus('processing', 'Analyzing...');

        } catch (error) {
            console.error('Camera analysis error:', error);
            this.handleError(error);
        }
    }

    /**
     * Start analysis with video file
     */
    async startVideoAnalysis(file) {
        console.log('🎬 Starting video analysis with file:', file?.name || file);
        try {
            // Stop any existing analysis
            await this.stopAnalysis();
            this.resetDashboardState();

            this.updateConnectionStatus('connecting');
            this.videoFeed.setStatus('processing', 'Loading video...');
            this.showLoadingState();

            // 1. Show the video in the UI
            this.videoFeed.setVideoSource(file);

            // 2. Get the element we just set up
            const videoEl = this.videoFeed.getVideoElement();
            if (!videoEl) {
                throw new Error('Video feed not ready');
            }

            // 3. Initialize analyzer with the UI element
            // This reuses the logic we improved for HLS - capturing the stream from the player
            await this.analyzer.initWithVideoElement(videoEl);

            // 4. Start analysis
            await this.analyzer.start();

            this.videoFeed.setStatus('processing', 'Analyzing...');

        } catch (error) {
            console.error('Video analysis error:', error);
            this.handleError(error);
        }
    }

    /**
     * Handle stream selection from video feed
     */
    handleStreamSelect(url, cameraId) {
        this.startHlsAnalysis(url);

        // Sync map if ID is provided
        if (cameraId) {
            this.interactiveMap?.selectCamera(cameraId);
            
            // Also update stats panel header
            // Try to find name from map cameras
            const camera = this.interactiveMap?.cameras.find(c => c.id == cameraId); // loose equality for string/num
            if (camera) {
                this.statsPanel?.setCameraName(camera.name);
            }

            // Update DataStore session for analytics
            dataStore.setCurrentIntersection(cameraId);
        }
    }

    /**
     * Handle camera selection from map
     */
    handleMapCameraSelect(camera) {
        if (camera && camera.id) {
            // Select in video feed (will trigger stream load via change event)
            this.videoFeed?.selectCamera(camera.id);
        }
    }

    /**
     * Start analysis with HLS stream
     */
    async startHlsAnalysis(url) {
        console.log('📡 Starting HLS analysis with URL:', url);
        try {
            // Stop any existing analysis
            await this.stopAnalysis();
            this.resetDashboardState();

            this.updateConnectionStatus('connecting');
            this.videoFeed.setStatus('processing', 'Initializing Stream...');
            this.showLoadingState();

            // Get the HLS video element from VideoFeed (which is already playing it)
            const videoEl = this.videoFeed.getVideoElement();
            if (!videoEl) {
                throw new Error('Video feed not ready');
            }

            // Init analyzer with this element
            await this.analyzer.initWithVideoElement(videoEl);

            // Start analysis (will use intercepted getUserMedia from captured stream)
            await this.analyzer.start();

            // Note: We don't overwrite SDK video element here, because SDK will look at captured stream
            // And VideoFeed is already showing the content.
            // BUT: If SDK creates a debug video, we might want to swap?
            // Actually, if we use captureStream, the SDK output video will just be the same thing.
            // We should ideally keep the VideoFeed element as is.
            // But SDK might expect to be attached.
            // Let's see if we need to do `setSDKVideoElement`.
            // If we don't, the SDK's hidden video might just be processing off-screen.
            // Perfect.

            this.videoFeed.setStatus('processing', 'Analyzing Stream...');

        } catch (error) {
            console.error('HLS analysis error:', error);
            this.handleError(error);
            // Reset UI state specifically for video feed
            this.videoFeed.setStatus('error', 'Connection Failed');
            this.hideLoadingState();
        }
    }

    /**
     * Stop current analysis
     */
    async stopAnalysis() {
        if (this.analyzer?.getIsRunning()) {
            await this.analyzer.stop();
        }
    }

    /**
     * Reset dashboard state (alerts, recommendations, current stats)
     */
    resetDashboardState() {
        console.log('🧹 Resetting dashboard state...');
        this.alertsPanel?.clear();
        this.optimizationsPanel?.clear();
        this.statsPanel?.reset();
        this.heatmap?.reset();
    }

    /**
     * Handle AI analysis result
     */
    handleAIResult(data) {
        console.log('📊 AI Result:', data);

        // Hide loading overlay on first result
        this.hideLoadingState();

        // Update all dashboard components
        this.heatmap?.update(data.lanes);
        this.statsPanel?.update(data);
        this.alertsPanel?.update(data.alerts);

        // Debug: log recommendations
        if (data.optimization_suggestions?.length > 0) {
            console.log('💡 AI Recommendations:', data.optimization_suggestions);
        }
        this.optimizationsPanel?.update(data.optimization_suggestions);
        this.historicalChart?.recordDataPoint(data);

        // Update map and signal control
        this.interactiveMap?.updateActiveIntersection(data);
        this.signalControl?.updateRecommendation(data);

        // Aggregate vehicle counts from lanes for DataStore
        const trafficData = {
            car: 0,
            truck: 0,
            bus: 0,
            motorcycle: 0,
            avgWaitTime: data.avg_wait_seconds || 0
        };

        if (data.lanes && Array.isArray(data.lanes)) {
            data.lanes.forEach(lane => {
                if (lane.vehicle_types) {
                    trafficData.car += lane.vehicle_types.car || 0;
                    trafficData.truck += lane.vehicle_types.truck || 0;
                    trafficData.bus += lane.vehicle_types.bus || 0;
                    trafficData.motorcycle += lane.vehicle_types.motorcycle || 0;
                }
            });
        }

        // Record traffic data to DataStore for analytics
        dataStore.recordTrafficData(trafficData);

        // Record alerts to DataStore
        if (data.alerts && data.alerts.length > 0) {
            data.alerts.forEach(alert => {
                const alertMsg = typeof alert === 'string' ? alert : (alert.message || alert.type || 'Alert');
                dataStore.recordIncident(typeof alert === 'object' ? (alert.type || 'alert') : 'alert', alertMsg);
            });
            // Play audio alerts for critical events
            this.audioAlerts?.processAlerts(data.alerts);
        }

        // NEW: Record recommendations to DataStore
        if (data.optimization_suggestions && data.optimization_suggestions.length > 0) {
            data.optimization_suggestions.forEach(rec => {
                 dataStore.recordRecommendation(rec);
            });
        }

        // Update video status with latency info
        if (data._meta) {
            const latency = data._meta.total_latency_ms || 0;
            const scenario = data._meta.scenario_name || '';
            const statusText = scenario
                ? `${scenario} (${latency}ms)`
                : `Analyzing (${latency}ms)`;
            this.videoFeed?.setStatus('processing', statusText);
        }
    }

    /**
     * Handle errors
     */
    handleError(error) {
        console.error('❌ Error:', error);
        this.updateConnectionStatus('error');
        this.videoFeed?.setStatus('error', error.message || 'An error occurred');
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(status) {
        if (!this.connectionStatus) return;

        this.connectionStatus.classList.remove(
            'status-pill--connected',
            'status-pill--connecting',
            'status-pill--error'
        );

        const textEl = this.connectionStatus.querySelector('.status-pill__text');
        const dotEl = this.connectionStatus.querySelector('.status-pill__dot');
        if (!textEl) return;

        switch (status) {
            case 'connected':
                this.connectionStatus.classList.add('status-pill--connected');
                textEl.textContent = 'Connected';
                if (dotEl) dotEl.style.background = 'var(--color-success)';
                break;
            case 'connecting':
                this.connectionStatus.classList.add('status-pill--connecting');
                textEl.textContent = 'Connecting...';
                if (dotEl) dotEl.style.background = 'var(--color-warning)';
                break;
            case 'ready':
                textEl.textContent = 'Ready';
                if (dotEl) dotEl.style.background = 'var(--color-success)';
                break;
            case 'error':
                this.connectionStatus.classList.add('status-pill--error');
                textEl.textContent = 'Error';
                if (dotEl) dotEl.style.background = 'var(--color-danger)';
                break;
            case 'disconnected':
            default:
                textEl.textContent = 'Disconnected';
                if (dotEl) dotEl.style.background = 'var(--color-text-muted)';
                break;
        }
    }

    /**
     * Handle signal timing changes
     */
    handleTimingChange(timings) {
        console.log('🚦 Signal timings changed:', timings);
        // In a real app, this would send to a traffic control system
    }

    /**
     * Show loading overlay on stats panel
     */
    showLoadingState() {
        this.loadingOverlay?.classList.add('loading-overlay--active');
    }

    /**
     * Hide loading overlay on stats panel
     */
    hideLoadingState() {
        this.loadingOverlay?.classList.remove('loading-overlay--active');
    }

    /**
     * Select an intersection (called from map popup)
     */
    selectIntersection(id) {
        console.log('📍 Selected intersection:', id);
        this.interactiveMap?.focusIntersection(id);
    }

    /**
     * Toggle demo mode on/off
     */
    toggleDemoMode() {
        if (this.isDemoMode) {
            this.stopDemoMode();
        } else {
            this.startDemoMode();
        }
    }

    /**
     * Start demo mode with simulated traffic data
     */
    startDemoMode() {
        // Stop any existing analysis
        this.stopAnalysis();
        this.resetDashboardState();

        this.isDemoMode = true;

        // Update button appearance
        const demoBtn = document.getElementById('demoBtn');
        if (demoBtn) {
            demoBtn.textContent = '⏹ Stop Demo';
            demoBtn.classList.add('btn--danger');
            demoBtn.classList.remove('btn--primary');
        }

        // Update video overlay to show demo mode
        this.videoFeed?.setStatus('processing', 'Demo Mode Active');
        const overlay = document.getElementById('videoOverlay');
        if (overlay) {
            overlay.innerHTML = `
                <div class="video-overlay__placeholder">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <polygon points="10 8 16 12 10 16 10 8"/>
                    </svg>
                    <p style="font-size: 1.2rem; color: var(--color-accent-primary);">Demo Mode</p>
                    <p style="font-size: 0.875rem;">Simulating traffic scenarios</p>
                </div>
            `;
            overlay.classList.remove('video-overlay--hidden');
        }

        // Start generating demo data
        this.demoGenerator.start((data) => {
            this.handleAIResult(data);

            // Also update map with demo data
            this.interactiveMap?.simulateTraffic();
        }, 2500); // Update every 2.5 seconds

        this.updateConnectionStatus('connected');
        console.log('🎮 Demo mode started - cycling through traffic scenarios');
    }

    /**
     * Stop demo mode
     */
    stopDemoMode() {
        this.isDemoMode = false;
        this.demoGenerator?.stop();

        // Update button appearance
        const demoBtn = document.getElementById('demoBtn');
        if (demoBtn) {
            demoBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Demo
            `;
            demoBtn.classList.remove('btn--danger');
            demoBtn.classList.add('btn--primary');
        }

        // Reset video overlay
        this.videoFeed?.setStatus('ready', 'Ready');
        const overlay = document.getElementById('videoOverlay');
        if (overlay) {
            overlay.innerHTML = `
                <div class="video-overlay__placeholder">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <p>Select camera or upload a video</p>
                </div>
            `;
        }

        this.updateConnectionStatus('ready');
        console.log('🎮 Demo mode stopped');
    }
}

// Initialize the app when DOM is ready
// Initialize the app when DOM is ready
const initApp = () => {
    if (window.traffiQ) return;
    window.traffiQ = new TraffiQApp();

    // Cleanup on page unload to prevent zombie streams
    window.addEventListener('beforeunload', () => {
        if (window.traffiQ && window.traffiQ.analyzer) {
            // We use sendBeacon or synchronous XHR if we need to notify server,
            // but here we just try to close what we can.
            // Note: Async/await doesn't work well in beforeunload,
            // but calling stop() might trigger some cleanup.
            window.traffiQ.analyzer.stop();
        }
    });
};

document.addEventListener('DOMContentLoaded', initApp);

// Also handle cases where DOMContentLoaded already fired
if (document.readyState !== 'loading') {
    initApp();
}
