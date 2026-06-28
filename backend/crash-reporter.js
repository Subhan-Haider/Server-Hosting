const http = require('http');

const appName = process.env.APP_NAME || 'Unknown App';
// The backend server is running on port 4000 locally usually. We should send to localhost:4000
// We could also get the backend port from env, but let's assume 4000.
const backendPort = process.env.MANAGER_PORT || 4000;

function reportCrash(errorType, err) {
    const payload = JSON.stringify({
        appName: appName,
        type: errorType,
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    });

    const options = {
        hostname: 'localhost',
        port: backendPort,
        path: '/api/report-crash',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    // We do this synchronously or wait before exiting.
    const req = http.request(options, (res) => {
        process.exit(1);
    });

    req.on('error', (e) => {
        // Fallback exit if we can't report
        process.exit(1);
    });

    req.write(payload);
    req.end();
}

process.on('uncaughtException', (err) => {
    console.error(`[Crash Reporter] Caught exception: ${err.message}`);
    reportCrash('uncaughtException', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[Crash Reporter] Unhandled Rejection at: ${promise}, reason: ${reason}`);
    const err = reason instanceof Error ? reason : new Error(String(reason));
    reportCrash('unhandledRejection', err);
});
