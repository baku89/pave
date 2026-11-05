import type {Rect} from 'geome'
import type {vec2} from 'linearly'

import {withCurves} from '../attributes'
import type {Curve, Path} from '../index'
import {planarFlattenPath} from '../pathPlanar'
import {planarBoolean} from './planar'
import type {FillRule} from './queries'
import type {Vertex} from './types'

/**
 * Which cells of a grid a shape fills, see {@link Path.pixelate}.
 *
 * - `overlap`: Each cell that the fill or the outline of the shape gets into, however little.
 * - `center`: Each cell whose center is inside of the shape, and not on its outline.
 * - `full`: Each cell that is inside of the shape all over.
 * @category Options
 */
export type PixelateMode = 'overlap' | 'center' | 'full'

/**
 * Where the outline of cells has anchors, see {@link Path.pixelate}.
 *
 * - `corners`: Only where the outline turns.
 * - `cells`: At every corner of a cell along it, even on a straight stretch.
 * @category Options
 */
export type PixelateAnchors = 'corners' | 'cells'

/**
 * The options for {@link Path.pixelate}.
 * @category Options
 */
export interface PixelateOptions {
	/**
	 * Which cells are filled.
	 * @default 'center'
	 */
	mode?: PixelateMode
	/**
	 * Where the outline has anchors.
	 * @default 'corners'
	 */
	anchors?: PixelateAnchors
	/**
	 * The fill rule telling what is inside of the shape.
	 * @default 'nonzero'
	 */
	fillRule?: FillRule
}

/** The most cells each way, so that a cell shrinking to nothing cannot take all the memory. */
const MAX_CELLS_PER_SIDE = 10000
/** In cells: how far an outline may stray from the curve it comes from. */
const FLATNESS = 1e-4
/** In cells: going no further than this into a cell does not count, which is well above `FLATNESS`. */
const MARGIN = 1e-3

type Edge = readonly [from: vec2, to: vec2]
/** A run of filled cells in a row, from the first up to the last but one. */
type Run = readonly [from: number, to: number]

/** The straight edges of a shape, in units of cells. An open curve is closed by a line, as a fill is. */
function edgesOf(
	path: Path,
	[originX, originY]: vec2,
	[width, height]: vec2
): Edge[] {
	const {curves} = planarFlattenPath(path, FLATNESS * Math.min(width, height))
	const edges: Edge[] = []

	for (const {vertices} of curves) {
		const points = vertices.map(
			({point: [x, y]}) => [(x - originX) / width, (y - originY) / height] as vec2
		)
		points.forEach((from, i) => {
			if (points.length > 1) edges.push([from, points[(i + 1) % points.length]])
		})
	}

	return edges
}

/**
 * The runs of cells that a line just off their centers finds to be inside, row by row. Going
 * from one curve straight into another that it meets there is not leaving the fill. A center has
 * to be inside by the margin along this line, so that one on an outline is left out on each side.
 */
function insideAlong(
	edges: readonly Edge[],
	top: number,
	rows: number,
	fillRule: FillRule,
	off: number
): Run[][] {
	const crossings: [x: number, direction: number][][] = Array.from(
		{length: rows},
		() => []
	)

	for (const [[x0, y0], [x1, y1]] of edges) {
		if (y0 === y1) continue
		// A line through a vertex belongs to the edge going on from there, or it would count twice
		const first = Math.ceil(Math.min(y0, y1) - 0.5 - off)
		const last = Math.ceil(Math.max(y0, y1) - 0.5 - off) - 1
		for (let row = first; row <= last; row++) {
			const x = x0 + ((row + 0.5 + off - y0) / (y1 - y0)) * (x1 - x0)
			crossings[row - top].push([x, y1 > y0 ? 1 : -1])
		}
	}

	return crossings.map(crossing => {
		crossing.sort((a, b) => a[0] - b[0])
		const spans: [from: number, to: number][] = []
		let winding = 0
		crossing.forEach(([x, direction], i) => {
			winding += direction
			const inside = fillRule === 'evenodd' ? winding % 2 !== 0 : winding !== 0
			if (!inside || i === crossing.length - 1) return
			const to = crossing[i + 1][0]
			const end = spans[spans.length - 1]
			if (end && x - end[1] <= MARGIN) end[1] = Math.max(end[1], to)
			else spans.push([x, to])
		})
		const runs: Run[] = []
		for (const [from, to] of spans) {
			const run: Run = [
				Math.ceil(from - 0.5 + MARGIN),
				Math.ceil(to - 0.5 - MARGIN),
			]
			if (run[0] < run[1]) runs.push(run)
		}
		return runs
	})
}

