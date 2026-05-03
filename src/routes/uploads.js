const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { BuildJob } = require('../models');
const { validateThrAddress } = require('../services/blockchain');
const { getUploadDir, getUploadZipPath } = require('../services/uploadStorage');

const router = express.Router();
const maxUploadMb = parseInt(process.env.MAX_UPLOAD_MB || '500', 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file || !file.originalname.toLowerCase().endsWith('.zip')) {
      return cb(new Error('Only .zip uploads are allowed'));
    }
    cb(null, true);
  }
});

router.post('/project-zip', upload.single('file'), async (req, res) => {
  try {
    const { wallet_address, project_name, platform, build_type } = req.body;
    if (!wallet_address || !validateThrAddress(wallet_address)) return res.status(400).json({ error: 'Invalid wallet_address' });
    if (!project_name || !platform || !build_type) return res.status(400).json({ error: 'Missing required fields' });
    if (!req.file) return res.status(400).json({ error: 'Zip file is required' });

    const buf = req.file.buffer;
    if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
      return res.status(400).json({ error: 'Invalid zip file' });
    }

    const uploadId = uuidv4();
    const uploadToken = crypto.randomBytes(24).toString('hex');
    const uploadDir = getUploadDir(uploadId);
    const zipPath = getUploadZipPath(uploadId);
    await fs.promises.mkdir(uploadDir, { recursive: true });
    await fs.promises.writeFile(zipPath, buf);

    const expiresAt = new Date(Date.now() + (parseInt(process.env.UPLOAD_RETENTION_HOURS || '24', 10) * 60 * 60 * 1000));

    res.status(201).json({
      upload_id: uploadId,
      upload_token: uploadToken,
      source_type: 'zip',
      source_url: `/api/v1/uploads/${uploadId}/download?token=${uploadToken}`,
      expires_at: expiresAt.toISOString()
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/:uploadId/download', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { token } = req.query;
    if (!token) return res.status(403).json({ error: 'Missing token' });

    const job = await BuildJob.findOne({ where: { upload_id: uploadId, upload_token: token } });
    if (!job) return res.status(404).json({ error: 'Upload not found' });

    const zipPath = getUploadZipPath(uploadId);
    if (!fs.existsSync(zipPath)) return res.status(404).json({ error: 'Upload expired or deleted' });

    console.log(`Upload download access job=${job.id} upload=${uploadId}`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="source.zip"');
    fs.createReadStream(zipPath).pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
