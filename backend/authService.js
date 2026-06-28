const fetch = require('node-fetch');

// This should ideally be placed in a .env file on the VPS
// For this Control Center to work out of the box, the user must provide their own OAuth App Client ID
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23liqbRAyRp8ZsT3fB';

async function requestDeviceCode() {
    if (GITHUB_CLIENT_ID === 'YOUR_GITHUB_CLIENT_ID_HERE') {
        throw new Error('GitHub Client ID not configured. Please set GITHUB_CLIENT_ID in your environment.');
    }

    const res = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            scope: 'repo user'
        })
    });
    
    if (!res.ok) {
        throw new Error('Failed to request device code');
    }
    
    return res.json();
}

async function pollForToken(deviceCode) {
    const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
    });

    if (!res.ok) {
        throw new Error('Failed to poll for token');
    }

    return res.json(); // returns access_token if successful, or error like 'authorization_pending'
}

module.exports = {
    requestDeviceCode,
    pollForToken
};
