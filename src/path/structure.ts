import {vec2} from 'linearly'

import {
	completeVertexAttrs,
	mergeAttrDefs,
	pushDownCurveAttrs,
	pushDownPathAttrs,
	segmentToVertex,
	withCurves,
} from '../attributes'
import {Arc, CubicBezier, Curve, type Path, Segment} from '../index'
import {planarPathArea} from '../pathPlanar'
import {normalizeIndex} from '../utils'
import {planarBoolean} from './planar'
import type {Vertex} from './types'

/**
 * An options for {@link Path.connect}
 * @category Options
 */
export interface ConnectOptions {
	/**
	 * If true, the connected chain is also closed
	 * @default false
	 */
	close?: boolean
	/**
	 * Endpoints within this distance are fused into one vertex instead of being connected by a line segment
	 * @default 1e-6
	 */
	tolerance?: number
}

/**
 * An options for {@link Path.cleanup}
 * @category Options
 */
export interface CleanupOptions {
	/**
	 * The distance below which a segment counts as zero-length, a vertex as lying on the line through its neighbours, and a handle as lying on the chord
	 * @default 1e-6
	 */
	tolerance?: number
	/**
	 * If true, curves consisting of a single vertex are removed as well
	 * @default false
	 */
	removeDots?: boolean
}

/**
 * An options for {@link Path.normalizeWinding}
 * @category Options
 */
export interface NormalizeWindingOptions {
	/**
	 * The fill rule deciding which regions of the input count as filled
	 * @default 'nonzero'
	 */
	fillRule?: 'nonzero' | 'evenodd'
}

/**
 * Makes the given vertex the first one (the move-to) of a closed curve by rotating its vertices. The shape does not change; only where the curve starts does. An open curve is returned unchanged, since it cannot start anywhere else without changing its shape.
 * @param path The path
 * @param curveIndex The index of the curve, negative values counting from the end
 * @param vertexIndex The index of the vertex to become the first, negative values counting from the end
 * @returns The path with the curve rotated
 * @category Modifiers
 */
export function setStart(
	path: Path,
	curveIndex: number,
	vertexIndex: number
): Path {
	if (path.curves.length === 0) return path

	const ci = normalizeIndex(curveIndex, path.curves.length)
	const curve = path.curves[ci]

	if (!curve.closed || curve.vertices.length === 0) return path

	const vi = normalizeIndex(vertexIndex, curve.vertices.length)

	if (vi === 0) return path

	// On a closed curve, the command of each vertex draws the segment from the vertex before
	// it, and that of the first one draws the closing segment. The vertex before stays the
	// same under a rotation, so each vertex keeps its command.
	const segs = Curve.segments(curve)
	const vertices = [...segs.slice(vi - 1), ...segs.slice(0, vi - 1)].map(
		segmentToVertex
	)

	const curves = path.curves.slice()
	curves[ci] = {...curve, vertices}

	return withCurves(path, curves)
}

/**
 * Breaks the path into one path per curve. Each of them keeps the attributes and the definitions of the whole path.
 * @param path The path to break apart
 * @returns The paths, one for each curve, in order
 * @category Utilities
 */
export function breakApart(path: Path): Path[] {
	return path.curves.map(curve => withCurves(path, [curve]))
}

/**
 * Connects the open curves of the paths into a single open curve by their nearest endpoints, like the Join command of Illustrator with multiple paths selected. Starting from the first open curve, the curve whose endpoint is nearest to the current end is appended, reversed when its end is nearer than its start, with a line segment between them unless the endpoints coincide. Closed curves are kept as they are.
 * @param paths The paths to connect
 * @param options The options
 * @returns The path with the connected chain, followed by the closed curves
 * @category Utilities
 */
