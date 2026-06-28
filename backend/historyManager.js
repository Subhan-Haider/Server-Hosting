const fs = require('fs');
const path = require('path');
const os = require('os');

const HISTORY_PATH = path.join(os.homedir(), 'server-manager-projects', 'history.json');

// Helper to ensure history directory exists
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

// Read history from JSON
function loadHistory() {
    if (!fs.existsSync(HISTORY_PATH)) {
        return {};
    }
    try {
        const data = fs.readFileSync(HISTORY_PATH, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('[History] Failed to read history.json:', err.message);
        return {};
    }
}

// Write history to JSON
function saveHistory(historyObj) {
    try {
        ensureDirectoryExistence(HISTORY_PATH);
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(historyObj, null, 2));
    } catch (err) {
        console.error('[History] Failed to write history.json:', err.message);
    }
}

/**
 * Add a deployment record for a domain.
 */
function logDeployment(domain, record) {
    const history = loadHistory();
    if (!history[domain]) {
        history[domain] = [];
    }
    
    // Create record with defaults
    const newRecord = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        status: record.status || 'unknown',
        commitHash: record.commitHash || null,
        durationMs: record.durationMs || 0,
        type: record.type || 'deploy', // 'deploy', 'redeploy', 'rollback'
        error: record.error || null
    };

    history[domain].unshift(newRecord);

    // Keep only the last 50 deployments per domain
    if (history[domain].length > 50) {
        history[domain] = history[domain].slice(0, 50);
    }

    saveHistory(history);
    return newRecord;
}

/**
 * Get the deployment history for a domain.
 */
function getHistory(domain) {
    const history = loadHistory();
    return history[domain] || [];
}

/**
 * Delete history for a domain.
 */
function deleteHistory(domain) {
    const history = loadHistory();
    if (history[domain]) {
        delete history[domain];
        saveHistory(history);
    }
}

module.exports = {
    logDeployment,
    getHistory,
    deleteHistory
};
