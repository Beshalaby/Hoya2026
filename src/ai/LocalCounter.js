/**
 * LocalCounter Component
 * Uses TensorFlow.js and Coco-SSD for efficient client-side vehicle counting
 */
import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export class LocalCounter {
    constructor() {
        this.model = null;
        this.isLoaded = false;
        this.isDetecting = false;
        this.videoElement = null;
        this.onCountUpdate = null; // Callback
        this.detectionInterval = null;
        this.classesOfInterest = ['car', 'bus', 'truck', 'motorcycle'];
        this.history = [];
        this.prevFrameData = null;

        // Tracking State
        this.tracks = []; // [{ id, bbox, class, age, missingFrames, counted }]
        this.nextTrackId = 1;
        this.cumulativeCounts = { car: 0, bus: 0, truck: 0, motorcycle: 0 };
    }

    /**
     * Load the Coco-SSD model
     */
    async load() {
        if (this.isLoaded) return;

        try {
            console.log('🧠 Loading local AI model (Coco-SSD)...');
            // Upgrade to mobilenet_v2 for better accuracy in complex conditions (snow/rain)
            this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
            this.isLoaded = true;
            console.log('✅ Local AI model loaded (mobilenet_v2)');
        } catch (e) {
            console.error('Failed to load local AI:', e);
            throw e;
        }
    }

    /**
     * Attach to a video element and start counting
     */
    start(videoElement, onCountUpdateCallback) {
        if (!this.isLoaded) {
            console.warn('Model not loaded yet, calling load()');
            this.load().then(() => this.start(videoElement, onCountUpdateCallback));
            return;
        }

        this.videoElement = videoElement;
        this.onCountUpdate = onCountUpdateCallback;
        this.isDetecting = true;

        console.log('▶️ Starting local detection loop');
        this.loop();
    }

    async loop() {
        if (!this.isDetecting || !this.videoElement) return;

        // Ensure video is ready (HAVE_CURRENT_DATA or better)
        if (this.videoElement.readyState >= 2) {
            try {
                // 1. Run AI Detection
                const predictions = await this.model.detect(this.videoElement);

                // 2. Check Lighting Conditions
                const lighting = this.analyzeLighting(this.videoElement);

                // 3. Process Counts (with Night Mode fallback)
                const counts = this.processPredictions(predictions, lighting);

                if (this.onCountUpdate) {
                    this.onCountUpdate(counts);
                }

                // DEBUG OVERLAY
                this.drawDebugOverlay(predictions, lighting);

            } catch (e) {
                // prediction error (e.g. context lost), ignore frame
            }
        }

        // Run next frame with delay
        if (this.isDetecting) {
            setTimeout(() => requestAnimationFrame(() => this.loop()), 200);
        }
    }

    /**
     * Analyze frame for brightness and headlight candidates
     * Optimized for High-Angle Highway View with BFS Clustering
     */
    analyzeLighting(video) {
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.width = 320;
            this.canvas.height = 180;
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        }

        this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
        const { width, height } = this.canvas;
        const frame = this.ctx.getImageData(0, 0, width, height);
        const data = frame.data;

        let totalBrightness = 0;

        // Clustering Setup
        const visited = new Uint8Array(width * height);
        let blobCount = 0;

        // ROI: Skip top 40%
        const startY = Math.floor(height * 0.4);
        const endY = height;
        const roiStartIndex = startY * width * 4;

        // 1. Calculate Average Brightness & Update Motion Data (ROI ONLY)
        // sparse sampling for speed, starting from ROI
        let pixelSamples = 0;
        for (let i = roiStartIndex; i < data.length; i += 16) {
            totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
            pixelSamples++;
        }
        const avgBrightness = totalBrightness / pixelSamples;

        // 1. Time-Based Logic (Primary)
        const now = new Date();
        const hour = now.getHours();
        const isDaytime = hour >= 6 && hour < 17; // 6:00 AM to 5:00 PM

        // 2. Brightness Check (Fallback)
        // If it's explicitly daytime, FORCE Night Mode OFF.
        // Otherwise, trust the sensor (allows for dark storms or tunnel-like conditions)
        let isNight = avgBrightness < 60;

        if (isDaytime) {
            // console.debug('☀️ Daytime override active');
            isNight = false;
        }

        // 2. BFS Blob Detection with Motion Filter
        // Only run detailed analysis if it IS night (save CPU)
        if (isNight) {
            const threshold = 220; // High threshold for center of flare
            const motionThreshold = 15; // Lowered to 15 to catch subtle motion (was 30)

            // Ensure prevFrameData exists
            if (!this.prevFrameData || this.prevFrameData.length !== data.length) {
                this.prevFrameData = new Uint8ClampedArray(data);
                // First frame, no motion possible yet
                return { isNight, blobCount: 0, avg: avgBrightness };
            }

            for (let y = startY; y < endY; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x);
                    if (visited[idx]) continue;

                    const i = idx * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const luma = (r + g + b) / 3;

                    // Check Static Brightness (Blob Seed)
                    if (luma > threshold) {
                        // Found new blob candidate
                        // Trace the blob and checking for internal motion
                        const blobStats = this.floodFill(x, y, data, visited, width, height, threshold, this.prevFrameData, motionThreshold);

                        // Filter noise
                        // VALID BLOB: Size > 2 pixels (catch distant lights) AND contains ANY moving pixels
                        if (blobStats.size > 2 && blobStats.movingPixels > 0) {
                            blobCount++;
                        }
                    }
                }
            }

            // Update previous frame for next loop
            this.prevFrameData.set(data);
        }

        return {
            isNight: isNight,
            blobCount: blobCount,
            avg: avgBrightness
        };
    }

    floodFill(startX, startY, data, visited, width, height, threshold, prevFrame, motionThreshold) {
        const stack = [[startX, startY]];
        let size = 0;
        let movingPixels = 0;

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = y * width + x;

            if (x < 0 || x >= width || y < 0 || y >= height || visited[idx]) continue;

            const i = idx * 4;
            // Check brightness
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const luma = (r + g + b) / 3;

            if (luma <= threshold) continue; // Boundary

            visited[idx] = 1;
            size++;

            // Check motion for this pixel
            if (prevFrame) {
                const pR = prevFrame[i];
                const pG = prevFrame[i + 1];
                const pB = prevFrame[i + 2];
                const pLuma = (pR + pG + pB) / 3;
                if (Math.abs(luma - pLuma) > motionThreshold) {
                    movingPixels++;
                }
            }

            // Add neighbors
            stack.push([x + 1, y]);
            stack.push([x - 1, y]);
            stack.push([x, y + 1]);
            stack.push([x, y - 1]);
        }
        return { size, movingPixels };
    }


    /**
     * Estimate cars from light blobs (Clustering)
     */
    estimateFromLights(blobCount) {
        // One car can be 1 large merged flare OR 2 separate headlights.
        // Heuristic: Divide blobs by ~1.2 (mostly merged at high angle/distance)
        // If 1 blob -> 1 car. 2 blobs -> ~1-2 cars. 
        if (blobCount === 0) return 0;
        return Math.max(1, Math.round(blobCount / 1.2));
    }

    processPredictions(predictions, lighting = { isNight: false, blobCount: 0, avg: 0 }) {
        // --- 1. Filter Valid Predictions ---
        const validPredictions = predictions.filter(p =>
            this.classesOfInterest.includes(p.class) && p.score > 0.10
        );

        // --- 2. Update Tracks (Simple IoU Matcher) ---
        const updatedTracks = [];
        const unassignedPreds = [...validPredictions];

        this.tracks.forEach(track => {
            // Find best match
            let bestMatchIdx = -1;
            let bestIoU = 0;

            unassignedPreds.forEach((pred, idx) => {
                const iou = this.calculateIoU(track.bbox, pred.bbox);
                if (iou > 0.15 && iou > bestIoU && track.class === pred.class) { // Low IoU threshold for fast cars
                    bestIoU = iou;
                    bestMatchIdx = idx;
                }
            });

            if (bestMatchIdx !== -1) {
                // Matched! Update track
                const match = unassignedPreds[bestMatchIdx];
                track.bbox = match.bbox;
                track.score = match.score;
                track.age++;
                track.missingFrames = 0;
                updatedTracks.push(track);

                // Remove from unassigned
                unassignedPreds.splice(bestMatchIdx, 1);
            } else {
                // Not matched
                track.missingFrames++;
                if (track.missingFrames < 10) { // Keep track alive for a bit
                    updatedTracks.push(track);
                }
            }
        });

        // --- 3. Create New Tracks ---
        unassignedPreds.forEach(pred => {
            updatedTracks.push({
                id: this.nextTrackId++,
                bbox: pred.bbox,
                class: pred.class,
                score: pred.score,
                age: 1,
                missingFrames: 0,
                counted: false
            });
        });

        this.tracks = updatedTracks;

        // --- 4. Count Stable Tracks --> Cumulative ---
        this.tracks.forEach(track => {
            if (!track.counted && track.age >= 1) { // Count immediately (age >= 1)
                track.counted = true;
                this.cumulativeCounts[track.class] = (this.cumulativeCounts[track.class] || 0) + 1;
                console.log(`🚗 Counted new ${track.class} (ID: ${track.id})! Total: ${this.cumulativeCounts[track.class]}`);
            }
        });

        // Return CUMULATIVE counts for the dashboard
        // Also include current counts for debug if needed, but UI wants to "increment"
        return {
            ...this.cumulativeCounts,
            total: Object.values(this.cumulativeCounts).reduce((a, b) => a + b, 0),
            isNightMode: lighting.isNight,
            // Debug: Current visible
            currentVisible: updatedTracks.filter(t => t.missingFrames === 0).length
        };
    }

    calculateIoU(bbox1, bbox2) {
        const [x1, y1, w1, h1] = bbox1;
        const [x2, y2, w2, h2] = bbox2;

        const xA = Math.max(x1, x2);
        const yA = Math.max(y1, y2);
        const xB = Math.min(x1 + w1, x2 + w2);
        const yB = Math.min(y1 + h1, y2 + h2);

        const interW = Math.max(0, xB - xA);
        const interH = Math.max(0, yB - yA);

        const areaIntersect = interW * interH;
        const area1 = w1 * h1;
        const area2 = w2 * h2;

        return areaIntersect / (area1 + area2 - areaIntersect);
    }

    stop() {
        this.isDetecting = false;
        this.videoElement = null;
        // Remove overlay
        const overlay = document.getElementById('local-ai-debug-overlay');
        if (overlay) overlay.remove();
        console.log('⏹️ Local detection stopped');
    }

    /**
     * Draw debug overlay with bounding boxes
     */
    drawDebugOverlay(predictions, lighting) {
        let canvas = document.getElementById('local-ai-debug-overlay');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'local-ai-debug-overlay';
            canvas.style.position = 'absolute';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '9999';
            document.body.appendChild(canvas);
        }

        if (!this.videoElement) return;

        const rect = this.videoElement.getBoundingClientRect();

        // Sync canvas position/size with video
        if (canvas.width !== rect.width || canvas.height !== rect.height ||
            canvas.style.top !== `${rect.top}px` || canvas.style.left !== `${rect.left}px`) {
            canvas.width = rect.width;
            canvas.height = rect.height;
            canvas.style.top = `${rect.top + window.scrollY}px`;
            canvas.style.left = `${rect.left + window.scrollX}px`;
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Scale factors (video native resolution vs displayed size)
        // CocoSSD returns detection coords relative to the videoElement dimensions it processed
        // usually it matches if we passed videoElement directly, but if video is scaled via CSS, we rely on canvas matching rect.
        const scaleX = rect.width / this.videoElement.videoWidth;
        const scaleY = rect.height / this.videoElement.videoHeight;

        // Draw Predictions
        predictions.forEach(prediction => {
            // DEBUG: Draw ALL predictions, even ignored ones, but fade them out
            const isCounted = this.classesOfInterest.includes(prediction.class) && prediction.score > 0.10;
            const isIgnoredClass = !this.classesOfInterest.includes(prediction.class);

            if (isIgnoredClass) {
                ctx.strokeStyle = '#0000FF'; // BLUE: Ignored class
                ctx.fillStyle = '#0000FF';
                ctx.lineWidth = 1;
            } else if (isCounted) {
                ctx.strokeStyle = '#00FF00'; // GREEN: Counted
                ctx.fillStyle = '#00FF00';
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = '#FF0000'; // RED: Low score
                ctx.fillStyle = '#FF0000';
                ctx.lineWidth = 1;
            }

            // Show very low confidence for debugging
            if (prediction.score < 0.05) return;


            ctx.lineWidth = 2;

            // bbox: [x, y, width, height]
            // Note: If TFJS processes the video element directly, bbox is usually in video coordinate space.
            // We need to scale it to the visual rect.
            const [x, y, w, h] = prediction.bbox;

            // Sometimes TFJS returns normalized coords or scaled? 
            // Coco-SSD on video element usually returns coords relative to videoWidth/Height.
            ctx.strokeRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);

            // Label
            ctx.font = '12px Arial';
            ctx.fillText(
                `${prediction.class} (${Math.round(prediction.score * 100)}%)`,
                x * scaleX,
                (y * scaleY) > 15 ? (y * scaleY) - 5 : (y * scaleY) + 15
            );
        });

        // Info Box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, 150, 60);
        ctx.fillStyle = '#fff';
        ctx.font = '12px Monospace';
        ctx.fillText(`Mode: ${lighting.isNight ? '🌙 NIGHT' : '☀️ DAY'}`, 10, 15);
        ctx.fillText(`Avg Brightness: ${Math.round(lighting.avg)}`, 10, 30);
        ctx.fillText(`Raw Blobs: ${lighting.blobCount}`, 10, 45);
    }
}

export const localCounter = new LocalCounter();
