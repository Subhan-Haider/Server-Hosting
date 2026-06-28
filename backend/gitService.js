const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Default projects directory
const PROJECTS_DIR = path.join(os.homedir(), 'server-manager-projects');

function ensureProjectsDir() {
    if (!fs.existsSync(PROJECTS_DIR)) {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }
}

/**
 * Parses GitHub URL and inserts PAT if provided
 */
function getAuthRepoUrl(repoUrl, pat) {
    if (!pat) return repoUrl;
    try {
        const urlObj = new URL(repoUrl);
        return `https://${pat}@${urlObj.hostname}${urlObj.pathname}`;
    } catch (e) {
        return repoUrl; // Fallback
    }
}

/**
 * Extracts a decent project name from a GitHub URL if not provided
 */
function extractProjectNameFromUrl(repoUrl) {
    try {
        const urlObj = new URL(repoUrl);
        const parts = urlObj.pathname.split('/').filter(Boolean);
        let name = parts[parts.length - 1];
        if (name.endsWith('.git')) name = name.slice(0, -4);
        return name;
    } catch (e) {
        return `project-${Date.now()}`;
    }
}

function runCommand(command, cwd) {
    return new Promise((resolve, reject) => {
        const env = {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',  // Prevent git from prompting for credentials
            GIT_ASKPASS: 'echo',       // Return empty string for any credential prompt
        };
        exec(command, { cwd, env }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing ${command}:`, error);
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

function detectFramework(projectPath) {
    const pkgPath = path.join(projectPath, 'package.json');
    
    // Defaults
    let installCmd = 'npm install';
    let buildCmd = '';
    let startCmd = 'npm start';

    if (!fs.existsSync(pkgPath)) {
        // Check for plain HTML site
        if (fs.existsSync(path.join(projectPath, 'index.html'))) {
            // No install/build needed for plain HTML
            installCmd = '';
            buildCmd = '';
            // `serve` package respects the PORT environment variable natively
            startCmd = 'npx serve .';
        }
        return { installCmd, buildCmd, startCmd };
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const scripts = pkg.scripts || {};

        // Detect package manager
        if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) installCmd = 'yarn install';
        else if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) installCmd = 'pnpm install';

        // Detect Framework
        if (deps['next']) {
            buildCmd = scripts.build ? `${installCmd.split(' ')[0]} run build` : 'npm run build';
            startCmd = scripts.start ? `${installCmd.split(' ')[0]} start` : 'npm start';
        } else if (deps['vite']) {
            buildCmd = scripts.build ? `${installCmd.split(' ')[0]} run build` : 'npm run build';
            startCmd = scripts.preview ? `${installCmd.split(' ')[0]} run preview` : 'npm run preview';
        } else if (deps['react-scripts']) {
            // Standard create-react-app
            startCmd = scripts.start ? `${installCmd.split(' ')[0]} start` : 'npm start';
        } else {
            // Generic Node
            if (scripts.build) buildCmd = `${installCmd.split(' ')[0]} run build`;
        }

        return { installCmd, buildCmd, startCmd };
    } catch (e) {
        console.error("Error detecting framework:", e);
        return { installCmd, buildCmd, startCmd };
    }
}

function cleanRepoUrl(url) {
    try {
        const urlObj = new URL(url);
        const parts = urlObj.pathname.split('/').filter(Boolean);
        if ((urlObj.hostname.includes('github.com') || urlObj.hostname.includes('gitlab.com')) && parts.length >= 2) {
            let repo = parts[1];
            if (repo.endsWith('.git')) repo = repo.slice(0, -4);
            return `${urlObj.protocol}//${urlObj.host}/${parts[0]}/${repo}`;
        }
    } catch (e) {
        // ignore
    }
    return url;
}

async function cloneAndSetup(rawRepoUrl, pat, projectName, branch = 'main', userInstallCmd, userBuildCmd, userStartCmd) {
    ensureProjectsDir();

    const repoUrl = cleanRepoUrl(rawRepoUrl);
    let finalProjectName = projectName || extractProjectNameFromUrl(repoUrl);
    let projectPath = path.join(PROJECTS_DIR, finalProjectName);
    const authUrl = getAuthRepoUrl(repoUrl, pat);

    // If the directory already exists, automatically append a number to make it unique
    let counter = 1;
    const baseName = finalProjectName;
    while (fs.existsSync(projectPath)) {
        finalProjectName = `${baseName}-${counter}`;
        projectPath = path.join(PROJECTS_DIR, finalProjectName);
        counter++;
    }

    console.log(`Cloning ${repoUrl} (branch: ${branch}) into ${projectPath}...`);
    await runCommand(`git clone -b ${branch} ${authUrl} ${finalProjectName}`, PROJECTS_DIR);

    // Auto Detect
    const auto = detectFramework(projectPath);
    const installCmd = userInstallCmd !== undefined && userInstallCmd !== '' ? userInstallCmd : auto.installCmd;
    const buildCmd = userBuildCmd !== undefined && userBuildCmd !== '' ? userBuildCmd : auto.buildCmd;
    const startCmd = userStartCmd !== undefined && userStartCmd !== '' ? userStartCmd : auto.startCmd;

    if (installCmd) {
        console.log(`Running install command: ${installCmd}`);
        await runCommand(installCmd, projectPath);
    }

    if (buildCmd) {
        console.log(`Running build command: ${buildCmd}`);
        await runCommand(buildCmd, projectPath);
    }

    // Patch vite.config.js to allow external hosts (Vite 5 security feature)
    patchViteConfig(projectPath);

    return {
        projectName: finalProjectName,
        projectPath,
        installCmd,
        buildCmd,
        startCmd
    };
}

async function redeployRepo(projectPath, branch, installCmd, buildCmd) {
    console.log(`Redeploying project at ${projectPath}...`);
    
    // Git pull latest
    await runCommand('git fetch', projectPath);
    await runCommand(`git reset --hard origin/${branch}`, projectPath);

    if (installCmd) {
        console.log(`Running install command: ${installCmd}`);
        await runCommand(installCmd, projectPath);
    }

    if (buildCmd) {
        console.log(`Running build command: ${buildCmd}`);
        await runCommand(buildCmd, projectPath);
    }

    // Re-patch vite config after redeploy (git reset may have reverted it)
    patchViteConfig(projectPath);
}

/**
 * Patches vite.config.js or vite.config.ts to allow all external hosts.
 * This is required by Vite 5's host-checking security feature.
 */
function patchViteConfig(projectPath) {
    const configFiles = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'];
    const injection = `
// === Auto-patched by deployment platform ===
// Allow external hosts (e.g. *.subhan.tech via Cloudflare Tunnel)
import { mergeConfig as __mergeConfig } from 'vite';
const __originalConfig = typeof module !== 'undefined' ? module.exports : exports.default;
if (__originalConfig && typeof __originalConfig === 'object') {
    Object.assign(__originalConfig, {
        server: { ...__originalConfig.server, host: true },
        preview: { ...__originalConfig.preview, host: true, allowedHosts: true }
    });
}
`;

    for (const fileName of configFiles) {
        const filePath = path.join(projectPath, fileName);
        if (!fs.existsSync(filePath)) continue;

        try {
            let content = fs.readFileSync(filePath, 'utf8');

            // Already patched — skip
            if (content.includes('allowedHosts: true') || content.includes("allowedHosts:true")) {
                console.log(`[VitePatch] ${fileName} already patched, skipping.`);
                return;
            }

            // Strategy: inject preview: { allowedHosts: true, host: true } and server: { host: true }
            // inside the defineConfig({...}) or export default {...} object
            const defineConfigMatch = content.match(/(defineConfig\s*\(\s*(?:async\s*)?(?:\([^)]*\)\s*=>\s*)?\{)/);
            if (defineConfigMatch) {
                const insertPos = content.indexOf(defineConfigMatch[0]) + defineConfigMatch[0].length;
                const patch = `
  server: { host: true },
  preview: { host: true, allowedHosts: true },`;
                content = content.slice(0, insertPos) + patch + content.slice(insertPos);
            } else {
                // Fallback: append to end of file
                content += `
// Auto-patched by deployment platform
// Allows Cloudflare tunnel domains to serve this Vite app
`;
            }

            fs.writeFileSync(filePath, content);
            console.log(`[VitePatch] Patched ${fileName} to allow external hosts.`);
            return;
        } catch (e) {
            console.warn(`[VitePatch] Failed to patch ${fileName}:`, e.message);
        }
    }
}

module.exports = {
    cloneAndSetup,
    redeployRepo,
    patchViteConfig,
    extractProjectNameFromUrl
};
