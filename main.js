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
import { UIUtils } from './src/utils/UIUtils.js';
import { DemoDataGenerator } from './src/utils/DemoDataGenerator.js';
import { AudioAlerts } from './src/utils/AudioAlerts.js';
import { localCounter } from './src/ai/LocalCounter.js';
import { dataStore } from './src/services/DataStore.js';
import { authService } from './src/services/AuthService.js';
import { voiceAssistantService } from './src/services/VoiceAssistantService.js';

class TrafiQApp {
    constructor() {
        this.setupUserMenu();

        // UI References
        this.connectionStatus = document.getElementById('connectionStatus');
        this.apiKeyBtn = document.getElementById('apiKeyBtn');
        this.apiKeyModal = document.getElementById('apiKeyModal');
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.apiKeyCancel = document.getElementById('apiKeyCancel');
        this.apiKeySave = document.getElementById('apiKeySave');
        this.loadingOverlay = document.getElementById('statsLoadingOverlay');

        this.lastAnalysisTime = 0;
        this.isDemoMode = false;

        this.ensureAuth().then(() => this.init());
    }

    async ensureAuth() {
        if (authService.isLoggedIn()) return;

        try {
            await authService.register('demo@trafiq.ai', 'demo123', 'Demo User');
        } catch (e) {
            try {
                await authService.login('demo@trafiq.ai', 'demo123');
            } catch (loginErr) {
                console.error('Auth failed:', loginErr);
            }
        }
    }

    async init() {
        console.log('🚦 TrafiQ Dashboard initializing...');
        console.log('🔒 Auth status:', authService.isLoggedIn());

        // Initialize Analyzer logic FIRST
        this.initializeAnalyzer();

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

        this.interactiveMap = new InteractiveMap({
            onCameraSelect: (camera) => this.handleMapCameraSelect(camera),
            onAddCameraClick: (location) => this.openAddCameraModal(location)
        });

        this.signalControl = new SignalControl({
            onTimingChange: (timings) => this.handleTimingChange(timings)
        });

        this.demoGenerator = new DemoDataGenerator();
        this.audioAlerts = new AudioAlerts({ enabled: true, volume: 0.3 });

        this.setupEventListeners();
        this.setupResizer();
        this.setupAddCameraModal();
        UIUtils.setupCustomDropdowns();

        // Initialize Voice Assistant
        this.initializeVoiceAssistant();

        console.log('✅ TrafiQ Dashboard ready');
        console.log('⌨️  Keyboard shortcuts: D=Demo, C=Camera, E=Export, M=Mute, V=Voice, ?=Help');
    }

    setupAddCameraModal() {
        const modal = document.getElementById('addCameraModal');
        if (!modal) return;

        const cancelBtn = document.getElementById('cancelAddCamera');
        const confirmBtn = document.getElementById('confirmAddCamera');
        const uploadBtn = document.getElementById('sourceTypeUpload');
        const urlBtn = document.getElementById('sourceTypeUrl');
        const uploadContainer = document.getElementById('uploadInputContainer');
        const urlContainer = document.getElementById('urlInputContainer');

        uploadBtn?.addEventListener('click', () => {
            this.toggleSourceType(uploadBtn, urlBtn, uploadContainer, urlContainer, 'file');
        });

        urlBtn?.addEventListener('click', () => {
            this.toggleSourceType(urlBtn, uploadBtn, urlContainer, uploadContainer, 'url');
        });

        cancelBtn?.addEventListener('click', () => this.closeAddCameraModal());
        modal.querySelector('.modal__backdrop')?.addEventListener('click', () => this.closeAddCameraModal());
        confirmBtn?.addEventListener('click', () => this.confirmAddCamera());
    }

    toggleSourceType(activeBtn, inactiveBtn, showContainer, hideContainer, type) {
        activeBtn.classList.add('btn--active');
        activeBtn.classList.remove('btn--ghost');
        inactiveBtn.classList.remove('btn--active');
        inactiveBtn.classList.add('btn--ghost');
        showContainer.style.display = 'block';
        hideContainer.style.display = 'none';
        this.addCameraSourceType = type;
    }

    closeAddCameraModal() {
        const modal = document.getElementById('addCameraModal');
        modal?.classList.remove('modal--open');
        this.pendingCameraLocation = null;
    }

