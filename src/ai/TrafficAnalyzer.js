import { RealtimeVision } from '@overshoot/sdk';
import Hls from 'hls.js';

/**
 * Traffic analysis prompt for the AI model
 * Simple and focused for reliable inference
 */
const LANE_DISCOVERY_PROMPT = `Analyze traffic video. Identify all traffic lanes.
IMPORTANT: Check road markings and visible movement to determine ACCURATE direction.
If a median exists, lanes on opposite sides MUST have opposite directions (e.g. Northbound vs Southbound).
Output JSON:
- lanes: [{lane_id, direction (e.g. "Northbound", "Southbound", "Turning"), type (e.g. "car", "bus-only")}]
- summary: "brief description of road layout"
JSON only.`;

const MONITORING_SCHEMA = {
  type: 'object',
  properties: {
    lanes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lane_id: { type: 'number' },
          // direction is known context, not needed in output
          vehicle_count: { type: 'number' },
          cars: { type: 'number' },
          trucks: { type: 'number' },
          buses: { type: 'number' },
          motorcycles: { type: 'number' },
          congestion: { type: 'string', enum: ['low', 'medium', 'high'] }
        }
      }
    },
    pedestrians: { type: 'number' },
    avg_wait_seconds: { type: 'number' },
    alerts: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    recommendations: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    engineering_suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['light', 'lane', 'sign', 'other'] },
          location: { type: 'string' },
          description: { type: 'string' },
          co2_impact: { type: 'string', enum: ['low', 'medium', 'high'] }
        }
      },
      maxItems: 2
    }
  }
};

// Simplified prompt to avoid token limits with many lanes
const generateMonitoringPrompt = (lanes) => {
  // Condense lane context: "1(N), 2(S)..."
  const laneContext = lanes.map(l => {
    const dir = l.direction ? l.direction.charAt(0) : '?';
    return `${l.lane_id}(${dir})`;
  }).join(', ');

  return `Analyze traffic.
Context: Lanes ${laneContext}

Identify TRAFFIC ENGINEERING improvements to reduce CO2 (e.g., adding lights, lanes, signs).
Output JSON:
- lanes: [{lane_id, vehicle_count, cars, trucks, buses, motorcycles, congestion}]
- pedestrians: number
- avg_wait_seconds: number
- alerts: [string]
- recommendations: [string] (immediate actions)
- engineering_suggestions: [{type, location, description, co2_impact}] (structural changes)
JSON only.`;
};

/**
 * TrafficAnalyzer class - Manages overshoot.ai integration for traffic analysis
 */
