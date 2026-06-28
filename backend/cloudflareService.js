const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('yaml');
const { exec } = require('child_process');

// Dedicated deployments tunnel config path
const CONFIG_PATH = path.join(os.homedir(), '.cloudflared', 'deployments-config.yml');
const TUNNEL_NAME = 'deployments';

// Helper to ensure directory exists
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

// Read and parse config, returning the object (or null if not found/parseable)
function readConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    try {
        return yaml.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.warn('[Cloudflare] Could not parse config YAML:', e.message);
        return null;
    }
}

// Write config object back to file with nice formatting
function writeConfig(configObj) {
    let newYaml = yaml.stringify(configObj);
    // Add blank lines between list items for readability
    newYaml = newYaml.replace(/\n(\s*-\s*hostname:)/g, '\n\n$1');
    newYaml = newYaml.replace(/\n(\s*-\s*service:\s*http_status)/g, '\n\n$1');
    fs.writeFileSync(CONFIG_PATH, newYaml);
}

// Restart the tunnel after a delay (so HTTP response goes out first)
function restartTunnel(delayMs = 2000) {
    setTimeout(() => {
        exec('pm2 restart tunnel', (error) => {
            if (error) {
                console.error('[Cloudflare] Failed to restart tunnel:', error.message);
            } else {
                console.log('[Cloudflare] Tunnel restarted successfully.');
            }
        });
    }, delayMs);
}

/**
 * Add or update a single app's route in the config, then restart the tunnel.
 * Resolves immediately so the HTTP response goes out before the tunnel restarts.
 */
function updateCloudflareConfig(domain, port) {
    return new Promise((resolve, reject) => {
        try {
            ensureDirectoryExistence(CONFIG_PATH);

            let configObj = readConfig();
            if (!configObj || !configObj.ingress) {
                // Create a minimal valid config if the file doesn't exist yet
                configObj = {
                    tunnel: TUNNEL_NAME,
                    'credentials-file': path.join(os.homedir(), '.cloudflared', 'b4dfff9c-8fe9-4f45-9242-07aedcdde471.json'),
                    ingress: [{ service: 'http_status:404' }]
                };
            }

            const newRule = { hostname: domain, service: `http://localhost:${port}` };

            // Remove duplicate, then insert before catch-all
            configObj.ingress = configObj.ingress.filter(r => r.hostname !== domain);
            const catchAllIdx = configObj.ingress.findIndex(r => r.service && r.service.includes('http_status:404'));
            if (catchAllIdx !== -1) {
                configObj.ingress.splice(catchAllIdx, 0, newRule);
            } else {
                configObj.ingress.push(newRule);
            }

            writeConfig(configObj);
            console.log(`[Cloudflare] Updated config: ${domain} -> port ${port}`);

            // Respond immediately, restart tunnel in background
            resolve();
            restartTunnel(2000);

        } catch (error) {
            console.error('[Cloudflare] Error updating config:', error);
            reject(error);
        }
    });
}

/**
 * Batch-sync all apps at once — writes all routes in a single file write
 * and does only ONE tunnel restart. Used on backend startup.
 */
function syncAllApps(apps) {
    return new Promise((resolve) => {
        try {
            if (!apps || apps.length === 0) return resolve();

            ensureDirectoryExistence(CONFIG_PATH);

            let configObj = readConfig();
            if (!configObj || !configObj.ingress) {
                configObj = {
                    tunnel: TUNNEL_NAME,
                    'credentials-file': path.join(os.homedir(), '.cloudflared', 'b4dfff9c-8fe9-4f45-9242-07aedcdde471.json'),
                    ingress: [{ service: 'http_status:404' }]
                };
            }

            let changed = false;
            for (const { domain, port } of apps) {
                if (!domain || !port) continue;
                const newRule = { hostname: domain, service: `http://localhost:${port}` };
                const existing = configObj.ingress.find(r => r.hostname === domain);
                if (!existing || existing.service !== newRule.service) {
                    // Remove old rule
                    configObj.ingress = configObj.ingress.filter(r => r.hostname !== domain);
                    // Insert before catch-all
                    const catchAllIdx = configObj.ingress.findIndex(r => r.service && r.service.includes('http_status:404'));
                    if (catchAllIdx !== -1) {
                        configObj.ingress.splice(catchAllIdx, 0, newRule);
                    } else {
                        configObj.ingress.push(newRule);
                    }
                    console.log(`[Cloudflare] Synced: ${domain} -> port ${port}`);
                    changed = true;
                }
            }

            if (changed) {
                writeConfig(configObj);
                // Single tunnel restart after all changes
                restartTunnel(1000);
            }

            resolve();
        } catch (err) {
            console.error('[Cloudflare] Error during batch sync:', err.message);
            resolve(); // Don't block startup
        }
    });
}

/**
 * Remove a single app's route and restart the tunnel.
 */
function removeCloudflareConfig(domain) {
    return new Promise((resolve) => {
        try {
            if (!fs.existsSync(CONFIG_PATH)) return resolve();

            const configObj = readConfig();
            if (configObj && configObj.ingress) {
                configObj.ingress = configObj.ingress.filter(r => r.hostname !== domain);
                writeConfig(configObj);
                console.log(`[Cloudflare] Removed config for: ${domain}`);
                resolve();
                restartTunnel(2000);
            } else {
                resolve();
            }
        } catch (error) {
            console.error('[Cloudflare] Error removing config:', error);
            resolve();
        }
    });
}

module.exports = {
    updateCloudflareConfig,
    removeCloudflareConfig,
    syncAllApps,
};
