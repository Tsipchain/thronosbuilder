const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// IPFS client (lazy-loaded via dynamic import — ipfs-http-client is ESM-only)
let _ipfsPromise;
function getIpfs() {
  if (!_ipfsPromise) {
    _ipfsPromise = import('ipfs-http-client')
      .then(mod => mod.create({ url: process.env.IPFS_API_URL || 'http://localhost:5001' }))
      .catch(e => {
        console.warn('IPFS not available, falling back to S3:', e.message);
        return null;
      });
  }
  return _ipfsPromise;
}

const s3 = new S3Client({
  region: process.env.AWS_S3_REGION || 'eu-central-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    : undefined
});

async function uploadToStorage(filePath, key) {
  // 1. Try local disk storage first
  if (process.env.LOCAL_STORAGE_PATH) {
    try {
      const destPath = path.join(process.env.LOCAL_STORAGE_PATH, key);
      const destDir = path.dirname(destPath);
      await fs.promises.mkdir(destDir, { recursive: true });
      await fs.promises.copyFile(filePath, destPath);
      const appUrl = process.env.APP_URL || 'http://localhost:' + (process.env.PORT || '3000');
      const url = `${appUrl}/api/v1/builds/artifacts/${key}`;
      console.log(`💾 Saved to local disk: ${destPath}`);
      return url;
    } catch (localError) {
      console.warn('Local disk storage failed, falling back to IPFS/S3:', localError.message);
    }
  }

  // 2. Try IPFS (needs a buffer, so use readFileSync)
  if (process.env.IPFS_ENABLED === 'true') {
    const ipfs = await getIpfs();
    if (ipfs) {
    try {
      const fileContent = fs.readFileSync(filePath);
      const result = await ipfs.add(fileContent);
      const hash = result.cid.toString();
      console.log(`📦 Uploaded to IPFS: ${hash}`);
      return `https://ipfs.io/ipfs/${hash}`;
    } catch (ipfsError) {
      console.warn('IPFS upload failed, falling back to S3:', ipfsError.message);
    }
    }
  }

  if (process.env.S3_ENABLED === 'true') {
    try {
    const bucket = process.env.AWS_S3_BUCKET;
    const fileBuffer = await fs.promises.readFile(filePath);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: getContentType(key)
    });

    await s3.send(command);
    const url = `https://${bucket}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${key}`;
    console.log(`☁️ Uploaded to S3: ${url}`);
    return url;

    } catch (s3Error) {
      console.error('S3 upload failed:', s3Error);
      throw new Error('Failed to upload artifact to storage');
    }
  }

  throw new Error('No artifact storage backend is enabled or available');
}

function getContentType(key) {
  if (key.endsWith('.apk')) return 'application/vnd.android.package-archive';
  if (key.endsWith('.aab')) return 'application/x-authorware-bin';
  if (key.endsWith('.ipa')) return 'application/octet-stream';
  if (key.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

async function cleanupOldArtifacts() {
  const localStoragePath = process.env.LOCAL_STORAGE_PATH;
  const retentionDays = parseInt(process.env.ARTIFACT_RETENTION_DAYS || '7', 10);

  if (!localStoragePath || Number.isNaN(retentionDays) || retentionDays < 0) {
    return;
  }

  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const root = path.resolve(localStoragePath);

  async function walkAndDelete(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkAndDelete(fullPath);
        const remaining = await fs.promises.readdir(fullPath);
        if (remaining.length === 0) {
          await fs.promises.rmdir(fullPath).catch(() => {});
        }
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(fullPath);
        if (stat.mtimeMs < cutoff) {
          await fs.promises.unlink(fullPath);
        }
      }
    }
  }

  try {
    await fs.promises.mkdir(root, { recursive: true });
    await walkAndDelete(root);
    console.log(`🧹 Artifact cleanup complete (retention: ${retentionDays} days)`);
  } catch (error) {
    console.warn('Artifact cleanup failed:', error.message);
  }
}

module.exports = { uploadToStorage, cleanupOldArtifacts };
