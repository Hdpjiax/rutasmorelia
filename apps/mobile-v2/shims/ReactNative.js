/**
 * RN 0.86 removed Libraries/Renderer/shims/ReactNative; gesture-handler still imports it.
 * Re-export ReactFabric so Metro can resolve the legacy path via apps/mobile-v2/metro.config.js.
 */
module.exports = require('react-native/Libraries/Renderer/shims/ReactFabric').default;