const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Octokit } = require('octokit');
const { BuildJob } = require('../models');
const { uploadToStorage } = require('./storage');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const GITHUB_OWNER = process.env.GITHUB_BUILD_REPO?.split('/')[0] || 'Tsipchain';
const GITHUB_REPO = process.env.GITHUB_BUILD_REPO?.split('/')[1] || 'thronosbuilder';

async function buildAndroid({
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
    onProgress(5, 'Triggering GitHub Actions build...');
    onLog('Starting Android build via GitHub Actions', 'info');

    // Trigger the android-build workflow
    await octokit.request(
      'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
      {
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        workflow_id: 'android-build.yml',
        ref: 'main',
        inputs: {
          job_id: jobId,
          source_url: sourceUrl,
          branch: branch || 'main',
          build_type: buildType || 'apk'
        }
      }
    );

    onProgress(10, 'GitHub Actions workflow triggered');
    onLog('GitHub Actions workflow dispatched successfully', 'info');

    // Wait for the workflow run to appear
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Find the workflow run
    let runId = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const runs = await octokit.request(
        'GET /repos/{owner}/{repo}/actions/runs',
        {
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          event: 'workflow_dispatch',
          per_page: 10
        }
      );

      // Find a run that matches our job - look for recent runs
      const recentRun = runs.data.workflow_runs.find(run => {
        const createdAt = new Date(run.created_at);
        const now = new Date();
        const ageMs = now - createdAt;
        // Match runs created in the last 60 seconds with the right workflow name
        return ageMs < 60000 && run.name === 'Android Build';
      });

      if (recentRun) {
        runId = recentRun.id;
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (!runId) {
      throw new Error('Could not find GitHub Actions run after dispatch. Check GITHUB_TOKEN permissions.');
    }

    // Save run ID for tracking
    await BuildJob.update(
      { github_run_id: runId.toString() },
      { where: { id: jobId } }
    ).catch(() => {});

    onProgress(15, `GitHub Actions run started (ID: ${runId})`);
    onLog(`GitHub Actions run ID: ${runId}`, 'info');

    // Poll for completion (max 30 minutes)
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 30000));

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
      const progressPct = 15 + Math.min(70, attempt * 1.5);

      onProgress(progressPct, `Build status: ${status}`);
      onLog(`GitHub Actions status: ${status}${conclusion ? ` (${conclusion})` : ''}`, 'info');

      if (status === 'completed') {
        if (conclusion === 'success') {
          onProgress(85, 'Build succeeded, downloading artifact...');
          onLog('GitHub Actions build completed successfully', 'success');

          // Download artifact
          const artifactUrl = await downloadAndUploadArtifact(runId, jobId, buildType);

          onProgress(100, 'Build completed!');
          onLog('Android build completed successfully!', 'success');

          return {
            success: true,
            androidUrl: artifactUrl
          };
        } else {
          throw new Error(`GitHub Actions build failed with conclusion: ${conclusion}`);
        }
      }
    }

    throw new Error('Build timeout exceeded (30 minutes)');

  } catch (error) {
    onLog(`Android build failed: ${error.message}`, 'error');
    return {
      success: false,
      error: error.message
    };
  }
}

async function downloadAndUploadArtifact(runId, jobId, buildType) {
  const axios = require('axios');

  // Get artifacts from the run
  const artifacts = await octokit.request(
    'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts',
    {
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      run_id: runId
    }
  );

  const artifact = artifacts.data.artifacts.find(a => a.name === 'android-artifact');
  if (!artifact) {
    throw new Error('Android artifact not found in GitHub Actions run');
  }

  // Download the artifact zip
  const tmpDir = `/tmp/builds/${jobId}-android`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const response = await axios.get(artifact.archive_download_url, {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      },
      responseType: 'arraybuffer',
      maxContentLength: 500 * 1024 * 1024
    });

    const zipPath = path.join(tmpDir, 'artifact.zip');
    fs.writeFileSync(zipPath, Buffer.from(response.data));

    // Extract zip
    const extractZip = require('extract-zip');
    const extractDir = path.join(tmpDir, 'extracted');
    await extractZip(zipPath, { dir: extractDir });

    // Find the APK/AAB file
    const ext = buildType === 'aab' ? '.aab' : '.apk';
    const files = fs.readdirSync(extractDir);
    const artifactFile = files.find(f => f.endsWith(ext));

    if (!artifactFile) {
      throw new Error(`No ${ext} file found in GitHub Actions artifact`);
    }

    const artifactPath = path.join(extractDir, artifactFile);
    const storageKey = `${jobId}/${buildType === 'aab' ? 'app.aab' : 'app.apk'}`;
    const url = await uploadToStorage(artifactPath, storageKey);

    return url;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

module.exports = { buildAndroid };
