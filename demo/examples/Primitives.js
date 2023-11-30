/**
 * The range of canvas is fixed to the size [100, 100].
 *
 * The variables shown below are available in the global scope:
 * import {Path} from 'pathed'
 * import {scalar, vec2, mat2d} from 'linearly'
 *
 * // The 2D context of the canvas
 * context: CanvasRenderingContext2D
 *
 * // Draws a stroke with the given path
 * draw: (path: Path, color: string, width: number) => void
 */

const c = Path.circle([50, 50], 40)
draw(c, 'PaleGreen', 1)

const r = Path.rectangle([10, 10], [50, 50])
draw(r, 'PowderBlue')

const t = Path.regularPolygon([50, 50], 40, 5)
draw(t, 'MediumSlateBlue')

const b = Path.cubicBezierTo(
	Path.moveTo([], [10, 50]),
	[10, 100],
	[90, 0],
	[90, 50]
)
draw(b, 'plum')
