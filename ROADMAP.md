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
