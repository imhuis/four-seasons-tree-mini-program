const { copyFileSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');

// Keep the engine inside miniprogramRoot so preview/upload needs no manual npm build.
const root = join(__dirname, '..');
const destination = join(root, 'miniprogram/vendor');
const source = dirname(require.resolve('threejs-miniprogram/package.json'));
mkdirSync(destination, { recursive: true });
copyFileSync(join(source, 'dist/index.js'), join(destination, 'three.js'));
copyFileSync(join(source, 'LICENSE'), join(destination, 'THREE-LICENSE.txt'));
copyFileSync(join(dirname(require.resolve('three/package.json')), 'LICENSE'),
  join(destination, 'THREE-UPSTREAM-LICENSE.txt'));
