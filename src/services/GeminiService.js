/**
 * GeminiService
 * Service for generating AI traffic insights using Google Gemini API
 */
import { dataStore } from './DataStore.js';

export class GeminiService {
    constructor() {
        this.API_URL = 'https://openrouter.ai/api/v1/chat/completions';
        this.MODEL = 'google/gemini-2.0-flash-001'; // Defaulting to 2.0 Flash via OpenRouter
    }

    /**
     * Get the API key from DataStore settings or env
     */
    getApiKey() {
        return import.meta.env.VITE_OPENROUTER_API_KEY || dataStore.getSetting('openRouterApiKey');
    }

    /**
     * Generate a comprehensive traffic engineering report
     * @param {Object} analyticsSummary - The data from dataStore.getAnalyticsSummary()
     * @returns {Promise<string>} The generated report text
     */
    async generateTrafficReport(analyticsSummary) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('OpenRouter API Key is missing. Please add VITE_OPENROUTER_API_KEY to .env or settings.');
        }

        // 1. Construct the Context
        const prompt = this.constructPrompt(analyticsSummary);

        try {
            // 2. Call OpenRouter API (OpenAI Compatible)
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.origin, // Required by OpenRouter
                    'X-Title': 'TraffIQ'
                },
                body: JSON.stringify({
                    model: this.MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a Senior Traffic Engineer. Output strictly in Markdown.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || `OpenRouter Error: ${response.statusText}`);
            }

            const data = await response.json();

            // 3. Extract Text (OpenAI format)
            const text = data.choices?.[0]?.message?.content;
            if (!text) throw new Error('Empty response from AI');

            return text;

        } catch (error) {
            console.error('OpenRouter Service Error:', error);
            throw error;
        }
    }

    /**
     * Construct the prompt for the AI
     */
    constructPrompt(data) {
        // Safe defaults
        const vehicles = data.totalVehiclesToday || 0;
        const congestion = data.congestionScore || 'Low';
        const queue = data.avgQueueLength || 0;
        const incidents = data.incidentsToday || 0;
        const efficiency = data.flowEfficiency || 100;

        return `
Generate a "Traffic Optimization Report" based on:
- Volume: ${vehicles}
- Congestion: ${congestion}
- Avg Queue: ${queue}m
- Efficiency: ${efficiency}/100
- Incidents: ${incidents}

Provide:
1. Analysis of current performance.
2. 3 specific engineering recommendations.
3. Estimated impact.
Keep it professional and concise.
        `.trim();
    }
}

export const geminiService = new GeminiService();
export default geminiService;
