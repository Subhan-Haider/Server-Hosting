/**
 * dockerService.js
 * Manages standalone databases using Docker (Postgres, MySQL, Redis).
 */
const { exec } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const secretsManager = require('./secretsManager');

const DB_CONFIG_PATH = path.join(__dirname, 'databases.json');

function getDatabases() {
    try {
        if (fs.existsSync(DB_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(DB_CONFIG_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('[Docker] Failed to load databases.json:', e.message);
    }
    return [];
}

function saveDatabases(dbs) {
    fs.writeFileSync(DB_CONFIG_PATH, JSON.stringify(dbs, null, 2));
}

function generatePassword() {
    return crypto.randomBytes(16).toString('hex');
}

async function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) return reject(new Error(stderr || error.message));
            resolve(stdout.trim());
        });
    });
}

async function createDatabase(type, name) {
    const dbs = getDatabases();
    if (dbs.find(d => d.name === name)) {
        throw new Error('Database with this name already exists');
    }

    const password = generatePassword();
    let port = 0;
    let containerName = `db_${type}_${name}`;
    let cmd = '';
    let envKeyPrefix = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    // Find a free port
    const usedPorts = dbs.map(d => d.port);
    const startPort = type === 'postgres' ? 5432 : type === 'mysql' ? 3306 : 6379;
    port = startPort;
    while (usedPorts.includes(port)) {
        port++;
    }

    if (type === 'postgres') {
        cmd = `docker run -d --name ${containerName} -e POSTGRES_PASSWORD=${password} -e POSTGRES_USER=admin -e POSTGRES_DB=${name} -p ${port}:5432 -v ${containerName}_data:/var/lib/postgresql/data --restart unless-stopped postgres:15-alpine`;
        secretsManager.saveSecret(`${envKeyPrefix}_DATABASE_URL`, `postgresql://admin:${password}@127.0.0.1:${port}/${name}`);
    } else if (type === 'mysql') {
        cmd = `docker run -d --name ${containerName} -e MYSQL_ROOT_PASSWORD=${password} -e MYSQL_DATABASE=${name} -p ${port}:3306 -v ${containerName}_data:/var/lib/mysql --restart unless-stopped mysql:8.0`;
        secretsManager.saveSecret(`${envKeyPrefix}_DATABASE_URL`, `mysql://root:${password}@127.0.0.1:${port}/${name}`);
    } else if (type === 'redis') {
        cmd = `docker run -d --name ${containerName} -p ${port}:6379 -v ${containerName}_data:/data --restart unless-stopped redis:7-alpine redis-server --requirepass ${password}`;
        secretsManager.saveSecret(`${envKeyPrefix}_REDIS_URL`, `redis://:${password}@127.0.0.1:${port}`);
    } else {
        throw new Error('Unsupported database type');
    }

    try {
        await runCommand(cmd);
        const db = { id: Date.now().toString(), name, type, containerName, port, status: 'running', createdAt: new Date().toISOString() };
        dbs.push(db);
        saveDatabases(dbs);
        return db;
    } catch (err) {
        throw new Error(`Failed to start Docker container: ${err.message}. Is Docker installed and running?`);
    }
}

async function deleteDatabase(id) {
    const dbs = getDatabases();
    const index = dbs.findIndex(d => d.id === id);
    if (index === -1) throw new Error('Database not found');

    const db = dbs[index];
    try {
        await runCommand(`docker rm -f ${db.containerName}`);
        await runCommand(`docker volume rm ${db.containerName}_data`).catch(() => {}); // Ignore volume delete error
    } catch (err) {
        console.error(`[Docker] Error deleting container ${db.containerName}:`, err.message);
    }

    dbs.splice(index, 1);
    saveDatabases(dbs);
}

async function getDatabaseStatus() {
    const dbs = getDatabases();
    for (const db of dbs) {
        try {
            const out = await runCommand(`docker inspect -f '{{.State.Status}}' ${db.containerName}`);
            db.status = out.trim() === "'running'" || out.trim() === "running" ? 'running' : 'stopped';
        } catch (e) {
            db.status = 'error';
        }
    }
    return dbs;
}

module.exports = {
    getDatabases,
    createDatabase,
    deleteDatabase,
    getDatabaseStatus
};
