/**
 * notificationService.js
 * Sends Discord webhook notifications for deployment events.
 * Discord URL is stored as a global secret under key "DISCORD_WEBHOOK_URL".
 */
const secretsManager = require('./secretsManager');

async function sendDiscordNotification(event) {
    try {
        const webhookUrl = secretsManager.getSecret('DISCORD_WEBHOOK_URL');
        if (!webhookUrl) return;

        const isSuccess = event.status === 'success';
        const color = isSuccess ? 0x10b981 : 0xef4444; // green / red
        const statusEmoji = isSuccess ? '✅' : '❌';
        const title = `${statusEmoji} ${event.type === 'redeploy' ? 'Redeploy' : 'Deploy'} ${isSuccess ? 'Succeeded' : 'Failed'}: ${event.name}`;

        let description = '';
        if (event.domain) description += `🌐 **Domain:** https://${event.domain}\n`;
        if (event.branch) description += `🌿 **Branch:** \`${event.branch}\`\n`;
        if (event.commitHash) description += `🔗 **Commit:** \`${event.commitHash.substring(0, 7)}\`\n`;
        if (event.durationMs) description += `⏱️ **Duration:** ${Math.round(event.durationMs / 1000)}s\n`;
        if (event.error) description += `\n**Error:**\n\`\`\`\n${event.error.substring(0, 500)}\n\`\`\``;

        const payload = {
            username: 'ServerOps',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/2721/2721304.png',
            embeds: [{
                title,
                description: description || 'No additional details.',
                color,
                timestamp: new Date().toISOString(),
                footer: { text: 'ServerOps Deployment Platform' }
            }]
        };

        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error('[Discord] Notification failed:', await res.text());
        }
    } catch (err) {
        console.error('[Discord] Error sending notification:', err.message);
    }
}

module.exports = { sendDiscordNotification };
