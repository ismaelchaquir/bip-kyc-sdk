const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.extraNodeModules = {
  '@kyciris/kyc-sdk-core': path.resolve(monorepoRoot, 'packages/core/dist'),
  '@kyciris/kyc-sdk-mobile': path.resolve(monorepoRoot, 'apps/mobile/src'),
};

module.exports = config;