export class TrafficAnalyzer {
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.apiUrl = options.apiUrl || 'https://cluster1.overshoot.ai/api/v0.2';
    this.vision = null;
    this.isRunning = false;
    this.isStarting = false;
    this.onResult = options.onResult || (() => { });
    this.onError = options.onError || console.error;
    this.onStatusChange = options.onStatusChange || (() => { });
    this.phase = 'discovery'; // 'discovery' | 'monitoring'
    this.discoveredLanes = [];
    this.sourceConfig = null; // Store source config for restarts
  }

  /**
   * Set the API key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    // Save to localStorage for persistence
    if (apiKey) {
      localStorage.setItem('trafiq_api_key', apiKey);
    }
  }

  /**
   * Get saved API key from localStorage
   */
  getSavedApiKey() {
    return localStorage.getItem('trafiq_api_key') || '';
  }

  /**
   * Initialize the RealtimeVision instance with camera source
   */
  /**
   * Initialize the RealtimeVision instance with camera source
   */
  async initWithCamera(cameraFacing = 'environment') {
    if (!this.apiKey) {
      throw new Error('API key is required');
    }

    // Reset phase
    this.phase = 'discovery';
    this.discoveredLanes = [];

    // Store config for restarts
    this.sourceConfig = { type: 'camera', cameraFacing };

    try {
      // Manually acquire stream to support seamless switching
      this.cleanupPreviousSession(); // Clean up any previous stream

      console.log('📷 Acquiring camera stream...');
      this.customStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      this.vision = new RealtimeVision({
        apiUrl: this.apiUrl,
        apiKey: this.apiKey,
        prompt: LANE_DISCOVERY_PROMPT,
        source: {
          type: 'camera',
          cameraFacing: cameraFacing
        },
        processing: {
          clip_length_seconds: 2,
          delay_seconds: 1,
          fps: 15,
          sampling_ratio: 0.15
        },
        onResult: (result) => this.handleResult(result)
      });

      return this.vision;
    } catch (e) {
      console.error('Failed to init camera:', e);
      throw e;
    }
  }

  /**
   * Initialize the RealtimeVision instance with video file
   */
  /**
   * Initialize the RealtimeVision instance with video file
   */
  initWithVideoFile(file) {
    console.log('📹 Initializing with video file:', file?.name || file);
    if (!this.apiKey) {
      throw new Error('API key is required');
    }

    this.phase = 'discovery';
    this.discoveredLanes = [];
    this.sourceConfig = { type: 'video', file };

    this.vision = new RealtimeVision({
      apiUrl: this.apiUrl,
      apiKey: this.apiKey,
      prompt: LANE_DISCOVERY_PROMPT,
      source: {
        type: 'video',
        file: file
      },
      processing: {
        clip_length_seconds: 2,
        delay_seconds: 1,
        fps: 15,
        sampling_ratio: 0.15
      },
      onResult: (result) => this.handleResult(result)
    });

    return this.vision;
  }

  /**
   * Initialize with an existing HTMLVideoElement (e.g. from VideoFeed)
   * Captures stream from the element without creating a new HLS instance
   */
  async initWithVideoElement(videoElement) {
    this.phase = 'discovery';
    this.discoveredLanes = [];

    if (!this.apiKey) {
      throw new Error('API key is required');
    }

    if (!videoElement) {
      throw new Error('Video element is required');
    }

    // Cleanup previous internal streams
    this.cleanupPreviousSession();

    // Store reference (but don't delete it on cleanup!)
    this.externalVideoElement = videoElement;

    // Capture stream
    // Ensure video is playing and has data before capturing
    try {
      if (videoElement.readyState < 3) { // HAVE_FUTURE_DATA
        console.log('⏳ Waiting for video to have data...');
        await new Promise((resolve) => {
          const onCanPlay = () => {
            videoElement.removeEventListener('canplay', onCanPlay);
            resolve();
          };
          videoElement.addEventListener('canplay', onCanPlay);
          // Fallback timeout
          setTimeout(resolve, 5000);
        });
      }

      // 15 FPS is sufficient for analysis
      this.customStream = videoElement.captureStream(15);

      // Verify tracks
      if (this.customStream.getVideoTracks().length === 0) {
        console.warn('⚠️ Capture stream has no video tracks! Waiting for playing...');
        // Sometimes captureStream needs the video to actually be advancing
        if (videoElement.paused) {
          try { await videoElement.play(); } catch (e) { }
        }

        // Check again after a short delay
        await new Promise(r => setTimeout(r, 500));
        if (this.customStream.getVideoTracks().length === 0) {
          throw new Error('Stream capture failed: No video tracks available');
        }
      }

      console.log('✅ Captured stream from external video element:', this.customStream);
    } catch (e) {
      console.error('Failed to capture stream from video element:', e);
      throw new Error('Could not capture stream: ' + e.message);
    }

    // Initialize Vision
    this.sourceConfig = { type: 'camera', cameraFacing: 'environment' };

    this.vision = new RealtimeVision({
      apiUrl: this.apiUrl,
      apiKey: this.apiKey,
      prompt: LANE_DISCOVERY_PROMPT,
      source: this.sourceConfig,
      processing: {
        clip_length_seconds: 2,
        delay_seconds: 1,
        fps: 10,
        sampling_ratio: 0.15
      },
      onResult: (result) => this.handleResult(result)
    });

    return this.vision;
  }

  cleanupPreviousSession() {
    // If we created a hidden HLS video element, clean it up
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.internalVideoElement) {
      this.internalVideoElement.remove();
      this.internalVideoElement = null;
    }

    // We do NOT remove externalVideoElement, as we don't own it
    this.externalVideoElement = null;

    if (this.customStream) {
      this.customStream.getTracks().forEach(track => track.stop());
      this.customStream = null;
    }
  }

  /**
   * Handle AI result from overshoot
   */
  handleResult(result) {
    // Extensive logging for debugging monitoring phase
    if (this.phase === 'monitoring') {
      console.log('📡 [Monitoring] Raw result:', result);
    }

    // Check for API errors first (timeout, auth, etc.)
    if (result?.error) {
      const errorMsg = result.error.toLowerCase();
      // Handle timeout gracefully - SDK will continue with next frame
      if (errorMsg.includes('timeout')) {
        console.warn('⏱️ API timeout - waiting for next frame...');
        return; // Don't treat as fatal, just skip this frame
      }
      console.warn('⚠️ Overshoot API error:', result.error);
      this.onError(new Error(`API error: ${result.error}`));
      return;
    }

    try {
      let data = result?.result;

      // Check if result.result is missing or empty
      if (data === undefined || data === null) {
        console.warn('⚠️ result.result is undefined or null, skipping');
        return;
      }

      // Parse JSON if it's a string
      if (typeof data === 'string') {
        // Check for empty or incomplete JSON
        if (!data.trim() || data.trim() === '') {
          if (this.phase === 'monitoring') console.warn('⚠️ Empty string result in monitoring');
          return;
        }

        // Clean markdown formatting if present
        data = data.replace(/```json\n?|```/g, '').trim();

        // console.log('🔄 Parsing JSON string:', data.substring(0, 50)); 
        data = JSON.parse(data);
      }

      // Check phase and handle transitions
      if (this.phase === 'discovery') {
        if (data && Array.isArray(data.lanes) && data.lanes.length > 0) {
          console.log('🎯 Discovery success! Found lanes:', data.lanes.length);
          this.phase = 'monitoring';
          this.discoveredLanes = data.lanes;

          this.onStatusChange('configuring');

          // Emit discovery data so UI updates immediately
          const discoveryData = this.normalizeData(data);
          discoveryData._meta = {
            timestamp: new Date().toISOString(),
            inference_latency_ms: result.inference_latency_ms,
            total_latency_ms: result.total_latency_ms,
            scenario_name: 'Discovery'
          };
          this.onResult(discoveryData);

          this.switchToMonitoring(data.lanes);
          return;
        } else {
          console.log('🔍 Still discovering lanes...');
          return;
        }
      }

      // Monitoring Phase processing
      // Check if data actually has our expected fields
      if (!data.lanes && !data.vehicle_count) {
        console.warn('⚠️ Monitoring result missing structure:', data);
      }

      // Normalize the data structure
      const normalizedData = this.normalizeData(data);

      // Add metadata
      normalizedData._meta = {
        timestamp: new Date().toISOString(),
        inference_latency_ms: result.inference_latency_ms,
        total_latency_ms: result.total_latency_ms,
        scenario_name: 'Monitoring'
      };

      this.onResult(normalizedData);
    } catch (error) {
      console.error('Error parsing result:', error);
      console.error('Problematic result.result:', result?.result);
      this.onError(error);
    }
  }

  /**
   * Normalize data to ensure consistent structure
   */
  normalizeData(data) {
    console.log('🔧 Normalizing data, input:', data);

    // If no lanes provided or empty, create one default lane
    const rawLanes = (data.lanes && Array.isArray(data.lanes) && data.lanes.length > 0)
      ? data.lanes
      : [{ lane_id: 1 }];

    const normalizedLanes = rawLanes.map((lane, index) => {
      // Try to find matching discovered lane for context
      const laneId = lane.lane_id || (index + 1);
      const knownLane = this.discoveredLanes.find(l => l.lane_id === laneId);

      return {
        lane_id: laneId,
        direction: knownLane?.direction || lane.direction || 'Unknown',
        vehicle_count: lane.vehicle_count || 0,
        vehicle_types: {
          // Support both flat fields (cars) and nested (vehicle_types.car)
          car: lane.cars || lane.vehicle_types?.car || 0,
          truck: lane.trucks || lane.vehicle_types?.truck || 0,
          bus: lane.buses || lane.vehicle_types?.bus || 0,
          motorcycle: lane.motorcycles || lane.vehicle_types?.motorcycle || 0
        },
        queue_length_meters: lane.queue_length_meters || 0,
        congestion: lane.congestion || 'low'
      };
    });

    console.log('🔧 Normalized lanes:', normalizedLanes);

    return {
      lanes: normalizedLanes,
      pedestrians: data.pedestrians || 0,
      avg_wait_seconds: data.avg_wait_seconds || 0,
      predicted_wait_seconds: {},
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
      optimization_suggestions: Array.isArray(data.recommendations) ? data.recommendations : [],
      engineering_suggestions: Array.isArray(data.engineering_suggestions) ? data.engineering_suggestions : []
    };
  }

  /**
   * Start the video analysis
   */
  async start() {
    if (!this.vision) {
      throw new Error('Vision not initialized. Call initWithCamera() or initWithVideoFile() first.');
    }

    try {
      console.log('▶️ Starting Overshoot analysis...');
      this.isStarting = true;
      this.onStatusChange('connecting');

      // If we have a custom stream (HLS), we need to intercept getUserMedia
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
      if (this.customStream) {
        console.log('🔀 Intercepting getUserMedia for HLS stream');
        navigator.mediaDevices.getUserMedia = async () => {
          // CLONE the stream so the original isn't killed if Vision stops it
          return this.customStream.clone();
        };
      }

      await this.vision.start();

      // Restore original getUserMedia
      if (this.customStream) {
        navigator.mediaDevices.getUserMedia = originalGetUserMedia;
      }

      this.isRunning = true;
      this.onStatusChange('connected');
    } catch (error) {
      this.onStatusChange('error');
      // Only report error if we haven't been stopped intentionally
      if (this.isStarting || this.isRunning) {
        this.onError(error);
      }
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stop the video analysis
   */
  /**
   * Stop the video analysis
   * @param {boolean} keepStream - If true, keeps the custom stream alive (for switching phases)
   */
  async stop(keepStream = false) {
    if (this.vision) { // Try to stop even if isRunning flag is off, just in case
      try {
        console.log('🛑 Stopping analysis...');
        await this.vision.stop();
      } catch (error) {
        console.warn('Warning during stop:', error);
      } finally {
        this.vision = null; // Ensure we drop the reference
        this.isRunning = false;
        this.isStarting = false;

        if (!keepStream) {
          this.cleanupPreviousSession();
          this.onStatusChange('disconnected');
        }
      }
    }
  }

  /**
   * Switch from discovery to monitoring phase
   */
  async switchToMonitoring(lanes) {
    console.log('🔄 Switching to monitoring phase with lanes:', lanes);

    // Validate lanes
    if (!lanes || lanes.length === 0) {
      console.warn('⚠️ No lanes to monitor, sticking to discovery');
      return;
    }

    try {
      // Stop current vision but keep stream
      await this.stop(true);

      const monitoringPrompt = generateMonitoringPrompt(lanes);

      // Re-init with new prompt
      // Use customStream if available, otherwise check source config
      // Note: For video files, we might restart from beginning or need seek support (complex).
      // For now, assuming video file restart is acceptable or purely for camera focus.

      this.vision = new RealtimeVision({
        apiUrl: this.apiUrl,
        apiKey: this.apiKey,
        prompt: monitoringPrompt,
        outputSchema: MONITORING_SCHEMA,
        source: this.sourceConfig || { type: 'camera', cameraFacing: 'environment' },
        processing: {
          clip_length_seconds: 2,
          delay_seconds: 1,
          fps: 15,
          sampling_ratio: 0.15
        },
        onResult: (result) => this.handleResult(result)
      });

      // Restart
      await this.start();

    } catch (e) {
      console.error('Failed to switch to monitoring:', e);
      this.onError(e);
      // Try to recover?
    }
  }

  /**
   * Check if the analyzer is currently running
   */
  getIsRunning() {
    return this.isRunning;
  }

  /**
   * Get the video element from the SDK (for display)
   */
  getVideoElement() {
    return this.vision?.videoElement;
  }
}

/**
 * Create a singleton instance
 */
let analyzerInstance = null;

export function getTrafficAnalyzer(options = {}) {
  if (!analyzerInstance) {
    analyzerInstance = new TrafficAnalyzer(options);
  }
  return analyzerInstance;
}

export default TrafficAnalyzer;
