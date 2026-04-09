/**
 * Build WebTorrent as a single CJS bundle for Electron compatibility.
 *
 * Steps:
 * 1. Patch webrtc-polyfill's Blob.js to remove top-level await (blocks CJS output)
 * 2. Run esbuild to create a single CJS bundle
 * 3. Restore the original Blob.js
 * 4. Post-process: wrap node-datachannel block in try-catch (optional native module)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const bundlePath = path.join(__dirname, '..', 'webtorrent-bundle.cjs');
const blobPath = path.join(__dirname, '..', 'node_modules', 'webrtc-polyfill', 'lib', 'Blob.js');

// Step 1: Patch Blob.js — remove top-level await
// In Electron (Chromium), globalThis.Blob always exists. The Node.js buffer
// fallback with `await import()` is never needed but blocks CJS output.
const blobOriginal = fs.readFileSync(blobPath, 'utf8');
fs.writeFileSync(blobPath,
  'const _Blob = globalThis.Blob || require("buffer").Blob;\nexport default _Blob;\n'
);

try {
  // Step 2: Bundle as CJS
  execSync(
    'npx esbuild node_modules/webtorrent/index.js --bundle --platform=node --format=cjs --outfile=webtorrent-bundle.cjs --external:electron',
    { cwd: path.join(__dirname, '..'), stdio: 'inherit' }
  );
} finally {
  // Step 3: Always restore original Blob.js
  fs.writeFileSync(blobPath, blobOriginal);
}

// Step 4: Post-process — wrap entire node-datachannel initialization in try-catch.
// esbuild converts import.meta to an empty object in CJS, so import_meta.url is
// undefined, which crashes fileURLToPath(). The whole block is optional.
let code = fs.readFileSync(bundlePath, 'utf8');

code = code.replace(
  [
    '// node_modules/node-datachannel/dist/esm/lib/node-datachannel.mjs',
    'var import_node_url2 = __toESM(require("node:url"), 1);',
    'var import_node_path = __toESM(require("node:path"), 1);',
    'var import_node_module = __toESM(require("node:module"), 1);',
    'var import_meta = {};',
    'var __filename2 = import_node_url2.default.fileURLToPath(import_meta.url);',
    'var __dirname2 = import_node_path.default.dirname(__filename2);',
    'var require2 = import_node_module.default.createRequire(import_meta.url);',
    'var nodeDataChannel = require2("../../../build/Release/node_datachannel.node");',
  ].join('\n'),
  [
    '// node_modules/node-datachannel/dist/esm/lib/node-datachannel.mjs',
    'var nodeDataChannel;',
    'try {',
    '  var import_node_url2 = __toESM(require("node:url"), 1);',
    '  var import_node_path = __toESM(require("node:path"), 1);',
    '  var import_node_module = __toESM(require("node:module"), 1);',
    '  var __filename2 = __filename;',
    '  var __dirname2 = __dirname;',
    '  var require2 = require;',
    '  nodeDataChannel = require2("../../../build/Release/node_datachannel.node");',
    '} catch(e) { console.warn("WebTorrent: node-datachannel not available:", e.message); nodeDataChannel = {}; }',
  ].join('\n')
);

fs.writeFileSync(bundlePath, code);
console.log('  ✓ webtorrent-bundle.cjs built and patched');
