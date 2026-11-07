// Metro bundles the web's shared code (client/src) and the contracts package without copying them.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');
const clientSrc = path.join(repoRoot, 'client', 'src');
const contracts = path.join(repoRoot, 'packages', 'contracts', 'dist', 'index.js');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [clientSrc, path.join(repoRoot, 'packages', 'contracts', 'dist')];
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];

const inside = (file, dir) => !path.relative(dir, file).startsWith('..');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@wqi/contracts') return context.resolveRequest(context, contracts, platform);
  if (moduleName.startsWith('@/')) return context.resolveRequest(context, path.join(clientSrc, moduleName.slice(2)), platform);
  // Packages imported by shared files resolve from mobile/node_modules: one React, one axios, one i18next.
  if (!inside(context.originModulePath, projectRoot) && !moduleName.startsWith('.') && !path.isAbsolute(moduleName)) {
    return context.resolveRequest({ ...context, originModulePath: path.join(projectRoot, 'package.json') }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
