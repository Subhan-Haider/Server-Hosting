require('dotenv').config({ path: '.env.local' });
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
const webhookService = require('./webhookService');
const healthService = require('./healthService');
const metricsService = require('./metricsService');
const notificationService = require('./notificationService');
const templates = require('./templates');
const cronService = require('./cronService');
const appHealthService = require('./appHealthService');
const s3BackupService = require('./s3BackupService');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const authMiddleware = require('./authMiddleware');

// Endpoints
app.use('/api', authMiddleware);

app.get('/', (req, res) => {
  res.json({
    status: "Server Hosting API running",
    routes: "/api/apps, /api/deploy, /api/logs"
  });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', port: process.env.PORT || 4000 });
});

app.get('/api/health', async (req, res) => {
    const health = await healthService.getSystemHealth();
    if (health) res.json(health);
    else res.status(500).json({ error: 'Failed to fetch system health' });
});

app.get('/api/apps', async (req, res) => {
    try {
        const pm2Apps = await pm2Service.listProjects();
        const storedProjects = portManager.getAllProjects();
        
        // Merge PM2 stats with stored project info (domain, port, path)
        const apps = Object.keys(storedProjects).map(name => {
            const stored = storedProjects[name];
            const pm2ProcessName = stored.pm2Name || name;
            const pm2App = pm2Apps.find(p => p.name === pm2ProcessName);
            const healthInfo = appHealthService.getHealthStatus(stored.domain);
            
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
                healthStatus: healthInfo.status,
                cpu: pm2App ? pm2App.cpu : 0,
                memory: pm2App ? pm2App.memory : 0,
                uptime: pm2App ? pm2App.uptime : 0,
                pm2Name: pm2ProcessName
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
        
        const deploymentData = {
            name: finalName,
            domain: domain,
            status: 'success',
            commitHash: meta.commitHash,
            durationMs: Date.now() - deployStartTime,
            type: 'deploy'
        };
        historyManager.logDeployment(domain, deploymentData);
        webhookService.sendWebhook(deploymentData);
        notificationService.sendNotifications({ ...deploymentData, branch: meta.branch });

        logger(`Deployment successful! Domain: ${domain}, Port: ${port}\n`);
        res.write(`data: ${JSON.stringify({ type: 'success', name: finalName, port, domain })}\n\n`);
        res.end();
    } catch (err) {
        console.error('Deployment error:', err);
        logger(`Deployment error: ${err.message}\n`);
        if (domain) {
            const deploymentData = {
                name: name,
                domain: domain,
                status: 'error',
                error: err.message,
                durationMs: Date.now() - deployStartTime,
                type: 'deploy'
            };
            historyManager.logDeployment(domain, deploymentData);
            webhookService.sendWebhook(deploymentData);
            notificationService.sendNotifications(deploymentData);
        }
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
    }
});

app.post('/api/redeploy/:name', async (req, res) => {
    const deployStartTime = Date.now();

    // Set up SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const logger = (msg) => {
        res.write(`data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`);
    };

    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        
        if (!project) {
            res.write(`data: ${JSON.stringify({ type: 'error', error: 'Project not found' })}\n\n`);
            return res.end();
        }
        if (project.deployType !== 'github') {
            res.write(`data: ${JSON.stringify({ type: 'error', error: 'Only GitHub deployments can be redeployed' })}\n\n`);
            return res.end();
        }
        
        // Zero-Downtime Blue/Green Deploy
        const oldPm2Name = project.pm2Name || name;
        const oldPath = project.path;
        
        logger(`Starting zero-downtime redeploy for ${name}...\n`);
        logger(`Repository: ${project.githubUrl}\n`);
        logger(`Branch: ${project.branch || 'main'}\n\n`);

        // 1. Redeploy repo to NEW folder
        const { commitHash, newPath } = await gitService.redeployRepo(
            project.githubUrl, 
            project.githubPat, 
            name, 
            project.branch || 'main', 
            project.installCmd, 
            project.buildCmd,
            logger
        );
        
        logger(`\nBuild complete! Switching traffic...\n`);

        // 2. Assign NEW port and start new PM2 process
        const newPm2Name = `${name}-${Date.now()}`;
        const newPort = await portManager.assignFreePort(name, project.domain, newPath, { ...project, pm2Name: newPm2Name });
        
        // Inherit global secrets and local env vars
        try {
            if (fs.existsSync(path.join(oldPath, '.env.local'))) {
                fs.copyFileSync(path.join(oldPath, '.env.local'), path.join(newPath, '.env.local'));
                logger(`Copied .env.local from old deployment\n`);
            }
        } catch (e) {}
        
        logger(`Starting new PM2 process on port ${newPort}...\n`);
        await pm2Service.startProject(newPm2Name, newPath, newPort, project.startCmd);
        
        // 3. Update Cloudflare to new port
        logger(`Updating Cloudflare routing...\n`);
        await cloudflareService.updateCloudflareConfig(project.domain, newPort);
        
        // 4. Stop and delete old PM2 process, delete old directory
        logger(`Cleaning up old deployment...\n`);
        await pm2Service.deleteProject(oldPm2Name).catch(() => {});
        fs.rmSync(oldPath, { recursive: true, force: true });
        
        const deploymentData = {
            name: name,
            domain: project.domain,
            status: 'success',
            commitHash,
            durationMs: Date.now() - deployStartTime,
            type: 'redeploy'
        };
        historyManager.logDeployment(project.domain, deploymentData);
        webhookService.sendWebhook(deploymentData);

        logger(`\n✅ Redeploy successful! Live at https://${project.domain}\n`);
        res.write(`data: ${JSON.stringify({ type: 'success', name, port: newPort, domain: project.domain })}\n\n`);
        res.end();
    } catch (err) {
        console.error('Redeploy error:', err);
        logger(`\n❌ Redeploy failed: ${err.message}\n`);
        if (req.params.name) {
            const project = portManager.getProjectDetails(req.params.name);
            if (project) {
                const deploymentData = {
                    name: req.params.name,
                    domain: project.domain,
                    status: 'error',
                    error: err.message,
                    durationMs: Date.now() - deployStartTime,
                    type: 'redeploy'
                };
                historyManager.logDeployment(project.domain, deploymentData);
                webhookService.sendWebhook(deploymentData);
            }
        }
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
    }
});

