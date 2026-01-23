import L from 'leaflet';
import 'leaflet.heat';
import { dataStore } from '../services/DataStore.js';
import { OFFICIAL_CAMERAS } from '../config/cameras.js';

/**
 * InteractiveMap Component
 * Displays a map with camera markers and radiating heatmap
 * Supports user's actual location and custom camera placement
 */
export class InteractiveMap {
    constructor(options = {}) {
        this.container = document.getElementById('mapContainer');
        this.map = null;
        this.markers = [];
        this.heatLayer = null;
        this.heatmapEnabled = true;
        this.cameras = []; // User's camera locations
        this.selectedCameraId = null;
        this.onCameraSelect = options.onCameraSelect || null;
        this.trafficData = new Map();
        this.addCameraMode = false;
        this.userLocation = null;

        this.init();
    }

    async init() {
        if (!this.container) return;

        // Try to get user's location, fallback to default
        const defaultLocation = await this.getUserLocation();

        // Initialize map
        this.map = L.map(this.container, {
            zoomControl: true,
            scrollWheelZoom: true
        }).setView([defaultLocation.lat, defaultLocation.lng], 16);

        // Add dark-themed tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.map);

        // Add user location marker
        if (this.userLocation) {
            this.addUserLocationMarker();
        }

        // Initialize heat layer
        this.initHeatLayer();

        // Load saved cameras from DataStore
        this.loadSavedCameras();

        // Setup click to add camera
        this.setupMapClick();

        // Setup control buttons
        this.setupControls();

        // Handle map resize
        setTimeout(() => {
            this.map.invalidateSize();
        }, 100);

        console.log('🗺️ Map initialized at:', defaultLocation);
    }

