import paper from 'paper'

let initialized = false

/**
 * Lazily creates the default Paper.js project (1×1 view, auto-updates off).
 * Call from any pave entry point that uses Paper; idempotent.
 *
 * When constructing raw `paper.Path` values yourself (e.g. before `Path.fromPaperPath`),
 * call this first so items attach to the active project.
 */
export function ensurePaperScope(): void {
	if (initialized) return
	paper.setup(new paper.Size(1, 1))
	paper.view.autoUpdate = false
	initialized = true
}
