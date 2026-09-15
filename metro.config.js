const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware) => (request, response, next) => {
  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(request, response, next);
};

module.exports = config;
