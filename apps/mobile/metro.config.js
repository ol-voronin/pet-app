// Workspace packages (packages/*) are consumed as TypeScript source and use ESM-style
// relative imports with a `.js` extension. Metro does not map `.js` to `.ts`, so do it here.
/* eslint-disable @typescript-eslint/no-require-imports -- Metro loads this file as CommonJS */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const workspacePackages = path.resolve(__dirname, '../../packages') + path.sep;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromWorkspace = context.originModulePath.startsWith(workspacePackages);
  if (fromWorkspace && moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    return context.resolveRequest(context, moduleName.slice(0, -'.js'.length), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
