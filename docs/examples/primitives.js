/**
 * The range of canvas is fixed to the size [100, 100].
 *
 * The variables shown below are also available:
 * import {Path, Arc, Bezier} from 'pave'
 * import {scalar, vec2, mat2d} from 'linearly'
 *
 * // The 2D context of the canvas
 * context: CanvasRenderingContext2D
 *
 * // Shorhands for drawing functions
 * stroke: (path: Path, color = accentCoor, width = 1) => void
 * fill: (path: Path, color: string) => void
 * dot: (point: vec2, color = accentColor, size = 3) => void
 *
 * // This is the debug function to inspect path commands
 * debug: (path: Path, color = accentColor) => void
 */

// The path data is an array of commands and arguments.
const path = {
	curves: [
		{
			vertices: [
				{point: [10, 50], command: ['L']},
				{point: [90, 50], command: ['C', [34, 100], [75, 0]]},
			],
			closed: false,
		},
	],
}
stroke(path, 'plum')

// You can create a path by primitive functions.
const c = Path.circle([50, 50], 40)
stroke(c, 'PaleGreen', 1)

const r = Path.rectangle([10, 10], [50, 50])
stroke(r, 'PowderBlue')

const t = Path.regularPolygon([50, 50], 30, 5)
stroke(t, 'MediumSlateBlue')

const o = Path.offset(t, 10, {lineJoin: 'round'})
stroke(o, 'gold')
