import './src/style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
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
 * TraffIQ - Traffic Optimization Dashboard
 * Main application entry point
 */
class TraffIQApp {
    constructor() {
        // Setup user menu
        this.setupUserMenu();

        // Initialize properties
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

        // DEV: Auto-login if needed (for demo/review purposes)
        this.ensureAuth().then(() => {
            this.init();
        });
    }

    /**
     * Ensure user is authenticated (auto-create demo user if needed)
     */
    async ensureAuth() {
        if (authService.isLoggedIn()) return;

        console.log('🔄 Auto-creating demo user...');
        try {
            await authService.register('demo@traffiq.ai', 'demo123', 'Demo User');
            console.log('✅ Demo user created and logged in');

            // Refresh page to ensure clean state or just let init proceed?
            // Auth service register calls createSession, so we are good.
        } catch (e) {
            // Might already exist but session expired? Try login.
            try {
                await authService.login('demo@traffiq.ai', 'demo123');
                console.log('✅ Demo user logged in');
            } catch (loginErr) {
                console.error('Auth failed:', loginErr);
            }
        }
    }

    async init() {
        console.log('🚦 TraffIQ Dashboard initializing...');
        console.log('🔒 Auth status:', authService.isLoggedIn());

        // Initialize UI components first to allow user interaction
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
            onCameraSelect: (camera) => this.handleMapCameraSelect(camera),
            onAddCameraClick: (location) => this.openAddCameraModal(location)
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
        this.setupAddCameraModal();

        // Initialize Analyzer logic
        this.initializeAnalyzer();

        console.log('✅ TraffIQ Dashboard ready');
        console.log('⌨️  Keyboard shortcuts: D=Demo, C=Camera, E=Export, M=Mute, ?=Help');
    }

    /**
     * Setup Add Camera Modal Listeners
     */
    setupAddCameraModal() {
        const modal = document.getElementById('addCameraModal');
        const cancelBtn = document.getElementById('cancelAddCamera');
        const confirmBtn = document.getElementById('confirmAddCamera');
        const uploadBtn = document.getElementById('sourceTypeUpload');
        const urlBtn = document.getElementById('sourceTypeUrl');
        const uploadContainer = document.getElementById('uploadInputContainer');
        const urlContainer = document.getElementById('urlInputContainer');

        if (!modal) return;

        // Toggle Source Type
        uploadBtn?.addEventListener('click', () => {
            uploadBtn.classList.add('btn--active');
            uploadBtn.classList.remove('btn--ghost');
            urlBtn.classList.remove('btn--active');
            urlBtn.classList.add('btn--ghost');
            uploadContainer.style.display = 'block';
            urlContainer.style.display = 'none';
            this.addCameraSourceType = 'file';
        });

        urlBtn?.addEventListener('click', () => {
            urlBtn.classList.add('btn--active');
            urlBtn.classList.remove('btn--ghost');
            uploadBtn.classList.remove('btn--active');
            uploadBtn.classList.add('btn--ghost');
            uploadContainer.style.display = 'none';
            urlContainer.style.display = 'block';
            this.addCameraSourceType = 'url';
        });

        // Cancel
        cancelBtn?.addEventListener('click', () => {
            modal.classList.remove('modal--open');
            this.pendingCameraLocation = null;
        });

        // Confirm
        confirmBtn?.addEventListener('click', () => {
            this.confirmAddCamera();
        });

        // Backdrop close
        modal.querySelector('.modal__backdrop')?.addEventListener('click', () => {
            modal.classList.remove('modal--open');
            this.pendingCameraLocation = null;
        });
    }

    /**
     * Open Add Camera Modal
     */
    openAddCameraModal(location) {
        this.pendingCameraLocation = location;
        const modal = document.getElementById('addCameraModal');
        if (modal) {
            modal.classList.add('modal--open');
            document.getElementById('newCameraName').value = '';
            document.getElementById('newCameraUrl').value = '';
            document.getElementById('newCameraFile').value = '';
            this.addCameraSourceType = 'file'; // Default

            // Reset UI to file upload
            document.getElementById('sourceTypeUpload').click();

            // Focus name input
            setTimeout(() => document.getElementById('newCameraName').focus(), 100);
        }
    }