    /**
     * Get user's current location
     */
    async getUserLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                console.log('Geolocation not supported');
                resolve({ lat: 40.7128, lng: -74.006 }); // NYC fallback
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    resolve(this.userLocation);
                },
                (error) => {
                    console.log('Geolocation error:', error.message);
                    resolve({ lat: 40.7128, lng: -74.006 }); // NYC fallback
                },
                { timeout: 5000, enableHighAccuracy: false }
            );
        });
    }

    /**
     * Add user's current location marker
     */
    addUserLocationMarker() {
        if (!this.userLocation) return;

        const userIcon = L.divIcon({
            className: 'user-location-marker',
            html: `
                <div class="user-marker-pulse"></div>
                <div class="user-marker-dot"></div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        L.marker([this.userLocation.lat, this.userLocation.lng], {
            icon: userIcon
        }).addTo(this.map).bindPopup('Your Location');
    }

    /**
     * Load saved cameras from DataStore and merge with official ones
     */
    loadSavedCameras() {
        // Get user saved cameras (custom added ones)
        const saved = dataStore.getSetting('cameras') || [];

        // Merge official cameras with saved ones
        // We use a Map to ensure unique IDs, preferring saved ones if they override (though unlikely for official IDs)
        const cameraMap = new Map();

        // Add official cameras first
        OFFICIAL_CAMERAS.forEach(cam => {
            cameraMap.set(cam.id, { ...cam, type: 'official' });
        });

        // Add saved cameras
        saved.forEach(cam => {
            cameraMap.set(cam.id, { ...cam, type: 'custom' });
        });

        this.cameras = Array.from(cameraMap.values());

        // Create markers for all
        this.cameras.forEach(camera => {
            this.addCameraMarker(camera, false);
            this.trafficData.set(camera.id, 0.2);
        });

        this.updateHeatmap();

        // Select first camera if exists
        if (this.cameras.length > 0) {
            this.selectCamera(this.cameras[0].id);
        }

        this.updateCameraList();
    }

    /**
     * Save cameras to DataStore
     */
    saveCameras() {
        // Only save custom cameras
        const customCameras = this.cameras.filter(c => c.type !== 'official');
        dataStore.setSetting('cameras', customCameras);
    }

    /**
     * Setup map click to add cameras
     */
    setupMapClick() {
        this.map.on('click', (e) => {
            if (this.addCameraMode) {
                this.addNewCamera(e.latlng.lat, e.latlng.lng);
                this.toggleAddCameraMode(false);
            }
        });
    }

    /**
     * Setup control buttons
     */
    setupControls() {
        // Add camera button
        const addCameraBtn = document.getElementById('addCameraBtn');
        if (addCameraBtn) {
            addCameraBtn.addEventListener('click', () => this.toggleAddCameraMode());
        }

        // Locate me button
        const locateMeBtn = document.getElementById('locateMeBtn');
        if (locateMeBtn) {
            locateMeBtn.addEventListener('click', () => this.locateUser());
        }

        // Heatmap toggle
        const toggleHeatBtn = document.getElementById('toggleHeatmapBtn');
        if (toggleHeatBtn) {
            toggleHeatBtn.addEventListener('click', () => this.toggleHeatmap());
        }
    }

    /**
     * Toggle add camera mode
     */
    toggleAddCameraMode(forceState) {
        this.addCameraMode = forceState !== undefined ? forceState : !this.addCameraMode;

        const addCameraBtn = document.getElementById('addCameraBtn');
        if (addCameraBtn) {
            if (this.addCameraMode) {
                addCameraBtn.classList.add('btn--active');
                addCameraBtn.textContent = '📍 Click Map to Place';
                this.container.style.cursor = 'crosshair';
            } else {
                addCameraBtn.classList.remove('btn--active');
                addCameraBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Add Camera
                `;
                this.container.style.cursor = '';
            }
        }
    }

    /**
     * Add a new camera at location
     */
    addNewCamera(lat, lng, name = null) {
        const id = Date.now();
        const camera = {
            id,
            name: name || `Camera ${this.cameras.length + 1}`,
            lat,
            lng,
            createdAt: new Date().toISOString()
        };

        this.cameras.push(camera);
        this.addCameraMarker(camera);
        this.trafficData.set(id, 0.2);
        this.saveCameras();
        this.updateCameraList();
        this.selectCamera(id);

        console.log(`📹 Camera added: ${camera.name} at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);

        return camera;
    }

    /**
     * Add camera marker to map
     */
    addCameraMarker(camera, animate = true) {
        const marker = L.marker([camera.lat, camera.lng], {
            icon: this.createCameraIcon('low'),
            draggable: true
        }).addTo(this.map);

        // Enable right-click to delete (only for custom cameras)
        if (camera.type !== 'official') {
            marker.on('contextmenu', () => {
                if (confirm(`Delete camera "${camera.name}"?`)) {
                    this.removeCamera(camera.id);
                }
            });
        }


        // Handle drag end
        marker.on('dragend', (e) => {
            const newPos = e.target.getLatLng();
            camera.lat = newPos.lat;
            camera.lng = newPos.lng;
            this.saveCameras();
            this.updateHeatmap();
        });

        // Handle click
        marker.on('click', () => {
            this.selectCamera(camera.id);
        });

        // Create popup
        marker.bindPopup(this.createCameraPopup(camera), {
            className: 'traffiq-popup'
        });

        this.markers.push({
            id: camera.id,
            marker,
            camera,
            congestion: 'low',
            data: null
        });

        if (animate) {
            this.updateHeatmap();
        }

        return marker;
    }

    /**
     * Create camera icon
     */
    createCameraIcon(congestion = 'low', isActive = false) {
        const colors = {
            low: '#10b981',
            medium: '#f59e0b',
            high: '#ef4444'
        };

        const color = isActive ? '#a855f7' : (colors[congestion] || colors.low);
        const size = isActive ? 36 : 30;

        return L.divIcon({
            className: `camera-marker ${isActive ? 'camera-marker--active' : ''}`,
            html: `
                <div class="marker-pin" style="background: ${color}; box-shadow: 0 0 ${isActive ? 20 : 10}px ${color}80;">
                    <svg width="${isActive ? 18 : 14}" height="${isActive ? 18 : 14}" viewBox="0 0 24 24" fill="white">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                    </svg>
                </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            popupAnchor: [0, -size / 2]
        });
    }

    /**
     * Create camera popup content
     */
    createCameraPopup(camera, data = null) {
        const congestion = data?.congestion || 'No data';
        const vehicles = data?.totalVehicles || 0;
        return `
            <div class="popup-content">
                <h3>${camera.name}</h3>
                <div class="popup-stats">
                    <div class="popup-stat">
                        <span class="popup-stat__label">Status</span>
                        <span class="popup-stat__value popup-stat__value--${congestion}">${congestion}</span>
                    </div>
                    <div class="popup-stat">
                        <span class="popup-stat__label">Vehicles</span>
                        <span class="popup-stat__value">${vehicles}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button class="popup-btn" onclick="window.traffiQ?.selectCamera('${camera.id}')">
                        Select
                    </button>
                    ${camera.type !== 'official' ? `
                    <button class="popup-btn" style="background: var(--color-danger);" onclick="window.traffiQ?.removeCamera('${camera.id}')">
                        Delete
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Remove a camera
     */
    removeCamera(cameraId) {
        const markerData = this.markers.find(m => m.id === cameraId);
        if (markerData) {
            this.map.removeLayer(markerData.marker);
            this.markers = this.markers.filter(m => m.id !== cameraId);
        }

        this.cameras = this.cameras.filter(c => c.id !== cameraId);
        this.trafficData.delete(cameraId);
        this.saveCameras();
        this.updateCameraList();
        this.updateHeatmap();

        // Select another camera if available
        if (this.selectedCameraId === cameraId && this.cameras.length > 0) {
            this.selectCamera(this.cameras[0].id);
        } else if (this.cameras.length === 0) {
            this.selectedCameraId = null;
            this.updateActiveCameraUI(null);
        }

        console.log(`🗑️ Camera removed: ${cameraId}`);
    }

    /**
     * Select a camera
     */
    selectCamera(cameraId) {
        if (this.selectedCameraId === cameraId) return;
        this.selectedCameraId = cameraId;
        // Alias for compatibility
        this.selectedIntersectionId = cameraId;

        // Update marker icons
        this.markers.forEach(markerData => {
            const isActive = markerData.id === cameraId;
            markerData.marker.setIcon(this.createCameraIcon(markerData.congestion, isActive));
        });

        const camera = this.cameras.find(c => c.id === cameraId);
        if (camera) {
            this.updateActiveCameraUI(camera);
            this.map.setView([camera.lat, camera.lng], 17);
        }

        if (this.onCameraSelect) {
            this.onCameraSelect(camera);
        }
    }

    /**
     * Update active camera UI elements
     */
    updateActiveCameraUI(camera) {
        const nameEl = document.getElementById('activeIntersectionName');
        if (nameEl) nameEl.textContent = camera?.name || 'No camera selected';

        const cameraNameEl = document.getElementById('cameraLocationName');
        if (cameraNameEl) cameraNameEl.textContent = camera?.name || 'No camera';

        const cameraBadge = document.getElementById('videoCameraBadge');
        if (cameraBadge) cameraBadge.style.display = camera ? 'inline-flex' : 'none';
    }

    /**
     * Update camera list UI
     */
    updateCameraList() {
        const listEl = document.getElementById('cameraList');
        if (!listEl) return;

        if (this.cameras.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <p>No cameras added yet</p>
                    <small>Click "Add Camera" then click the map</small>
                </div>
            `;
            return;
        }

        listEl.innerHTML = this.cameras.map(cam => `
            <div class="camera-list-item ${cam.id === this.selectedCameraId ? 'camera-list-item--active' : ''}"
                 onclick="window.traffiQ?.interactiveMap?.selectCamera('${cam.id}')">
                <span class="camera-list-item__name">${cam.name} ${cam.type === 'official' ? '⭐' : ''}</span>
                <span class="camera-list-item__coords">${cam.lat.toFixed(4)}, ${cam.lng.toFixed(4)}</span>
            </div>
        `).join('');
    }

    /**
     * Locate user and center map
     */
    async locateUser() {
        const location = await this.getUserLocation();
        if (location) {
            this.map.setView([location.lat, location.lng], 17);
        }
    }

    /**
     * Initialize heat layer
     */
    initHeatLayer() {
        this.heatLayer = L.heatLayer([], {
            radius: 25,
            blur: 20,
            maxZoom: 18,
            max: 1.0,
            minOpacity: 0.15,
            gradient: {
                0.0: 'rgba(16, 185, 129, 0)',
                0.2: 'rgba(16, 185, 129, 0.3)',
                0.4: 'rgba(251, 191, 36, 0.4)',
                0.6: 'rgba(249, 115, 22, 0.5)',
                0.8: 'rgba(239, 68, 68, 0.6)',
                1.0: 'rgba(220, 38, 38, 0.7)'
            }
        }).addTo(this.map);
    }

    /**
     * Update heatmap with traffic data
     */
    updateHeatmap() {
        if (!this.heatLayer) return;

        const heatPoints = [];

        this.cameras.forEach(camera => {
            const intensity = this.trafficData.get(camera.id) || 0.2;
            heatPoints.push([camera.lat, camera.lng, intensity]);

            // Spread along roads
            const spread = 0.0004;
            [[spread, 0], [-spread, 0], [0, spread], [0, -spread]].forEach(([dLat, dLng]) => {
                for (let i = 1; i <= 3; i++) {
                    const factor = i * 0.8;
                    heatPoints.push([
                        camera.lat + dLat * factor,
                        camera.lng + dLng * factor,
                        intensity * (1 - i * 0.25)
                    ]);
                }
            });
        });

        this.heatLayer.setLatLngs(heatPoints);
    }

    /**
     * Toggle heatmap visibility
     */
    toggleHeatmap() {
        this.heatmapEnabled = !this.heatmapEnabled;
        if (this.heatmapEnabled) {
            this.heatLayer.addTo(this.map);
        } else {
            this.map.removeLayer(this.heatLayer);
        }
    }

    /**
     * Update selected camera with AI data
     */
    updateActiveIntersection(data) {
        if (!this.selectedCameraId) return;

        const markerData = this.markers.find(m => m.id === this.selectedCameraId);
        if (!markerData) return;

        // Calculate congestion
        let overallCongestion = 'low';
        let congestionScore = 1;
        if (data?.lanes) {
            const scores = data.lanes.map(l => l.congestion === 'high' ? 3 : l.congestion === 'medium' ? 2 : 1);
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            congestionScore = avg;
            overallCongestion = avg >= 2.5 ? 'high' : avg >= 1.5 ? 'medium' : 'low';
        }

        const totalVehicles = data?.lanes?.reduce((sum, l) => sum + (l.vehicle_count || 0), 0) || 0;

        markerData.congestion = overallCongestion;
        markerData.data = { ...data, totalVehicles, congestion: overallCongestion };
        markerData.marker.setIcon(this.createCameraIcon(overallCongestion, true));
        markerData.marker.setPopupContent(this.createCameraPopup(markerData.camera, markerData.data));

        this.trafficData.set(this.selectedCameraId, congestionScore / 3);
        this.updateHeatmap();
    }

    /**
     * Simulate traffic for demo
     */
    simulateTraffic() {
        this.markers.forEach(markerData => {
            const levels = ['low', 'low', 'low', 'medium', 'medium', 'high'];
            const congestion = levels[Math.floor(Math.random() * levels.length)];

            const data = {
                lanes: Array(4).fill(null).map(() => ({
                    congestion,
                    vehicle_count: Math.floor(Math.random() * 20),
                    queue_length_meters: Math.floor(Math.random() * 50)
                }))
            };

            const totalVehicles = data.lanes.reduce((sum, l) => sum + l.vehicle_count, 0);
            const score = congestion === 'high' ? 3 : congestion === 'medium' ? 2 : 1;

            markerData.congestion = congestion;
            markerData.data = { ...data, totalVehicles, congestion };
            markerData.marker.setIcon(this.createCameraIcon(congestion, markerData.id === this.selectedCameraId));

            this.trafficData.set(markerData.id, score / 3);
        });

        this.updateHeatmap();
    }

    // Compatibility aliases
    focusIntersection(id) { this.selectCamera(id); }
    selectIntersection(id) { this.selectCamera(id); }
    getSelectedIntersection() { return this.cameras.find(c => c.id === this.selectedCameraId); }
    getMarkers() { return this.markers; }
    resize() { this.map?.invalidateSize(); }
}

export default InteractiveMap;
