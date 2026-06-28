const secretsManager = require('./secretsManager');

async function sendWebhook(deploymentData) {
    try {
        const webhookUrl = secretsManager.getSecret('WEBHOOK_URL');
        if (!webhookUrl) return; // No webhook configured

        // Basic payload structure compatible with Discord
        const isSuccess = deploymentData.status === 'success';
        const color = isSuccess ? 0x00FF00 : 0xFF0000;
        const statusText = isSuccess ? '✅ Successful' : '❌ Failed';
        
        let description = `**Project:** ${deploymentData.name}\n`;
        if (deploymentData.domain) description += `**Domain:** https://${deploymentData.domain}\n`;
        if (deploymentData.durationMs) description += `**Duration:** ${Math.round(deploymentData.durationMs / 1000)}s\n`;
        if (deploymentData.commitHash) description += `**Commit:** \`${deploymentData.commitHash.substring(0, 7)}\`\n`;
        if (deploymentData.error) description += `**Error:** ${deploymentData.error}\n`;

        const payload = {
            username: 'Antigravity Deployments',
            embeds: [{
                title: `Deployment ${statusText}`,
                description: description,
                color: color,
                timestamp: new Date().toISOString()
            }]
        };

        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error('[Webhook] Failed to send webhook:', await res.text());
        }
    } catch (err) {
        console.error('[Webhook] Error sending webhook:', err.message);
    }
}

module.exports = {
    sendWebhook
};
