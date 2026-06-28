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
        exec(command, { cwd }, (error, stdout, stderr) => {
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
    const finalProjectName = projectName || extractProjectNameFromUrl(repoUrl);
    const projectPath = path.join(PROJECTS_DIR, finalProjectName);
    const authUrl = getAuthRepoUrl(repoUrl, pat);

    if (fs.existsSync(projectPath)) {
        throw new Error(`Project directory already exists at ${projectPath}. Use a different name or redeploy it.`);
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
}

module.exports = {
    cloneAndSetup,
    redeployRepo,
    extractProjectNameFromUrl
};
