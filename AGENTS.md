# AGENTS.md

<!-- HEX-KIT:START -->
## Shared engineering constraints (Hex-Kit)

Before planning, editing, or reviewing code in this monorepo:

1. Read `.agent-spec/AGENTS.md` for shared engineering constraints, rule
   precedence, architecture boundaries, workspace protection, and validation.
2. Read the applicable language constraints under `.agent-spec/constitution/`
   (for example, `AGENTS-TypeScript.md` or `AGENTS-Golang.md`).
3. Read the relevant shared guidelines under `.agent-spec/.trellis/spec/`,
   including the applicable technology profiles and thinking guides.
4. Read this project's own `AGENTS.md`, scoped instructions, and module specs.
   Apply shared constraints to this project's actual architecture and stack;
   unfilled template guidelines do not define project conventions.

Paths in Hex-Kit documentation are relative to `.agent-spec/`. Its Trellis
workflow, tasks, journals, hooks, and skills manage Hex-Kit itself. Use this
project's own workflow and runtime for work in this monorepo; do not write its
task state into the shared submodule.

If `.agent-spec/` is missing or uninitialized, run
`git submodule update --init --recursive -- .agent-spec` before proceeding.
Keep shared rules in the submodule instead of copying them into this file.
<!-- HEX-KIT:END -->
