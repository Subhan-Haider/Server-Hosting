const fs = require('fs');
const path = require('path');
const os = require('os');

const SECRETS_PATH = path.join(os.homedir(), 'server-manager-projects', 'secrets.json');

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

function loadSecrets() {
    if (!fs.existsSync(SECRETS_PATH)) {
        return {};
    }
    try {
        const data = fs.readFileSync(SECRETS_PATH, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('[Secrets] Failed to read secrets.json:', err.message);
        return {};
    }
}

function saveSecrets(secretsObj) {
    try {
        ensureDirectoryExistence(SECRETS_PATH);
        fs.writeFileSync(SECRETS_PATH, JSON.stringify(secretsObj, null, 2));
    } catch (err) {
        console.error('[Secrets] Failed to write secrets.json:', err.message);
    }
}

function getSecrets(mask = true) {
    const secrets = loadSecrets();
    if (!mask) return secrets;

    const masked = {};
    for (const [key, value] of Object.entries(secrets)) {
        if (value.length <= 4) {
            masked[key] = '*'.repeat(value.length);
        } else {
            masked[key] = value.substring(0, 3) + '*'.repeat(value.length - 3);
        }
    }
    return masked;
}

function getRawSecrets(keys) {
    const all = loadSecrets();
    const result = {};
    for (const key of keys) {
        if (all[key] !== undefined) {
            result[key] = all[key];
        }
    }
    return result;
}

function setSecret(key, value) {
    const secrets = loadSecrets();
    secrets[key] = value;
    saveSecrets(secrets);
}

function deleteSecret(key) {
    const secrets = loadSecrets();
    if (secrets[key] !== undefined) {
        delete secrets[key];
        saveSecrets(secrets);
    }
}

module.exports = {
    getSecrets,
    getRawSecrets,
    setSecret,
    deleteSecret
};
