# AI-Powered Public Infrastructure Asset Monitoring System

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/pratikrise25-code/public-infrastructure-system)

An end-to-end, citizen-centric public infrastructure reporting and maintenance management platform featuring real-time AI computer vision defect detection, automated priority calculation, and geospatial hotspot clustering.

---

## 🌟 Key Features & AI Modules

### 1. 📷 AI Image-Based Issue Detection
- **Instant Citizen Upload:** Citizens snap or upload an infrastructure issue image (e.g. pothole, broken streetlight, leaking pipeline, damaged sidewalk).
- **Vision Analysis:** Automatically extracts defects, confidence scores, and damage severity.
- **Plain-Word Citizen Feedback:** Translates technical defect parameters into clear, understandable words with an explicit **"AI-Assisted"** badge.

### 2. ⚡ AI Priority Engine
- **Automated Impact Scoring:** Computes urgency based on damage severity, citizen foot-traffic impact, and public safety hazard.
- **Priority Tiers:** Categorized clearly as `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.
- **Administrative Override Authority:** Municipal supervisors can review AI predictions and manually adjust priority with full audit logging.

### 3. 🗺️ AI Maintenance Hotspot Map & Strict Citizen Isolation
- **Citizen Privacy & 0-Start:** Every new citizen starts with an initial count of **0 reports** and an empty personal map.
- **Isolated View:** Citizens only ever see their own submitted complaints on **My Map**.
- **Admin Macro-Clustering:** Supervisors access the city-wide geospatial heatmap, density clusters, and maintenance dispatch queue.

---

## 🚀 1-Click Permanent Cloud Deployment (Render.com)

Click the button below to deploy this system 24/7 for free on Render:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/pratikrise25-code/public-infrastructure-system)

Render will automatically parse `render.yaml`, install Node.js dependencies, initialize the native SQLite database, and launch your live application with free automatic SSL.

---

## 💻 Local Development

### Prerequisites
- Node.js 18+ (Node 22+ recommended with native `node:sqlite`)
- Modern web browser

### Quick Start
```bash
# Clone the repository
git clone https://github.com/pratikrise25-code/public-infrastructure-system.git
cd public-infrastructure-system

# Install dependencies
npm install

# Start the server
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Automated Testing
Run the test suites:
```bash
npm test
node test-workflow.js
```

---

## 📄 License
MIT License
