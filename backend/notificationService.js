/**
 * notificationService.js
 * Sends Discord webhook notifications for deployment events.
 * Discord URL is stored as a global secret under key "DISCORD_WEBHOOK_URL".
 */
const secretsManager = require('./secretsManager');

async function sendNotifications(event) {
    try {
        const isSuccess = event.status === 'success';
        const color = isSuccess ? 0x10b981 : 0xef4444; // green / red
        const statusEmoji = isSuccess ? '✅' : '❌';
        const title = `${statusEmoji} ${event.type === 'redeploy' ? 'Redeploy' : event.type === 'health_alert' ? 'Health Alert' : 'Deploy'} ${isSuccess ? 'Succeeded/Recovered' : 'Failed'}: ${event.name}`;

        let description = '';
        if (event.domain) description += `🌐 **Domain:** https://${event.domain}\n`;
        if (event.branch) description += `🌿 **Branch:** \`${event.branch}\`\n`;
        if (event.commitHash) description += `🔗 **Commit:** \`${event.commitHash.substring(0, 7)}\`\n`;
        if (event.durationMs) description += `⏱️ **Duration:** ${Math.round(event.durationMs / 1000)}s\n`;
        if (event.error) description += `\n**Error:**\n\`\`\`\n${event.error.substring(0, 500)}\n\`\`\``;

        // Discord
        const discordWebhook = secretsManager.getSecret('DISCORD_WEBHOOK_URL');
        if (discordWebhook) {
            const payload = {
                username: 'ServerOps',
                avatar_url: 'https://cdn-icons-png.flaticon.com/512/2721/2721304.png',
                embeds: [{ title, description: description || 'No additional details.', color, timestamp: new Date().toISOString(), footer: { text: 'ServerOps Platform' } }]
            };
            fetch(discordWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(e => console.error('[Discord Error]', e));
        }

        // Slack
        const slackWebhook = secretsManager.getSecret('SLACK_WEBHOOK_URL');
        if (slackWebhook) {
            const payload = {
                text: `*${title}*\n${description}`
            };
            fetch(slackWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(e => console.error('[Slack Error]', e));
        }

        // Telegram
        const telegramToken = secretsManager.getSecret('TELEGRAM_BOT_TOKEN');
        const telegramChatId = secretsManager.getSecret('TELEGRAM_CHAT_ID');
        if (telegramToken && telegramChatId) {
            const text = `*${title}*\n${description}`;
            fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: telegramChatId, text, parse_mode: 'Markdown' })
            }).catch(e => console.error('[Telegram Error]', e));
        }

    } catch (err) {
        console.error('[Notification] Error sending notifications:', err.message);
    }
}

module.exports = { sendNotifications };
