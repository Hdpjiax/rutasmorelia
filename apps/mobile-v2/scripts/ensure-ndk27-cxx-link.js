/**
 * NDK 27.1 no aplica ANDROID_STL=c++_shared en CMake; worklets/reanimated fallan al enlazar.
 * @see https://github.com/software-mansion/react-native-reanimated/issues/9444
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(projectRoot, '../..');

const patches = [
  {
    packageName: 'react-native-worklets',
    cmakeRelativePath: 'android/CMakeLists.txt',
    marker: 'target_link_libraries(worklets c++_shared',
    apply: (content) =>
      content.replace(
        'target_link_libraries(worklets android log ReactAndroid::reactnative',
        'target_link_libraries(worklets c++_shared android log ReactAndroid::reactnative',
      ),
  },
  {
    packageName: 'react-native-reanimated',
    cmakeRelativePath: 'android/CMakeLists.txt',
    marker: 'target_link_libraries(\n  reanimated\n  c++_shared',
    apply: (content) =>
      content.replace(
        'target_link_libraries(\n  reanimated\n  log',
        'target_link_libraries(\n  reanimated\n  c++_shared\n  log',
      ),
  },
  {
    packageName: 'expo-modules-core',
    cmakeRelativePath: 'android/cmake/common.cmake',
    marker: 'ReactAndroid::reactnative\n  c++_shared',
    apply: (content) =>
      content.replace(
        '  ReactAndroid::reactnative\n)',
        '  ReactAndroid::reactnative\n  c++_shared\n)',
      ),
  },
  {
    packageName: 'react-native-gesture-handler',
    cmakeRelativePath: 'android/src/main/jni/CMakeLists.txt',
    marker: 'fbjni::fbjni\n  c++_shared',
    apply: (content) =>
      content.replace(
        '  fbjni::fbjni\n)',
        '  fbjni::fbjni\n  c++_shared\n)',
      ),
  },
];

let changed = 0;

for (const patch of patches) {
  const cmakePath = path.join(
    monorepoRoot,
    'node_modules',
    patch.packageName,
    patch.cmakeRelativePath,
  );

  if (!fs.existsSync(cmakePath)) {
    console.warn('[ensure-ndk27-cxx-link] skipped missing file:', cmakePath);
    continue;
  }

  const original = fs.readFileSync(cmakePath, 'utf8');
  if (original.includes(patch.marker)) {
    console.log('[ensure-ndk27-cxx-link] already patched:', cmakePath);
    continue;
  }

  const updated = patch.apply(original);
  if (updated === original) {
    console.warn('[ensure-ndk27-cxx-link] pattern not found in:', cmakePath);
    continue;
  }

  fs.writeFileSync(cmakePath, updated);
  changed += 1;
  console.log('[ensure-ndk27-cxx-link] patched:', cmakePath);
}

if (changed === 0) {
  console.log('[ensure-ndk27-cxx-link] no changes needed');
}