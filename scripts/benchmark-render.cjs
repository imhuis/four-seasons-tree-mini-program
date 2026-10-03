const { performance } = require('node:perf_hooks');
const three = require('three');
const adapter = require('../miniprogram/vendor/three');
const { TreeScene } = require('../miniprogram/render/TreeScene');
const { createRng } = require('../miniprogram/utils/math');

// Measure scene/geometry CPU work without a GPU or mini-program page bridge.
class Renderer {
  setPixelRatio() {} setSize() {} clear() {} render() {} dispose() {} forceContextLoss() {}
}
adapter.createScopedThreejs = () => ({ ...three, WebGLRenderer: Renderer });
global.wx = { getWindowInfo: () => ({ pixelRatio: 2 }) };

const frames = 180;
const samples = 5;
const results = [];
for (const [preset, progress] of [
  ['sakura', 0.125], ['sakura', 0.375], ['japanese-maple', 0.375],
  ['persimmon', 0.625], ['sakura', 0.875], ['crape-myrtle', 0.375],
]) {
  Math.random = createRng(20261003);
  const scene = new TreeScene();
  scene.attach({ requestAnimationFrame: () => 1, cancelAnimationFrame() {} }, 375, 600);
  scene.setTreePreset(preset);
  scene.setSeasonProgress(progress);
  const step = () => { scene.elapsed += 1 / 60; scene.update(1 / 60); };
  for (let frame = 0; frame < 120; frame++) step();
  const times = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    for (let frame = 0; frame < frames; frame++) step();
    times.push((performance.now() - start) / frames);
  }
  const versions = new Map();
  scene.world.traverse(object => {
    if (object.geometry) for (const attribute of Object.values(object.geometry.attributes)) {
      versions.set(attribute, attribute.version);
    }
  });
  step();
  let uploadBytes = 0;
  const counted = new Set();
  scene.world.traverseVisible(object => {
    if (!object.geometry || object.geometry.drawRange.count === 0) return;
    for (const attribute of Object.values(object.geometry.attributes)) {
      if (counted.has(attribute) || attribute.version === versions.get(attribute)) continue;
      counted.add(attribute);
      const count = attribute.dynamic && attribute.updateRange.count >= 0
        ? attribute.updateRange.count : attribute.array.length;
      uploadBytes += count * attribute.array.BYTES_PER_ELEMENT;
    }
  });
  times.sort((a, b) => a - b);
  results.push({ preset, progress, cpuMsPerFrame: Number(times[2].toFixed(3)), uploadKiB: Number((uploadBytes / 1024).toFixed(1)) });
  scene.destroy();
}
console.log(JSON.stringify({ frames, samples, note: 'CPU geometry update and pending attribute uploads; excludes GPU rendering and page bridge', results }, null, 2));