    /**
     * Confirm adding a camera
     */
    async confirmAddCamera() {
        if (!this.pendingCameraLocation) return;

        const nameInput = document.getElementById('newCameraName');
        const name = nameInput.value.trim() || 'New Camera';

        // Create the camera
        const camera = this.interactiveMap.addNewCamera(
            this.pendingCameraLocation.lat,
            this.pendingCameraLocation.lng,
            name
        );

        // Close modal
        document.getElementById('addCameraModal').classList.remove('modal--open');
        this.pendingCameraLocation = null;

        // Process footage if provided
        if (this.addCameraSourceType === 'file') {
            const fileInput = document.getElementById('newCameraFile');
            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                await this.startVideoAnalysis(file);
            }
        } else {
            const urlInput = document.getElementById('newCameraUrl');
            const url = urlInput.value.trim();
            if (url) {
                this.handleStreamSelect(url, camera.id);
            }
        }
    }

    /**
     * Initialize the traffic analyzer logic
     */
    initializeAnalyzer() {
        // Initialize AI analyzer with empty params
        this.analyzer = new TrafficAnalyzer({
            apiKey: '', // Start empty
            onResult: (data) => this.handleAIResult(data),
            onError: (error) => this.handleError(error),
            onStatusChange: (status) => this.updateConnectionStatus(status)
        });

        // Priority 1: Check User Profile (Account Settings)
        const user = authService.getCurrentUser();
        if (user && user.settings && user.settings.apiKey) {
            console.log('🔑 API Key used from User Profile');
            this.analyzer.setApiKey(user.settings.apiKey);
            this.updateConnectionStatus('ready');
            return;
        }

        // Priority 2: Check LocalStorage (Legacy/Device specific)
        const savedKey = this.analyzer.getSavedApiKey();
        if (savedKey) {
            console.log('🔑 API Key used from LocalStorage');
            this.analyzer.setApiKey(savedKey);
            // Also migrate to profile if logged in
            if (user) {
                authService.updateProfile({ settings: { apiKey: savedKey } });
            }
            this.updateConnectionStatus('ready');
        }
        // Priority 3: Check Environment Variable (Developer/Deployment default)
        else if (import.meta.env.VITE_OVERSHOOT_API_KEY) {
            console.log('🔑 API Key used from Environment');
            this.analyzer.setApiKey(import.meta.env.VITE_OVERSHOOT_API_KEY);
            this.updateConnectionStatus('ready');
        }
        else {
            // Fallback for user: use provided key if env fails
            const fallbackKey = 'ovs_ad7c46804b149f5a6f169e8b59986328';
            console.log('🔑 Using fallback API Key (Env missing)');
            this.analyzer.setApiKey(fallbackKey);
            this.updateConnectionStatus('ready');
        }
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


        const userNameSpan = document.createElement('span');
        userNameSpan.className = 'user-menu__name';
        userNameSpan.textContent = user.name;

        const userAvatarDiv = document.createElement('div');
        userAvatarDiv.className = 'user-menu__avatar';
        userAvatarDiv.textContent = user.name.charAt(0).toUpperCase();

        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'btn btn--ghost btn--sm';
        logoutBtn.id = 'logoutBtn';
        logoutBtn.textContent = 'Logout';

        userMenu.appendChild(userNameSpan);
        userMenu.appendChild(userAvatarDiv);
        userMenu.appendChild(logoutBtn);

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

        // Record speed data if available
        if (data.avg_speed_kmh) {
            dataStore.recordSpeed(data.avg_speed_kmh);
        }

        // Record emergency vehicle events
        if (data.emergency_vehicles && data.emergency_vehicles.length > 0) {
            data.emergency_vehicles.forEach(ev => {
                dataStore.recordEmergencyEvent(ev.type, ev.lane_id, ev.direction);
            });
        }

        // Record alerts to DataStore
        if (data.alerts && data.alerts.length > 0) {
            data.alerts.forEach(alert => {
                const alertMsg = typeof alert === 'string' ? alert : (alert.message || alert.type || 'Alert');
                dataStore.recordIncident(typeof alert === 'object' ? (alert.type || 'alert') : 'alert', alertMsg);
            });
            // Play audio alerts for critical events
            this.audioAlerts?.processAlerts(data.alerts);
        }

        // Record recommendations to DataStore
        if (data.optimization_suggestions && data.optimization_suggestions.length > 0) {
            data.optimization_suggestions.forEach(rec => {
                dataStore.recordRecommendation(rec);
            });

            // Calculate CO2 savings based on reduced idling time
            // Idling emission rates (kg CO2/minute) based on EPA/DOE research:
            // - Car: ~0.016 kg/min (avg passenger vehicle)
            // - Truck: ~0.040 kg/min (heavy-duty diesel)
            // - Bus: ~0.035 kg/min (transit bus)
            // - Motorcycle: ~0.008 kg/min (lower displacement)
            const IDLING_RATES = {
                car: 0.016,
                truck: 0.040,
                bus: 0.035,
                motorcycle: 0.008
            };

            // Each optimization suggestion reduces avg wait time by ~0.3-0.5 min per vehicle
            // Use conservative estimate of 0.3 min saved per suggestion
            const timeSavedPerVehicle = data.optimization_suggestions.length * 0.3;
            
            // Calculate weighted CO2 savings based on vehicle mix
            const co2Saved = timeSavedPerVehicle * (
                (trafficData.car || 0) * IDLING_RATES.car +
                (trafficData.truck || 0) * IDLING_RATES.truck +
                (trafficData.bus || 0) * IDLING_RATES.bus +
                (trafficData.motorcycle || 0) * IDLING_RATES.motorcycle
            );

            // Total time saved (aggregate across all vehicles, in minutes)
            const totalVehicles = (trafficData.car || 0) + (trafficData.truck || 0) + 
                                  (trafficData.bus || 0) + (trafficData.motorcycle || 0);
            const timeSaved = timeSavedPerVehicle * totalVehicles;

            dataStore.recordSavings(timeSaved, co2Saved);
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

        // Handle API Key errors specifically
        const errorMsg = (error.message || '').toString().toLowerCase();
        if (errorMsg.includes('unauthorized') || errorMsg.includes('api key') || errorMsg.includes('401')) {
            console.log('🔒 Auth error detected, checking env...');
            // this.openApiKeyModal(); // Disabled per user request
            // If env key failed, maybe just log it?
            this.updateConnectionStatus('error');
            this.videoFeed?.setStatus('error', 'Auth Failed. Check .env or Console.');
            return;
        }

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
     * Remove a camera from the map
     */
    removeCamera(id) {
        if (this.interactiveMap) {
            this.interactiveMap.removeCamera(id);
            console.log('🗑️ Camera removed:', id);
        }
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
    window.traffiQ = new TraffIQApp();

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
