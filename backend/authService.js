// Use native fetch (Node 18+) — no external dependency needed
// This should be available on any modern Node.js installation

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23liqbRAyRp8ZsT3fB';

async function githubPost(url, body) {
    const res = await fetch(url, {
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
