import maplibregl from 'maplibre-gl';
import osmtogeojson from 'osmtogeojson';
import { dataStore } from '../services/DataStore.js';
import { OFFICIAL_CAMERAS } from '../config/cameras.js';

/**
 * InteractiveMap Component
 * Displays a 3D map with camera markers and radiating heatmap using MapLibre GL JS
 * Uses Overpass API for keyless 3D buildings
 */
export class InteractiveMap {
    constructor(options = {}) {
        this.container = document.getElementById('mapContainer');
        this.map = null;
        this.markers = new Map(); // Store markers by ID
        this.heatmapEnabled = true;
        this.cameras = []; // User's camera locations
        this.selectedCameraId = null;
        this.onCameraSelect = options.onCameraSelect || null;
        this.onAddCameraClick = options.onAddCameraClick || null;
        this.trafficData = new Map();
        this.addCameraMode = false;
        this.userLocation = null;
        this.userLocationMarker = null;
        this.lastFetchBounds = null;
        this.isFetchingBuildings = false;

        this.init();
    }

    async init() {
        if (!this.container) return;

        // Try to get user's location, fallback to default
        const defaultLocation = await this.getUserLocation();

        // Initialize MapLibre map with Carto Dark Matter (Raster) for premium look without API key
        this.map = new maplibregl.Map({
            container: this.container,
            style: {
                version: 8,
                sources: {
                    'carto-dark': {
                        type: 'raster',
                        tiles: [
                            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                            'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
                        ],
                        tileSize: 256,
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    }
                },
                layers: [{
                    id: 'carto-dark-layer',
                    type: 'raster',
                    source: 'carto-dark',
                    minzoom: 0,
                    maxzoom: 22
                }]
            },
            center: [defaultLocation.lng, defaultLocation.lat],
            zoom: 16,
            pitch: 45, // 3D tilt supported even on raster
            bearing: -17.6,
            antialias: true
        });

        // Wait for map to load style
        this.map.on('load', () => {
            console.log('🗺️ Map loaded');

            // Add dynamic 3D buildings layer (Overpass)
            this.add3DBuildingsLayer();

            // Initialize Heatmap Source & Layer
            this.initHeatmapLayer();

            // Add navigation controls
            this.map.addControl(new maplibregl.NavigationControl());

            // Add user location marker if available
            if (this.userLocation) {
                this.addUserLocationMarker();
            }

            // Load saved cameras
            this.loadSavedCameras();

            // Setup interactions
            this.setupMapClick();
            this.setupControls();

            // Initial building fetch
            this.fetchBuildings();
        });

        // Fetch buildings on move end
        this.map.on('moveend', () => {
            this.fetchBuildings();
        });
    }