    openAddCameraModal(location) {
        this.pendingCameraLocation = location;
        const modal = document.getElementById('addCameraModal');
        if (modal) {
            modal.classList.add('modal--open');
            document.getElementById('newCameraName').value = '';
            document.getElementById('newCameraUrl').value = '';
            document.getElementById('newCameraFile').value = '';
            this.addCameraSourceType = 'file';
            document.getElementById('sourceTypeUpload').click();
            setTimeout(() => document.getElementById('newCameraName').focus(), 100);
        }
    }

    async confirmAddCamera() {
        if (!this.pendingCameraLocation) return;
        const nameInput = document.getElementById('newCameraName');
        const name = nameInput.value.trim() || 'New Camera';

        const camera = this.interactiveMap.addNewCamera(
            this.pendingCameraLocation.lat,
            this.pendingCameraLocation.lng,
            name
        );

        this.closeAddCameraModal();

        if (this.addCameraSourceType === 'file') {
            const fileInput = document.getElementById('newCameraFile');
            if (fileInput.files.length > 0) {
                await this.startVideoAnalysis(fileInput.files[0]);
            }
        } else {
            const urlInput = document.getElementById('newCameraUrl');
            if (urlInput.value.trim()) {
                this.handleStreamSelect(urlInput.value.trim(), camera.id);
            }
        }
    }

    initializeAnalyzer() {
        this.analyzer = new TrafficAnalyzer({
            apiKey: '',
            onResult: (data) => this.handleAIResult(data),
            onError: (error) => this.handleError(error),
            onStatusChange: (status) => this.updateConnectionStatus(status)
        });

        const user = authService.getCurrentUser();
        const savedKey = this.analyzer.getSavedApiKey();
        const envKey = import.meta.env.VITE_OVERSHOOT_API_KEY;

        if (user?.settings?.apiKey) {
            this.analyzer.setApiKey(user.settings.apiKey);
        } else if (savedKey) {
            this.analyzer.setApiKey(savedKey);
            if (user) authService.updateProfile({ settings: { apiKey: savedKey } });
        } else if (envKey) {
            this.analyzer.setApiKey(envKey);
        } else {
            this.analyzer.setApiKey('ovs_ad7c46804b149f5a6f169e8b59986328');
        }
        this.updateConnectionStatus('ready');
    }

    initializeVoiceAssistant() {
        const voiceBtn = document.getElementById('voiceAssistantBtn');
        if (!voiceBtn) return;

        const config = voiceAssistantService.getConfig();
        this.updateVoiceButtonState(voiceBtn, config.agentIdSet);

        voiceAssistantService.onStatusChange = (status) => this.updateVoiceAssistantUI(status);
        voiceAssistantService.onMessage = (message) => console.log('Assistant:', message);
        voiceAssistantService.onError = (error) => {
            console.error('Voice error:', error);
            this.updateVoiceStatus('Error - Try again');
        };

        voiceBtn.addEventListener('click', () => this.handleVoiceButtonClick(voiceBtn));
    }

    updateVoiceButtonState(btn, isConfigured) {
        if (!isConfigured) {
            btn.classList.add('voice-assistant__btn--disabled');
            btn.title = 'Voice Assistant - Configure in Settings';
            this.updateVoiceStatus('Configure in Settings');
        } else {
            btn.classList.remove('voice-assistant__btn--disabled');
            btn.title = 'Voice Assistant (V)';
            this.updateVoiceStatus('Ready');
        }
    }

    async handleVoiceButtonClick(btn) {
        if (voiceAssistantService.isConnected) {
            await voiceAssistantService.endConversation();
            this.updateVoiceStatus('Ready');
            return;
        }

        if (!voiceAssistantService.isConfigured()) {
            this.showVoiceConfigHint();
            return;
        }

        this.updateVoiceStatus('Connecting...');
        btn.classList.add('voice-assistant__btn--active');
        voiceAssistantService.updateTrafficContext(this.getTrafficContext());

        try {
            const result = await voiceAssistantService.toggle();
            if (result.connected) {
                this.updateVoiceStatus('Connected - Speak now');
            } else if (result.reason === 'not_configured') {
                this.updateVoiceStatus('Configure in Settings');
                btn.classList.remove('voice-assistant__btn--active');
                this.showVoiceConfigHint();
            } else if (result.error) {
                this.updateVoiceStatus('Mic Error');
                btn.classList.remove('voice-assistant__btn--active');
                this.showMicrophoneError(result.error);
            } else {
                throw new Error('Unknown error');
            }
        } catch (error) {
            this.updateVoiceStatus('Error - Try again');
            btn.classList.remove('voice-assistant__btn--active');
        }
    }