export function connect(
	paths: Path[],
	{close = false, tolerance = 1e-6}: ConnectOptions = {}
): Path {
	const single = paths.length === 1
	const attrDefs = mergeAttrDefs(paths)

	const open: Curve[] = []
	const closed: Curve[] = []

	for (const path of paths) {
		for (const curve of completeVertexAttrs(path).curves) {
			if (curve.closed) {
				closed.push(single ? curve : pushDownPathAttrs(path, curve))
			} else if (curve.vertices.length > 0) {
				// The curves become one, so what differed between them moves down to the vertices
				open.push(
					pushDownCurveAttrs(single ? curve : pushDownPathAttrs(path, curve))
				)
			}
		}
	}

	const curves = [...closed]

	if (open.length > 0) {
		let vertices: Vertex[] = [...open[0].vertices]
		const remaining = open.slice(1)

		while (remaining.length > 0) {
			const tail = vertices[vertices.length - 1].point

			let best = 0
			let bestDistance = Infinity
			let reversed = false

			for (const [i, curve] of remaining.entries()) {
				const toStart = vec2.distance(tail, curve.vertices[0].point)
				const toEnd = vec2.distance(
					tail,
					curve.vertices[curve.vertices.length - 1].point
				)
				if (toStart < bestDistance) {
					best = i
					bestDistance = toStart
					reversed = false
				}
				if (toEnd < bestDistance) {
					best = i
					bestDistance = toEnd
					reversed = true
				}
			}

			const [picked] = remaining.splice(best, 1)
			const next = reversed ? Curve.reverse(picked) : picked
			const [head, ...rest] = next.vertices

			if (bestDistance <= tolerance) {
				vertices.push(...rest)
			} else {
				vertices.push(
					{
						command: 'L',
						point: head.point,
						...(head.attrs ? {attrs: head.attrs} : {}),
					},
					...rest
				)
			}
		}

		if (close) {
			const first = vertices[0]
			const last = vertices[vertices.length - 1]
			if (
				vertices.length > 1 &&
				vec2.distance(first.point, last.point) <= tolerance
			) {
				// The last segment becomes the closing one, which the first vertex draws
				const fused = {
					...last,
					point: first.point,
					...(first.attrs ? {attrs: first.attrs} : {}),
				} as Vertex
				vertices = [fused, ...vertices.slice(1, -1)]
			}
		}

		curves.unshift({vertices, closed: close})
	}

	if (single) return withCurves(paths[0], curves)

	return attrDefs ? {curves, attrDefs} : {curves}
}

/**
 * Removes what does not contribute to the shape of the path: zero-length segments and the duplicated points they connect, line vertices lying on the line through their neighbours, and curved segments that are straight, which become lines. Curves without vertices are dropped, and curves of a single vertex can be.
 * @param path The path to clean up
 * @param options The options
 * @returns The cleaned up path
 * @category Modifiers
 */
export function cleanup(
	path: Path,
	{tolerance = 1e-6, removeDots = false}: CleanupOptions = {}
): Path {
	const curves = path.curves.flatMap(curve => {
		const cleaned = cleanupCurve(curve, tolerance)
		if (cleaned.vertices.length === 0) return []
		if (removeDots && cleaned.vertices.length === 1) return []
		return [cleaned]
	})

	return withCurves(path, curves)
}

function cleanupCurve(curve: Curve, tolerance: number): Curve {
	if (curve.vertices.length <= 1) return curve

	const isStraight = (seg: Segment) =>
		seg.command === 'L' ||
		(seg.command === 'C'
			? CubicBezier.isStraight(seg, tolerance)
			: Arc.isStraight(seg, tolerance))

	// Drops zero-length segments and straightens the others
	let vertices: Vertex[] = Curve.segments(curve).flatMap((seg): Vertex[] => {
		if (Segment.length(seg) <= tolerance) return []

		if (seg.command !== 'L' && isStraight(seg)) {
			return [
				{
					command: 'L',
					point: seg.point,
					...(seg.attrs ? {attrs: seg.attrs} : {}),
				},
			]
		}

		return [segmentToVertex(seg)]
	})

	if (curve.closed) {
		if (vertices.length === 0) {
			vertices = [curve.vertices[0]]
		} else {
			// The last segment ends at the first vertex, which stays the move-to
			vertices.unshift(vertices.pop()!)
		}
	} else {
		vertices.unshift(curve.vertices[0])
	}

	vertices = dropCollinear(vertices, curve.closed, tolerance)

	return {...curve, vertices}
}

