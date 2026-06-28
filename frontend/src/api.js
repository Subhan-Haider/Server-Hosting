const API_URL = 'https://api.subhan.tech/api';
const AUTH_URL = 'https://api.subhan.tech/api/auth';

export const api = {
  async getApps() {
    const res = await fetch(`${API_URL}/apps`);
    if (!res.ok) throw new Error('Failed to fetch apps');
    return res.json();
  },

  async detectEnv(data) {
    const response = await fetch(`${API_URL}/env/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to detect environment');
    }
    return response.json();
  },

  async getHistory(domain) {
    const response = await fetch(`${API_URL}/history/${domain}`);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get history');
    }
    return response.json();
  },

  async rollback(domain, commit) {
    const response = await fetch(`${API_URL}/rollback/${domain}/${commit}`, {
        method: 'POST'
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to rollback');
    }
    return response.json();
  },

  async deployApp(data, onLog) {
    const res = await fetch(`${API_URL}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!res.ok) throw new Error(await res.text());

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Split by double newline since SSE uses \n\n
        let parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep the incomplete part

        for (const part of parts) {
            if (part.startsWith('data: ')) {
                const jsonStr = part.substring(6);
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.type === 'log' && onLog) {
                        onLog(parsed.message);
                    } else if (parsed.type === 'error') {
                        throw new Error(parsed.error);
                    } else if (parsed.type === 'success') {
                        return parsed;
                    }
                } catch (e) {
                    // Ignore parse errors from partial JSON
                }
            }
        }
    }
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

  async getSecrets() {
    const res = await fetch(`${API_URL}/secrets`);
    if (!res.ok) throw new Error('Failed to fetch secrets');
    return res.json();
  },

  async saveSecret(key, value) {
    const res = await fetch(`${API_URL}/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    if (!res.ok) throw new Error('Failed to save secret');
    return res.json();
  },

  async deleteSecret(key) {
    const res = await fetch(`${API_URL}/secrets/${key}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete secret');
    return res.json();
  },

  async getFiles(name, dir = '') {
    const res = await fetch(`${API_URL}/files/${name}?dir=${encodeURIComponent(dir)}`);
    if (!res.ok) throw new Error('Failed to fetch files');
    return res.json();
  },

  async getFileContent(name, file = '') {
    const res = await fetch(`${API_URL}/file/${name}/read?file=${encodeURIComponent(file)}`);
    if (!res.ok) throw new Error('Failed to fetch file content');
    return res.json();
  },

  async saveFileContent(name, file, content) {
    const res = await fetch(`${API_URL}/file/${name}/write?file=${encodeURIComponent(file)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) throw new Error('Failed to save file');
    return res.json();
  },

  async getCrashes() {
    const res = await fetch(`${API_URL}/crashes`);
    if (!res.ok) throw new Error('Failed to fetch crashes');
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
