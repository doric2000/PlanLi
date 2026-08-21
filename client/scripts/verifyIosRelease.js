const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientRoot, '..');
const configOnly = process.argv.includes('--config-only');
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(clientRoot, relativePath), 'utf8'));
}

function pluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

function verifyPng(relativePath, expectedWidth, expectedHeight, allowAlpha = false) {
  const fullPath = path.join(clientRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`${relativePath} is missing.`);
    return;
  }
  const bytes = fs.readFileSync(fullPath);
  const pngSignature = '89504e470d0a1a0a';
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== pngSignature) {
    fail(`${relativePath} is not a valid PNG.`);
    return;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    fail(`${relativePath} must be ${expectedWidth}x${expectedHeight}; found ${width}x${height}.`);
  }
  const colorType = bytes[25];
  const hasAlphaChannel = colorType === 4 || colorType === 6;
  const hasTransparencyChunk = bytes.includes(Buffer.from('tRNS'));
  if (!allowAlpha && (hasAlphaChannel || hasTransparencyChunk)) {
    fail(`${relativePath} must not contain transparency for App Store submission.`);
  }
}

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

if (!configOnly && Number(process.versions.node.split('.')[0]) !== 22) {
  fail(`Node 22 is required; found ${process.version}.`);
}

const app = readJson('app.json').expo;
const eas = readJson('eas.json');
const packageJson = readJson('package.json');
const preview = eas.build?.preview || {};
const production = eas.build?.production || {};
const productionSubmit = eas.submit?.production?.ios || {};
const requiredPlugins = [
  'expo-apple-authentication',
  '@react-native-google-signin/google-signin',
  'expo-image-picker',
  'expo-notifications',
  '@sentry/react-native',
];
const configuredPlugins = (app.plugins || []).map(pluginName);

if (app.ios?.bundleIdentifier !== 'com.planli.planlitravels') {
  fail('The iOS bundle identifier must be com.planli.planlitravels.');
}
if (app.ios?.usesAppleSignIn !== true) fail('Sign in with Apple must remain enabled.');
if (app.ios?.supportsTablet !== false) fail('The untested iPad target must remain disabled for this beta.');
if (app.ios?.infoPlist?.ITSAppUsesNonExemptEncryption !== false) {
  fail('ITSAppUsesNonExemptEncryption must explicitly remain false.');
}
if (!String(app.ios?.infoPlist?.NSLocationWhenInUseUsageDescription || '').trim()) {
  fail('The iOS location usage description is missing.');
}
requiredPlugins.forEach((name) => {
  if (!configuredPlugins.includes(name)) fail(`Missing Expo config plugin: ${name}.`);
});
const imagePickerPlugin = (app.plugins || []).find((plugin) => pluginName(plugin) === 'expo-image-picker');
const imagePickerOptions = Array.isArray(imagePickerPlugin) ? imagePickerPlugin[1] : null;
if (!String(imagePickerOptions?.photosPermission || '').trim()) {
  fail('The iOS photo-library usage description is missing.');
}
if (!String(imagePickerOptions?.cameraPermission || '').trim()) {
  fail('The iOS camera usage description is missing.');
}
if (imagePickerOptions?.microphonePermission !== false) {
  fail('The unused microphone permission must remain disabled.');
}

if (preview.distribution !== 'internal') fail('The preview profile must use internal distribution.');
if (preview.channel !== 'preview') fail('The preview profile must use the preview EAS Update channel.');
if (preview.environment !== 'production') fail('The preview profile must use the production EAS environment.');
if (!String(preview.node || '').startsWith('22.')) fail('The preview EAS build must use Node 22.');
if (preview.ios?.image !== 'macos-sequoia-15.6-xcode-26.0') {
  fail('The SDK 54 preview build must use the pinned Xcode 26.0 image.');
}
if (production.distribution !== 'store') fail('The production profile must use store distribution.');
if (production.channel !== 'production') fail('The production profile must use the production EAS Update channel.');
if (production.environment !== 'production') fail('The production profile must use the EAS production environment.');
if (production.autoIncrement !== true) fail('The production profile must auto-increment build numbers.');
if (!String(production.node || '').startsWith('22.')) fail('The EAS production build must use Node 22.');
if (production.ios?.image !== 'macos-sequoia-15.6-xcode-26.0') {
  fail('The SDK 54 production build must use the pinned Xcode 26.0 image.');
}
if (productionSubmit.ascAppId !== '6801453067') {
  fail('The production submit profile must target the PlanLi App Store Connect app.');
}

