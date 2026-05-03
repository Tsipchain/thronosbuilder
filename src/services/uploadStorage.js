const fs = require('fs');
const path = require('path');

function getUploadRoot() {
  return path.resolve(process.env.UPLOAD_STORAGE_PATH || '/tmp/uploads');
}

function getUploadDir(uploadId) {
  return path.join(getUploadRoot(), uploadId);
}

function getUploadZipPath(uploadId) {
  return path.join(getUploadDir(uploadId), 'source.zip');
}

async function deleteUploadById(uploadId) {
  if (!uploadId) return;
  const root = getUploadRoot();
  const dir = path.resolve(getUploadDir(uploadId));
  if (!dir.startsWith(`${root}${path.sep}`)) return;
  await fs.promises.rm(dir, { recursive: true, force: true });
}

async function cleanupOldUploads() {
  const retentionHours = parseInt(process.env.UPLOAD_RETENTION_HOURS || '24', 10);
  const root = getUploadRoot();
  if (Number.isNaN(retentionHours) || retentionHours < 0) return;
  const cutoff = Date.now() - (retentionHours * 60 * 60 * 1000);
  await fs.promises.mkdir(root, { recursive: true });
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (!entry.isDirectory()) continue;
    const stat = await fs.promises.stat(fullPath);
    if (stat.mtimeMs < cutoff) {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
    }
  }
}

module.exports = { getUploadRoot, getUploadDir, getUploadZipPath, deleteUploadById, cleanupOldUploads };
