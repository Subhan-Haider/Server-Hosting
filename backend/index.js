const express = require('express');
const cors = require('cors');
const portManager = require('./portManager');
const pm2Service = require('./pm2Service');
const cloudflareService = require('./cloudflareService');
const gitService = require('./gitService');
const envService = require('./envService');
const authService = require('./authService');
const historyManager = require('./historyManager');
const secretsManager = require('./secretsManager');

const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Endpoints

app.get('/', (req, res) => {
  res.json({
    status: "Server Hosting API running",
    routes: "/api/apps, /api/deploy, /api/logs"
  });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', port: process.env.PORT || 4000 });
});

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
    const { deployType, name, domain, path, githubUrl, githubPat, branch = 'main', installCmd, buildCmd, startCmd, envVars, globalSecretKeys } = req.body;
    const deployStartTime = Date.now();
    
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const logger = (msg) => {
        res.write(`data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`);
    };

    if (!domain) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Domain is required' })}\n\n`);
        return res.end();
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
            // Handle Environment Variables and Global Secrets
            let finalEnvVars = null;
            if (envVars || (globalSecretKeys && globalSecretKeys.length > 0)) {
                finalEnvVars = { ...(envVars || {}) };
                if (globalSecretKeys && globalSecretKeys.length > 0) {
                    const rawSecrets = secretsManager.getRawSecrets(globalSecretKeys);
                    finalEnvVars = { ...finalEnvVars, ...rawSecrets };
                }
            }

            if (finalEnvVars && path) {
                envService.writeEnvFile(path, finalEnvVars);
                try {
                    const commitHash = await gitService.redeployRepo(path, branch, installCmd, buildCmd, logger);
                    meta.commitHash = commitHash;
                } catch (e) {
                    if (e.message.includes('already exists')) {
                        logger('Project exists, writing env and running build steps...\n');
                        const commitHash = await gitService.redeployRepo(path, branch, installCmd, buildCmd, logger);
                        meta.commitHash = commitHash;
                    } else {
                        throw e;
                    }
                }
            } else {
                const setupResult = await gitService.cloneAndSetup(githubUrl, githubPat, name, branch, installCmd, buildCmd, startCmd, logger);
                finalPath = setupResult.projectPath;
                finalName = setupResult.projectName;
                finalStartCmd = setupResult.startCmd;
                meta.commitHash = setupResult.commitHash;
            }
            
            meta = {
                deployType, githubUrl, githubPat, branch,
                installCmd: installCmd, buildCmd: buildCmd, startCmd: finalStartCmd
            };
        } else {
            if (!name || !path) return res.status(400).json({ error: 'Name and path are required' });
            if (envVars || (globalSecretKeys && globalSecretKeys.length > 0)) {
                let finalEnvVars = { ...(envVars || {}) };
                if (globalSecretKeys && globalSecretKeys.length > 0) {
                    const rawSecrets = secretsManager.getRawSecrets(globalSecretKeys);
                    finalEnvVars = { ...finalEnvVars, ...rawSecrets };
                }
                envService.writeEnvFile(path, finalEnvVars);
            }
            meta.startCmd = finalStartCmd;
        }
        
        logger('Assigning port...\n');
        const port = await portManager.assignFreePort(finalName, domain, finalPath, meta);
        
        logger('Starting PM2 process...\n');
        await pm2Service.startProject(finalName, finalPath, port, finalStartCmd);
        
        logger('Updating Cloudflare Tunnel...\n');
        await cloudflareService.updateCloudflareConfig(domain, port);
        
        historyManager.logDeployment(domain, {
            status: 'success',
            commitHash: meta.commitHash,
            durationMs: Date.now() - deployStartTime,
            type: 'deploy'
        });

        logger(`Deployment successful! Domain: ${domain}, Port: ${port}\n`);
        res.write(`data: ${JSON.stringify({ type: 'success', name: finalName, port, domain })}\n\n`);
        res.end();
    } catch (err) {
        console.error('Deployment error:', err);
        logger(`Deployment error: ${err.message}\n`);
        if (domain) {
            historyManager.logDeployment(domain, {
                status: 'error',
                error: err.message,
                durationMs: Date.now() - deployStartTime,
                type: 'deploy'
            });
        }
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
    }
});

