/**
 * RN 0.86 omits Libraries/Renderer/shims/ReactNative; gesture-handler still imports it.
 * Copy the local shim into react-native so Metro resolves it without custom aliases.
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(projectRoot, '../..');
const shimSource = path.join(projectRoot, 'shims/ReactNative.js');
const shimTarget = path.join(
  monorepoRoot,
  'node_modules/react-native/Libraries/Renderer/shims/ReactNative.js',
);

if (!fs.existsSync(shimSource)) {
  console.warn('[ensure-rn-shims] source shim missing:', shimSource);
  process.exit(0);
}

fs.mkdirSync(path.dirname(shimTarget), {recursive: true});
fs.copyFileSync(shimSource, shimTarget);
console.log('[ensure-rn-shims] installed', shimTarget);