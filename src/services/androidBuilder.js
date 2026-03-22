const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const { uploadToStorage } = require('./storage');
const { addLog } = require('../utils/logger');

// Docker image name for Flutter builds
const FLUTTER_DOCKER_IMAGE = 'thronosbuilder-flutter';

/**
 * Check if Docker is available and build the Flutter Docker image if needed.
 */
function ensureDockerImage(onLog) {
  try {
    execSync('docker --version', { stdio: 'pipe' });
  } catch {
    throw new Error('Neither Flutter SDK nor Docker is available on this build server.');
  }

  // Check if image exists
  try {
    execSync(`docker image inspect ${FLUTTER_DOCKER_IMAGE}`, { stdio: 'pipe' });
    onLog('Docker Flutter image found', 'info');
  } catch {
    // Build the image from Dockerfile.android
    const dockerfilePath = path.join(__dirname, '../../docker/Dockerfile.android');
    if (!fs.existsSync(dockerfilePath)) {
      throw new Error('Dockerfile.android not found. Cannot build Flutter Docker image.');
    }
    onLog('Building Docker Flutter image (first time only, this may take a few minutes)...', 'info');
    execSync(`docker build -t ${FLUTTER_DOCKER_IMAGE} -f "${dockerfilePath}" "${path.dirname(dockerfilePath)}"`, {
      stdio: 'pipe',
      timeout: 600000 // 10 min timeout for image build
    });
    onLog('Docker Flutter image built successfully', 'success');
  }
}

/**
 * Run a Flutter build inside a Docker container.
 */
