/**
 * The range of canvas is fixed to the size [100, 100].
 *
 * The variables shown below are also available:
 * import {Path} from 'pathed'
 * import {scalar, vec2, mat2d} from 'linearly'
 *
 * // The 2D context of the canvas
 * context: CanvasRenderingContext2D
 *
 * // Shorhands for drawing functions
 * stroke: (path: Path, color: string, width: number) => void
 * fill: (path: Path, color: string) => void
 */

// The path data is an array of commands and arguments.
const path = [
	['M', [10, 50]],
	['C', [34, 100], [75, 0], [90, 50]],
]
stroke(path, 'plum')

// You can create a path by primitive functions.
const c = Path.circle([50, 50], 40)
stroke(c, 'PaleGreen', 1)

const r = Path.rectangle([10, 10], [50, 50])
stroke(r, 'PowderBlue')

const t = Path.regularPolygon([50, 50], 30, 5)
stroke(t, 'MediumSlateBlue')

const o = Path.offset(t, 10, {join: 'round'})
stroke(o, 'gold')