if (!String(packageJson.dependencies?.['@sentry/react-native'] || '').trim()) {
  fail('@sentry/react-native is missing from dependencies.');
}
if (!String(packageJson.dependencies?.['expo-updates'] || '').trim()) {
  fail('expo-updates is missing from dependencies.');
}
if (packageJson.dependencies?.['expo-notifications'] !== '~0.32.17') {
  fail('expo-notifications must stay on the SDK 54 compatible ~0.32.17 release.');
}
if (app.version === '1.0.0') {
  fail('The native push build must use a new appVersion/runtimeVersion (1.1.0 or newer).');
}
if (app.runtimeVersion?.policy !== 'appVersion') {
  fail('The EAS Update runtime version must use the appVersion policy.');
}
const expectedUpdatesUrl = `https://u.expo.dev/${app.extra?.eas?.projectId || ''}`;
if (app.updates?.url !== expectedUpdatesUrl) {
  fail(`The EAS Update URL must match the configured EAS project: ${expectedUpdatesUrl}.`);
}
const metroConfig = fs.readFileSync(path.join(clientRoot, 'metro.config.js'), 'utf8');
if (!metroConfig.includes('getSentryExpoConfig')) fail('Metro is not configured for Sentry source maps.');
const errorReporting = fs.readFileSync(path.join(clientRoot, 'src/services/ErrorReporting.js'), 'utf8');
[
  'sendDefaultPii: false',
  'maxBreadcrumbs: 50',
  'tracesSampleRate: 0.1',
  'profilesSampleRate: 0',
  'replaysSessionSampleRate: 0',
  'replaysOnErrorSampleRate: 1',
  'maskAllText: true',
  'maskAllImages: true',
  'maskAllVectors: true',
  'attachScreenshot: false',
  'attachViewHierarchy: false',
  'enableCaptureFailedRequests: false',
  'beforeSendTransaction: scrubTransaction',
].forEach((setting) => {
  if (!errorReporting.includes(setting)) fail(`Crash reporting privacy setting is missing: ${setting}.`);
});

const plistPath = path.join(clientRoot, app.ios.googleServicesFile || '');
if (!fs.existsSync(plistPath)) {
  fail('GoogleService-Info.plist is missing.');
} else {
  const plist = fs.readFileSync(plistPath, 'utf8');
  if (!plist.includes('<string>com.planli.planlitravels</string>')) {
    fail('GoogleService-Info.plist does not match the iOS bundle identifier.');
  }
}

verifyPng('assets/brand-app-icon.png', 1024, 1024);
verifyPng('assets/brand-splash.png', 1024, 1024, true);

const sourceFiles = walkFiles(path.join(clientRoot, 'src')).filter((file) => /\.(js|jsx|ts|tsx)$/.test(file));
const debugPatterns = [
  { pattern: /Alert\.alert\s*\(\s*['"]DEBUG['"]/, label: 'visible DEBUG alert' },
  { pattern: /DELETE CLICKED/, label: 'deletion debug log' },
];
sourceFiles.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  debugPatterns.forEach(({ pattern, label }) => {
    if (pattern.test(source)) fail(`${path.relative(repoRoot, file)} contains a ${label}.`);
  });
});

if (failures.length) {
  console.error('iOS release configuration failed:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(configOnly
    ? 'iOS release configuration verified (Node version check skipped).'
    : 'iOS release configuration verified on Node 22.');
}
