/**
 * cronService.js
 * Manages scheduled tasks for projects using node-cron.
 */
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const pm2Service = require('./pm2Service');
const { exec } = require('child_process');
const portManager = require('./portManager');

const CRON_CONFIG_PATH = path.join(__dirname, 'cron-config.json');
let jobs = {}; // { id -> { name, expression, command, type } }
let activeTasks = {}; // { id -> cron.ScheduledTask }

function loadJobs() {
    try {
        if (fs.existsSync(CRON_CONFIG_PATH)) {
            jobs = JSON.parse(fs.readFileSync(CRON_CONFIG_PATH, 'utf8'));
            for (const [id, job] of Object.entries(jobs)) {
                scheduleJob(id, job);
            }
        }
    } catch (err) {
        console.error('[Cron] Failed to load jobs:', err.message);
    }
}

function saveJobs() {
    fs.writeFileSync(CRON_CONFIG_PATH, JSON.stringify(jobs, null, 2));
}

function scheduleJob(id, job) {
    if (!cron.validate(job.expression)) {
        console.error(`[Cron] Invalid expression for job ${id}: ${job.expression}`);
        return;
    }

    if (activeTasks[id]) {
        activeTasks[id].stop();
    }

    activeTasks[id] = cron.schedule(job.expression, async () => {
        console.log(`[Cron] Executing job ${id} for project ${job.name} (${job.type})`);
        
        if (job.type === 'restart') {
            const project = portManager.getProjectDetails(job.name);
            if (project) {
                const pm2Name = project.pm2Name || job.name;
                await pm2Service.restartProject(pm2Name);
            }
        } else if (job.type === 'command') {
            const project = portManager.getProjectDetails(job.name);
            if (project && project.path) {
                exec(job.command, { cwd: project.path }, (error, stdout, stderr) => {
                    if (error) console.error(`[Cron] Command error:`, error.message);
                    if (stdout) console.log(`[Cron] stdout:`, stdout);
                    if (stderr) console.log(`[Cron] stderr:`, stderr);
                });
            }
        }
    });
}

function addJob(name, expression, type = 'restart', command = '') {
    const id = Date.now().toString();
    const job = { name, expression, type, command };
    jobs[id] = job;
    scheduleJob(id, job);
    saveJobs();
    return { id, ...job };
}

function deleteJob(id) {
    if (jobs[id]) {
        delete jobs[id];
        saveJobs();
    }
    if (activeTasks[id]) {
        activeTasks[id].stop();
        delete activeTasks[id];
    }
}

function getJobs(name) {
    const projectJobs = [];
    for (const [id, job] of Object.entries(jobs)) {
        if (job.name === name) {
            projectJobs.push({ id, ...job });
        }
    }
    return projectJobs;
}

// Init
loadJobs();

module.exports = {
    addJob,
    deleteJob,
    getJobs
};
