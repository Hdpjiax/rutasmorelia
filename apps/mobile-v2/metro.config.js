const path = require('path');
const {getDefaultConfig} = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const monorepoModules = path.resolve(monorepoRoot, 'node_modules');
const reanimatedSemver = path.join(monorepoModules, 'react-native-reanimated/node_modules/semver');

const escapePathForRegex = absolutePath => absolutePath.replace(/[/\\]/g, '[\\\\/]');

const config = getDefaultConfig(projectRoot);
const defaultResolveRequest = config.resolver.resolveRequest;

const pinnedReactModules = {
  react: path.join(monorepoModules, 'react', 'index.js'),
  'react/jsx-runtime': path.join(monorepoModules, 'react/jsx-runtime.js'),
  'react/jsx-dev-runtime': path.join(monorepoModules, 'react/jsx-dev-runtime.js'),
  'react-native': path.join(monorepoModules, 'react-native', 'index.js'),
};

config.watchFolders = [monorepoRoot];
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [monorepoModules, path.resolve(projectRoot, 'node_modules')],
  disableHierarchicalLookup: true,
  blockList: [
    new RegExp(`${escapePathForRegex(path.resolve(monorepoRoot, 'apps/web/node_modules'))}.*`),
  ],
  extraNodeModules: {
    react: path.join(monorepoModules, 'react'),
    'react-native': path.join(monorepoModules, 'react-native'),
    'react/jsx-runtime': path.join(monorepoModules, 'react/jsx-runtime'),
    'react/jsx-dev-runtime': path.join(monorepoModules, 'react/jsx-dev-runtime'),
    semver: reanimatedSemver,
  },
  resolveRequest: (context, moduleName, platform) => {
    const pinned = pinnedReactModules[moduleName];
    if (pinned) {
      return {type: 'sourceFile', filePath: pinned};
    }
    if (moduleName === 'react-native/Libraries/Renderer/shims/ReactNative') {
      return {type: 'sourceFile', filePath: path.join(projectRoot, 'shims/ReactNative.js')};
    }
    if (moduleName === 'semver' || moduleName.startsWith('semver/')) {
      const subpath = moduleName === 'semver' ? 'index.js' : `${moduleName.slice('semver/'.length)}.js`;
      return {type: 'sourceFile', filePath: path.join(reanimatedSemver, subpath)};
    }
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;