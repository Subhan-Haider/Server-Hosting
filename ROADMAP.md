# Deployment Platform Roadmap & Feature Ideas

This document outlines potential future features and improvements for the deployment platform, categorized by impact and functionality.

## High Impact

### 1. Real-time Deployment Logs (Implemented)
Stream live build logs directly in the dashboard while deploying (like Vercel does). Currently, users have to check PM2 logs manually. Use Server-Sent Events (SSE) to push log lines to the UI in real time.

### 2. Deployment History (Implemented)
Track every deploy with timestamp, git commit hash, status (success/fail), and duration. Let users roll back to a previous deployment with one click.

### 3. Auto-Redeploy on Git Push / Webhooks (Implemented)
Register a GitHub webhook so every `git push` automatically triggers a redeploy. True CI/CD -- just push code and it goes live.

### 4. Custom Domain Support (Implemented)
Let users enter any domain (not just `*.subhan.tech`) during deploy. The backend adds the CNAME to Cloudflare automatically.

---

## Medium Impact

### 5. Dashboard Password Protection
Add a login screen to `app.subhan.tech` so not everyone can deploy/delete apps.

### 6. Resource Usage Per App
Show CPU %, memory, and uptime for each deployed app pulled live from PM2.

### 7. App Health Checks
Ping each deployed app's URL every few minutes. Show a red/green health badge in the dashboard. Alert the user if something goes down.

### 8. Database Provisioning
One-click spin up a SQLite or PostgreSQL instance and auto-inject the `DATABASE_URL` env var.

---

## Nice to Have

### 9. Deploy from ZIP upload
Upload a ZIP file and deploy it directly -- no GitHub needed.

### 10. Teams / Multi-user
Multiple people can log in with different permission levels (viewer vs deployer vs admin).

---

## Advanced Deployment Features

### 11. Docker Support (Deploy Anything)
Instead of just auto-detecting Node.js and Vite, allow users to deploy any repository that has a `Dockerfile`. The backend would run `docker build` and `docker run`, meaning you could host Python, Go, Rust, or PHP apps!

### 12. Zero-Downtime Deployments (Completed ✅)
Right now, PM2 stops the old app and starts the new one. Implement a system that starts the new version on a *new* port first, verifies it works, and only then updates Cloudflare and stops the old one.

### 13. Custom Subdomains
Currently, the subdomain is generated from the project name. Add a feature so users can type exactly what subdomain they want before hitting deploy.

---

## Developer Tools in the Browser

### 14. Web Terminal
Embed a real terminal in the dashboard (using a library like `xterm.js`). This would let you run commands directly on the VPS from the browser without needing PuTTY or SSH.

### 15. In-Browser File Editor (Completed ✅)
Add a lightweight file explorer that lets you see the files of a deployed app and make quick edits to things like `.env` files or small code typos directly from the dashboard.

### 16. Cron Jobs / Scheduled Tasks
A UI to set up tasks that run on a schedule (e.g., "Run `npm run backup` every day at midnight").

---

## Monitoring & Alerts

### 17. Discord / Slack Webhooks (Completed ✅)
Add a settings page where you can drop a Discord webhook URL. Every time an app finishes deploying (or fails), it sends a nice notification message to your Discord server.

### 18. Basic Analytics
Since the platform controls the reverse proxy (or via a small middleware), track how many people are visiting each of the apps and show a simple graph of "Views Today" in the dashboard.

### 19. Log Search & Filter (Completed ✅)
Instead of just viewing the last X lines of logs, add a search bar to filter logs by keyword (e.g., "Error" or "Exception") and color-code the log output.

---

## Enterprise & Security

### 20. Centralized Secrets Vault
Instead of pasting `.env` variables per app, create a "Secrets Manager" where you define API keys once (e.g., `OPENAI_API_KEY`) and can check a box to inject them into specific apps.

### 21. Automatic Server Backups
Configure a cron job that zips up all your project code, databases, and config files and automatically uploads them to Google Drive or AWS S3 every night.

### 22. Server Health Dashboard
Add a dedicated page that acts like `htop` in the browser -- showing your VPS total CPU, RAM usage, disk space remaining, and network bandwidth in real-time.

---

## Scaling & Infrastructure

### 23. One-Click Starter Templates
Instead of needing a GitHub repo, add a page with templates. Click "Deploy WordPress", "Deploy Next.js Blog", or "Deploy Ghost", and the platform spins it up from scratch instantly.

### 24. Clone / Staging Environments
Add a "Clone" button next to an app. It will duplicate the code, give it a new port and subdomain (like `staging-restaurant.subhan.tech`), so you can test updates without breaking production.

### 25. Custom `.deploy.sh` Scripts
Instead of the platform guessing `npm install` and `npm run build`, allow users to commit a `server-hosting.json` or `.deploy.sh` file in their repo. If the platform sees this file, it follows the exact custom instructions inside it.

---

## Monetization (If you want to sell hosting)

### 26. Resource Quotas
Set limits so a specific user can only deploy 3 apps, or their apps can only use a maximum of 512MB of RAM.

### 27. Client Billing
Integrate Stripe so you can give friends or clients access to the platform, and they automatically get charged $5/month to keep their apps online.

---

## Next-Generation Platform Features (New Ideas)

### 28. Pull Request Previews (Ephemeral Environments)
Automatically listen to GitHub Webhooks for "Pull Request Opened". When someone makes a PR, the platform spins up a temporary version of the app at `pr-123.subhan.tech`. When the PR is merged or closed, the environment automatically deletes itself.

### 29. Global Edge Caching (One-Click CDN)
Since you use Cloudflare, add a toggle in the UI: "Enable Edge Caching". This automatically interacts with the Cloudflare API to cache all static assets globally, making the app load instantly anywhere in the world.

### 30. Visual Database Management
If you implement #8 (Database Provisioning), add a built-in UI (like Adminer or phpMyAdmin but modern) directly in your dashboard so users can view, edit, and query their databases right from the browser.

### 31. Serverless Functions Support
Instead of deploying an entire Node server, allow users to deploy a single `api/` folder containing JavaScript files. The platform wraps them in a fast Express server automatically, mimicking Vercel's Serverless API routes.

### 32. Drag & Drop File Hosting (Static Sites)
A specialized ultra-fast deployment mode where you just drag and drop a folder of HTML/CSS/JS files onto the dashboard. No Git needed, it just serves the files directly using NGINX or a lightweight static server.

### 33. Environment Variable Import/Export
A UI feature to bulk copy-paste `.env` files. You can just paste a block of text, and the dashboard parses it into key-value pairs. You can also click "Download .env" to save the variables locally.

### 34. AI Auto-Fix for Failed Deploys
If a deployment fails (e.g. build error), send the error log to the Gemini or OpenAI API and show an "AI Suggestion" box on the dashboard explaining exactly *why* the build failed and how the developer can fix their code.

### 35. Built-in Error Tracking & Crash Alerts
Automatically inject a tiny script into Node.js apps that reports crashes back to your platform. If an app crashes, show a notification on the dashboard and email the owner, displaying the stack trace so they don't have to hunt through logs.
