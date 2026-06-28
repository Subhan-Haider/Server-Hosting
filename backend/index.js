const express = require('express');
const cors = require('cors');
const portManager = require('./portManager');
const pm2Service = require('./pm2Service');
const cloudflareService = require('./cloudflareService');
const gitService = require('./gitService');

const app = express();
app.use(cors());
app.use(express.json());

// Endpoints

app.get('/api/apps', async (req, res) => {
    try {
        const pm2Apps = await pm2Service.listProjects();
        const storedProjects = portManager.getAllProjects();
        
        // Merge PM2 stats with stored project info (domain, port, path)
        const apps = Object.keys(storedProjects).map(name => {
            const stored = storedProjects[name];
            const pm2App = pm2Apps.find(p => p.name === name);
            
            return {
                name,
                domain: stored.domain,
                port: stored.port,
                path: stored.path,
                deployType: stored.deployType,
                branch: stored.branch,
                githubUrl: stored.githubUrl,
                createdAt: stored.createdAt,
                status: pm2App ? pm2App.status : 'stopped',
                cpu: pm2App ? pm2App.cpu : 0,
                memory: pm2App ? pm2App.memory : 0,
                uptime: pm2App ? pm2App.uptime : 0
            };
        });
        
        res.json({ apps });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const envService = require('./envService');
const authService = require('./authService');

// Auth Endpoints
app.post('/api/auth/device', async (req, res) => {
    try {
        const data = await authService.requestDeviceCode();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/poll', async (req, res) => {
    try {
        const { device_code } = req.body;
        const data = await authService.pollForToken(device_code);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Env Endpoints
app.post('/api/env/detect', async (req, res) => {
    try {
        const { githubUrl, githubPat, name, branch = 'main' } = req.body;
        // In a real system, we'd clone first to a temp dir, then detect env keys.
        // For efficiency, since cloneAndSetup does everything, we split it here.
        // But for simplicity, we'll clone it, check envs, and wait.
        
        // Let's use gitService to just clone
        const result = await gitService.cloneAndSetup(githubUrl, githubPat, name, branch, '', '', '');
        
        const envKeys = envService.scanForEnvKeys(result.projectPath);
        res.json({ keys: envKeys, projectPath: result.projectPath, projectName: result.projectName });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/deploy', async (req, res) => {
    const { deployType, name, domain, path, githubUrl, githubPat, branch = 'main', installCmd, buildCmd, startCmd, envVars } = req.body;
    
    if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
    }
    
    try {
        let finalPath = path;
        let finalName = name;
        let finalStartCmd = startCmd || 'npm start';
        let meta = { deployType };
        
        if (deployType === 'github') {
            if (!githubUrl) return res.status(400).json({ error: 'GitHub URL is required for github deployment' });
            
            // Wait, if /api/env/detect was called, it's already cloned.
            // We should just check if the directory exists and write the env file, then install/build.
            // For now, let's just write the env file if envVars are provided.
            if (envVars && path) {
                envService.writeEnvFile(path, envVars);
                // Assume already cloned by /api/env/detect, so just run install/build
                // and skip cloneAndSetup to avoid "already exists" error.
                // But wait, the previous code doesn't support this cleanly. 
                // We'll catch the error and run redeploy logic if it exists.
                try {
                    await gitService.cloneAndSetup(githubUrl, githubPat, name, branch, installCmd, buildCmd, startCmd);
                } catch (e) {
                    if (e.message.includes('already exists')) {
                        console.log('Project exists, writing env and running build steps...');
                        await gitService.redeployRepo(path, branch, installCmd, buildCmd);
                    } else {
                        throw e;
                    }
                }
            } else {
                const setupResult = await gitService.cloneAndSetup(githubUrl, githubPat, name, branch, installCmd, buildCmd, startCmd);
                finalPath = setupResult.projectPath;
                finalName = setupResult.projectName;
                finalStartCmd = setupResult.startCmd;
            }
            
            meta = {
                deployType, githubUrl, githubPat, branch,
                installCmd: installCmd, buildCmd: buildCmd, startCmd: finalStartCmd
            };
        } else {
            if (!name || !path) return res.status(400).json({ error: 'Name and path are required' });
            if (envVars) envService.writeEnvFile(path, envVars);
            meta.startCmd = finalStartCmd;
        }
        
        const port = await portManager.assignFreePort(finalName, domain, finalPath, meta);
        await pm2Service.startProject(finalName, finalPath, port, finalStartCmd);
        await cloudflareService.updateCloudflareConfig(domain, port);
        
        res.json({ message: 'Project deployed successfully', name: finalName, port, domain });
    } catch (err) {
        console.error('Deployment error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/redeploy/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (project.deployType !== 'github') return res.status(400).json({ error: 'Only GitHub deployments can be redeployed' });
        
        // Stop PM2 process first
        await pm2Service.stopProject(name).catch(() => {});
        
        // Redeploy repo (git fetch, reset, install, build)
        await gitService.redeployRepo(project.path, project.branch || 'main', project.installCmd, project.buildCmd);
        
        // Start PM2 process again
        await pm2Service.startProject(name, project.path, project.port, project.startCmd);
        
        res.json({ message: 'Redeployed successfully' });
    } catch (err) {
        console.error('Redeploy error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/start/:name', async (req, res) => {
    try {
        const { name } = req.params;
        // In case it's completely stopped or removed from PM2, we might need to use startProject again
        // But PM2 'start' on an existing stopped process will restart it.
        // Actually, if it's in PM2 memory, pm2.restart is better for stopped apps.
        // Let's just use restart for both start and restart.
        await pm2Service.restartProject(name);
        res.json({ message: 'Started' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stop/:name', async (req, res) => {
    try {
        const { name } = req.params;
        await pm2Service.stopProject(name);
        res.json({ message: 'Stopped' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/restart/:name', async (req, res) => {
    try {
        const { name } = req.params;
        await pm2Service.restartProject(name);
        res.json({ message: 'Restarted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/delete/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        
        if (project) {
            await pm2Service.deleteProject(name).catch(() => {}); // ignore error if not in pm2
            await cloudflareService.removeCloudflareConfig(project.domain);
            portManager.removeProject(name);
        }
        
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/logs/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const logs = await pm2Service.getLogs(name);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});