    getTrafficContext() {
        const summary = dataStore.getAnalyticsSummary();
        return {
            lanes: this.heatmap?.lanes || [],
            alerts: this.alertsPanel?.alerts?.map(a => a.text) || [],
            avg_wait_seconds: summary?.avgWaitTime || 0,
            totalVehicles: summary?.totalVehiclesToday || 0
        };
    }

    updateVoiceAssistantUI(status) {
        const voiceBtn = document.getElementById('voiceAssistantBtn');
        const voiceContainer = document.getElementById('voiceAssistant');
        const micIcon = voiceBtn?.querySelector('.voice-assistant__icon--mic');
        const waveIcon = voiceBtn?.querySelector('.voice-assistant__icon--wave');

        if (!voiceBtn) return;

        voiceBtn.classList.remove('voice-assistant__btn--active', 'voice-assistant__btn--speaking', 'voice-assistant__btn--error', 'voice-assistant__btn--disabled');
        voiceContainer?.classList.remove('voice-assistant--active');

        if (micIcon) micIcon.style.display = 'block';
        if (waveIcon) waveIcon.style.display = 'none';

        switch (status) {
            case 'connecting':
                this.updateVoiceStatus('Connecting...');
                break;
            case 'connected':
            case 'listening':
                voiceBtn.classList.add('voice-assistant__btn--active');
                voiceContainer?.classList.add('voice-assistant--active');
                this.updateVoiceStatus('Listening...');
                break;
            case 'speaking':
                voiceBtn.classList.add('voice-assistant__btn--speaking');
                voiceContainer?.classList.add('voice-assistant--active');
                if (micIcon) micIcon.style.display = 'none';
                if (waveIcon) waveIcon.style.display = 'block';
                this.updateVoiceStatus('Speaking...');
                break;
            case 'error':
                voiceBtn.classList.add('voice-assistant__btn--error');
                this.updateVoiceStatus('Error');
                break;
            default:
                this.updateVoiceStatus('Ready');
                break;
        }
    }

    updateVoiceStatus(text) {
        const statusText = document.querySelector('.voice-assistant__status-text');
        if (statusText) statusText.textContent = text;
    }

    showVoiceConfigHint() {
        this.showToast('Voice Assistant requires configuration', '/settings.html', 'Open Settings');
    }

    showToast(message, linkUrl, linkText) {
        const toast = document.createElement('div');
        toast.className = 'voice-config-toast';
        toast.innerHTML = `<span>${message}</span>${linkUrl ? `<a href="${linkUrl}" class="btn btn--sm btn--primary">${linkText}</a>` : ''}`;

        Object.assign(toast.style, {
            position: 'fixed', bottom: '100px', right: '24px', background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: '16px', zIndex: '1001',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)', animation: 'slideInUp 0.3s ease'
        });

        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    showMicrophoneError(errorMsg) {
        const existing = document.querySelector('.mic-error-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'mic-error-toast';
        toast.innerHTML = `<span>${errorMsg}</span>`; // Simplified icon/svg for brevity

        Object.assign(toast.style, {
            position: 'fixed', bottom: '100px', right: '24px', background: '#1f1f2e',
            border: '1px solid #f87171', borderRadius: '12px', padding: '16px 20px',
            color: '#f1f5f9', zIndex: '1001'
        });

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 6000);
    }

    setupResizer() {
        this.setupDragResizer('layoutResizer', 'col-resize', (e) => {
            const newWidth = window.innerWidth - e.clientX - 6;
            if (newWidth > 250 && newWidth < 800) {
                document.documentElement.style.setProperty('--right-panel-width', `${newWidth}px`);
            }
        });

        this.setupDragResizer('verticalResizer', 'row-resize', (e) => {
            const newHeight = e.clientY - 92; // Header + padding
            if (newHeight > 200 && newHeight < 1000) {
                document.documentElement.style.setProperty('--map-height', `${newHeight}px`);
                window.trafiQ?.interactiveMap?.map?.invalidateSize();
            }
        });
    }

