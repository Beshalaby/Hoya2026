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
    }

    /**
     * Load the Coco-SSD model
     */
    async load() {
        if (this.isLoaded) return;

        try {
            console.log('🧠 Loading local AI model (Coco-SSD)...');
            this.model = await cocoSsd.load();
            this.isLoaded = true;
            console.log('✅ Local AI model loaded');
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
        const isNight = avgBrightness < 60; // Lowered to 60 to prevent false Night Mode on cloudy days

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
        const counts = {
            car: 0,
            bus: 0,
            truck: 0,
            motorcycle: 0,
            total: 0,
            isNightMode: lighting.isNight
        };

        // Standard AI counting
        let aiTotal = 0;
        predictions.forEach(p => {
            // High Angle Optimization: Lower scoring threshold (0.25) for small distant cars
            if (this.classesOfInterest.includes(p.class) && p.score > 0.25) {
                counts[p.class] = (counts[p.class] || 0) + 1;
                aiTotal++;
            }
        });

        // Night Mode Fallback
        // If it's night AND AI sees very little, but we see lights -> Use light estimation
        if (lighting.isNight && aiTotal < 2 && lighting.blobCount > 0) {
            const estimatedCars = this.estimateFromLights(lighting.blobCount);

            // If lights indicate more cars than AI, assume AI failed due to darkness
            if (estimatedCars > aiTotal) {
                console.debug(`🌙 Night Mode: AI saw ${aiTotal}, Lights suggest ~${estimatedCars}`);
                // Add difference as 'car' (safest assumption)
                counts.car += (estimatedCars - aiTotal);
            }
        }

        // Recalculate total
        counts.total = counts.car + counts.bus + counts.truck + counts.motorcycle;

        // --- Smoothing Filter ---
        // Push raw counts to history buffer
        this.history.push(counts);
        if (this.history.length > 12) this.history.shift(); // Keep ~2 seconds buffer (at 5fps)

        // Calculate Average
        const smoothed = {
            car: 0, bus: 0, truck: 0, motorcycle: 0, total: 0,
            isNightMode: lighting.isNight
        };

        this.history.forEach(c => {
            smoothed.car += c.car;
            smoothed.bus += c.bus;
            smoothed.truck += c.truck;
            smoothed.motorcycle += c.motorcycle;
        });

        // Average (Do NOT round, keep precision for DataStore accumulation)
        const len = this.history.length;
        if (len > 0) {
            smoothed.car = smoothed.car / len;
            smoothed.bus = smoothed.bus / len;
            smoothed.truck = smoothed.truck / len;
            smoothed.motorcycle = smoothed.motorcycle / len;
            smoothed.total = smoothed.car + smoothed.bus + smoothed.truck + smoothed.motorcycle;
        }

        return smoothed;
    }

    stop() {
        this.isDetecting = false;
        this.videoElement = null;
        console.log('⏹️ Local detection stopped');
    }
}

export const localCounter = new LocalCounter();
