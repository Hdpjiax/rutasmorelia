const path = require('path');
const {getDefaultConfig} = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const monorepoModules = path.resolve(monorepoRoot, 'node_modules');

const escapePathForRegex = absolutePath => absolutePath.replace(/[/\\]/g, '[\\\\/]');

const config = getDefaultConfig(projectRoot);
const defaultResolveRequest = config.resolver.resolveRequest;

const reactNativeRendererShim = path.join(
  monorepoModules,
  'react-native/Libraries/Renderer/shims/ReactFabric.js',
);

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
  },
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName === 'react-native/Libraries/Renderer/shims/ReactNative') {
      return {type: 'sourceFile', filePath: reactNativeRendererShim};
    }
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;