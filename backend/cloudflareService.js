const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('yaml');
const { exec } = require('child_process');

// Determine path to cloudflared config — use the dedicated deployments tunnel config
const CONFIG_PATH = path.join(os.homedir(), '.cloudflared', 'deployments-config.yml');

// Helper to ensure directory exists (mostly for testing)
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    fs.mkdirSync(dirname, { recursive: true });
}

function updateCloudflareConfig(domain, port) {
    return new Promise((resolve, reject) => {
        try {
            ensureDirectoryExistence(CONFIG_PATH);

            let configContent = '';
            let configObj = null;

            if (fs.existsSync(CONFIG_PATH)) {
                configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
                try {
                    configObj = yaml.parse(configContent);
                } catch (e) {
                    // if it fails to parse cleanly, we will fall back to string manipulation
                    console.warn("Could not parse cloudflared config as YAML, using text append fallback.", e);
                }
            } else {
                // If it doesn't exist, create a basic one (though usually it should exist)
                configObj = { ingress: [] };
            }

            const newRule = {
                hostname: domain,
                service: `http://localhost:${port}`
            };

            if (configObj && configObj.ingress) {
                // Remove existing rule for this domain to prevent duplicates
                configObj.ingress = configObj.ingress.filter(rule => rule.hostname !== domain);

                // Insert before the catch-all rule if it exists
                const catchAllIndex = configObj.ingress.findIndex(rule => rule.service && rule.service.includes('http_status:404'));
                if (catchAllIndex !== -1) {
                    configObj.ingress.splice(catchAllIndex, 0, newRule);
                } else {
                    configObj.ingress.push(newRule);
                }
                
                // Write back
                let newYaml = yaml.stringify(configObj);
                
                // Add blank lines before each list item for better readability
                newYaml = newYaml.replace(/\n\s*-\s*hostname:/g, '\n\n  - hostname:');
                newYaml = newYaml.replace(/\n\s*-\s*service:/g, '\n\n  - service:');
                
                fs.writeFileSync(CONFIG_PATH, newYaml);
            } else {
                // Fallback: Text Append
                // Assuming standard format, we append to the end. Note: this might not work perfectly 
                // if there's a catch-all rule at the end. YAML parsing is preferred.
                const appendText = `\n  - hostname: ${domain}\n    service: http://localhost:${port}\n`;
                fs.appendFileSync(CONFIG_PATH, appendText);
            }

            console.log(`Updated cloudflared config for ${domain} -> port ${port}`);

            // Resolve immediately so the HTTP response can be sent to the frontend BEFORE the tunnel goes down
            resolve();

            // Restart cloudflared via PM2 after a 2-second delay
            setTimeout(() => {
                exec('pm2 restart tunnel', (error, stdout, stderr) => {
                    if (error) {
                        console.error('Failed to restart cloudflared via PM2:', error);
                    } else {
                        console.log('Successfully restarted cloudflared via PM2 (Delayed)');
                    }
                });
            }, 2000);

        } catch (error) {
            console.error('Error updating cloudflare config:', error);
            reject(error);
        }
    });
}

function removeCloudflareConfig(domain) {
    return new Promise((resolve, reject) => {
        try {
            if (!fs.existsSync(CONFIG_PATH)) {
                return resolve(); // Nothing to remove
            }
            
            const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
            let configObj = yaml.parse(configContent);

            if (configObj && configObj.ingress) {
                configObj.ingress = configObj.ingress.filter(rule => rule.hostname !== domain);
                fs.writeFileSync(CONFIG_PATH, yaml.stringify(configObj));
                
                // Resolve immediately before restarting tunnel
                resolve();

                // Restart cloudflared via PM2 after 2 seconds
                setTimeout(() => {
                    exec('pm2 restart tunnel', (error, stdout, stderr) => {
                        if (error) console.error('Failed to restart cloudflared on removal:', error);
                    });
                }, 2000);
            } else {
                resolve();
            }
        } catch (error) {
            console.error('Error removing cloudflare config:', error);
            resolve(); // Don't block deletion if config fails
        }
    });
}

module.exports = {
    updateCloudflareConfig,
    removeCloudflareConfig
};