/** The runs of cells whose center is inside, row by row, which a center on an outline is not. */
function centersInside(
	edges: readonly Edge[],
	top: number,
	rows: number,
	fillRule: FillRule
): Run[][] {
	const above = insideAlong(edges, top, rows, fillRule, -MARGIN)
	const below = insideAlong(edges, top, rows, fillRule, MARGIN)
	return above.map((runs, row) => subtractRuns(runs, gapsIn(runs, below[row])))
}

/** What is between `runs` and not in `within`, as far as `runs` goes. */
function gapsIn(runs: readonly Run[], within: readonly Run[]): Run[] {
	if (runs.length === 0) return []
	const start = runs[0][0]
	const end = runs[runs.length - 1][1]
	return subtractRuns([[start, end]], within)
}

/** The cells each row has an edge going through, in a set for each row. */
function cellsCrossed(
	edges: readonly Edge[],
	top: number,
	rows: number
): Set<number>[] {
	const crossed = Array.from({length: rows}, () => new Set<number>())

	for (const [[x0, y0], [x1, y1]] of edges) {
		const first = Math.floor(Math.min(y0, y1) + MARGIN)
		const last = Math.ceil(Math.max(y0, y1) - MARGIN) - 1

		for (let row = first; row <= last; row++) {
			// How far along x the edge goes, within what counts as the inside of this row
			const yA = Math.max(Math.min(y0, y1), row + MARGIN)
			const yB = Math.min(Math.max(y0, y1), row + 1 - MARGIN)
			const xA = y0 === y1 ? x0 : x0 + ((yA - y0) / (y1 - y0)) * (x1 - x0)
			const xB = y0 === y1 ? x1 : x0 + ((yB - y0) / (y1 - y0)) * (x1 - x0)
			const from = Math.floor(Math.min(xA, xB) + MARGIN)
			const to = Math.ceil(Math.max(xA, xB) - MARGIN) - 1
			for (let col = from; col <= to; col++) crossed[row - top].add(col)
		}
	}

	return crossed
}

function runsOfCells(cells: Iterable<number>): Run[] {
	const sorted = [...cells].sort((a, b) => a - b)
	const runs: Run[] = []
	let from = 0
	sorted.forEach((col, i) => {
		if (i === 0 || sorted[i - 1] !== col - 1) from = col
		if (sorted[i + 1] !== col + 1) runs.push([from, col + 1])
	})
	return runs
}

function uniteRuns(a: readonly Run[], b: readonly Run[]): Run[] {
	const runs: Run[] = []
	for (const run of [...a, ...b].sort((p, q) => p[0] - q[0])) {
		const end = runs[runs.length - 1]
		if (end && end[1] >= run[0]) {
			runs[runs.length - 1] = [end[0], Math.max(end[1], run[1])]
		} else {
			runs.push(run)
		}
	}
	return runs
}

function subtractRuns(runs: readonly Run[], cells: readonly Run[]): Run[] {
	const left: Run[] = []
	for (const [start, end] of runs) {
		let from = start
		for (const [cutFrom, cutTo] of cells) {
			if (cutTo <= from) continue
			if (cutFrom >= end) break
			if (cutFrom > from) left.push([from, cutFrom])
			from = cutTo
		}
		if (from < end) left.push([from, end])
	}
	return left
}

