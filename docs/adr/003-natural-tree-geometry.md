# 003 · Natural branches and leaves

Status: accepted

## Context

The procedural tree used repeated symmetric forks and closed, faceted leaf
solids. Leaves had random offsets around branches, so their attachment and
orientation looked artificial. Improve the silhouette and surface detail while
retaining the canvas-scoped Three.js r108 engine and bounded WebGL 1 batches.

## Decision

- `TreeTrunk` generates an asymmetric leader with shorter lateral shoots and
  spreading terminal twigs. Branches taper strongly toward their tips. Each
  branch records `parentT`, the parameter of its attachment on the parent curve;
  growth and inherited wind use this same parameter. A height ratio is not a
  curve parameter, and side shoots do not necessarily attach at the tip.
- `sampleTangent` differentiates the grown, animated curve. Branch tube frames
  follow that tangent throughout growth, including collapsed branches. A modest
  root flare and seven axial rings improve the trunk outline without increasing
  its eight radial sides or the existing 110-branch limit.
- `MeshBatch` distinguishes existing solid meshes from thin leaf surfaces. Leaf
  templates include a curved blade, pointed or lobed outlines and a petiole.
  Local roll orients the blade independently of its stem direction. Normals
  still come from precomputed triangle cross products, including nonuniform
  scaling, roll and zero thickness; no per-frame full-buffer recomputation occurs.
- `LeafSystem` places the petiole base on the live branch sample, distributes
  broad leaves around the shoot and alternates needle leaves along its sides.
  Its center and orientation change together under wind, keeping that base
  attached. Falling-leaf sources use the same current size and center.
- Bark grain and leaf veins extend the existing Lambert shaders through r108
  `onBeforeCompile`. Birch lenticels, mottled bark, pinnate veins and radial
  fan/palmate veins use procedural coordinates. Mild leaf transmission depends
  on the existing lights, so leaves follow day/night and light controls. There
  are no texture requests, new rendering passes or new draw calls.
- Fixed-shape vein coordinates and bark coordinates are uploaded once. Only
  mixed leaf batches update UVs; update ranges use each attribute's item size.
  Flower, fruit, weather and fallen-particle geometry retain their solid surface.

## Consequences and validation

The tree remains stylized procedural geometry, rather than a scanned botanical
model. More terminal branches also mean more attached flowers and fruits; their
CPU and upload costs increase during bloom and fruiting. Thin leaf blades have
33 vertices for oval leaves instead of 60, 51 instead of 84 for maple, 39 instead
of 60 for fan leaves, and 15 instead of 24 for needles, which offsets much of the
additional foliage cost. Performance samples are recorded in
[render-performance.md](../render-performance.md).

Tests cover tangent derivatives, branch and petiole attachment under growth and
wind, rolled normals, UV upload ranges, static leaf UVs, winter foliage, all
species and resource disposal. Browser validation checks actual shader
compilation and species/season/growth/light controls. WeChat developer-tool and
iOS/Android frame rate and GPU measurements still require device validation.
