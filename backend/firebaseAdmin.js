const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

try {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        if (getApps().length === 0) {
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                })
            });
            console.log('Firebase Admin initialized successfully.');
        }
    } else {
        console.warn('Firebase Admin credentials not found in environment. Auth will be disabled or fail.');
    }
} catch (error) {
    console.error('Firebase Admin initialization error', error);
}

module.exports = {
    getAuth
};
