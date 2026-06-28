module.exports = {
  apps: [
    {
      name: 'server-backend',
      script: 'backend/index.js',
      env: {
        PORT: 6003
      },
      watch: false,
      max_memory_restart: '1G',
      error_file: 'logs/backend-error.log',
      out_file: 'logs/backend-out.log'
    },
    {
      name: 'server-frontend',
      script: 'npm',
      args: 'run dev --prefix frontend',
      watch: false,
      max_memory_restart: '1G',
      error_file: 'logs/frontend-error.log',
      out_file: 'logs/frontend-out.log'
    }
  ]
};