/**
 * The outlines around runs of cells, with the filled cells on the right of the way each goes,
 * as a rectangle has them. Cells meeting at nothing but a corner are kept apart, so that no
 * outline passes through a point twice.
 */
function outlinesOf(
	runsByRow: readonly (readonly Run[])[],
	top: number,
	left: number,
	cols: number
): [x: number, y: number][][] {
	// The directions are 0: right, 1: down, 2: left, 3: up, so turning right is adding 1.
	const stride = cols + 2
	const keyOf = (x: number, y: number) => (y - top) * stride + (x - left)
	const STEP = [
		[1, 0],
		[0, 1],
		[-1, 0],
		[0, -1],
	] as const
	/** The directions going out of each corner. There are two where cells meet at a corner. */
	const out = new Map<number, number[]>()
	const addEdge = (x: number, y: number, direction: number) => {
		const key = keyOf(x, y)
		const directions = out.get(key)
		if (directions) directions.push(direction)
		else out.set(key, [direction])
	}

	const none: readonly Run[] = []
	runsByRow.forEach((runs, index) => {
		const row = top + index
		const above = runsByRow[index - 1] ?? none
		const below = runsByRow[index + 1] ?? none
		for (const [from, to] of runs) {
			addEdge(to, row, 1)
			addEdge(from, row + 1, 3)
		}
		for (const [from, to] of subtractRuns(runs, above)) {
			for (let x = from; x < to; x++) addEdge(x, row, 0)
		}
		for (const [from, to] of subtractRuns(runs, below)) {
			for (let x = to; x > from; x--) addEdge(x, row + 1, 2)
		}
	})

	const outlines: [number, number][][] = []

	for (const [startKey, directions] of [...out].sort((a, b) => a[0] - b[0])) {
		while (directions.length > 0) {
			let x = (startKey % stride) + left
			let y = Math.floor(startKey / stride) + top
			let direction = directions.pop()!
			const startX = x
			const startY = y
			const outline: [number, number, number][] = []

			for (;;) {
				outline.push([x, y, direction])
				x += STEP[direction][0]
				y += STEP[direction][1]
				if (x === startX && y === startY) {
					const onward = out.get(keyOf(x, y))!
					// A loop can only end at its start when no other way out is the right turn
					if (!onward.includes((direction + 1) % 4)) break
				}
				const onward = out.get(keyOf(x, y))!
				const right = onward.indexOf((direction + 1) % 4)
				const at = right >= 0 ? right : onward.length - 1
				direction = onward.splice(at, 1)[0]
			}

			outlines.push(outline.map(([ox, oy]) => [ox, oy]))
		}
	}

	return outlines
}

/** The corners of a closed outline going by unit steps, starting from one of them. */
function cornersOnly(outline: readonly [number, number][]): [number, number][] {
	const count = outline.length
	return outline.filter(([x, y], i) => {
		const [px, py] = outline[(i + count - 1) % count]
		const [nx, ny] = outline[(i + 1) % count]
		return (x - px) * (ny - y) !== (y - py) * (nx - x)
	})
}

/**
 * Turns a shape into the cells of a grid, as if drawn in pixels. The grid goes on all sides of `cell`, with no end: each cell is that rectangle moved by a whole number of its width and height.
 *
 * A shape lying along the lines of the grid fills the same cells in every mode. So little as a thousandth of a cell over a line does not count. An open curve is filled as if closed by a straight line, and `overlap` also takes the cells that it runs through, so that a line with no area still comes out.
 * @param path The shape to turn into cells
 * @param cell One of the cells of the grid. It can be anywhere, as it only says how the grid is laid out.
 * @param options The options
 * @returns A path of straight closed curves around the filled cells, with holes going the other way around. Vertex attributes are lost, as cells have nothing to do with them.
 * @throws A `RangeError` when the cell has no width or height, or the shape spans more than 10000 cells either way.
 * @category Modifiers
 * @example
 * ```js:pave
 * const c = Path.circle([50, 50], 34)
 * stroke(Path.pixelate(c, [[0, 0], [10, 10]], {mode: 'overlap'}), 'skyblue')
 * stroke(Path.pixelate(c, [[0, 0], [10, 10]], {mode: 'center'}), 'purple')
 * stroke(Path.pixelate(c, [[0, 0], [10, 10]], {mode: 'full'}), 'tomato')
 * stroke(c, 'gray')
 * ```
 */
