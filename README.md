Introducing TrafIQ
___________________

Our friend's father owns a small traffic consulting business, and he described to us the manual labor in the traffic engineering profession. Skilled engineers sit at intersections for hours, buying expensive manual machines to count the number of cars passing by and log the average wait time at traffic lights. This manual labor naturally costs cities millions in time, fuel, and emergency response delays, as issues can take years to fix.

TrafiQ automates these processes with real-time vision and AI insights. To demonstrate the product, we connected a few open-source Maryland DOT cams and private camera streams to the app. TrafiQ uses dynamic prompting on a custom TensorFlow model and Overshoot API to determine the number of lanes on the road, their directions, and the road's general layout. Using this information, the app continuously prompts the model for the number of vehicles and pedestrians, as well as for any outlier events, such as congestion or accidents. This data is displayed as real-time statistics and stored in a database, which the app then uses to generate AI reports and support historical analysis.

Our core platform is built on JavaScript and Vite, with Overshoot, TensorFlow, and HLS.js for video streaming and analysis. We used Vultr for our cloud backend.

## Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/Beshalaby/Hoya2026.git
cd Hoya2026
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure API Keys
**IMPORTANT: Never commit API keys to version control**

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your API keys:
   - `VITE_OVERSHOOT_API_KEY` - Required for traffic analysis ([Get key](https://overshoot.ai/))
   - `VITE_OPENROUTER_API_KEY` - Optional for AI reports ([Get key](https://openrouter.ai/))
   - `VITE_ELEVENLABS_AGENT_ID` - Optional for voice assistant ([Get key](https://elevenlabs.io/))

3. The `.env` file is already in `.gitignore` and will not be committed

### 4. Run the development server
```bash
npm run dev
```

### 5. Build for production
```bash
npm run build
```

## Security Notice

⚠️ **IMPORTANT**: This repository previously contained hardcoded API keys that have been removed. If you have access to the git history:
- The exposed Overshoot API key `ovs_ad7c46804b149f5a6f169e8b59986328` has been **REVOKED**
- Never use API keys found in git history
- Always use fresh API keys stored in environment variables
- Report any security issues to the repository maintainers

See `SECURITY_FINDINGS.md` for detailed security audit results.
