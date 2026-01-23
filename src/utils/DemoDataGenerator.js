/**
 * Demo Data Generator
 * Generates realistic mock traffic data for demonstration purposes
 */
export class DemoDataGenerator {
    constructor() {
        this.interval = null;
        this.isRunning = false;
        this.onData = null;
        this.scenarioIndex = 0;
        this.scenarios = this.createScenarios();
    }

    /**
     * Create a set of realistic traffic scenarios
     */
    createScenarios() {
        return [
            // Normal traffic flow
            {
                name: 'Normal Traffic',
                lanes: [
                    { lane_id: 1, vehicle_count: 8, vehicle_types: { car: 6, truck: 1, bus: 0, motorcycle: 1 }, queue_length_meters: 15, congestion: 'low' },
                    { lane_id: 2, vehicle_count: 12, vehicle_types: { car: 9, truck: 2, bus: 1, motorcycle: 0 }, queue_length_meters: 25, congestion: 'medium' },
                    { lane_id: 3, vehicle_count: 6, vehicle_types: { car: 5, truck: 0, bus: 0, motorcycle: 1 }, queue_length_meters: 10, congestion: 'low' },
                    { lane_id: 4, vehicle_count: 10, vehicle_types: { car: 8, truck: 1, bus: 0, motorcycle: 1 }, queue_length_meters: 20, congestion: 'low' }
                ],
                pedestrians: 8,
                predicted_wait_seconds: { lane_1: 25, lane_2: 45, lane_3: 20, lane_4: 35 },
                alerts: [],
                optimization_suggestions: ['Consider slight increase in Lane 2 green time']
            },
            // Rush hour congestion
            {
                name: 'Rush Hour',
                lanes: [
                    { lane_id: 1, vehicle_count: 18, vehicle_types: { car: 14, truck: 2, bus: 1, motorcycle: 1 }, queue_length_meters: 45, congestion: 'high' },
                    { lane_id: 2, vehicle_count: 22, vehicle_types: { car: 17, truck: 3, bus: 2, motorcycle: 0 }, queue_length_meters: 55, congestion: 'high' },
                    { lane_id: 3, vehicle_count: 15, vehicle_types: { car: 12, truck: 1, bus: 1, motorcycle: 1 }, queue_length_meters: 35, congestion: 'medium' },
                    { lane_id: 4, vehicle_count: 20, vehicle_types: { car: 16, truck: 2, bus: 1, motorcycle: 1 }, queue_length_meters: 50, congestion: 'high' }
                ],
                pedestrians: 24,
                predicted_wait_seconds: { lane_1: 85, lane_2: 95, lane_3: 60, lane_4: 90 },
                alerts: ['High congestion detected on Lane 2', 'Queue backup approaching intersection limit'],
                optimization_suggestions: [
                    'Increase green time for Lane 1 by 15 seconds',
                    'Increase green time for Lane 2 by 20 seconds',
                    'Consider temporary rerouting from Lane 4'
                ]
            },
            // Safety incident
            {
                name: 'Safety Alert',
                lanes: [
                    { lane_id: 1, vehicle_count: 10, vehicle_types: { car: 8, truck: 1, bus: 0, motorcycle: 1 }, queue_length_meters: 20, congestion: 'medium' },
                    { lane_id: 2, vehicle_count: 8, vehicle_types: { car: 6, truck: 1, bus: 1, motorcycle: 0 }, queue_length_meters: 18, congestion: 'low' },
                    { lane_id: 3, vehicle_count: 12, vehicle_types: { car: 10, truck: 1, bus: 0, motorcycle: 1 }, queue_length_meters: 28, congestion: 'medium' },
                    { lane_id: 4, vehicle_count: 7, vehicle_types: { car: 5, truck: 1, bus: 0, motorcycle: 1 }, queue_length_meters: 14, congestion: 'low' }
                ],
                pedestrians: 15,
                predicted_wait_seconds: { lane_1: 40, lane_2: 30, lane_3: 50, lane_4: 25 },
                alerts: [
                    'Red light violation detected on Lane 3',
                    'Unsafe pedestrian crossing detected',
                    'Near-miss incident recorded'
                ],
                optimization_suggestions: [
                    'Extend pedestrian crossing time by 5 seconds',
                    'Consider adding left-turn signal for Lane 3'
                ]
            },
            // Light traffic
            {
                name: 'Light Traffic',
                lanes: [
                    { lane_id: 1, vehicle_count: 3, vehicle_types: { car: 2, truck: 1, bus: 0, motorcycle: 0 }, queue_length_meters: 5, congestion: 'low' },
                    { lane_id: 2, vehicle_count: 5, vehicle_types: { car: 4, truck: 0, bus: 1, motorcycle: 0 }, queue_length_meters: 8, congestion: 'low' },
                    { lane_id: 3, vehicle_count: 2, vehicle_types: { car: 2, truck: 0, bus: 0, motorcycle: 0 }, queue_length_meters: 4, congestion: 'low' },
                    { lane_id: 4, vehicle_count: 4, vehicle_types: { car: 3, truck: 0, bus: 0, motorcycle: 1 }, queue_length_meters: 6, congestion: 'low' }
                ],
                pedestrians: 3,
                predicted_wait_seconds: { lane_1: 10, lane_2: 15, lane_3: 8, lane_4: 12 },
                alerts: [],
                optimization_suggestions: ['Traffic flow optimal - no changes recommended']
            },
            // Bus priority
            {
                name: 'Bus Priority Active',
                lanes: [
                    { lane_id: 1, vehicle_count: 9, vehicle_types: { car: 7, truck: 1, bus: 0, motorcycle: 1 }, queue_length_meters: 18, congestion: 'low' },
                    { lane_id: 2, vehicle_count: 6, vehicle_types: { car: 3, truck: 0, bus: 3, motorcycle: 0 }, queue_length_meters: 12, congestion: 'low' },
                    { lane_id: 3, vehicle_count: 11, vehicle_types: { car: 9, truck: 1, bus: 0, motorcycle: 1 }, queue_length_meters: 22, congestion: 'medium' },
                    { lane_id: 4, vehicle_count: 8, vehicle_types: { car: 6, truck: 1, bus: 0, motorcycle: 1 }, queue_length_meters: 16, congestion: 'low' }
                ],
                pedestrians: 12,
                predicted_wait_seconds: { lane_1: 35, lane_2: 15, lane_3: 45, lane_4: 30 },
                alerts: ['Bus priority signal activated on Lane 2'],
                optimization_suggestions: [
                    'Bus priority mode active - Lane 2 optimized',
                    'Reduce Lane 3 wait time after bus clears'
                ]
            }
        ];
    }

