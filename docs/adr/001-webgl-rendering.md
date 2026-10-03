# 001: Canvas-scoped Three.js rendering

Date: 2026-10-03

Status: Accepted

## Context

The project originally drew a two-dimensional skeleton, foliage and particles with Canvas 2D. The requested WebGL / Three.js upgrade requires actual depth, perspective and view rotation within a native WeChat mini-program rather than a web-view conversion.

## Decision

Use the WeChat-maintained `threejs-miniprogram` adapter at 0.0.8, which embeds Three.js r108 and scopes the engine to a native canvas. Keep Three.js imports type-only in application modules. A build script copies the distributable and license into `miniprogram/vendor` so the existing in-place TypeScript build still produces a complete uploadable package.

Retain the existing season curves and thin page boundary. Generate a deterministic three-dimensional skeleton. Share world-space sway sampling across branch surfaces, foliage and particle sources. Merge branch tubes and batch foliage meshes using standard buffer attributes and 16-bit indices; this avoids a dependency on WebGL instancing extensions. Use simple lighting and a planar contact shadow to limit mobile rendering cost.

The scene owns geometries, materials, the renderer and RAF handles. The page owns asynchronous node queries, caption timers and visibility. Resize queries the actual stage dimensions rather than the window dimensions. Failed initialization disposes partial resources; retry remounts the native canvas because the adapter defines canvas properties once and a disposed context cannot safely be reused.

## Consequences and verification

The renderer targets the APIs available in r108 rather than current browser Three.js. Any engine upgrade needs a deliberate adapter and type migration. The `three` development dependency supplies matching types and non-WebGL geometry tests; it is absent from the mini-program runtime bundle.

Node's built-in test runner verifies connected animated joints, season continuity, particle cleanup, caption transitions, asynchronous page lifecycle, canvas sizing and resource ownership. A browser preview exercises the same compiled scene using a separate Canvas bridge, with no browser APIs added to the mini-program code. It validates shader compilation and graphical interactions but does not prove WeChat device compatibility or mobile GPU performance; those require developer-tool and real-device checks.
