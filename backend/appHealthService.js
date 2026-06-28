/**
 * appHealthService.js
 * Actively pings application domains to check their health.
 */
const portManager = require('./portManager');
const notificationService = require('./notificationService');

const healthStatus = {}; // { domain -> { status: 'online'|'degraded'|'offline', lastCheck: timestamp, fails: number } }

async function checkHealth() {
    const projects = portManager.getAllProjects();
    const now = Date.now();

    for (const [name, project] of Object.entries(projects)) {
        if (!project.domain) continue;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
            
            const res = await fetch(`https://${project.domain}`, { 
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!healthStatus[project.domain]) healthStatus[project.domain] = { fails: 0 };
            
            if (res.ok || res.status < 400) {
                if (healthStatus[project.domain].status !== 'online' && healthStatus[project.domain].fails > 0) {
                    // Recovered
                    notificationService.sendDiscordNotification({
                        name, domain: project.domain, status: 'success', type: 'health_recovery'
                    });
                }
                healthStatus[project.domain] = { status: 'online', lastCheck: now, fails: 0 };
            } else {
                throw new Error(`HTTP ${res.status}`);
            }
        } catch (err) {
            if (!healthStatus[project.domain]) healthStatus[project.domain] = { fails: 0 };
            healthStatus[project.domain].fails += 1;
            healthStatus[project.domain].lastCheck = now;

            if (healthStatus[project.domain].fails >= 3 && healthStatus[project.domain].status !== 'degraded') {
                healthStatus[project.domain].status = 'degraded';
                notificationService.sendDiscordNotification({
                    name, domain: project.domain, status: 'error', type: 'health_alert', error: `App is unresponsive: ${err.message}`
                });
            } else if (healthStatus[project.domain].status !== 'degraded') {
                healthStatus[project.domain].status = 'pending_degraded';
            }
        }
    }
}

function getHealthStatus(domain) {
    return healthStatus[domain] || { status: 'unknown' };
}

// Check every 60 seconds
setInterval(checkHealth, 60 * 1000);
checkHealth();

module.exports = { getHealthStatus };
