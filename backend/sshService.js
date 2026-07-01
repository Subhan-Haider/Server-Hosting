/**
 * sshService.js
 * Manages remote servers via SSH using node-ssh.
 */
const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const path = require('path');

const SERVERS_CONFIG_PATH = path.join(__dirname, 'servers.json');

function getServers() {
    try {
        if (fs.existsSync(SERVERS_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(SERVERS_CONFIG_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('[SSH] Failed to load servers.json:', e.message);
    }
    return [];
}

function saveServers(servers) {
    fs.writeFileSync(SERVERS_CONFIG_PATH, JSON.stringify(servers, null, 2));
}

async function testConnection(host, username, privateKey) {
    const ssh = new NodeSSH();
    try {
        await ssh.connect({ host, username, privateKey });
        const result = await ssh.execCommand('echo "SSH Connection Successful"');
        ssh.dispose();
        return result.stdout.includes('Successful');
    } catch (err) {
        throw new Error(`SSH Connection Failed: ${err.message}`);
    }
}

async function addServer(name, host, username, privateKey) {
    const servers = getServers();
    if (servers.find(s => s.name === name || s.host === host)) {
        throw new Error('Server with this name or host already exists');
    }

    await testConnection(host, username, privateKey);

    const server = {
        id: Date.now().toString(),
        name,
        host,
        username,
        privateKey, // In production this should be encrypted, storing plaintext for MVP
        status: 'online',
        createdAt: new Date().toISOString()
    };

    servers.push(server);
    saveServers(servers);
    return { id: server.id, name: server.name, host: server.host, status: server.status };
}

function deleteServer(id) {
    const servers = getServers();
    const index = servers.findIndex(s => s.id === id);
    if (index > -1) {
        servers.splice(index, 1);
        saveServers(servers);
    }
}

async function getServerStatus() {
    const servers = getServers();
    for (const s of servers) {
        try {
            const isOnline = await testConnection(s.host, s.username, s.privateKey);
            s.status = isOnline ? 'online' : 'offline';
        } catch (e) {
            s.status = 'offline';
        }
    }
    return servers.map(s => ({ id: s.id, name: s.name, host: s.host, status: s.status }));
}

async function executeRemoteCommand(serverId, command, cwd = '.') {
    const servers = getServers();
    const server = servers.find(s => s.id === serverId);
    if (!server) throw new Error('Server not found');

    const ssh = new NodeSSH();
    await ssh.connect({ host: server.host, username: server.username, privateKey: server.privateKey });
    
    const result = await ssh.execCommand(command, { cwd });
    ssh.dispose();

    if (result.stderr && result.code !== 0) throw new Error(result.stderr);
    return result.stdout;
}

module.exports = {
    getServers,
    addServer,
    deleteServer,
    getServerStatus,
    executeRemoteCommand
};
