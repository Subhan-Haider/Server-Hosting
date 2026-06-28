const si = require('systeminformation');
const os = require('os');

async function getSystemHealth() {
    try {
        const cpuLoad = await si.currentLoad();
        const mem = await si.mem();
        const disk = await si.fsSize();
        const network = await si.networkStats();

        // Calculate aggregates
        const cpuUsage = cpuLoad.currentLoad;
        const memoryUsage = {
            total: mem.total,
            used: mem.active,
            free: mem.free,
            usagePercent: (mem.active / mem.total) * 100
        };

        // Combine disk sizes
        let diskTotal = 0;
        let diskUsed = 0;
        disk.forEach(d => {
            diskTotal += d.size;
            diskUsed += d.used;
        });
        const diskUsage = {
            total: diskTotal,
            used: diskUsed,
            usagePercent: diskTotal ? (diskUsed / diskTotal) * 100 : 0
        };

        // Combine network stats
        let rxSec = 0;
        let txSec = 0;
        network.forEach(n => {
            rxSec += n.rx_sec;
            txSec += n.tx_sec;
        });

        return {
            cpu: cpuUsage,
            memory: memoryUsage,
            disk: diskUsage,
            network: {
                rx_sec: rxSec,
                tx_sec: txSec
            },
            uptime: os.uptime(),
            hostname: os.hostname()
        };
    } catch (e) {
        console.error('Error fetching system health:', e);
        return null;
    }
}

module.exports = {
    getSystemHealth
};
