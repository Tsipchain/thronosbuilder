const { Octokit } = require('octokit');
const { BuildJob } = require('../models');
const { uploadToStorage } = require('./storage');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const GITHUB_OWNER = process.env.GITHUB_BUILD_REPO?.split('/')[0] || 'your-org';
const GITHUB_REPO = process.env.GITHUB_BUILD_REPO?.split('/')[1] || 'ios-build-runner';

async function buildIOS({
  jobId,
  sourceUrl,
  sourceType,
  branch,
  buildType,
  signingConfig,
  onProgress,
  onLog
}) {
  try {
    onProgress(10, 'Triggering GitHub Actions build...');
    onLog('Starting iOS build via GitHub Actions', 'info');

    // Trigger workflow
    const response = await octokit.request(
      'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
      {
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        workflow_id: 'ios-build.yml',
        ref: 'main',
        inputs: {
          job_id: jobId,
          source_url: sourceUrl,
          branch: branch,
          build_type: buildType
        }
      }
    );

    onLog('GitHub Actions workflow triggered', 'info');

    // Poll for workflow completion
    let runId = null;
    let attempts = 0;
    const maxAttempts = 60; // 30 minutes (polling every 30 seconds)

    // Get the run ID
    await new Promise(resolve => setTimeout(resolve, 5000));

    const runs = await octokit.request(
      'GET /repos/{owner}/{repo}/actions/runs',
      {
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        per_page: 5
      }
    );

    const workflowRun = runs.data.workflow_runs.find(
      run => run.name === `iOS Build - ${jobId}` || new Date(run.created_at) > new Date(Date.now() - 60000)
    );

    if (!workflowRun) {
      throw new Error('Could not find GitHub Actions run');
    }

    runId = workflowRun.id;

    // Save run ID
    await BuildJob.update(
      { github_run_id: runId.toString() },
      { where: { id: jobId } }
    );

    onLog(`GitHub Actions run ID: ${runId}`, 'info');

    // Poll for completion
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 30000));
      attempts++;

      const run = await octokit.request(
        'GET /repos/{owner}/{repo}/actions/runs/{run_id}',
        {
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          run_id: runId
        }
      );

      const status = run.data.status;
      const conclusion = run.data.conclusion;

      onProgress(10 + Math.min(80, attempts * 1.5), `GitHub Actions status: ${status}`);
      onLog(`GitHub Actions status: ${status}`, 'info');

      if (status === 'completed') {
        if (conclusion === 'success') {
          onProgress(90, 'Downloading artifact...');
          onLog('Build completed, downloading IPA...', 'success');

          // Download artifact
          const artifacts = await octokit.request(
            'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts',
            {
              owner: GITHUB_OWNER,
              repo: GITHUB_REPO,
              run_id: runId
            }
          );

          const ipaArtifact = artifacts.data.artifacts.find(
            a => a.name === 'ipa-artifact'
          );

          if (!ipaArtifact) {
            throw new Error('IPA artifact not found');
          }

          // Download and upload to our storage
          const artifactUrl = await downloadAndUploadArtifact(
            ipaArtifact.archive_download_url,
            jobId
          );

          onProgress(100, 'Build completed!');
          onLog('iOS build completed successfully!', 'success');

          return {
            success: true,
            iosUrl: artifactUrl
          };

        } else {
          throw new Error(`GitHub Actions failed with conclusion: ${conclusion}`);
        }
      }
    }

    throw new Error('Build timeout exceeded');

  } catch (error) {
    onLog(`iOS build failed: ${error.message}`, 'error');
    return {
      success: false,
      error: error.message
    };
  }
}

async function downloadAndUploadArtifact(downloadUrl, jobId) {
  const axios = require('axios');
  const fs = require('fs');
  const path = require('path');
  const extractZip = require('extract-zip');

  const tmpDir = `/tmp/builds/${jobId}-ios`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Download the artifact zip from GitHub Actions
    const response = await axios.get(downloadUrl, {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      },
      responseType: 'arraybuffer',
      maxContentLength: 500 * 1024 * 1024 // 500MB max
    });

    const zipPath = path.join(tmpDir, 'artifact.zip');
    fs.writeFileSync(zipPath, Buffer.from(response.data));

    // Extract the zip to find the IPA file
    const extractDir = path.join(tmpDir, 'extracted');
    await extractZip(zipPath, { dir: extractDir });

    // Find the .ipa file in extracted contents
    const files = fs.readdirSync(extractDir);
    const ipaFile = files.find(f => f.endsWith('.ipa'));

    if (!ipaFile) {
      throw new Error('No .ipa file found in GitHub Actions artifact');
    }

    const ipaPath = path.join(extractDir, ipaFile);

    // Upload IPA to storage (IPFS or S3)
    const artifactUrl = await uploadToStorage(ipaPath, `${jobId}/app.ipa`);

    return artifactUrl;
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

module.exports = { buildIOS };
