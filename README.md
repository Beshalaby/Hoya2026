Introducing TrafIQ
___________________

Our friend's father owns a small traffic consulting business, and he described to us the manual labor in the traffic engineering profession. Skilled engineers sit at intersections for hours, buying expensive manual machines to count the number of cars passing by and log the average wait time at traffic lights. This manual labor naturally costs cities millions in time, fuel, and emergency response delays, as issues can take years to fix.

TrafiQ automates these processes with real-time vision and AI insights. To demonstrate the product, we connected a few open-source Maryland DOT cams and private camera streams to the app. TrafiQ uses dynamic prompting on a custom TensorFlow model and Overshoot API to determine the number of lanes on the road, their directions, and the road's general layout. Using this information, the app continuously prompts the model for the number of vehicles and pedestrians, as well as for any outlier events, such as congestion or accidents. This data is displayed as real-time statistics and stored in a database, which the app then uses to generate AI reports and support historical analysis.

Our core platform is built on JavaScript and Vite, with Overshoot, TensorFlow, and HLS.js for video streaming and analysis. We used Vultr for our cloud backend.

Deploying TrafiQ to Vercel
__________________________

This project is now Vercel-ready:

- Frontend is built with Vite (`dist/`)
- HLS proxy runs as a Vercel Function at `/api/proxy`
- Existing frontend calls to `/proxy` are preserved through a Vercel rewrite in `vercel.json`

1) Connect Repo to Vercel
-------------------------

1. Import this GitHub repo into Vercel.
2. Framework preset: `Vite`.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Install command: `npm ci` (default is fine).

2) Configure Environment Variables
----------------------------------

In the Vercel project settings, add:

- `VITE_OVERSHOOT_API_KEY`
- `VITE_OPENROUTER_API_KEY`
- `VITE_ELEVENLABS_AGENT_ID` (optional)

Reference: `.env.example`

3) Attach Your Domain
---------------------

Add both of these domains in the Vercel project:

- `trafiq.tech` (apex)
- `www.trafiq.tech`

You have two DNS options:

Option A: Use Vercel nameservers (easiest)
- Set nameservers at your registrar to:
  - `ns1.vercel-dns.com`
  - `ns2.vercel-dns.com`
- Vercel manages records automatically afterward.

Option B: Keep your current DNS provider
- Add records Vercel shows in the Domains tab.
- Typical setup:
  - Apex `A` record: `@ -> 76.76.21.21`
  - `www` `CNAME`: `www -> cname.vercel-dns.com` (or a project-specific `*.vercel-dns-*.com` target shown by Vercel)

4) Verify After Cutover
-----------------------

1. Open `https://trafiq.tech`.
2. Open dashboard and pick an HLS camera stream.
3. In browser devtools, verify requests hit `/proxy?url=...` and return `200`.
4. Verify SSL is active and domain status is "Valid Configuration" in Vercel.

Local Development
-----------------

- `npm run dev` keeps using local Express + Vite (`server.js` + Vite proxy).
- Production on Vercel uses `api/proxy.js` for HLS proxying.
