const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const monorepoModules = path.resolve(monorepoRoot, 'node_modules');

const escapePathForRegex = (absolutePath) =>
  absolutePath.replace(/[/\\]/g, '[\\\\/]');

const defaultConfig = getDefaultConfig(projectRoot);
const defaultResolveRequest = defaultConfig.resolver.resolveRequest;

const pinnedReactModules = {
  react: path.join(monorepoModules, 'react', 'index.js'),
  'react/jsx-runtime': path.join(monorepoModules, 'react', 'jsx-runtime.js'),
  'react/jsx-dev-runtime': path.join(monorepoModules, 'react', 'jsx-dev-runtime.js'),
  'react-native': path.join(monorepoModules, 'react-native', 'index.js'),
};

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [monorepoModules, path.resolve(projectRoot, 'node_modules')],
    disableHierarchicalLookup: true,
    blockList: [
      // Never bundle dependencies from the Next.js app — it ships its own React copy.
      new RegExp(`${escapePathForRegex(path.resolve(monorepoRoot, 'apps/web/node_modules'))}.*`),
    ],
    extraNodeModules: {
      react: path.join(monorepoModules, 'react'),
      'react-native': path.join(monorepoModules, 'react-native'),
      'react/jsx-runtime': path.join(monorepoModules, 'react/jsx-runtime'),
      'react/jsx-dev-runtime': path.join(monorepoModules, 'react/jsx-dev-runtime'),
    },
    resolveRequest: (context, moduleName, platform) => {
      const pinned = pinnedReactModules[moduleName];
      if (pinned) {
        return {type: 'sourceFile', filePath: pinned};
      }

      if (defaultResolveRequest) {
        return defaultResolveRequest(context, moduleName, platform);
      }

      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);