    /**
     * Start generating demo data at regular intervals
     */
    start(callback, intervalMs = 2000) {
        if (this.isRunning) {
            this.stop();
        }

        this.onData = callback;
        this.isRunning = true;

        // Send initial data immediately
        this.sendData();

        // Schedule regular updates
        this.interval = setInterval(() => {
            this.sendData();
        }, intervalMs);

        console.log('🎮 Demo mode started');
    }

    /**
     * Stop generating demo data
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        console.log('🎮 Demo mode stopped');
    }

    /**
     * Send current scenario data with some randomization
     */
    sendData() {
        if (!this.onData) return;

        const scenario = this.scenarios[this.scenarioIndex];
        const data = this.addVariation(JSON.parse(JSON.stringify(scenario)));

        // Add metadata
        data._meta = {
            timestamp: new Date().toISOString(),
            inference_latency_ms: Math.floor(Math.random() * 100) + 200,
            total_latency_ms: Math.floor(Math.random() * 150) + 300,
            demo_mode: true,
            scenario_name: scenario.name
        };

        this.onData(data);

        // Cycle through scenarios
        this.scenarioIndex = (this.scenarioIndex + 1) % this.scenarios.length;
    }

    /**
     * Add random variation to make data feel more realistic
     */
    addVariation(data) {
        // Vary vehicle counts slightly
        data.lanes = data.lanes.map(lane => {
            const variation = Math.floor(Math.random() * 5) - 2; // -2 to +2
            lane.vehicle_count = Math.max(0, lane.vehicle_count + variation);
            lane.queue_length_meters = Math.max(0, lane.queue_length_meters + (variation * 3));

            // Adjust congestion based on new count
            if (lane.vehicle_count >= 15) lane.congestion = 'high';
            else if (lane.vehicle_count >= 8) lane.congestion = 'medium';
            else lane.congestion = 'low';

            return lane;
        });

        // Vary pedestrian count
        data.pedestrians = Math.max(0, data.pedestrians + (Math.floor(Math.random() * 5) - 2));

        // Vary wait times
        for (const key in data.predicted_wait_seconds) {
            const variation = Math.floor(Math.random() * 10) - 5;
            data.predicted_wait_seconds[key] = Math.max(5, data.predicted_wait_seconds[key] + variation);
        }

        return data;
    }

    /**
     * Get current running status
     */
    getIsRunning() {
        return this.isRunning;
    }

    /**
     * Set specific scenario by name
     */
    setScenario(name) {
        const index = this.scenarios.findIndex(s => s.name === name);
        if (index !== -1) {
            this.scenarioIndex = index;
        }
    }

    /**
     * Get all scenario names
     */
    getScenarioNames() {
        return this.scenarios.map(s => s.name);
    }
}

export default DemoDataGenerator;
