const pm2 = require('pm2');
const path = require('path');

function connect() {
    return new Promise((resolve, reject) => {
        pm2.connect((err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

async function startProject(projectName, projectPath, port, startCmd = 'npm start') {
    await connect();
    return new Promise((resolve, reject) => {
        // Parse the start command (e.g., "npm run preview" -> script: "npm", args: "run preview")
        const parts = startCmd.split(' ');
        const script = parts[0];
        let args = parts.slice(1).join(' ');

        // Vite ignores the PORT env var — it requires --port flag explicitly
        // Detect any vite-based command (preview, dev) and inject --port <port> --host
        const isViteCmd = /vite\s*(preview|dev|serve)?/.test(startCmd) ||
                          /npm\s+run\s+(preview|dev|start)/.test(startCmd) ||
                          startCmd.includes('preview') ||
                          startCmd.includes('vite');
        
        const env = { 
            PORT: port,
            APP_NAME: projectName,
            NODE_OPTIONS: `--require ${path.join(__dirname, 'crash-reporter.js')}`
        };
        
        if (isViteCmd) {
            // Append --port and --host so Vite binds to the correct port and is network-accessible
            args = args + ` -- --port ${port} --host`;
            console.log(`[PM2] Detected Vite command, injecting --port ${port} --host`);
        }
        
        pm2.start({
            name: projectName,
            script: script,
            args: args,
            cwd: projectPath,
            env,
            max_memory_restart: '1G'
        }, (err, apps) => {
            if (err) return reject(err);
            resolve(apps);
        });
    });
}

async function stopProject(projectName) {
    await connect();
    return new Promise((resolve, reject) => {
        pm2.stop(projectName, (err, proc) => {
            if (err) return reject(err);
            resolve(proc);
        });
    });
}

async function restartProject(projectName) {
    await connect();
    return new Promise((resolve, reject) => {
        pm2.restart(projectName, (err, proc) => {
            if (err) return reject(err);
            resolve(proc);
        });
    });
}

async function deleteProject(projectName) {
    await connect();
    return new Promise((resolve, reject) => {
        pm2.delete(projectName, (err, proc) => {
            if (err) return reject(err);
            resolve(proc);
        });
    });
}

async function listProjects() {
    await connect();
    return new Promise((resolve, reject) => {
        pm2.list((err, list) => {
            if (err) return reject(err);
            
            // Map pm2 output to simpler format for the dashboard
            const mappedList = list.map(app => ({
                name: app.name,
                status: app.pm2_env.status,
                cpu: app.monit ? app.monit.cpu : 0,
                memory: app.monit ? app.monit.memory : 0,
                uptime: app.pm2_env.pm_uptime
            }));
            
            resolve(mappedList);
        });
    });
}

async function getLogs(projectName) {
    // PM2 API doesn't easily expose a simple log fetcher natively without file reading.
    // PM2 stores logs in ~/.pm2/logs. We will find the path from pm2 list.
    await connect();
    return new Promise((resolve, reject) => {
        pm2.describe(projectName, (err, proc) => {
            if (err || !proc || proc.length === 0) return reject(new Error('Process not found'));
            
            const processData = proc[0];
            const outPath = processData.pm2_env.pm_out_log_path;
            const errPath = processData.pm2_env.pm_err_log_path;
            
            const fs = require('fs');
            let outLogs = '';
            let errLogs = '';
            
            try {
                if (fs.existsSync(outPath)) {
                    // Read last 2000 chars roughly to avoid massive files
                    const stats = fs.statSync(outPath);
                    const stream = fs.createReadStream(outPath, {
                        start: Math.max(0, stats.size - 5000)
                    });
                    stream.on('data', chunk => outLogs += chunk);
                    stream.on('end', () => {
                        try {
                            if (fs.existsSync(errPath)) {
                                const errStats = fs.statSync(errPath);
                                const errStream = fs.createReadStream(errPath, {
                                    start: Math.max(0, errStats.size - 5000)
                                });
                                errStream.on('data', chunk => errLogs += chunk);
                                errStream.on('end', () => {
                                    resolve({ out: outLogs, err: errLogs });
                                });
                            } else {
                                resolve({ out: outLogs, err: '' });
                            }
                        } catch (e) {
                            resolve({ out: outLogs, err: '' });
                        }
                    });
                } else {
                    resolve({ out: 'No logs available', err: '' });
                }
            } catch (e) {
                reject(e);
            }
        });
    });
}

module.exports = {
    startProject,
    stopProject,
    restartProject,
    deleteProject,
    listProjects,
    getLogs
};