function runDockerFlutterBuild({ buildDir, flutterDir, buildType, onLog, onProgress }) {
  const relativeFlutterDir = path.relative(buildDir, flutterDir) || '.';

  onProgress(35, 'Running Flutter build in Docker container...');
  onLog('Using Docker-based Flutter builder', 'info');

  const buildCmd = buildType === 'aab'
    ? 'flutter build appbundle --release'
    : 'flutter build apk --release';

  const workdir = relativeFlutterDir === '.' ? '/build' : `/build/${relativeFlutterDir}`;

  // Run flutter pub get + build inside Docker
  const dockerCmd = [
    'docker', 'run', '--rm',
    '-v', `${buildDir}:/build`,
    '-w', workdir,
    FLUTTER_DOCKER_IMAGE,
    'bash', '-c', `flutter pub get && ${buildCmd}`
  ].join(' ');

  onLog(`Docker build command: flutter pub get && ${buildCmd}`, 'info');

  execSync(dockerCmd, {
    stdio: 'pipe',
    timeout: 900000 // 15 min timeout for build
  });

  const artifactPath = buildType === 'aab'
    ? path.join(flutterDir, 'build/app/outputs/bundle/release/app-release.aab')
    : path.join(flutterDir, 'build/app/outputs/flutter-apk/app-release.apk');

  return artifactPath;
}

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

    // Check for required tools
    let hasFlutter = false;
    let hasGradleSystem = false;
    try { execSync('flutter --version', { stdio: 'pipe' }); hasFlutter = true; } catch {}
    try { execSync('gradle --version', { stdio: 'pipe' }); hasGradleSystem = true; } catch {}

    onLog(`Build environment: Flutter=${hasFlutter}, Gradle=${hasGradleSystem}`, 'info');
    onLog(`ANDROID_HOME=${process.env.ANDROID_HOME || 'not set'}`, 'info');

    // Clone repository
    onProgress(20, 'Cloning repository...');
    onLog(`Cloning from ${sourceUrl}`, 'info');

    const git = simpleGit();
    await git.clone(sourceUrl, buildDir, ['--branch', branch, '--depth', '1']);

    onLog('Repository cloned successfully', 'success');

    // Detect build system
    const hasGradle = fs.existsSync(path.join(buildDir, 'gradlew'));
    const hasPackageJson = fs.existsSync(path.join(buildDir, 'package.json'));
    const hasPubspec = fs.existsSync(path.join(buildDir, 'pubspec.yaml'));
    // Also check if Flutter project is inside a subfolder (e.g. flutter_app/)
    const flutterSubdirs = ['flutter_app', 'mobile', 'app_flutter'];
    let flutterDir = hasPubspec ? buildDir : null;
    if (!flutterDir) {
      for (const sub of flutterSubdirs) {
        const subPath = path.join(buildDir, sub, 'pubspec.yaml');
        if (fs.existsSync(subPath)) {
          flutterDir = path.join(buildDir, sub);
          break;
        }
      }
    }

    let artifactPath;

    if (flutterDir) {
      // Flutter build
      onProgress(30, 'Detected Flutter project...');
      onLog('Detected Flutter project (pubspec.yaml found)', 'info');

      if (hasFlutter) {
        // Use local Flutter SDK
        onProgress(35, 'Running flutter pub get...');
        execSync('flutter pub get', {
          cwd: flutterDir,
          stdio: 'pipe',
          env: { ...process.env, ANDROID_HOME: process.env.ANDROID_HOME || '/opt/android-sdk' }
        });
        onLog('Flutter dependencies installed', 'success');

        // Build APK or AAB
        onProgress(50, `Building Flutter ${buildType.toUpperCase()}...`);
        if (buildType === 'aab') {
          execSync('flutter build appbundle --release', {
            cwd: flutterDir,
            stdio: 'pipe',
            env: { ...process.env, ANDROID_HOME: process.env.ANDROID_HOME || '/opt/android-sdk' }
          });
          artifactPath = path.join(flutterDir, 'build/app/outputs/bundle/release/app-release.aab');
        } else {
          execSync('flutter build apk --release', {
            cwd: flutterDir,
            stdio: 'pipe',
            env: { ...process.env, ANDROID_HOME: process.env.ANDROID_HOME || '/opt/android-sdk' }
          });
          artifactPath = path.join(flutterDir, 'build/app/outputs/flutter-apk/app-release.apk');
        }
      } else {
        // Fallback to Docker-based Flutter build
        onLog('Flutter SDK not found locally, switching to Docker-based builder...', 'warning');
        ensureDockerImage(onLog);
        artifactPath = runDockerFlutterBuild({ buildDir, flutterDir, buildType, onLog, onProgress });
      }

      onLog(`Flutter ${buildType.toUpperCase()} built successfully`, 'success');

    } else if (hasGradle) {
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
      throw new Error('Could not detect build system. Supported: Flutter, Gradle, React Native, Expo');
    }

    // Sign APK if keystore provided
    if (signingConfig.android_keystore && artifactPath) {
      onProgress(80, 'Signing APK...');
      onLog('Signing APK with provided keystore', 'info');

      const keystorePath = path.join(buildDir, 'release-keystore.jks');

      // Decode base64 keystore and write to disk
      fs.writeFileSync(keystorePath, Buffer.from(signingConfig.android_keystore, 'base64'));

      const keystorePassword = signingConfig.keystore_password;
      const keyAlias = signingConfig.key_alias;
      const keyPassword = signingConfig.key_password || keystorePassword;

      if (!keystorePassword || !keyAlias) {
        throw new Error('Signing requires keystore_password and key_alias in signing config');
      }

      // Sign the APK with jarsigner
      const signedApkPath = artifactPath.replace('-unsigned.apk', '-signed.apk');

      execSync(
        `jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 ` +
        `-keystore "${keystorePath}" ` +
        `-storepass "${keystorePassword}" ` +
        `-keypass "${keyPassword}" ` +
        `"${artifactPath}" "${keyAlias}"`,
        { cwd: buildDir, stdio: 'pipe' }
      );

      onLog('APK signed with jarsigner', 'info');

      // Zipalign the signed APK
      const alignedApkPath = artifactPath.replace('-unsigned.apk', '-aligned.apk');
      try {
        execSync(
          `zipalign -v 4 "${artifactPath}" "${alignedApkPath}"`,
          { cwd: buildDir, stdio: 'pipe' }
        );
        // Replace the artifact path with the aligned version
        artifactPath = alignedApkPath;
        onLog('APK zipaligned successfully', 'info');
      } catch (alignError) {
        onLog('zipalign not available, skipping alignment', 'warning');
      }

      // Clean up keystore from disk
      fs.unlinkSync(keystorePath);

      onLog('APK signing completed', 'success');
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
