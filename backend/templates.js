/**
 * templates.js
 * Pre-configured one-click deployment templates inspired by Coolify.
 */

const templates = [
    {
        id: 'nextjs',
        name: 'Next.js',
        description: 'React framework for production-grade web apps with SSR and static generation.',
        icon: '▲',
        color: '#000000',
        type: 'github',
        installCmd: 'npm install',
        buildCmd: 'npm run build',
        startCmd: 'npm start',
        envVars: [{ key: 'NODE_ENV', value: 'production' }]
    },
    {
        id: 'react-vite',
        name: 'React + Vite',
        description: 'Lightning-fast React SPA with Vite bundler.',
        icon: '⚡',
        color: '#646cff',
        type: 'github',
        installCmd: 'npm install',
        buildCmd: 'npm run build',
        startCmd: 'npx serve dist -p $PORT',
        envVars: []
    },
    {
        id: 'node-express',
        name: 'Node.js / Express',
        description: 'Minimal and flexible Node.js web application framework for APIs.',
        icon: '🟢',
        color: '#339933',
        type: 'github',
        installCmd: 'npm install',
        buildCmd: '',
        startCmd: 'node index.js',
        envVars: [{ key: 'PORT', value: '3000' }, { key: 'NODE_ENV', value: 'production' }]
    },
    {
        id: 'static-html',
        name: 'Static HTML Site',
        description: 'Serve a plain HTML/CSS/JS website with no build step.',
        icon: '🌐',
        color: '#e34c26',
        type: 'local',
        installCmd: '',
        buildCmd: '',
        startCmd: 'npx serve . -p $PORT',
        envVars: []
    },
    {
        id: 'nuxt',
        name: 'Nuxt.js',
        description: 'Vue.js meta-framework for universal, static or SPA applications.',
        icon: '💚',
        color: '#00dc82',
        type: 'github',
        installCmd: 'npm install',
        buildCmd: 'npm run build',
        startCmd: 'node .output/server/index.mjs',
        envVars: [{ key: 'NODE_ENV', value: 'production' }, { key: 'NUXT_HOST', value: '0.0.0.0' }]
    },
    {
        id: 'astro',
        name: 'Astro',
        description: 'Fast, content-focused web framework. Ships zero JS by default.',
        icon: '🚀',
        color: '#ff5d01',
        type: 'github',
        installCmd: 'npm install',
        buildCmd: 'npm run build',
        startCmd: 'node dist/server/entry.mjs',
        envVars: [{ key: 'HOST', value: '0.0.0.0' }]
    },
    {
        id: 'fastapi',
        name: 'Python FastAPI',
        description: 'Modern, fast (high-performance) Python web framework for building APIs.',
        icon: '🐍',
        color: '#009688',
        type: 'github',
        installCmd: 'pip install -r requirements.txt',
        buildCmd: '',
        startCmd: 'uvicorn main:app --host 0.0.0.0 --port $PORT',
        envVars: []
    },
    {
        id: 'svelte',
        name: 'SvelteKit',
        description: 'Cybernetically enhanced web apps with SvelteKit full-stack framework.',
        icon: '🧡',
        color: '#ff3e00',
        type: 'github',
        installCmd: 'npm install',
        buildCmd: 'npm run build',
        startCmd: 'node build',
        envVars: [{ key: 'PORT', value: '3000' }, { key: 'ORIGIN', value: 'https://yourdomain.com' }]
    },
    {
        id: 'remix',
        name: 'Remix',
        description: 'Full stack web framework focused on web fundamentals and modern UX.',
        icon: '💿',
        color: '#3992ff',
        type: 'github',
        installCmd: 'npm install',
        buildCmd: 'npm run build',
        startCmd: 'npm start',
        envVars: [{ key: 'NODE_ENV', value: 'production' }]
    },
    {
        id: 'django',
        name: 'Django',
        description: 'The web framework for perfectionists with deadlines. Python-based.',
        icon: '🎸',
        color: '#092e20',
        type: 'github',
        installCmd: 'pip install -r requirements.txt',
        buildCmd: 'python manage.py collectstatic --noinput',
        startCmd: 'gunicorn config.wsgi:application --bind 0.0.0.0:$PORT',
        envVars: [{ key: 'DEBUG', value: 'False' }, { key: 'SECRET_KEY', value: '' }]
    }
];

function getTemplates() {
    return templates;
}

function getTemplate(id) {
    return templates.find(t => t.id === id) || null;
}

module.exports = { getTemplates, getTemplate };
