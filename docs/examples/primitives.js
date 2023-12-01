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
	['M', [0, 0]],
	['C', [0, 100], [100, 100], [100, 0]],
	['L', [100, 100]],
	['L', [0, 100]],
	['Z'],
]

// You can create a path by primitive functions.
const c = Path.circle([50, 50], 40)
stroke(c, 'PaleGreen', 1)

const r = Path.rectangle([10, 10], [50, 50])
stroke(r, 'PowderBlue')

const t = Path.regularPolygon([50, 50], 30, 5)
stroke(t, 'MediumSlateBlue')

const o = Path.offset(t, 10, {join: 'round'})
stroke(o, 'gold')

const b = Path.cubicBezierTo(
	Path.moveTo([], [10, 50]),
	[10, 100],
	[90, 0],
	[90, 50]
)
stroke(b, 'plum')

// All property functions for paths will be memoized.
// Thus, the path is immutable.
Path.length(path)
Path.bound(path)
Path.area(path)

// Manipulating and combining paths
const tc = Path.transform(c, mat2d.fromScaling([1, 0.5]))
const or = Path.offset(r, 100, {join: 'round'})
Path.join(tc, or)

// As the path data is immutable, you cannot modify the content of paths
// (Not using Object.freeze, but it'll be warned in TypeScript).
// Use the mutation functions shown below instead.
const path2 = Path.moveTo(path, [0, 200])
const path3 = Path.lineTo(path2, [100, 200])