app.post('/api/clone/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const { cloneName } = req.body;
        
        if (!cloneName) return res.status(400).json({ error: 'Clone name is required' });
        
        const project = portManager.getProjectDetails(name);
        if (!project) return res.status(404).json({ error: 'Original project not found' });
        if (project.deployType !== 'github') return res.status(400).json({ error: 'Only GitHub deployments can be cloned' });
        
        const cloneDomain = `${cloneName}.subhan.tech`;
        
        // 1. Redeploy repo to NEW folder
        const { commitHash, newPath } = await gitService.redeployRepo(
            project.githubUrl, 
            project.githubPat, 
            cloneName, 
            project.branch || 'main', 
            project.installCmd, 
            project.buildCmd
        );
        
        // 2. Assign NEW port and start new PM2 process
        const newPm2Name = cloneName;
        const newPort = await portManager.assignFreePort(cloneName, cloneDomain, newPath, { ...project, pm2Name: newPm2Name, domain: cloneDomain, path: newPath, name: cloneName });
        
        // Inherit global secrets and local env vars
        const envKeys = envService.scanForEnvKeys(newPath);
        if (envKeys.length > 0 || fs.existsSync(path.join(project.path, '.env.local'))) {
            try {
                if (fs.existsSync(path.join(project.path, '.env.local'))) {
                    fs.copyFileSync(path.join(project.path, '.env.local'), path.join(newPath, '.env.local'));
                }
            } catch (e) {}
        }
        
        await pm2Service.startProject(newPm2Name, newPath, newPort, project.startCmd);
        
        // 3. Update Cloudflare to new port
        await cloudflareService.updateCloudflareConfig(cloneDomain, newPort);
        
        res.json({ message: 'Cloned successfully', cloneName, cloneDomain });
    } catch (err) {
        console.error('Clone error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/start/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        const pm2Name = project?.pm2Name || name;
        await pm2Service.restartProject(pm2Name);
        res.json({ message: 'Started' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stop/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        const pm2Name = project?.pm2Name || name;
        await pm2Service.stopProject(pm2Name);
        res.json({ message: 'Stopped' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/restart/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        const pm2Name = project?.pm2Name || name;
        await pm2Service.restartProject(pm2Name);
        res.json({ message: 'Restarted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        
        const pm2Name = project?.pm2Name || name;
        await pm2Service.stopProject(pm2Name).catch(() => {});
        await pm2Service.deleteProject(pm2Name).catch(() => {});
        
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
        const oldPm2Name = project.pm2Name || project.name;
        
        await pm2Service.stopProject(oldPm2Name).catch(() => {});
        
        await gitService.rollbackRepo(project.path, commit, project.installCmd, project.buildCmd);
        await pm2Service.startProject(oldPm2Name, project.path, project.port, project.startCmd);
        
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

const prService = require('./prService');

// --- GitHub Webhook Endpoint ---
app.post('/api/webhook/github', async (req, res) => {
    try {
        const repoUrl = req.body.repository?.html_url || req.body.repository?.clone_url;
        const repoFullName = req.body.repository?.full_name;
        
        // Handle Pull Request Events
        if (req.body.pull_request) {
            const action = req.body.action;
            const prNumber = req.body.number;
            const prBranch = req.body.pull_request.head.ref;
            
            if (!repoUrl || !prBranch) {
                return res.status(200).send('Ignored: missing repoUrl or prBranch');
            }
            
            const allProjects = portManager.getAllProjects();
            const entries = Object.values(allProjects);
            
            // Find the base project that matches this repo
            let baseProject = null;
            for (const project of entries) {
                if (project.deployType === 'github' && project.githubUrl && !project.isPR) {
                    const url1 = project.githubUrl.replace(/\.git$/, '').toLowerCase();
                    const url2 = repoUrl.replace(/\.git$/, '').toLowerCase();
                    if (url1 === url2) {
                        baseProject = project;
                        break;
                    }
                }
            }
            
            if (baseProject) {
                // Handle in background
                prService.handlePullRequest(action, repoFullName, prNumber, prBranch, repoUrl, baseProject).catch(e => console.error(e));
                return res.status(200).json({ message: `Processing PR ${action} for ${baseProject.name}` });
            } else {
                return res.status(200).json({ message: `Ignored: No base project found for repo ${repoUrl}` });
            }
        }

        // Handle Push Events
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

// --- File Explorer Endpoints ---
app.get('/api/files/:name', (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        const dirParam = req.query.dir || '';
        const targetPath = path.join(project.path, dirParam);
        
        // Security check
        if (!targetPath.startsWith(project.path)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: 'Directory not found' });
        }

        const items = fs.readdirSync(targetPath, { withFileTypes: true });
        const result = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join(dirParam, item.name).replace(/\\/g, '/')
        }));
        
        result.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/file/:name/read', (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        const fileParam = req.query.file || '';
        const targetPath = path.join(project.path, fileParam);
        
        if (!targetPath.startsWith(project.path)) return res.status(403).json({ error: 'Access denied' });
        if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'File not found' });
        
        const content = fs.readFileSync(targetPath, 'utf8');
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/file/:name/write', (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        const fileParam = req.query.file || '';
        const { content } = req.body;
        const targetPath = path.join(project.path, fileParam);
        
        if (!targetPath.startsWith(project.path)) return res.status(403).json({ error: 'Access denied' });
        
        fs.writeFileSync(targetPath, content, 'utf8');
        res.json({ message: 'File saved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/crashes', (req, res) => {
    res.json(crashStore);
});

// ─── Environment Variables Editor ──────────────────────────────────────────
app.get('/api/env/:name', (req, res) => {
    try {
        const project = portManager.getProjectDetails(req.params.name);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        const envFiles = ['.env', '.env.local'];
        let vars = {};
        for (const file of envFiles) {
            const p = path.join(project.path, file);
            if (fs.existsSync(p)) {
                const lines = fs.readFileSync(p, 'utf8').split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) continue;
                    const eqIdx = trimmed.indexOf('=');
                    if (eqIdx > 0) {
                        const key = trimmed.substring(0, eqIdx).trim();
                        const val = trimmed.substring(eqIdx + 1).trim().replace(/^"|"$/g, '');
                        vars[key] = val;
                    }
                }
                break;
            }
        }
        res.json({ vars });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/env/:name', async (req, res) => {
    try {
        const project = portManager.getProjectDetails(req.params.name);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        const { vars } = req.body;
        if (!vars || typeof vars !== 'object') return res.status(400).json({ error: 'vars object required' });
        envService.writeEnvFile(project.path, vars);
        // Restart the PM2 process so new env takes effect
        const pm2Name = project.pm2Name || req.params.name;
        await pm2Service.restartProject(pm2Name);
        res.json({ message: 'Environment variables saved and project restarted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GitHub Webhook (push-to-deploy) ───────────────────────────────────────
const pendingWebhooks = new Map(); // debounce per app
app.post('/webhook/:name', express.raw({ type: '*/*' }), async (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        // Verify HMAC signature if secret is set
        const webhookSecret = secretsManager.getSecret(`WEBHOOK_SECRET_${name}`);
        if (webhookSecret) {
            const sig = req.headers['x-hub-signature-256'];
            const expected = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(req.body).digest('hex');
            if (sig !== expected) return res.status(401).json({ error: 'Invalid signature' });
        }

        const payload = JSON.parse(req.body.toString());
        const pushedBranch = payload.ref ? payload.ref.replace('refs/heads/', '') : null;
        const configuredBranch = project.branch || 'main';

        if (pushedBranch && pushedBranch !== configuredBranch) {
            return res.json({ message: `Ignoring push to branch '${pushedBranch}', watching '${configuredBranch}'` });
        }

        res.json({ message: 'Webhook received, redeploy queued.' });

        // Debounce: wait 3s in case of multiple rapid pushes
        if (pendingWebhooks.has(name)) clearTimeout(pendingWebhooks.get(name));
        pendingWebhooks.set(name, setTimeout(async () => {
            pendingWebhooks.delete(name);
            try {
                const startTime = Date.now();
                const noop = () => {};
                const commitHash = await require('./gitService').redeployRepo(project.path, configuredBranch, project.installCmd, project.buildCmd, noop);
                await pm2Service.restartProject(project.pm2Name || name);
                notificationService.sendNotifications({
                    name, domain: project.domain, status: 'success',
                    type: 'redeploy', branch: configuredBranch, commitHash,
                    durationMs: Date.now() - startTime
                });
            } catch (e) {
                console.error(`[Webhook] Auto-redeploy failed for ${name}:`, e.message);
                notificationService.sendNotifications({
                    name, domain: project.domain, status: 'error',
                    type: 'redeploy', error: e.message
                });
            }
        }, 3000));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Metrics ───────────────────────────────────────────────────────────────
app.get('/api/metrics/:name', (req, res) => {
    const data = metricsService.getMetrics(req.params.name);
    res.json({ metrics: data });
});

// ─── Cache Clear ───────────────────────────────────────────────────────────
app.post('/api/clear-cache/:name', async (req, res) => {
    try {
        const project = portManager.getProjectDetails(req.params.name);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        const dirsToDelete = ['node_modules', '.next', 'dist', 'build', '.nuxt', '.output'];
        let deleted = [];
        for (const dir of dirsToDelete) {
            const target = path.join(project.path, dir);
            if (fs.existsSync(target)) {
                fs.rmSync(target, { recursive: true, force: true });
                deleted.push(dir);
            }
        }
        res.json({ message: `Cache cleared: ${deleted.join(', ') || 'nothing to clear'}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Discord Notification Test ─────────────────────────────────────────────
app.post('/api/notify/test', async (req, res) => {
    try {
        await notificationService.sendNotifications({
            name: 'Test Project',
            domain: 'example.subhan.tech',
            status: 'success',
            type: 'deploy',
            durationMs: 12000
        });
        res.json({ message: 'Test notification sent to Discord.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Service Templates ─────────────────────────────────────────────────────
app.get('/api/templates', (req, res) => {
    res.json({ templates: templates.getTemplates() });
});

// ─── Cron Jobs ─────────────────────────────────────────────────────────────
app.get('/api/cron/:name', (req, res) => {
    res.json({ jobs: cronService.getJobs(req.params.name) });
});

app.post('/api/cron/:name', (req, res) => {
    const { expression, type, command } = req.body;
    if (!expression) return res.status(400).json({ error: 'Expression is required' });
    const job = cronService.addJob(req.params.name, expression, type, command);
    res.json({ message: 'Cron job added successfully', job });
});

app.delete('/api/cron/:name/:id', (req, res) => {
    cronService.deleteJob(req.params.id);
    res.json({ message: 'Cron job deleted successfully' });
});

// ─── S3 Backups ────────────────────────────────────────────────────────────
app.post('/api/backup/:name', async (req, res) => {
    try {
        const project = portManager.getProjectDetails(req.params.name);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        const result = await s3BackupService.createBackup(req.params.name, project.path);
        res.json({ message: 'Backup uploaded successfully', key: result.key });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/logs/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const project = portManager.getProjectDetails(name);
        const pm2Name = project?.pm2Name || name;
        const logs = await pm2Service.getLogs(pm2Name);
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
