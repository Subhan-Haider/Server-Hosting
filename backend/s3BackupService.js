/**
 * s3BackupService.js
 * Backs up project directories to S3-compatible storage.
 */
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const archiver = require('archiver');
const secretsManager = require('./secretsManager');

async function createBackup(projectName, projectPath) {
    return new Promise(async (resolve, reject) => {
        try {
            const bucket = secretsManager.getSecret('S3_BUCKET');
            const region = secretsManager.getSecret('S3_REGION');
            const endpoint = secretsManager.getSecret('S3_ENDPOINT'); // Optional, for Cloudflare R2 / DigitalOcean Spaces
            const accessKeyId = secretsManager.getSecret('S3_ACCESS_KEY');
            const secretAccessKey = secretsManager.getSecret('S3_SECRET_KEY');

            if (!bucket || !region || !accessKeyId || !secretAccessKey) {
                return reject(new Error('S3 credentials are not fully configured in Secrets Vault'));
            }

            const s3Config = {
                region,
                credentials: { accessKeyId, secretAccessKey }
            };
            if (endpoint) s3Config.endpoint = endpoint;

            const s3Client = new S3Client(s3Config);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const zipFileName = `${projectName}-backup-${timestamp}.zip`;
            const zipFilePath = path.join(__dirname, zipFileName);

            const output = fs.createWriteStream(zipFilePath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', async () => {
                try {
                    const fileStream = fs.createReadStream(zipFilePath);
                    const uploadParams = {
                        Bucket: bucket,
                        Key: `backups/${projectName}/${zipFileName}`,
                        Body: fileStream
                    };

                    await s3Client.send(new PutObjectCommand(uploadParams));
                    fs.unlinkSync(zipFilePath); // Clean up local zip
                    resolve({ success: true, key: uploadParams.Key });
                } catch (err) {
                    if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
                    reject(err);
                }
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);
            
            // Ignore node_modules, .git, and dist to save space, unless user configures otherwise
            archive.glob('**/*', {
                cwd: projectPath,
                ignore: ['node_modules/**', '.git/**', '.next/**', 'dist/**']
            });
            
            archive.finalize();

        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { createBackup };
