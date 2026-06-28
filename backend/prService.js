const portManager = require('./portManager');
const pm2Service = require('./pm2Service');
const gitService = require('./gitService');
const cloudflareService = require('./cloudflareService');
const historyManager = require('./historyManager');
const fs = require('fs');
const path = require('path');
const os = require('os');
const PROJECTS_DIR = path.join(os.homedir(), 'server-manager-projects');

// Optional: Comment on PR if GITHUB_PAT is available
async function commentOnPR(repoFullName, prNumber, previewUrl) {
    const pat = process.env.GITHUB_PAT;
    if (!pat) return;

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`https://api.github.com/repos/${repoFullName}/issues/${prNumber}/comments`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${pat}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                body: `✅ **Preview Environment Ready!**\n\nYour PR has been deployed to the ephemeral environment:\n🚀 [View Preview](${previewUrl})`
            })
        });

        if (!response.ok) {
            console.error('[PR Service] Failed to comment on PR:', await response.text());
        } else {
            console.log(`[PR Service] Successfully commented on PR #${prNumber}`);
        }
    } catch (err) {
        console.error('[PR Service] Error commenting on PR:', err);
    }
}

async function handlePullRequest(action, repoFullName, prNumber, prBranch, repoUrl, baseProject) {
    const prProjectName = `${baseProject.name}-pr-${prNumber}`;
    const cloneDomain = `pr-${prNumber}-${baseProject.name}.subhan.tech`;

    if (action === 'opened' || action === 'reopened') {
        console.log(`[PR Service] Opening PR Environment for ${prProjectName} on branch ${prBranch}`);
        
        // 1. Allocate Port
        const clonePort = await portManager.allocatePort();
        if (!clonePort) throw new Error('No available ports for PR preview');

        // 2. Setup Cloudflare
        try {
            await cloudflareService.createDNSRecord(cloneDomain, process.env.SERVER_IP || '127.0.0.1');
        } catch (e) {
            console.log(`[PR Service] Warning: Failed to create DNS record for ${cloneDomain}`);
        }

        // 3. Clone and Setup
        try {
            // We need the PAT that was originally used to clone the base project
            // We can get it from secretsManager or process.env, but usually PAT is stored in secretsManager for Github Device Flow, or we use process.env.GITHUB_PAT
            const secretsManager = require('./secretsManager');
            const storedPat = secretsManager.getSecret('gh_token') || process.env.GITHUB_PAT;
            
            const result = await gitService.cloneAndSetup(
                repoUrl,
                storedPat,
                prProjectName,
                prBranch,
                baseProject.installCmd,
                baseProject.buildCmd,
                baseProject.startCmd
            );

            // 4. Register Project
            portManager.registerProject(prProjectName, cloneDomain, clonePort, result.projectPath, {
                deployType: 'github',
                githubUrl: repoUrl,
                branch: prBranch,
                installCmd: result.installCmd,
                buildCmd: result.buildCmd,
                startCmd: result.startCmd,
                isPR: true, // Mark as PR clone
                baseProject: baseProject.name
            });

            // 5. Start PM2
            await pm2Service.startProject(prProjectName, result.projectPath, clonePort, result.startCmd);
            
            // 6. Comment on PR
            await commentOnPR(repoFullName, prNumber, `https://${cloneDomain}`);

        } catch (error) {
            console.error(`[PR Service] Error setting up PR Environment:`, error);
            portManager.releasePort(clonePort);
            throw error;
        }

    } else if (action === 'synchronize') {
        console.log(`[PR Service] Updating PR Environment for ${prProjectName}`);
        const prProject = portManager.getProjectDetails(prProjectName);
        if (prProject) {
            try {
                await pm2Service.stopProject(prProjectName).catch(() => {});
                await gitService.redeployRepo(prProject.path, prBranch, prProject.installCmd, prProject.buildCmd);
                await pm2Service.startProject(prProjectName, prProject.path, prProject.port, prProject.startCmd);
                console.log(`[PR Service] Updated PR Environment ${prProjectName}`);
            } catch (err) {
                console.error(`[PR Service] Error updating PR Environment:`, err);
            }
        } else {
            console.log(`[PR Service] Received synchronize for PR #${prNumber} but no environment exists. Ignoring or you can handle as open.`);
        }

    } else if (action === 'closed') {
        console.log(`[PR Service] Closing PR Environment for ${prProjectName}`);
        const prProject = portManager.getProjectDetails(prProjectName);
        if (prProject) {
            try {
                // 1. Stop PM2
                await pm2Service.stopProject(prProjectName);
                await pm2Service.deleteProject(prProjectName);
                
                // 2. Delete DNS
                await cloudflareService.deleteDNSRecord(prProject.domain).catch(() => {});
                
                // 3. Delete Files
                if (fs.existsSync(prProject.path)) {
                    fs.rmSync(prProject.path, { recursive: true, force: true });
                }
                
                // 4. Unregister
                portManager.unregisterProject(prProjectName);
                console.log(`[PR Service] Successfully cleaned up PR Environment ${prProjectName}`);
            } catch (err) {
                console.error(`[PR Service] Error cleaning up PR Environment:`, err);
            }
        }
    }
}

module.exports = {
    handlePullRequest
};