app.post('/api/redeploy/:name', async (req, res) => {
    const deployStartTime = Date.now();
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (project.deployType !== 'github') return res.status(400).json({ error: 'Only GitHub deployments can be redeployed' });
        
        // Stop PM2 process first
        await pm2Service.stopProject(name).catch(() => {});
        
        // Redeploy repo (git fetch, reset, install, build)
        const commitHash = await gitService.redeployRepo(project.path, project.branch || 'main', project.installCmd, project.buildCmd);
        
        // Start PM2 process again
        await pm2Service.startProject(name, project.path, project.port, project.startCmd);
        
        historyManager.logDeployment(project.domain, {
            status: 'success',
            commitHash,
            durationMs: Date.now() - deployStartTime,
            type: 'redeploy'
        });

        res.json({ message: 'Redeployed successfully' });
    } catch (err) {
        console.error('Redeploy error:', err);
        if (req.params.name) {
            const project = portManager.getProjectDetails(req.params.name);
            if (project) {
                historyManager.logDeployment(project.domain, {
                    status: 'error',
                    error: err.message,
                    durationMs: Date.now() - deployStartTime,
                    type: 'redeploy'
                });
            }
        }
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

app.delete('/api/projects/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        
        await pm2Service.stopProject(name).catch(() => {});
        await pm2Service.deleteProject(name).catch(() => {});
        
        if (project && project.domain) {
            await cloudflareService.removeCloudflareConfig(project.domain);
            historyManager.deleteHistory(project.domain);
        }
        
        portManager.removeProject(name);
        res.json({ message: 'Project removed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- History & Rollback Endpoints ---
app.get('/api/history/:domain', (req, res) => {
    try {
        const history = historyManager.getHistory(req.params.domain);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/rollback/:domain/:commit', async (req, res) => {
    try {
        const { domain, commit } = req.params;
        const project = portManager.getProjectByDomain(domain);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        const startTime = Date.now();
        await pm2Service.stopProject(project.name).catch(() => {});
        
        await gitService.rollbackRepo(project.path, commit, project.installCmd, project.buildCmd);
        await pm2Service.startProject(project.name, project.path, project.port, project.startCmd);
        
        historyManager.logDeployment(domain, {
            status: 'success',
            commitHash: commit,
            durationMs: Date.now() - startTime,
            type: 'rollback'
        });
        
        res.json({ message: 'Rolled back successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- GitHub Webhook Endpoint ---
app.post('/api/webhook/github', async (req, res) => {
    try {
        // GitHub sends repository.html_url or clone_url
        const repoUrl = req.body.repository?.html_url || req.body.repository?.clone_url;
        // Ref is like "refs/heads/main"
        const ref = req.body.ref;
        if (!repoUrl || !ref) {
            return res.status(200).send('Ignored: missing repoUrl or ref');
        }

        const branch = ref.replace('refs/heads/', '');
        const allProjects = portManager.getAllProjects();
        const entries = Object.values(allProjects);

        let triggered = 0;
        for (const project of entries) {
            if (project.deployType === 'github' && project.githubUrl) {
                // simple check if URL matches (ignoring trailing .git)
                const url1 = project.githubUrl.replace(/\.git$/, '').toLowerCase();
                const url2 = repoUrl.replace(/\.git$/, '').toLowerCase();
                
                if (url1 === url2 && (project.branch === branch || !project.branch && branch === 'main')) {
                    // Match found! Trigger redeploy in background
                    console.log(`[Webhook] Auto-redeploying ${project.name} due to push on ${branch}`);
                    triggered++;
                    
                    const startTime = Date.now();
                    (async () => {
                        try {
                            await pm2Service.stopProject(project.name).catch(() => {});
                            const commitHash = await gitService.redeployRepo(project.path, branch, project.installCmd, project.buildCmd);
                            await pm2Service.startProject(project.name, project.path, project.port, project.startCmd);
                            historyManager.logDeployment(project.domain, {
                                status: 'success',
                                commitHash,
                                durationMs: Date.now() - startTime,
                                type: 'webhook-redeploy'
                            });
                        } catch (err) {
                            console.error(`[Webhook] Failed to redeploy ${project.name}:`, err);
                            historyManager.logDeployment(project.domain, {
                                status: 'error',
                                error: err.message,
                                durationMs: Date.now() - startTime,
                                type: 'webhook-redeploy'
                            });
                        }
                    })();
                }
            }
        }

        res.status(200).json({ message: `Triggered ${triggered} redeployments` });
    } catch (err) {
        console.error('[Webhook] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- Secrets Vault Endpoints ---
app.get('/api/secrets', (req, res) => {
    try {
        const maskedSecrets = secretsManager.getSecrets(true);
        res.json(maskedSecrets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/secrets', (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || !value) return res.status(400).json({ error: 'Key and value required' });
        secretsManager.setSecret(key, value);
        res.json({ message: 'Secret saved successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/secrets/:key', (req, res) => {
    try {
        secretsManager.deleteSecret(req.params.key);
        res.json({ message: 'Secret deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Crash Reporting Endpoints ---
app.post('/api/report-crash', (req, res) => {
    try {
        const crash = req.body;
        crash.id = Date.now().toString();
        crashStore.unshift(crash);
        if (crashStore.length > 50) crashStore.pop(); // Keep only last 50
        console.log(`[Crash Alert] ${crash.appName} crashed: ${crash.message}`);
        res.status(200).json({ message: 'Crash reported' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/crashes', (req, res) => {
    res.json(crashStore);
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
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Backend server running on port ${PORT}`);

    // On startup, batch-sync all deployed apps into deployments-config.yml
    // Single file write + single tunnel restart — no repeated restarts
    try {
        const portMap = portManager.loadPortMap();
        const apps = Object.values(portMap).filter(a => a.domain && a.port);
        if (apps.length > 0) {
            console.log(`[Startup] Syncing ${apps.length} app(s) into deployments-config.yml...`);
            await cloudflareService.syncAllApps(apps);
            console.log('[Startup] Sync complete.');
        }
    } catch (err) {
        console.error('[Startup] Failed to sync apps:', err.message);
    }
});