/** Removes the line vertices lying between their neighbours on the line through them. */
function dropCollinear(
	vertices: Vertex[],
	closed: boolean,
	tolerance: number
): Vertex[] {
	const n = vertices.length
	if (n < 3) return vertices

	const out: Vertex[] = []

	for (let i = 0; i < n; i++) {
		const vertex = vertices[i]

		if (!closed && (i === 0 || i === n - 1)) {
			out.push(vertex)
			continue
		}

		const prev = out.length > 0 ? out[out.length - 1] : vertices[n - 1]
		const next =
			i + 1 < n ? vertices[i + 1] : out.length > 0 ? out[0] : vertices[0]

		if (
			vertex.command === 'L' &&
			next.command === 'L' &&
			liesBetween(prev.point, next.point, vertex.point, tolerance)
		) {
			continue
		}

		out.push(vertex)
	}

	return out
}

/** Whether `p` is within `tolerance` of the line segment from `a` to `b`, and not beyond its ends. */
function liesBetween(a: vec2, b: vec2, p: vec2, tolerance: number): boolean {
	const ab = vec2.sub(b, a)
	const len = vec2.len(ab)
	if (len <= tolerance) return false

	const ap = vec2.sub(p, a)
	const along = vec2.dot(ap, ab) / len
	const across = Math.abs(ap[0] * ab[1] - ap[1] * ab[0]) / len

	return across <= tolerance && along >= -tolerance && along <= len + tolerance
}

/**
 * Makes every closed curve of the path wind in the given direction, reversing the ones that do not. The direction is that of the signed area, which is positive for {@link Path.rect}: its vertices run clockwise on the screen in the y-down coordinates of SVG and canvas, so `cw` means visually clockwise there (and counter-clockwise with the y axis up). Open curves and curves without area are untouched.
 * @param path The path to orient
 * @param orientation The winding direction every closed curve should have
 * @returns The oriented path
 * @category Modifiers
 */
export function orient(path: Path, orientation: 'cw' | 'ccw'): Path {
	const sign = orientation === 'cw' ? 1 : -1

	return withCurves(
		path,
		path.curves.map(curve => {
			if (!curve.closed) return curve
			const area = planarPathArea({curves: [curve]})
			return area * sign < 0 ? Curve.reverse(curve) : curve
		})
	)
}

/**
 * Resolves the self-intersections and the overlaps of the closed curves of the path. The result fills the same region as the input under the fill rule, with non-overlapping curves wound consistently: outer boundaries in the direction of positive signed area (the one of {@link Path.rect}, see {@link Path.orient}) and holes in the other, so that the result fills the same under either rule. Open curves are kept as they are and appended after the closed ones.
 * @param path The path to normalize
 * @param options The options
 * @returns The normalized path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.polygon([10, 10], [90, 90], [90, 10], [10, 90])
 * stroke(p, 'skyblue')
 * stroke(Path.normalizeWinding(p), 'tomato')
 * ```
 */
export function normalizeWinding(
	path: Path,
	{fillRule = 'nonzero'}: NormalizeWindingOptions = {}
): Path {
	const complete = completeVertexAttrs(path)
	const closed = complete.curves.filter(curve => curve.closed)
	const open = complete.curves.filter(curve => !curve.closed)

	if (closed.length === 0) return path

	const inside =
		fillRule === 'evenodd'
			? (w: number[]) => w[0] % 2 !== 0
			: (w: number[]) => w[0] !== 0

	// The curves get mixed up, so what they hold moves down to the vertices
	const {curves} = planarBoolean(
		[{curves: closed.map(curve => ({curve: pushDownCurveAttrs(curve)}))}],
		{inside, assemble: 'closed', attrDefs: path.attrDefs}
	)

	return withCurves(path, [...curves, ...open])
}
