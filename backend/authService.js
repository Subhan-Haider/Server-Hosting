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
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitHub API error ${res.status}: ${text}`);
    }
    return res.json();
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
