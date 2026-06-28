# Server Hosting & Deployment Manager Dashboard

This project is a self-hosted mini-Vercel dashboard for Linux VPS, enabling you to manage Node.js, Next.js, and Vite applications with automatic port management and Cloudflare Tunnel routing.

## Features
- **Automatic Port Management**: Assigns free ports (3000-9000) dynamically.
- **PM2 Integration**: Start, stop, restart, delete, and view logs of applications.
- **Cloudflare Automation**: Updates `~/.cloudflared/config.yml` automatically to route your domain to the assigned port, and restarts the tunnel.
- **Premium UI**: Built with React, Vite, and Vanilla CSS.

## Installation Guide

### Prerequisites (Linux VPS)
1. **Node.js & npm**: Install Node.js (v18+ recommended)
2. **PM2**: Install PM2 globally:
   ```bash
   npm install -g pm2
   ```
3. **Cloudflared**: Ensure Cloudflare Tunnel is installed and authenticated. The config file should be located at `~/.cloudflared/config.yml`.

### Setup

1. **Clone/Copy this repository** to your VPS.
2. **Setup Backend**:
   ```bash
   cd backend
   npm install
   # Start the backend API using PM2 (runs on port 4000)
   pm2 start index.js --name server-manager-api
   ```
3. **Setup Frontend**:
   ```bash
   cd ../frontend
   npm install
   npm run build
   
   # You can serve the built frontend using a simple static server like 'serve' via PM2
   npm install -g serve
   pm2 start serve --name server-manager-ui -- -s dist -l 5000
   ```
4. **Save PM2 Configuration**:
   ```bash
   pm2 save
   pm2 startup
   ```

## Example Usage Workflow

1. Open the dashboard (running at `http://your-vps-ip:5000` based on the setup above).
2. Prepare your Next.js/Vite project in a folder on your VPS (e.g., `/home/user/my-next-app`). Ensure you have run `npm install` and `npm run build` in that folder if required.
3. In the dashboard, enter:
   - **Project Name**: `my-next-app`
   - **Project Folder Path**: `/home/user/my-next-app`
   - **Domain**: `app.yourdomain.com`
4. Click **Deploy**.
5. The system will:
   - Find a free port (e.g., `3001`).
   - Start the app via PM2 using `npm run start` with `PORT=3001`.
   - Add a rule to `~/.cloudflared/config.yml` routing `app.yourdomain.com` to `localhost:3001`.
   - Restart the Cloudflare Tunnel.
6. Your app is now live at `app.yourdomain.com`! Use the dashboard to monitor CPU/Memory, restart the app, or view logs.

## Advanced: Wildcard DNS Setup (Highly Recommended)

To avoid manually creating DNS records in Cloudflare for every single app you deploy, you can set up a **Wildcard DNS Record**. This enables the auto-generated domain feature in the dashboard (e.g., automatically generating `my-awesome-app.subhan.tech`).

1. Log into your Cloudflare Dashboard and go to your domain's DNS settings.
2. Add a new **CNAME** record.
3. For the **Name**, type exactly: `*`
4. For the **Target**, enter your Cloudflare Tunnel URL (e.g., `<your-tunnel-uuid>.cfargotunnel.com`).
5. Ensure **Proxy status** is set to **Proxied (Orange Cloud)** and click Save.

With this setup, the Cloudflare Tunnel will dynamically route *any* subdomain created by the Server Hosting platform without any manual DNS intervention required!
