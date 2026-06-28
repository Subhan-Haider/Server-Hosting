const fs = require('fs');
const path = require('path');
const net = require('net');

function isPortFree(port) {
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

const PORT_MAP_FILE = path.join(__dirname, 'port-map.json');

// Initialize port map if it doesn't exist
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

const killPort = require('kill-port');

async function assignFreePort(projectName, domain, projectPath, meta = {}) {
    const portMap = loadPortMap();
    
    // Check if project already has a port assigned
    if (portMap[projectName]) {
        // If it already exists, just update the meta and return existing port
        portMap[projectName] = { ...portMap[projectName], domain, path: projectPath, ...meta };
        savePortMap(portMap);
        return portMap[projectName].port;
    }

    // Find a free port between 6100 and 7000 (avoids frontend:3000, backend:4000, serve:5000)
    const port = await findFreePortInRange(6100, 7000);


    // Save to map
    portMap[projectName] = { 
        port, 
        domain, 
        path: projectPath, 
        createdAt: new Date().toISOString(),
        ...meta // deployType, githubUrl, githubPat, branch, installCmd, buildCmd, startCmd
    };
    savePortMap(portMap);

    return port;
}

function getProjectDetails(projectName) {
    const portMap = loadPortMap();
    return portMap[projectName] || null;
}

function removeProject(projectName) {
    const portMap = loadPortMap();
    if (portMap[projectName]) {
        delete portMap[projectName];
        savePortMap(portMap);
    }
}

function getAllProjects() {
    return loadPortMap();
}

module.exports = {
    assignFreePort,
    getProjectDetails,
    removeProject,
    getAllProjects
};
