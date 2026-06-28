const API_URL = 'https://api.subhan.tech/api';
const AUTH_URL = 'https://api.subhan.tech/api/auth';

export const api = {
  async getApps() {
    const res = await fetch(`${API_URL}/apps`);
    if (!res.ok) throw new Error('Failed to fetch apps');
    return res.json();
  },

  async deployApp(data) {
    const res = await fetch(`${API_URL}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async actionApp(name, action) {
    const res = await fetch(`${API_URL}/${action}/${name}`, {
      method: action === 'delete' ? 'DELETE' : 'POST'
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getLogs(name) {
    const res = await fetch(`${API_URL}/logs/${name}`);
    if (!res.ok) throw new Error('Failed to fetch logs');
    return res.json();
  },

  async requestDeviceCode() {
    const res = await fetch(`${AUTH_URL}/device`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start GitHub login');
    return res.json();
  },

  async pollForToken(deviceCode) {
    const res = await fetch(`${AUTH_URL}/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode })
    });
    if (!res.ok) throw new Error('Failed to poll for token');
    return res.json();
  }
};
