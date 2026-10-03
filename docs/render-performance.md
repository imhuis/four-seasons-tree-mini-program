# Rendering performance

Measured on 2026-10-03 with Node.js v21.5.0. Run `npm run build` followed by
`node scripts/benchmark-render.cjs` to reproduce the current measurements.

The benchmark runs the compiled scene with a renderer stub, a fixed random seed,
120 warm-up frames and five samples of 180 frames. Seasonal progress, growth and
daytime remain fixed; wind, particles and weather continue updating at a 1/60 s
step. CPU times are the median time per frame. They exclude GPU drawing,
mini-program page communication and initialization. Upload estimates count
attributes changed by one warmed-up frame on visible meshes, including the
r108 dynamic update ranges; they exclude initial buffer allocation.

The baseline uses the working-tree implementation captured before this
optimization, including its existing species and environment changes.

| Scene | Progress | CPU before (ms/frame) | CPU after (ms/frame) | Upload before (KiB/frame) | Upload after (KiB/frame) |
| --- | --- | --- | --- | --- | --- |
| Sakura bloom | 0.125 | 1.231 | 0.398 | 3578.6 | 1884.9 |
| Sakura summer | 0.375 | 0.785 | 0.332 | 1533.3 | 1494.7 |
| Japanese maple summer | 0.375 | 1.028 | 0.428 | 2100.3 | 2061.7 |
| Persimmon autumn | 0.625 | 0.947 | 0.288 | 2966.8 | 1328.1 |
| Sakura winter | 0.875 | 0.277 | 0.064 | 1047.3 | 153.1 |
| Crape myrtle bloom | 0.375 | 1.767 | 0.705 | 4214.7 | 3311.9 |

CPU geometry time fell by approximately 58–77% in these samples. These numbers
depend on the host and workload and do not imply the same improvement in device
frame rate.

`MeshBatch` computes flat normals from precomputed triangle cross products,
transforms them with each mesh's scale and rotation, and uploads only active
position, color and normal components. It retains the existing silhouettes,
faceted lighting, materials and WebGL 1 support. There is no full-capacity normal
recomputation per frame. The normal calculation also handles zero thickness.

`BranchSystem` reuses ring trigonometry and skips unchanged plain bark colors.
Birch and mottled bark retain their animated color updates. `TreeTrunk` skips
unchanged growth, and `SnowSystem` retains unchanged mound geometry while
continuing to emit flakes. Unchanged periodic HUD snapshots are skipped;
commands still force immediate notifications.

Regression coverage compares every mesh shape's normals with Three.js normals,
checks partial uploads across shrinking/empty/mixed batches, verifies bark color
changes and snowfall, and checks HUD notifications. Browser preview checks cover
bloom rendering, maple foliage and seasonal controls without WebGL warnings.
WeChat developer-tool and iOS/Android device frame rate, memory and lifecycle
checks remain device-level verification.
