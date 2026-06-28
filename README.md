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



# Deployment Platform Roadmap & Feature Ideas

This document outlines potential future features and improvements for the deployment platform, categorized by impact and functionality.

## 🔥 High Impact

### 1. Real-time Deployment Logs
Stream live build logs directly in the dashboard while deploying (like Vercel does). Currently, users have to check PM2 logs manually. Use Server-Sent Events (SSE) to push log lines to the UI in real time.

### 2. Deployment History
Track every deploy with timestamp, git commit hash, status (success/fail), and duration. Let users roll back to a previous deployment with one click.

### 3. Auto-Redeploy on Git Push (Webhooks)
Register a GitHub webhook so every `git push` automatically triggers a redeploy. True CI/CD — just push code and it goes live.

### 4. Custom Domain Support
Let users enter any domain (not just `*.subhan.tech`) during deploy. The backend adds the CNAME to Cloudflare automatically.

---

## ⚡ Medium Impact

### 5. Dashboard Password Protection
Add a login screen to `app.subhan.tech` so not everyone can deploy/delete apps.

### 6. Resource Usage Per App
Show CPU %, memory, and uptime for each deployed app pulled live from PM2.

### 7. App Health Checks
Ping each deployed app's URL every few minutes. Show a red/green health badge in the dashboard. Alert the user if something goes down.

### 8. Database Provisioning
One-click spin up a SQLite or PostgreSQL instance and auto-inject the `DATABASE_URL` env var.

---

## 🎨 Nice to Have

### 9. Deploy from ZIP upload
Upload a ZIP file and deploy it directly — no GitHub needed.

### 10. Teams / Multi-user
Multiple people can log in with different permission levels (viewer vs deployer vs admin).

---

## 🚀 Advanced Deployment Features

### 11. Docker Support (Deploy Anything)
Instead of just auto-detecting Node.js and Vite, allow users to deploy any repository that has a `Dockerfile`. The backend would run `docker build` and `docker run`, meaning you could host Python, Go, Rust, or PHP apps!

### 12. Zero-Downtime Deployments
Right now, PM2 stops the old app and starts the new one. Implement a system that starts the new version on a *new* port first, verifies it works, and only then updates Cloudflare and stops the old one.

### 13. Custom Subdomains
Currently, the subdomain is generated from the project name. Add a feature so users can type exactly what subdomain they want before hitting deploy.

---

## 🛠️ Developer Tools in the Browser

### 14. Web Terminal
Embed a real terminal in the dashboard (using a library like `xterm.js`). This would let you run commands directly on the VPS from the browser without needing PuTTY or SSH.

### 15. In-Browser File Editor
Add a lightweight file explorer that lets you see the files of a deployed app and make quick edits to things like `.env` files or small code typos directly from the dashboard.

### 16. Cron Jobs / Scheduled Tasks
A UI to set up tasks that run on a schedule (e.g., "Run `npm run backup` every day at midnight").

---

## 📊 Monitoring & Alerts

### 17. Discord / Slack Webhooks
Add a settings page where you can drop a Discord webhook URL. Every time an app finishes deploying (or fails), it sends a nice notification message to your Discord server.

### 18. Basic Analytics
Since the platform controls the reverse proxy (or via a small middleware), track how many people are visiting each of the apps and show a simple graph of "Views Today" in the dashboard.

### 19. Log Search & Filter
Instead of just viewing the last X lines of logs, add a search bar to filter logs by keyword (e.g., "Error" or "Exception") and color-code the log output.