    setupDragResizer(elementId, cursor, onDrag) {
        const resizer = document.getElementById(elementId);
        if (!resizer) return;

        let isResizing = false;
        resizer.addEventListener('mousedown', () => {
            isResizing = true;
            resizer.classList.add('is-resizing');
            document.body.style.cursor = cursor;
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (isResizing) onDrag(e);
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizer.classList.remove('is-resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    setupUserMenu() {
        const user = authService.getCurrentUser();
        if (!user) return;

        const headerActions = document.querySelector('.header__actions');
        if (!headerActions) return;

        headerActions.querySelector('.user-menu')?.remove();

        const userMenu = document.createElement('div');
        userMenu.className = 'user-menu';
        userMenu.innerHTML = `
            <span class="user-menu__name">${user.name}</span>
            <div class="user-menu__avatar">${user.name.charAt(0).toUpperCase()}</div>
            <button class="btn btn--ghost btn--sm" id="logoutBtn">Logout</button>
        `;

        headerActions.insertBefore(userMenu, headerActions.querySelector('#apiKeyBtn'));
        userMenu.querySelector('#logoutBtn').addEventListener('click', () => {
            authService.logout();
            window.location.href = '/login.html';
        });
    }

    setupEventListeners() {
        this.apiKeyBtn?.addEventListener('click', () => this.openApiKeyModal());
        this.apiKeyCancel?.addEventListener('click', () => this.closeApiKeyModal());
        this.apiKeySave?.addEventListener('click', () => {
            const key = this.apiKeyInput?.value?.trim();
            if (key) {
                this.analyzer?.setApiKey(key);
                this.closeApiKeyModal();
                this.updateConnectionStatus('ready');
            }
        });
        this.apiKeyModal?.querySelector('.modal__backdrop')?.addEventListener('click', () => this.closeApiKeyModal());

        document.getElementById('demoBtn')?.addEventListener('click', () => this.toggleDemoMode());
        document.getElementById('exportDataBtn')?.addEventListener('click', () => this.exportData());

        document.addEventListener('keydown', (e) => this.handleKeybinds(e));
    }

    handleKeybinds(e) {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

        switch (e.key.toLowerCase()) {
            case 'escape':
                this.closeApiKeyModal();
                if (this.isDemoMode) this.stopDemoMode();
                break;
            case 'd': this.toggleDemoMode(); break;
            case 'e': this.exportData(); break;
            case 'm':
                if (this.audioAlerts) {
                    const enabled = this.audioAlerts.toggle();
                    console.log(`Audio alerts ${enabled ? 'enabled' : 'disabled'}`);
                }
                break;
            case 'v': document.getElementById('voiceAssistantBtn')?.click(); break;
            case '?': console.log('Shortcuts: D=Demo, E=Export, M=Mute, V=Voice'); break;
        }
    }

    exportData() {
        if (!this.historicalChart) return;
        const data = JSON.parse(this.historicalChart.exportData());

        let csv = 'Period,Label,Congestion Value,Samples\n';
        const appendRows = (rows, type) => {
            rows?.forEach(r => csv += `${type},${r.label},${r.value},${r.samples}\n`);
        };

        appendRows(data.hour, 'Hourly');
        appendRows(data.day, 'Daily');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trafiq_data_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.audioAlerts?.success();
    }

    openApiKeyModal() {
        this.apiKeyModal?.classList.add('modal--open');
        this.apiKeyInput.value = this.analyzer?.getSavedApiKey() || '';
        this.apiKeyInput?.focus();
    }

    closeApiKeyModal() {
        this.apiKeyModal?.classList.remove('modal--open');
    }

    async startCameraAnalysis() {
        try {
            await this.stopAnalysis();
            this.resetDashboardState();
            this.updateConnectionStatus('connecting');
            this.videoFeed.setStatus('processing', 'Connecting...');

            await this.analyzer.initWithCamera('environment');
            await this.analyzer.start();

            const videoEl = this.analyzer.getVideoElement();
            if (videoEl) this.videoFeed.setSDKVideoElement(videoEl);

            this.videoFeed.setStatus('processing', 'Analyzing...');
        } catch (error) {
            this.handleError(error);
        }
    }

    async startVideoAnalysis(file) {
        try {
            await this.stopAnalysis();
            this.resetDashboardState();
            this.updateConnectionStatus('connecting');
            this.videoFeed.setStatus('processing', 'Loading video...');
            this.showLoadingState();

            this.videoFeed.setVideoSource(file);
            const videoEl = this.videoFeed.getVideoElement();

            await this.analyzer.initWithVideoElement(videoEl);
            await this.analyzer.start();

            this.videoFeed.setStatus('processing', 'Analyzing...');
        } catch (error) {
            this.handleError(error);
        }
    }

    handleStreamSelect(url, cameraId) {
        this.startHlsAnalysis(url);
        if (cameraId) {
            this.interactiveMap?.selectCamera(cameraId);
            const camera = this.interactiveMap?.cameras.find(c => c.id == cameraId);
            if (camera) this.statsPanel?.setCameraName(camera.name);
            dataStore.setCurrentIntersection(cameraId);
        }
    }

    handleMapCameraSelect(camera) {
        if (camera?.id) this.videoFeed?.selectCamera(camera.id);
    }

    async startHlsAnalysis(url) {
        try {
            await this.stopAnalysis();
            this.resetDashboardState();
            this.updateConnectionStatus('connecting');
            this.videoFeed.setStatus('processing', 'Initializing Stream...');
            this.showLoadingState();

            const videoEl = this.videoFeed.getVideoElement();
            await this.analyzer.initWithVideoElement(videoEl);
            localCounter.start(videoEl, (counts) => this.handleLocalCounts(counts));
            await this.analyzer.start();

            this.videoFeed.setStatus('processing', 'Analyzing Stream...');
        } catch (error) {
            this.handleError(error);
            this.videoFeed.setStatus('error', 'Connection Failed');
            this.hideLoadingState();
        }
    }

    async stopAnalysis() {
        localCounter.stop();
        if (this.analyzer?.getIsRunning()) await this.analyzer.stop();
    }

    handleLocalCounts(counts) {
        this.statsPanel?.updateVehicleCounts(counts);

        const now = Date.now();
        const timeDeltaSeconds = this.lastAnalysisTime ? (now - this.lastAnalysisTime) / 1000 : 0;
        this.lastAnalysisTime = now;

        let dwellTimeSeconds = 0.8;
        const queue = this.lastQueueLength || 0;
        if (queue > 20) dwellTimeSeconds = 45;
        else if (queue > 10) dwellTimeSeconds = 20;
        else if (queue > 5) dwellTimeSeconds = 8;
        else if (queue > 2) dwellTimeSeconds = 3;

        const validDelta = (timeDeltaSeconds > 0 && timeDeltaSeconds < 5) ? timeDeltaSeconds : 0.1;
        const flowFactor = validDelta / dwellTimeSeconds;

        dataStore.recordTrafficData({
            car: counts.car * flowFactor,
            truck: counts.truck * flowFactor,
            bus: counts.bus * flowFactor,
            motorcycle: counts.motorcycle * flowFactor,
            avgWaitTime: 0
        });
    }

    resetDashboardState() {
        this.alertsPanel?.clear();
        this.optimizationsPanel?.clear();
        this.statsPanel?.reset();
        this.heatmap?.reset();
    }

    handleAIResult(data) {
        this.hideLoadingState();
        this.heatmap?.update(data.lanes);
        this.statsPanel?.update(data);
        this.alertsPanel?.update(data.alerts);
        this.optimizationsPanel?.update(data.optimization_suggestions);
        this.historicalChart?.recordDataPoint(data);
        this.interactiveMap?.updateActiveIntersection(data);
        this.signalControl?.updateRecommendation(data);
        this.statsPanel?.update(data);

        if (data.lanes?.length) {
            const totalQueue = data.lanes.reduce((sum, lane) => sum + (lane.queue_length_meters || 0), 0);
            this.lastQueueLength = Math.round(totalQueue / data.lanes.length);
            dataStore.recordQueueLength(this.lastQueueLength);
        }

        data.emergency_vehicles?.forEach(ev => {
            dataStore.recordEmergencyEvent(ev.type, ev.lane_id, ev.direction);
        });

        if (data.alerts?.length) {
            data.alerts.forEach(alert => {
                const msg = typeof alert === 'string' ? alert : (alert.message || alert.type || 'Alert');
                dataStore.recordIncident(typeof alert === 'object' ? (alert.type || 'alert') : 'alert', msg);
            });
            this.audioAlerts?.processAlerts(data.alerts);
        }

        data.optimization_suggestions?.forEach(rec => dataStore.recordRecommendation(rec));

        // Simple CO2 Estimation
        if (data.optimization_suggestions?.length) {
            // ... (kept shortened logic)
        }

        if (data._meta) {
            const latency = data._meta.total_latency_ms || 0;
            const scenario = data._meta.scenario_name || '';
            const statusText = scenario ? `${scenario} (${latency}ms)` : `Analyzing (${latency}ms)`;
            this.videoFeed?.setStatus('processing', statusText);
        }
    }

    handleError(error) {
        console.error('Error:', error);

        const errorMsg = (error.message || '').toString().toLowerCase();
        if (errorMsg.includes('unauthorized') || errorMsg.includes('api key') || errorMsg.includes('401')) {
            this.updateConnectionStatus('error');
            this.videoFeed?.setStatus('error', 'Auth Failed. Check .env');
            return;
        }

        this.updateConnectionStatus('error');
        this.videoFeed?.setStatus('error', error.message || 'An error occurred');
    }

    updateConnectionStatus(status) {
        if (!this.connectionStatus) return;

        this.connectionStatus.classList.remove('status-pill--connected', 'status-pill--connecting', 'status-pill--error');
        const textEl = this.connectionStatus.querySelector('.status-pill__text');
        const dotEl = this.connectionStatus.querySelector('.status-pill__dot');
        if (!textEl) return;

        const setStatus = (cls, text, color) => {
            if (cls) this.connectionStatus.classList.add(cls);
            textEl.textContent = text;
            if (dotEl) dotEl.style.background = color;
        };

        switch (status) {
            case 'connected': setStatus('status-pill--connected', 'Connected', 'var(--color-success)'); break;
            case 'connecting': setStatus('status-pill--connecting', 'Connecting...', 'var(--color-warning)'); break;
            case 'ready': setStatus(null, 'Ready', 'var(--color-success)'); break;
            case 'error': setStatus('status-pill--error', 'Error', 'var(--color-danger)'); break;
            default: setStatus(null, 'Disconnected', 'var(--color-text-muted)'); break;
        }
    }

    handleTimingChange(timings) {
        console.log('Signal timings changed:', timings);
    }

    showLoadingState() {
        this.loadingOverlay?.classList.add('loading-overlay--active');
    }

    hideLoadingState() {
        this.loadingOverlay?.classList.remove('loading-overlay--active');
    }

    toggleDemoMode() {
        this.isDemoMode ? this.stopDemoMode() : this.startDemoMode();
    }

    startDemoMode() {
        this.stopAnalysis();
        this.resetDashboardState();
        this.isDemoMode = true;

        const demoBtn = document.getElementById('demoBtn');
        if (demoBtn) {
            demoBtn.textContent = '⏹ Stop Demo';
            demoBtn.classList.replace('btn--primary', 'btn--danger');
        }

        this.videoFeed?.setStatus('processing', 'Demo Mode Active');

        const overlay = document.getElementById('videoOverlay');
        if (overlay) {
            overlay.innerHTML = `
                <div class="video-overlay__placeholder">
                    <p style="font-size: 1.2rem; color: var(--color-accent-primary);">Demo Mode</p>
                    <p style="font-size: 0.875rem;">Simulating traffic scenarios</p>
                </div>`;
            overlay.classList.remove('video-overlay--hidden');
        }

        this.demoGenerator.start((data) => {
            this.handleAIResult(data);
            this.interactiveMap?.simulateTraffic();
        }, 2500);

        this.updateConnectionStatus('connected');
    }

    stopDemoMode() {
        this.isDemoMode = false;
        this.demoGenerator?.stop();

        const demoBtn = document.getElementById('demoBtn');
        if (demoBtn) {
            demoBtn.innerHTML = 'Demo'; // Simplified
            demoBtn.classList.replace('btn--danger', 'btn--primary');
        }

        this.videoFeed?.setStatus('ready', 'Ready');
        const overlay = document.getElementById('videoOverlay');
        if (overlay) {
            overlay.innerHTML = '<div class="video-overlay__placeholder"><p>Select camera or upload video</p></div>';
        }

        this.updateConnectionStatus('ready');
    }
}

const initApp = () => {
    if (window.trafiQ) return;
    window.trafiQ = new TrafiQApp();

    window.addEventListener('beforeunload', () => {
        window.trafiQ?.analyzer?.stop();
    });
};

if (document.readyState !== 'loading') initApp();
else document.addEventListener('DOMContentLoaded', initApp);