export function pixelate(
	path: Path,
	cell: Rect,
	{
		mode = 'center',
		anchors = 'corners',
		fillRule = 'nonzero',
	}: PixelateOptions = {}
): Path {
	const [[ax, ay], [bx, by]] = cell
	const origin: vec2 = [Math.min(ax, bx), Math.min(ay, by)]
	const size: vec2 = [Math.abs(bx - ax), Math.abs(by - ay)]
	if (!(size[0] > 0 && size[1] > 0 && Number.isFinite(size[0] + size[1]))) {
		throw new RangeError('The cell of pixelate has to have a width and a height')
	}

	// Where curves overlap, one of them runs inside of the other and is not an edge of the fill,
	// which is what `full` has to tell. Without those, what is left bounds the fill all along.
	const source: Path =
		mode === 'full'
			? {
					curves: planarBoolean(
						[{curves: path.curves.map(curve => ({curve: closed(curve)}))}],
						{
							inside: ([winding]) =>
								fillRule === 'evenodd' ? winding % 2 !== 0 : winding !== 0,
							assemble: 'closed',
						}
					).curves,
				}
			: path
	const rule: FillRule = mode === 'full' ? 'nonzero' : fillRule

	const edges = edgesOf(source, origin, size)
	if (edges.length === 0) return withCurves(path, [])

	const xs = edges.flatMap(([[x0], [x1]]) => [x0, x1])
	const ys = edges.flatMap(([[, y0], [, y1]]) => [y0, y1])
	const left = Math.floor(xs.reduce((a, b) => Math.min(a, b)))
	const right = Math.ceil(xs.reduce((a, b) => Math.max(a, b)))
	const top = Math.floor(ys.reduce((a, b) => Math.min(a, b)))
	const bottom = Math.ceil(ys.reduce((a, b) => Math.max(a, b)))
	const cols = right - left
	const rows = bottom - top
	if (!(cols <= MAX_CELLS_PER_SIDE && rows <= MAX_CELLS_PER_SIDE)) {
		throw new RangeError(
			`The shape spans too many cells for pixelate: ${cols} by ${rows}, while the most is ${MAX_CELLS_PER_SIDE} each way`
		)
	}
	// A shape with nothing but a point or a line along the grid has no cell to it
	if (rows === 0) return withCurves(path, [])

	const inside = centersInside(edges, top, rows, rule)
	const crossed =
		mode === 'center'
			? null
			: cellsCrossed(edges, top, rows).map(cells => runsOfCells(cells))

	const runsByRow = inside.map((runs, row) =>
		crossed === null
			? runs
			: mode === 'overlap'
				? uniteRuns(runs, crossed[row])
				: subtractRuns(runs, crossed[row])
	)

	const curves: Curve[] = outlinesOf(runsByRow, top, left, cols).map(outline => {
		const points = anchors === 'cells' ? outline : cornersOnly(outline)
		const vertices: Vertex[] = points.map(([x, y]) => ({
			point: [origin[0] + x * size[0], origin[1] + y * size[1]] as vec2,
			command: 'L',
		}))
		return {vertices, closed: true}
	})

	return withCurves(path, curves)
}

/** The curve as a fill has it: an open one comes back to its start by a straight line. */
function closed(curve: Curve): Curve {
	if (curve.closed || curve.vertices.length === 0) return curve
	const [{point, attrs}, ...rest] = curve.vertices
	return {
		...curve,
		closed: true,
		vertices: [{point, command: 'L', ...(attrs ? {attrs} : {})}, ...rest],
	}
}
