/**
 * metricsService.js
 * Collects per-app CPU & RAM metrics every 30s and stores the last 60 data points (30 min window).
 */
const pm2Service = require('./pm2Service');
const portManager = require('./portManager');

// Ring buffer: { appName -> [{ ts, cpu, memory }, ...] }
const metricsStore = {};
const MAX_POINTS = 60; // 60 * 30s = 30 min

async function collectMetrics() {
    try {
        const pm2Apps = await pm2Service.listProjects();
        const storedProjects = portManager.getAllProjects();
        const now = Date.now();

        for (const name of Object.keys(storedProjects)) {
            const stored = storedProjects[name];
            const pm2Name = stored.pm2Name || name;
            const pm2App = pm2Apps.find(p => p.name === pm2Name);

            if (!metricsStore[name]) metricsStore[name] = [];

            metricsStore[name].push({
                ts: now,
                cpu: pm2App ? (pm2App.cpu || 0) : 0,
                memory: pm2App ? (pm2App.memory || 0) : 0,
            });

            // Keep only last MAX_POINTS
            if (metricsStore[name].length > MAX_POINTS) {
                metricsStore[name].shift();
            }
        }
    } catch (err) {
        // Silently ignore collection errors
    }
}

function getMetrics(name) {
    return metricsStore[name] || [];
}

// Start collection on module load
setInterval(collectMetrics, 30 * 1000);
collectMetrics(); // collect immediately on startup

module.exports = { getMetrics };
