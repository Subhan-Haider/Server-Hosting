const fs = require('fs');
const path = require('path');

/**
 * Scans a project directory for .env.example or .env.template
 * Parses the keys and returns them.
 */
function scanForEnvKeys(projectPath) {
    const possibleFiles = ['.env.example', '.env.template', '.env.sample'];
    let keys = [];
    
    for (const file of possibleFiles) {
        const fullPath = path.join(projectPath, file);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    // Match KEY=value or just KEY
                    const match = trimmed.match(/^([^=]+)=?(.*)$/);
                    if (match && match[1]) {
                        keys.push({
                            key: match[1].trim(),
                            defaultValue: match[2] ? match[2].trim().replace(/^['"]|['"]$/g, '') : ''
                        });
                    }
                }
            }
            break; // Stop at first found file
        }
    }
    
    return keys;
}

/**
 * Writes the provided env variables to .env in the project directory
 */
function writeEnvFile(projectPath, envVars) {
    if (!envVars || Object.keys(envVars).length === 0) return;
    
    const envPath = path.join(projectPath, '.env');
    let content = '';
    
    for (const [key, value] of Object.entries(envVars)) {
        content += `${key}=${value}\n`;
    }
    
    fs.writeFileSync(envPath, content);
}

module.exports = {
    scanForEnvKeys,
    writeEnvFile
};
