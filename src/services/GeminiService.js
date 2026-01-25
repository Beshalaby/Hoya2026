/**
 * GeminiService
 * Service for generating AI traffic insights using Google Gemini API
 */
import { dataStore } from './DataStore.js';

export class GeminiService {
    constructor() {
        this.API_URL = 'https://openrouter.ai/api/v1/chat/completions';
        this.MODEL = 'google/gemini-2.0-flash-001';
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

        const prompt = this.constructPrompt(analyticsSummary);

        try {
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'TraffIQ'
                },
                body: JSON.stringify({
                    model: this.MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a Senior Traffic Engineer acting as a consultant. Your output must be strictly professional, technical, and objective. Do not speculate or hallucinate data not provided. Output strictly in Markdown format.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.5 // Lower temperature for more deterministic/professional output
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || `OpenRouter Error: ${response.statusText}`);
            }

            const data = await response.json();
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
        const vehicles = data.totalVehiclesToday || 0;
        const congestion = data.congestionScore || 'Low';
        const queue = data.avgQueueLength || 0;
        const incidents = data.incidentsToday || 0;
        const efficiency = data.flowEfficiency || 100;

        // Context Injection
        const location = "Georgetown, Washington D.C.";
        const date = new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
GENERATE TRAFFIC OPTIMIZATION REPORT

CONTEXT:
- Location: ${location}
- Report Generated: ${date}

DATA METRICS (Last 24 Hours):
- Total Volume: ${vehicles} vehicles
- Congestion Level: ${congestion}
- Average Queue Length: ${queue} meters
- Flow Efficiency: ${efficiency}/100
- Recorded Incidents: ${incidents}

INSTRUCTIONS:
Provide a formal engineering report including:
1. Executive Summary of current performance in ${location}.
2. Technical Analysis of the metrics provided.
3. Three (3) specific, actionable engineering recommendations.
4. Estimated impact on flow efficiency and CO2 emissions.

TONE:
Professional, Concise, and Authoritative. Avoid conversational language.
`.trim();
    }
}

export const geminiService = new GeminiService();
export default geminiService;
