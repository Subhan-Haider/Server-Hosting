const { getAuth } = require('./firebaseAdmin');

async function authMiddleware(req, res, next) {
    const publicRoutes = ['/webhook/github', '/report-crash', '/auth/github/callback'];
    if (publicRoutes.some(route => req.path.includes(route))) {
        return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        // Verify the ID token
        const decodedToken = await getAuth().verifyIdToken(idToken);
        const userEmail = decodedToken.email;
        
        // Ensure the email matches the authorized admin email
        const adminEmail = process.env.ADMIN_EMAIL;
        
        if (!adminEmail) {
            console.error("ADMIN_EMAIL is not set in environment variables!");
            return res.status(500).json({ error: 'Server configuration error' });
        }
        
        if (userEmail !== adminEmail) {
            return res.status(403).json({ error: 'Forbidden: You are not authorized to access this dashboard.' });
        }
        
        // User is authorized
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

module.exports = authMiddleware;
