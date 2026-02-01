import Hls from 'hls.js';
import { OFFICIAL_CAMERAS } from '../config/cameras.js';
import { UIUtils } from '../utils/UIUtils.js';

/**
 * VideoFeed Component
 * Manages video feed display and source selection
 */
export class VideoFeed {
    constructor(options = {}) {
        this.container = document.getElementById('videoContainer');
        this.videoElement = document.getElementById('videoElement');
        if (this.videoElement) {
            this.videoElement.crossOrigin = 'anonymous';
        }
        this.overlay = document.getElementById('videoOverlay');
        this.status = document.getElementById('videoStatus');

        // Set initial overlay text
        if (this.overlay) {
            const p = this.overlay.querySelector('p');
            if (p) p.textContent = 'Select a camera to start traffic analysis';
        }

        this.cameraBtn = document.getElementById('cameraBtn');
        this.cameraSelect = document.getElementById('cameraSelect');
        this.uploadInput = document.getElementById('videoUpload');

        this.onCameraSelect = options.onCameraSelect || (() => { });
        this.onStreamSelect = options.onStreamSelect || (() => { });
        this.onVideoUpload = options.onVideoUpload || (() => { });

        this.init();
        this.hls = null;

        // Populate dropdown
        this.populateCameraDropdown();

        // Show initial instruction
        this.setStatus('ready', 'Select a camera to start analysis');
    }

    /**
     * Populate camera dropdown from official config
     */
    populateCameraDropdown() {
        if (!this.cameraSelect) return;

        // Clear existing options except the first "Select" if we want one, 
        // but currently it seems to hold hardcoded values.
        this.cameraSelect.innerHTML = '<option value="" disabled selected>Select a Camera...</option>';

        OFFICIAL_CAMERAS.forEach(cam => {
            const option = document.createElement('option');
            option.value = cam.id; // Use ID as value now, not URL directly
            option.textContent = cam.name;
            option.dataset.url = cam.url; // Store URL in dataset
            this.cameraSelect.appendChild(option);
        });

        // Sync custom dropdown UI
        const wrapper = this.cameraSelect.closest('.custom-select-wrapper');
        if (wrapper) {
            UIUtils.updateCustomDropdownOptions(wrapper);
            // Re-bind events for new options
            UIUtils.setupCustomDropdowns(wrapper.parentElement || document);
        }
    }

    init() {
        // Camera button click handler
        this.cameraBtn?.addEventListener('click', async () => {
            try {
                this.onCameraSelect();
            } catch (error) {
                console.error('Camera error:', error);
                this.setStatus('error', 'Camera access denied');
            }
        });

        // Video upload handler
        this.uploadInput?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) {
                this.onVideoUpload(file);
            }
        });

        // Camera select handler
        this.cameraSelect?.addEventListener('change', (e) => {
            const cameraId = e.target.value;
            const option = e.target.selectedOptions[0];
            const url = option?.dataset.url;

            if (url) {
                this.setHlsSource(url);
                // Update header text
                const badge = document.getElementById('cameraLocationName');
                if (badge) badge.textContent = option.text;

                // Notify parent with ID and URL
                this.onStreamSelect(url, cameraId);
            }
        });
    }

    /**
     * Show the video element and hide overlay
     */
    showVideo() {
        this.overlay?.classList.add('video-overlay--hidden');
    }

    /**
     * Hide the video element and show overlay
     */
    hideVideo() {
        this.overlay?.classList.remove('video-overlay--hidden');
    }

    /**
     * Set video source from file
     */
    setVideoSource(file) {
        this.destroyHls();
        if (this.videoElement && file) {
            this.videoElement.src = URL.createObjectURL(file);
            this.videoElement.load();
            this.videoElement.play().catch(e => console.error('Play error:', e));
            this.showVideo();
        }
    }

    /**
     * Set video source from stream (camera)
     */
    setStreamSource(stream) {
        this.destroyHls();
        if (this.videoElement && stream) {
            this.videoElement.srcObject = stream;
            this.showVideo();
        }
    }

    /**
     * Set video source from HLS URL
     */
    setHlsSource(url) {
        this.destroyHls();

        if (!url) return;

        if (Hls.isSupported()) {
            this.hls = new Hls({
                xhrSetup: (xhr, url) => {
                    // Rewrite all HLS requests to go through local proxy to bypass CORS
                    // This allows TF.js to read pixels from the video element
                    if (url.includes('proxy')) return;
                    // Use relative path for proxy to work in both dev and prod
                    // In dev (Vite), this is proxied to localhost:3001 via vite.config.js
                    // In prod (Express), this is handled directly by server.js
                    const proxyUrl = `/proxy?url=${encodeURIComponent(url)}`;
                    xhr.open('GET', proxyUrl, true);
                }
            });
            this.hls.loadSource(url);
            this.hls.attachMedia(this.videoElement);

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this.videoElement.play().catch(e => console.error('Play error:', e));
                this.showVideo();
                this.setStatus('processing', 'Live Stream Active');
            });

            this.hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error('HLS Network error', data);
                            this.hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error('HLS Media error', data);
                            this.hls.recoverMediaError();
                            break;
                        default:
                            this.destroyHls();
                            this.setStatus('error', 'Stream Error');
                            break;
                    }
                }
            });
        } else if (this.videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            this.videoElement.src = url;
            this.videoElement.addEventListener('loadedmetadata', () => {
                this.videoElement.play();
                this.showVideo();
                this.setStatus('processing', 'Live Stream Active');
            });
        } else {
            this.setStatus('error', 'HLS Not Supported');
        }
    }

    /**
     * Clean up HLS instance
     */
    destroyHls() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
    }

    /**
     * Set the SDK's video element
     */
    setSDKVideoElement(sdkVideoElement) {
        if (sdkVideoElement && this.container) {
            // Replace our video element with the SDK's
            this.videoElement.style.display = 'none';
            sdkVideoElement.className = this.videoElement.className;
            sdkVideoElement.style.width = '100%';
            sdkVideoElement.style.height = '100%';
            sdkVideoElement.style.objectFit = 'cover';
            this.container.insertBefore(sdkVideoElement, this.overlay);
            this.showVideo();
        }
    }

    /**
     * Update status indicator
     */
    setStatus(status, text) {
        if (!this.status) return;

        this.status.classList.remove('video-status--processing', 'video-status--error');

        const indicator = this.status.querySelector('.video-status__indicator');
        const textEl = this.status.querySelector('.video-status__text');

        switch (status) {
            case 'processing':
                this.status.classList.add('video-status--processing');
                textEl.textContent = text || 'Processing...';
                // Add a spinner if not present
                if (!this.status.querySelector('.spinner')) {
                    // logic to add spinner if needed, or CSS handles it via class
                }
                break;
            case 'error':
                this.status.classList.add('video-status--error');
                textEl.textContent = text || 'Error';
                break;
            case 'live':
                this.status.classList.add('video-status--live');
                textEl.textContent = text || 'Live Feed';
                if (indicator) indicator.style.background = '#ef4444'; // Red for live
                break;
            case 'ready':
            default:
                textEl.textContent = text || 'Ready';
                break;
        }
    }

    /**
     * Get the native video element
     */
    getVideoElement() {
        return this.videoElement;
    }

    /**
     * Select a specific camera by ID programmatically
     */
    selectCamera(cameraId) {
        if (!this.cameraSelect) return;

        this.cameraSelect.value = cameraId;

        // Trigger change event to load stream
        this.cameraSelect.dispatchEvent(new Event('change'));
    }
}

export default VideoFeed;
