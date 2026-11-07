/**
 * Expo config plugin: keeps the Android C++ build out of the project folder.
 *
 * Release builds on Windows fail with "Filename longer than 260 characters"
 * because the generated object paths under android/app/.cxx repeat the full
 * project path. Pointing CMake's staging directory at a short path fixes it.
 * No effect on macOS or Linux beyond the different folder.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// easy-medrefill: short cxx dir';

module.exports = function withShortCxxDir(config, { dir = 'C:/emr-cxx' } = {}) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes(MARKER)) return mod;
    const snippet = `
android {
    ${MARKER}
    externalNativeBuild {
        cmake {
            buildStagingDirectory "${dir}"
        }
    }
}
`;
    mod.modResults.contents += snippet;
    return mod;
  });
};