    /**
     * Add 3D building layer setup
     */
    add3DBuildingsLayer() {
        // Add empty GeoJSON source
        this.map.addSource('osm-buildings', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        this.map.addLayer({
            'id': '3d-buildings',
            'source': 'osm-buildings',
            'type': 'fill-extrusion',
            'minzoom': 14,
            'paint': {
                'fill-extrusion-color': '#2a2a2a', // Dark theme building color
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-base': 0,
                'fill-extrusion-opacity': 0.8
            }
        });
    }

    /**
     * Fetch buildings from Overpass API
     */
    async fetchBuildings() {
        if (this.map.getZoom() < 14) return; // Too zoomed out
        if (this.isFetchingBuildings) return;

        const bounds = this.map.getBounds();
        // Check if we moved enough to warrant a refetch (optimization)
        if (this.lastFetchBounds &&
            bounds.contains(this.lastFetchBounds.getNorthEast()) &&
            bounds.contains(this.lastFetchBounds.getSouthWest())) {
            return;
        }

        this.isFetchingBuildings = true;
        // Expand bounds slightly to avoid popping at edges
        const s = bounds.getSouth() - 0.002;
        const w = bounds.getWest() - 0.002;
        const n = bounds.getNorth() + 0.002;
        const e = bounds.getEast() + 0.002;

        const query = `
            [out:json][timeout:25];
            (
              way["building"](${s},${w},${n},${e});
              relation["building"](${s},${w},${n},${e});
            );
            out body;
            >;
            out skel qt;
        `;

        try {
            console.log('🏗️ Fetching 3D buildings...');
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: query
            });

            if (!response.ok) throw new Error('Overpass API error');

            const data = await response.json();
            const geojson = osmtogeojson(data);

            // Process features to ensure height
            geojson.features.forEach(f => {
                // If height is missing, generate a random one based on 'levels' or just random
                if (!f.properties.height) {
                    if (f.properties['building:levels']) {
                        f.properties.height = parseInt(f.properties['building:levels']) * 3.5;
                    } else {
                        // Random height between 8m and 30m for visual effect
                        // Use ID to make it deterministic (consistent across reloads/fetches)
                        const idNum = parseInt((f.id + '').replace(/\D/g, '')) || 100;
                        f.properties.height = 8 + (idNum % 22);
                    }
                }
            });

            if (this.map && this.map.getSource('osm-buildings')) {
                this.map.getSource('osm-buildings').setData(geojson);
            }

            this.lastFetchBounds = bounds;

        } catch (err) {
            console.warn('Failed to fetch buildings:', err);
        } finally {
            this.isFetchingBuildings = false;
        }
    }

    /**
     * Initialize heatmap source and layer
     */
    initHeatmapLayer() {
        this.map.addSource('traffic-heat', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        this.map.addLayer({
            id: 'traffic-heatmap',
            type: 'heatmap',
            source: 'traffic-heat',
            maxzoom: 18,
            paint: {
                'heatmap-weight': [
                    'interpolate',
                    ['linear'],
                    ['get', 'intensity'],
                    0, 0,
                    1, 1
                ],
                'heatmap-intensity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    11, 1,
                    18, 3
                ],
                'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(0,0,0,0)',
                    0.2, 'rgba(16, 185, 129, 0.4)',
                    0.4, 'rgba(251, 191, 36, 0.5)',
                    0.6, 'rgba(249, 115, 22, 0.6)',
                    0.8, 'rgba(239, 68, 68, 0.7)',
                    1, 'rgba(220, 38, 38, 0.9)'
                ],
                'heatmap-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 2,
                    18, 50
                ],
                'heatmap-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    7, 1,
                    18, 0.8
                ]
            }
        });

        if (!this.heatmapEnabled) {
            this.map.setLayoutProperty('traffic-heatmap', 'visibility', 'none');
        }
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
        if (!this.userLocation || !this.map) return;

        const el = document.createElement('div');
        el.className = 'user-location-marker';
        el.innerHTML = `
            <div class="user-marker-pulse"></div>
            <div class="user-marker-dot"></div>
        `;

        this.userLocationMarker = new maplibregl.Marker({ element: el })
            .setLngLat([this.userLocation.lng, this.userLocation.lat])
            .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Your Location'))
            .addTo(this.map);
    }

    /**
     * Load saved cameras from DataStore
     */
    loadSavedCameras() {
        const saved = dataStore.getSetting('cameras') || [];
        const cameraMap = new Map();

        OFFICIAL_CAMERAS.forEach(cam => {
            cameraMap.set(cam.id, { ...cam, type: 'official' });
        });

        saved.forEach(cam => {
            cameraMap.set(cam.id, { ...cam, type: 'custom' });
        });

        this.cameras = Array.from(cameraMap.values());

        this.cameras.forEach(camera => {
            this.addCameraMarker(camera);
            this.trafficData.set(camera.id, 0.2);
        });

        this.updateHeatmap();
        this.updateCameraList();

        if (this.cameras.length > 0 && !this.selectedCameraId) {
            this.selectCamera(this.cameras[0].id);
        }
    }

    /**
     * Save cameras to DataStore
     */
    saveCameras() {
        const customCameras = this.cameras.filter(c => c.type !== 'official');
        dataStore.setSetting('cameras', customCameras);
    }

    /**
     * Setup map click to add cameras
     */
    setupMapClick() {
        this.map.on('click', (e) => {
            if (this.addCameraMode) {
                if (this.onAddCameraClick) {
                    this.onAddCameraClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
                } else {
                    this.addNewCamera(e.lngLat.lat, e.lngLat.lng);
                }
                this.toggleAddCameraMode(false);
            }
        });
    }

    /**
     * Setup control buttons
     */
    setupControls() {
        const addCameraBtn = document.getElementById('addCameraBtn');
        if (addCameraBtn) {
            addCameraBtn.addEventListener('click', () => this.toggleAddCameraMode());
        }

        const locateMeBtn = document.getElementById('locateMeBtn');
        if (locateMeBtn) {
            locateMeBtn.addEventListener('click', () => this.locateUser());
        }

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
                this.map.getCanvas().style.cursor = 'crosshair';
            } else {
                addCameraBtn.classList.remove('btn--active');
                addCameraBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Add Camera
                `;
                this.map.getCanvas().style.cursor = '';
            }
        }
    }

    /**
     * Add a new camera
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
        this.updateHeatmap();

        console.log(`📹 Camera added: ${camera.name} at ${lat}, ${lng}`);
    }

    /**
     * Add camera marker to map using custom DOM element
     */
    addCameraMarker(camera) {
        const el = document.createElement('div');
        el.className = 'camera-marker-container';
        el.innerHTML = this.getCameraIconHtml('low', false);

        const marker = new maplibregl.Marker({
            element: el,
            draggable: true
        })
            .setLngLat([camera.lng, camera.lat])
            .setPopup(new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(this.createCameraPopup(camera)))
            .addTo(this.map);

        marker.on('dragend', () => {
            const lngLat = marker.getLngLat();
            camera.lat = lngLat.lat;
            camera.lng = lngLat.lng;
            this.saveCameras();
            this.updateHeatmap();
        });

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectCamera(camera.id);
            marker.togglePopup();
        });

        if (camera.type !== 'official') {
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (confirm(`Delete camera "${camera.name}"?`)) {
                    this.removeCamera(camera.id);
                }
            });
        }

        this.markers.set(camera.id, {
            id: camera.id,
            marker,
            element: el,
            camera,
            congestion: 'low',
            data: null
        });

        return marker;
    }

    /**
     * Remove a camera
     */
    removeCamera(cameraId) {
        const markerData = this.markers.get(cameraId);
        if (markerData) {
            markerData.marker.remove();
            this.markers.delete(cameraId);
        }

        this.cameras = this.cameras.filter(c => c.id !== cameraId);
        this.trafficData.delete(cameraId);
        this.saveCameras();
        this.updateCameraList();
        this.updateHeatmap();

        if (this.selectedCameraId === cameraId) {
            if (this.cameras.length > 0) {
                this.selectCamera(this.cameras[0].id);
            } else {
                this.selectedCameraId = null;
                this.updateActiveCameraUI(null);
            }
        }
    }

    /**
     * Generate HTML for camera icon
     */
    getCameraIconHtml(congestion = 'low', isActive = false) {
        const colors = {
            low: '#10b981',
            medium: '#f59e0b',
            high: '#ef4444'
        };

        const color = isActive ? '#a855f7' : (colors[congestion] || colors.low);
        const size = isActive ? 36 : 30;
        const shadow = isActive ? `0 0 20px ${color}80` : `0 0 10px ${color}80`;

        return `
            <div class="camera-marker ${isActive ? 'camera-marker--active' : ''}" style="width: ${size}px; height: ${size}px;">
                <div class="marker-pin" style="background: ${color}; box-shadow: ${shadow}; width: 100%; height: 100%; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center;">
                    <svg width="${isActive ? 18 : 14}" height="${isActive ? 18 : 14}" viewBox="0 0 24 24" fill="white" style="transform: rotate(45deg);">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                    </svg>
                </div>
            </div>
        `;
    }

    /**
     * Create popup content
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
                    ${camera.type !== 'official' ? `
                    <button class="popup-btn" style="background: var(--color-danger);" onclick="window.trafiQ?.removeCamera('${camera.id}')">
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
    removeCamera(val) {
        const cameraId = Number(val) || val;
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
        if (this.selectedCameraId === cameraId) {
            if (this.cameras.length > 0) {
                this.selectCamera(this.cameras[0].id);
            } else {
                this.selectedCameraId = null;
                this.updateActiveCameraUI(null);
            }
        }

        console.log(`🗑️ Camera removed: ${cameraId}`);
    }
    /**
     * Select a camera
     */
    selectCamera(val) {
        const cameraId = Number(val) || val;
        if (this.selectedCameraId === cameraId) return;

        if (this.selectedCameraId) {
            const prev = this.markers.get(this.selectedCameraId);
            if (prev) {
                prev.element.innerHTML = this.getCameraIconHtml(prev.congestion, false);
                prev.marker.getElement().style.zIndex = '1';
            }
        }

        this.selectedCameraId = cameraId;
        this.selectedIntersectionId = cameraId;

        const curr = this.markers.get(cameraId);
        if (curr) {
            curr.element.innerHTML = this.getCameraIconHtml(curr.congestion, true);
            curr.marker.getElement().style.zIndex = '100';

            this.updateActiveCameraUI(curr.camera);

            this.map.flyTo({
                center: [curr.camera.lng, curr.camera.lat],
                zoom: 17,
                pitch: 60,
                bearing: -30,
                speed: 1.2
            });
        }

        if (this.onCameraSelect && curr) {
            this.onCameraSelect(curr.camera);
        }
    }

    updateActiveCameraUI(camera) {
        const nameEl = document.getElementById('activeIntersectionName');
        if (nameEl) nameEl.textContent = camera?.name || 'No camera selected';

        const cameraNameEl = document.getElementById('cameraLocationName');
        if (cameraNameEl) cameraNameEl.textContent = camera?.name || 'No camera';

        const cameraBadge = document.getElementById('videoCameraBadge');
        if (cameraBadge) cameraBadge.style.display = camera ? 'inline-flex' : 'none';
    }

    updateCameraList() {
        // Implementation from original file
    }

    /**
     * Locate user
     */
    async locateUser() {
        const location = await this.getUserLocation();
        if (location) {
            this.map.flyTo({
                center: [location.lng, location.lat],
                zoom: 16
            });
        }
    }

    /**
     * Update heatmap data source
     */
    updateHeatmap() {
        if (!this.map || !this.map.getSource('traffic-heat')) return;

        const features = [];
        this.cameras.forEach(camera => {
            const intensity = this.trafficData.get(camera.id) || 0.2;

            features.push({
                type: 'Feature',
                properties: { intensity: intensity },
                geometry: { type: 'Point', coordinates: [camera.lng, camera.lat] }
            });

            const spread = 0.0004;
            const points = [
                [spread, 0], [-spread, 0], [0, spread], [0, -spread],
                [spread * 0.7, spread * 0.7]
            ];

            points.forEach(([dLat, dLng]) => {
                features.push({
                    type: 'Feature',
                    properties: { intensity: intensity * 0.7 },
                    geometry: { type: 'Point', coordinates: [camera.lng + dLng, camera.lat + dLat] }
                });
            });
        });

        this.map.getSource('traffic-heat').setData({
            type: 'FeatureCollection',
            features: features
        });
    }

    toggleHeatmap() {
        this.heatmapEnabled = !this.heatmapEnabled;
        if (this.map && this.map.getLayer('traffic-heatmap')) {
            const visibility = this.heatmapEnabled ? 'visible' : 'none';
            this.map.setLayoutProperty('traffic-heatmap', 'visibility', visibility);
        }
    }

    /**
     * Update active intersection data from AI
     */
    updateActiveIntersection(data) {
        if (!this.selectedCameraId) return;

        const markerData = this.markers.get(this.selectedCameraId);
        if (!markerData) return;

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

        markerData.marker.setPopup(new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(this.createCameraPopup(markerData.camera, markerData.data)));

        markerData.element.innerHTML = this.getCameraIconHtml(overallCongestion, true);

        this.trafficData.set(this.selectedCameraId, congestionScore / 3);
        this.updateHeatmap();
    }

    // Aliases
    focusIntersection(id) { this.selectCamera(id); }
    selectIntersection(id) { this.selectCamera(id); }
    getSelectedIntersection() { return this.cameras.find(c => c.id === this.selectedCameraId); }
    getMarkers() { return Array.from(this.markers.values()); }
    resize() { this.map?.resize(); }
}

export default InteractiveMap;
