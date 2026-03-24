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
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
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
      const url = `${appUrl}/api/builds/artifacts/${key}`;
      console.log(`💾 Saved to local disk: ${destPath}`);
      return url;
    } catch (localError) {
      console.warn('Local disk storage failed, falling back to IPFS/S3:', localError.message);
    }
  }

  // 2. Try IPFS (needs a buffer, so use readFileSync)
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

  // 3. Fallback to S3 (use a stream instead of reading entire file into memory)
  try {
    const bucket = process.env.AWS_S3_BUCKET;
    const fileStream = fs.createReadStream(filePath);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileStream,
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

function getContentType(key) {
  if (key.endsWith('.apk')) return 'application/vnd.android.package-archive';
  if (key.endsWith('.aab')) return 'application/x-authorware-bin';
  if (key.endsWith('.ipa')) return 'application/octet-stream';
  if (key.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

module.exports = { uploadToStorage };
