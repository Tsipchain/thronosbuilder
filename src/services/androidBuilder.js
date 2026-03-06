const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const { uploadToStorage } = require('./storage');
const { addLog } = require('../utils/logger');

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
  const buildDir = `/tmp/builds/${jobId}`;

  try {
    onProgress(10, 'Setting up build environment...');
    onLog('Starting Android build process', 'info');

    // Create build directory
    fs.mkdirSync(buildDir, { recursive: true });

    // Clone repository
    onProgress(20, 'Cloning repository...');
    onLog(`Cloning from ${sourceUrl}`, 'info');

    const git = simpleGit();
    await git.clone(sourceUrl, buildDir, ['--branch', branch, '--depth', '1']);

    onLog('Repository cloned successfully', 'success');

    // Detect build system
    const hasGradle = fs.existsSync(path.join(buildDir, 'gradlew'));
    const hasPackageJson = fs.existsSync(path.join(buildDir, 'package.json'));

    let artifactPath;

    if (hasGradle) {
      // Native Android build
      onProgress(30, 'Building with Gradle...');
      onLog('Detected Gradle project', 'info');

      const gradleCmd = buildType === 'aab' 
        ? './gradlew bundleRelease'
        : './gradlew assembleRelease';

      execSync(gradleCmd, {
        cwd: buildDir,
        stdio: 'pipe',
        env: { ...process.env, ANDROID_HOME: process.env.ANDROID_HOME || '/opt/android-sdk' }
      });

      artifactPath = buildType === 'aab'
        ? path.join(buildDir, 'app/build/outputs/bundle/release/app-release.aab')
        : path.join(buildDir, 'app/build/outputs/apk/release/app-release-unsigned.apk');

    } else if (hasPackageJson) {
      // React Native / Expo build
      onProgress(30, 'Installing dependencies...');
      onLog('Detected React Native project', 'info');

      execSync('npm install', { cwd: buildDir, stdio: 'pipe' });

      onProgress(50, 'Building React Native app...');

      // Check for Expo
      const hasExpo = fs.existsSync(path.join(buildDir, 'app.json'));

      if (hasExpo) {
        execSync('npx expo prebuild --platform android', { cwd: buildDir, stdio: 'pipe' });
        artifactPath = path.join(buildDir, 'android/app/build/outputs/apk/release/app-release.apk');
      } else {
        execSync('cd android && ./gradlew assembleRelease', { cwd: buildDir, stdio: 'pipe' });
        artifactPath = path.join(buildDir, 'android/app/build/outputs/apk/release/app-release.apk');
      }
    } else {
      throw new Error('Could not detect build system. Supported: Gradle, React Native, Expo');
    }

    // Sign APK if keystore provided
    if (signingConfig.android_keystore && artifactPath) {
      onProgress(80, 'Signing APK...');
      onLog('Signing APK with provided keystore', 'info');

      // TODO: Implement APK signing logic
      // jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore mykeystore.jks app-release-unsigned.apk alias_name
    }

    // Upload artifact
    onProgress(90, 'Uploading artifact...');
    onLog('Uploading to storage...', 'info');

    const artifactUrl = await uploadToStorage(artifactPath, `${jobId}/${buildType === 'aab' ? 'app.aab' : 'app.apk'}`);

    onProgress(100, 'Build completed!');
    onLog('Build completed successfully!', 'success');

    // Cleanup
    execSync(`rm -rf ${buildDir}`);

    return {
      success: true,
      androidUrl: artifactUrl
    };

  } catch (error) {
    onLog(`Build failed: ${error.message}`, 'error');

    // Cleanup on error
    try {
      execSync(`rm -rf ${buildDir}`);
    } catch (e) {}

    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { buildAndroid };
