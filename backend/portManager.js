const fs = require('fs');
const path = require('path');
const net = require('net');

// ─── Reserved Ports ────────────────────────────────────────────────────────────
// These ports are used by the platform itself and must NEVER be assigned to apps
const RESERVED_PORTS = new Set([
    3000,  // Frontend Dashboard
    4000,  // Backend API
    5000,  // serve default / alternate frontend
    5173,  // Vite dev server
    6003,  // Ecosystem backend port
    6004,  // Alternate frontend port
    8080,  // Common HTTP alt
    8443,  // Common HTTPS alt
    22,    // SSH
    80,    // HTTP
    443,   // HTTPS
]);

// ─── Port Availability ─────────────────────────────────────────────────────────
function isPortFree(port) {
    if (RESERVED_PORTS.has(port)) return Promise.resolve(false);
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, () => {
            server.once('close', () => resolve(true));
            server.close();
        });
        server.on('error', () => resolve(false));
    });
}

async function findFreePortInRange(start, end) {
    for (let p = start; p <= end; p++) {
        if (await isPortFree(p)) return p;
    }
    throw new Error('No free ports available in range ' + start + '-' + end);
}

// ─── Port Map Storage ──────────────────────────────────────────────────────────
const PORT_MAP_FILE = path.join(__dirname, 'port-map.json');

if (!fs.existsSync(PORT_MAP_FILE)) {
    fs.writeFileSync(PORT_MAP_FILE, JSON.stringify({}, null, 2));
}

function loadPortMap() {
    try {
        const data = fs.readFileSync(PORT_MAP_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Failed to load port map:', err);
        return {};
    }
}

function savePortMap(map) {
    try {
        fs.writeFileSync(PORT_MAP_FILE, JSON.stringify(map, null, 2));
    } catch (err) {
        console.error('Failed to save port map:', err);
    }
}

// ─── Core Functions ────────────────────────────────────────────────────────────

async function assignFreePort(projectName, domain, projectPath, meta = {}) {
    const portMap = loadPortMap();

    // Check if project already has a port assigned
    if (portMap[projectName]) {
        portMap[projectName] = { ...portMap[projectName], domain, path: projectPath, ...meta };
        savePortMap(portMap);
        return portMap[projectName].port;
    }

    // Check if domain is already in use by another project
    const domainConflict = Object.entries(portMap).find(([name, p]) => p.domain === domain);
    if (domainConflict) {
        throw new Error(`Domain "${domain}" is already assigned to project "${domainConflict[0]}". Delete it first or use a different domain.`);
    }

    // Assign a free port in the safe range (6100–7000)
    const port = await findFreePortInRange(6100, 7000);

    portMap[projectName] = {
        port,
        domain,
        path: projectPath,
        createdAt: new Date().toISOString(),
        ...meta
    };
    savePortMap(portMap);

    console.log(`[PortManager] Assigned port ${port} to "${projectName}" → ${domain}`);
    return port;
}

function getProjectDetails(projectName) {
    const portMap = loadPortMap();
    return portMap[projectName] || null;
}

function getProjectByDomain(domain) {
    const portMap = loadPortMap();
    const entry = Object.entries(portMap).find(([, p]) => p.domain === domain);
    return entry ? { name: entry[0], ...entry[1] } : null;
}

function removeProject(projectName) {
    const portMap = loadPortMap();
    if (portMap[projectName]) {
        const { port, domain } = portMap[projectName];
        delete portMap[projectName];
        savePortMap(portMap);
        console.log(`[PortManager] Removed "${projectName}" (port ${port}, domain ${domain})`);
    }
}

function getAllProjects() {
    return loadPortMap();
}

function getStats() {
    const portMap = loadPortMap();
    const projects = Object.entries(portMap);
    const ports = projects.map(([, p]) => p.port);
    return {
        totalProjects: projects.length,
        portsInUse: ports,
        nextAvailablePort: Math.max(6100, ...ports) + 1,
        reservedPorts: [...RESERVED_PORTS].sort((a, b) => a - b),
    };
}

// Update just the meta (e.g. after a redeploy with new start command)
function updateProjectMeta(projectName, meta) {
    const portMap = loadPortMap();
    if (!portMap[projectName]) throw new Error(`Project "${projectName}" not found`);
    portMap[projectName] = { ...portMap[projectName], ...meta };
    savePortMap(portMap);
}

module.exports = {
    assignFreePort,
    getProjectDetails,
    getProjectByDomain,
    removeProject,
    getAllProjects,
    getStats,
    updateProjectMeta,
    loadPortMap,
    RESERVED_PORTS,
};
