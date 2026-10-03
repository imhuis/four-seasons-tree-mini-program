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

The following table records the original performance optimization, before the
subsequent natural branch and thin-leaf geometry change. Its baseline includes
the existing species and environment changes.

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

## Color channel throttling

`MeshBatch` keeps position and normal on an every-frame schedule, but color is
uploaded only when a written value moves by more than half an 8-bit step
(`COLOR_EPSILON = 1/510`) from the value already in its persistent color array.
Season colors are continuously interpolated, so during autoplay each frame shifts
a channel by roughly 0.09 of a step — below the threshold — while a genuine season
change crosses it immediately. The first commit always uploads, because a fresh
GPU buffer has undefined contents. Shrinking or emptying a batch does not
invalidate the buffer: only `drawRange` changes.

Measured against the same benchmark, upload dropped a further 30–32% on the four
leaf-heavy scenes, at a cost of about 0.1 ms/frame:

| Scene | Upload before (KiB/frame) | Upload after (KiB/frame) | Change |
| --- | --- | --- | --- |
| Sakura bloom | 2709.6 | 1862.1 | -31% |
| Sakura summer | 1441.1 | 1008.0 | -30% |
| Japanese maple summer | 2149.9 | 1480.5 | -31% |
| Persimmon autumn | 1639.7 | 1140.4 | -30% |
| Sakura winter | 204.2 | 183.4 | -10% |
| Crape myrtle bloom | 4530.1 | 3090.9 | -32% |

Crape myrtle bloom at 3091 KiB/frame is still the heaviest case: roughly 185 MB/s
at 60 fps. Reducing it further requires drawing fewer leaves, not uploading less
often — leaf density tiers per device profile are the next step.

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

## Natural branch and leaf geometry

The later visual improvement adds terminal twigs, root flare, curved thin leaf
blades, fixed UVs and procedural bark/vein shaders. The same benchmark, run before
and after that change on this host, produced the following samples. The final
working tree also includes the unchanged-color buffer cache added alongside this
work; the after column includes that cache.

| Scene | CPU before (ms/frame) | CPU after (ms/frame) | Upload before (KiB/frame) | Upload after (KiB/frame) |
| --- | --- | --- | --- | --- |
| Sakura bloom | 0.475 | 0.854 | 1884.9 | 1862.1 |
| Sakura summer | 0.385 | 0.544 | 1494.7 | 1008.0 |
| Japanese maple summer | 0.490 | 0.711 | 2061.7 | 1480.5 |
| Persimmon autumn | 0.329 | 0.549 | 1328.1 | 1140.4 |
| Sakura winter | 0.072 | 0.113 | 153.1 | 183.4 |
| Crape myrtle bloom | 0.785 | 1.362 | 3311.9 | 3090.9 |

These are geometry quality tradeoffs, not an additional performance gain.
Broad crowns now have 96 branches rather than 61, so bloom and fruit systems
create more attached objects. Thin leaf surfaces and the color buffer cache
reduce foliage upload cost; fixed UVs do not contribute to subsequent upload estimates. Existing
batching, cached normals, active ranges and unchanged-state skips remain in use.
The benchmark does not measure the new fragment shaders or device GPU time.

Regression coverage compares every mesh shape's normals with Three.js normals,
checks partial uploads across shrinking/empty/mixed batches, verifies bark color
changes and snowfall, and checks HUD notifications. Browser preview checks cover
bloom rendering, maple foliage and seasonal controls without WebGL warnings.
WeChat developer-tool and iOS/Android device frame rate, memory and lifecycle
checks remain device-level verification.

## Natural ground

The ground change adds static low-relief terrain, clustered grass and rocks,
species-specific litter and soft projected shadows. The terrain has 897 vertices
and 1,728 triangles. Grass, rocks, leaves and petals each use one bounded batch,
so the ground uses at most five draw calls. Terrain and grass/rock attributes stay
unchanged during wind and daylight updates; grass movement, wetness, snow and
shadows use uniforms. Litter is rebuilt only when relevant season, snow, growth
or species state changes. Tree replacement retains the landscape.

The same six benchmark cases, measured immediately before and after this change:

| Scene | CPU before (ms/frame) | CPU after (ms/frame) | Upload before (KiB/frame) | Upload after (KiB/frame) |
| --- | --- | --- | --- | --- |
| Sakura bloom | 0.855 | 0.854 | 1862.1 | 1893.0 |
| Sakura summer | 0.556 | 0.553 | 1008.0 | 1008.0 |
| Japanese maple summer | 0.719 | 0.724 | 1480.5 | 1480.5 |
| Persimmon autumn | 0.556 | 0.566 | 1140.4 | 1145.5 |
| Sakura winter | 0.111 | 0.121 | 183.4 | 183.9 |
| Crape myrtle bloom | 1.372 | 1.375 | 3090.9 | 3126.4 |

CPU update times remain close to the baseline in these samples. Bloom uploads
increase slightly because airborne petals now have oval outlines and remain in
the bounded ground pool after landing. Terrain height also changes the exact
frame when particles land. Static scenery allocations and fragment-shader costs
are excluded from this table; it does not establish device GPU frame rate.

Ground tests check interpolated heights against every rendered triangle, anchor
alignment, deterministic scatter, unchanged buffers during wind/daylight,
seasonal litter, weather overrides and melting, shadow direction, bounded
leaf/petal landing, and GPU disposal. Browser checks cover spring bloom, summer
grass, autumn ginkgo litter, winter cover, day/night and rain/snow controls at
phone and desktop canvas sizes. Device-level validation remains as above.
