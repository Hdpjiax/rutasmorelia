const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../../..');

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function writeIfChanged(filePath, nextContent) {
  const current = readIfExists(filePath);
  if (!current || current === nextContent) {
    return false;
  }
  fs.writeFileSync(filePath, nextContent);
  return true;
}

function ensureTargetLinksCppShared(content, targetName) {
  if (content.includes('c++_shared')) {
    return content;
  }

  const blockPattern = new RegExp(
    `(target_link_libraries\\(\\s*${targetName}[\\s\\S]*?\\))`,
    'm',
  );
  const match = content.match(blockPattern);
  if (!match) {
    return content;
  }

  return content.replace(match[1], `${match[1].replace(/\)\s*$/, '\n    c++_shared\n)')}`);
}

function patchSafeAreaContext(cmakePath) {
  let content = readIfExists(cmakePath);
  if (!content) {
    return false;
  }

  const mergedNeedle = `target_link_libraries(
          ${'${LIB_TARGET_NAME}'}
          fbjni
          jsi
          reactnative
  )`;
  const legacyNeedle = `target_link_libraries(
          ${'${LIB_TARGET_NAME}'}
          fbjni
          folly_runtime
          glog
          jsi
          react_codegen_rncore
          react_debug
          react_nativemodule_core
          react_render_core
          react_render_debug
          react_render_graphics
          react_render_mapbuffer
          react_render_componentregistry
          react_utils
          rrc_view
          turbomodulejsijni
          yoga
  )`;

  let patched = content;
  if (patched.includes(mergedNeedle)) {
    patched = patched.replace(
      mergedNeedle,
      `target_link_libraries(
          \${LIB_TARGET_NAME}
          fbjni
          jsi
          reactnative
          c++_shared
  )`,
    );
  } else if (patched.includes(legacyNeedle)) {
    patched = patched.replace(
      legacyNeedle,
      `target_link_libraries(
          \${LIB_TARGET_NAME}
          fbjni
          folly_runtime
          glog
          jsi
          react_codegen_rncore
          react_debug
          react_nativemodule_core
          react_render_core
          react_render_debug
          react_render_graphics
          react_render_mapbuffer
          react_render_componentregistry
          react_utils
          rrc_view
          turbomodulejsijni
          yoga
          c++_shared
  )`,
    );
  } else {
    patched = ensureTargetLinksCppShared(patched, '\\$\\{LIB_TARGET_NAME\\}');
  }

  return writeIfChanged(cmakePath, patched);
}

function patchScreensModule(cmakePath) {
  let content = readIfExists(cmakePath);
  if (!content) {
    return false;
  }

  const needle = `target_link_libraries(rnscreens
    ReactAndroid::reactnative
    ReactAndroid::jsi
    fbjni::fbjni
    android
)`;

  let patched = content;
  if (patched.includes(needle)) {
    patched = patched.replace(
      needle,
      `target_link_libraries(rnscreens
    ReactAndroid::reactnative
    ReactAndroid::jsi
    fbjni::fbjni
    android
    c++_shared
)`,
    );
  } else {
    patched = ensureTargetLinksCppShared(patched, 'rnscreens');
  }

  return writeIfChanged(cmakePath, patched);
}

function patchScreensCodegen(cmakePath) {
  let content = readIfExists(cmakePath);
  if (!content) {
    return false;
  }

  const needle = `target_link_libraries(
  \${LIB_TARGET_NAME}
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
)`;

  let patched = content;
  if (patched.includes(needle)) {
    patched = patched.replace(
      needle,
      `target_link_libraries(
  \${LIB_TARGET_NAME}
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
  c++_shared
)`,
    );
  } else {
    patched = ensureTargetLinksCppShared(patched, '\\$\\{LIB_TARGET_NAME\\}');
  }

  return writeIfChanged(cmakePath, patched);
}

function patchSvg(cmakePath) {
  let content = readIfExists(cmakePath);
  if (!content) {
    return false;
  }

  const needle = `target_link_libraries(
  react_codegen_rnsvg
  fbjni
)`;

  let patched = content;
  if (patched.includes(needle)) {
    patched = patched.replace(
      needle,
      `target_link_libraries(
  react_codegen_rnsvg
  fbjni
  c++_shared
)`,
    );
  } else {
    patched = ensureTargetLinksCppShared(patched, 'react_codegen_rnsvg');
  }

  return writeIfChanged(cmakePath, patched);
}

const patches = [
  {
    label: 'react-native-safe-area-context codegen',
    path: path.join(
      workspaceRoot,
      'node_modules/react-native-safe-area-context/android/src/main/jni/CMakeLists.txt',
    ),
    apply: patchSafeAreaContext,
  },
  {
    label: 'react-native-screens native module',
    path: path.join(
      workspaceRoot,
      'node_modules/react-native-screens/android/CMakeLists.txt',
    ),
    apply: patchScreensModule,
  },
  {
    label: 'react-native-screens codegen',
    path: path.join(
      workspaceRoot,
      'node_modules/react-native-screens/android/src/main/jni/CMakeLists.txt',
    ),
    apply: patchScreensCodegen,
  },
  {
    label: 'react-native-svg codegen',
    path: path.join(
      workspaceRoot,
      'node_modules/react-native-svg/android/src/main/jni/CMakeLists.txt',
    ),
    apply: patchSvg,
  },
];

let changed = 0;
for (const patch of patches) {
  if (patch.apply(patch.path)) {
    changed += 1;
    console.log(`[patch-native-ndk] Updated ${patch.label}.`);
  }
}

if (changed === 0) {
  console.log('[patch-native-ndk] Native modules already patched for NDK 27.');
}