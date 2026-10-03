const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join, dirname, posix } = require('node:path');

const root = join(__dirname, '..');
function createBundle() {
const modules = new Map();
function collect(id) {
  if (modules.has(id)) return;
  const source = readFileSync(join(root, 'miniprogram', id), 'utf8');
  modules.set(id, source);
  for (const match of source.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (!match[1].startsWith('.')) throw new Error(`Unexpected runtime dependency: ${match[1]}`);
    collect(posix.normalize(posix.join(posix.dirname(id), match[1] + '.js')));
  }
}
collect('render/TreeScene.js');
const factories = [...modules].map(([id, source]) => `${JSON.stringify(id)}: function(require, module, exports) {\n${source}\n}`).join(',\n');
return `(() => {
  const factories = {${factories}};
  const cache = {};
  function load(id) {
    if (cache[id]) return cache[id].exports;
    const module = { exports: {} }; cache[id] = module;
    factories[id](name => {
      const parts = id.split('/'); parts.pop();
      for (const part of name.split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part); }
      return load(parts.join('/') + '.js');
    }, module, module.exports);
    return module.exports;
  }
  window.TreeScene = load('render/TreeScene.js').TreeScene;
  window.TreePresets = load('render/TreePresets.js').TREE_PRESETS;
  window.GrowthStages = load('render/GrowthController.js').GROWTH_STAGES;
})();`;
}

const port = Number(process.env.SEASON_TREE_PORT || 4173);
const server = createServer((request, response) => {
  if (request.url === '/bundle.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    response.end(createBundle());
  } else if (request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(readFileSync(join(dirname(__dirname), 'preview/index.html')));
  } else {
    response.writeHead(404); response.end();
  }
});
// 绑定 0.0.0.0，方便 IDE 内置预览面板通过反向代理域名访问本地服务
server.listen(port, '0.0.0.0', () => console.log(`Preview: http://127.0.0.1:${port}`));
