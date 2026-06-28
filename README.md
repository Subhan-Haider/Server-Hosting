# Server Hosting & Deployment Manager Dashboard

This project is a self-hosted mini-Vercel dashboard for Linux VPS, enabling you to manage Node.js, Next.js, React, and Vite applications with automatic port management and Cloudflare DNS routing.

## 🚀 Features

- **GitHub Integration**: Deploy directly from any public or private GitHub repository using OAuth or Personal Access Tokens.
- **Zero-Downtime Deployments (Blue/Green)**: Deploys the new version of your app on a new port, verifies it, and switches traffic seamlessly without dropping connections.
- **Pull Request Previews (Ephemeral Environments)**: Automatically intercept GitHub Webhooks when a PR is opened. Clones the PR branch, deploys it to a temporary subdomain (e.g., `pr-12-myapp.subhan.tech`), and posts a comment on the PR. Automatically tears down the environment when the PR is closed.
- **Continuous Integration**: Webhooks listen for `push` events to auto-redeploy your applications the second you push to GitHub.
- **Firebase Authentication**: Secure your dashboard with Google Login so only authorized administrators can access it.
- **Server Health Dashboard**: Monitor live CPU, RAM, Disk space, and Network usage directly from the dashboard.
- **Clone Environments**: Duplicate any running app instantly to a staging subdomain to test changes without touching production.
- **In-Browser File Explorer**: View and edit the source code of your deployed applications directly within the dashboard.
- **Discord Notifications**: Get real-time alerts in Discord when deployments succeed or fail.
- **Secrets Vault**: Securely inject global environment variables (e.g., Database URIs, API Keys) into your apps.
- **Automatic Port Management**: Assigns free ports dynamically.
- **PM2 Integration**: Start, stop, restart, delete, and view logs of applications.
- **Cloudflare Automation**: Updates Cloudflare DNS records via API to route your domain automatically.

## 🛠 Installation Guide

### Prerequisites (Linux VPS)
1. **Node.js & npm**: Install Node.js (v18+ recommended)
2. **PM2**: Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

### Setup

1. **Clone/Copy this repository** to your VPS.
2. **Setup Backend**:
   ```bash
   cd backend
   npm install
   ```
3. **Configure Environment Variables**:
   Create a `.env.local` file inside the `backend/` directory:
   ```env
   # Notifications
   WEBHOOK_URL="https://discordapp.com/api/webhooks/..."
   ADMIN_EMAIL="your_admin_email@gmail.com"

   # Firebase Admin SDK (For Google Login)
   FIREBASE_PROJECT_ID="..."
   FIREBASE_CLIENT_EMAIL="..."
   FIREBASE_PRIVATE_KEY="..."
   
   # GitHub (Optional, for PR Comments)
   GITHUB_PAT="ghp_..."
   ```

4. **Start the Backend**:
   ```bash
   pm2 start index.js --name server-manager-api
   ```

5. **Setup Frontend**:
   ```bash
   cd ../frontend
   npm install
   ```
   Create a `.env.local` file inside the `frontend/` directory with your public Firebase Client SDK values:
   ```env
   VITE_FIREBASE_API_KEY="..."
   VITE_FIREBASE_AUTH_DOMAIN="..."
   VITE_FIREBASE_PROJECT_ID="..."
   VITE_FIREBASE_STORAGE_BUCKET="..."
   VITE_FIREBASE_MESSAGING_SENDER_ID="..."
   VITE_FIREBASE_APP_ID="..."
   ```
   
6. **Build and Serve Frontend**:
   ```bash
   npm run build
   npm install -g serve
   pm2 start serve --name server-manager-ui -- -s dist -l 5000
   ```
   
7. **Save PM2 Configuration**:
   ```bash
   pm2 save
   pm2 startup
   ```

## 🌐 Advanced: Wildcard DNS Setup (Highly Recommended)

To avoid manually creating DNS records in Cloudflare for every single app you deploy, you should set up a **Wildcard DNS Record**. This enables the auto-generated domain feature (e.g., `my-awesome-app.subhan.tech`).

1. Log into your Cloudflare Dashboard and go to your domain's DNS settings.
2. Add a new **A Record** (or CNAME if using a Tunnel).
3. For the **Name**, type exactly: `*`
4. For the **Target**, enter your VPS IP Address (or Tunnel URL).
5. Ensure **Proxy status** is set to **Proxied (Orange Cloud)** and click Save.

With this setup, Cloudflare will route *any* subdomain to your server, and the backend platform will dynamically handle the local routing!

---

## 🗺 Remaining Roadmap Features

If you want to keep building, here are some remaining ideas:

- **One-Click Starter Templates**: Click "Deploy Next.js Blog" and the platform spins it up from scratch instantly without needing a repo.
- **Resource Quotas**: Set limits so specific apps can only use a maximum amount of RAM.
- **Client Billing**: Integrate Stripe to charge clients for keeping their apps online.
- **Global Edge Caching**: A toggle to interact with the Cloudflare API and cache all static assets globally.
- **AI Auto-Fix for Failed Deploys**: Send build errors to Gemini/OpenAI API and show an "AI Suggestion" explaining why the build failed and how to fix it.
