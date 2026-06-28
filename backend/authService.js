// Use native fetch (Node 18+) or fallback to https module for older Node versions
const _fetch = typeof fetch !== 'undefined' ? fetch : (() => {
    const https = require('https');
    return (url, opts = {}) => new Promise((resolve, reject) => {
        const body = opts.body || null;
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: opts.method || 'GET',
            headers: opts.headers || {}
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: () => Promise.resolve(JSON.parse(data)),
                    text: () => Promise.resolve(data)
                });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
})();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23liqbRAyRp8ZsT3fB';

async function githubPost(url, body) {
    const res = await _fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    // Always parse and return JSON — GitHub uses 4xx status for pending/slow_down states
    // so we must NOT throw on non-ok responses during device flow polling
    const json = await res.json();
    return json;
}

async function requestDeviceCode() {
    return githubPost('https://github.com/login/device/code', {
        client_id: GITHUB_CLIENT_ID,
        scope: 'repo user'
    });
}

async function pollForToken(deviceCode) {
    return githubPost('https://github.com/login/oauth/access_token', {
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });
}

module.exports = {
    requestDeviceCode,
    pollForToken
};
