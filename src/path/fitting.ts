/**
 * Curve fitting: turning points into cubic Béziers, and paths into fewer of them.
 *
 * {@link fit} and {@link simplify} follow Philip J. Schneider's "An Algorithm for
 * Automatically Fitting Digitized Curves" (Graphics Gems, 1990), the same approach as
 * paper.js `PathFitter` (MIT, https://github.com/paperjs/paper.js).
 */
import {scalar, vec2} from 'linearly'

import {withCurves} from '../attributes'
import {type Curve, type Path, Segment} from '../index'
import {flatten, unarc} from './modifiers'
import type {Vertex, VertexC, VertexL} from './types'

/**
 * An options for {@link Path.fit}
 * @category Options
 */
export interface FitOptions {
	/**
	 * The maximum distance allowed between the given points and the fitted curve, in the same unit as the coordinates.
	 * @defaultValue 2.5
	 */
	tolerance?: number
	/**
	 * If true, the points are regarded as a loop and a closed curve is returned.
	 * @defaultValue false
	 */
	closed?: boolean
}

/**
 * An options for {@link Path.simplify}
 * @category Options
 */
export interface SimplifyOptions {
	/**
	 * The maximum distance allowed between the original path and the simplified one, in the same unit as the coordinates.
	 * @defaultValue 2.5
	 */
	tolerance?: number
}

/**
 * An options for {@link Path.spline}
 * @category Options
 */
export interface SplineOptions {
	/**
	 * How far the handles reach, in the range of 0 to 1. Each handle of a vertex is `tension / 3` of the vector between its neighbours, so 0 makes every segment straight, 0.5 is the uniform Catmull-Rom spline, and 1 is twice as loose as that.
	 * @defaultValue 0.5
	 */
	tension?: number
	/**
	 * If true, the spline wraps around and a closed curve is returned.
	 * @defaultValue false
	 */
	closed?: boolean
}

/**
 * An options for {@link Path.smooth}
 * @category Options
 */
export interface SmoothOptions {
	/**
	 * The alpha of the Catmull-Rom spline the handles are taken from: 0 is uniform, 0.5 is centripetal, and 1 is chordal. Larger values make the handles of a vertex more unequal when its neighbours are at unequal distances, which avoids cusps and overshoots.
	 * @defaultValue 0.5
	 */
	factor?: number
}

const DEFAULT_TOLERANCE = 2.5

/**
 * The points with consecutive duplicates removed. When `closed`, a trailing copy of the first point is removed too.
 */
function dedupePoints(points: readonly vec2[], closed: boolean): vec2[] {
	const out: vec2[] = []
	for (const point of points) {
		const prev = out.at(-1)
		if (!prev || !vec2.approx(prev, point)) out.push(point)
	}
	while (closed && out.length > 1 && vec2.approx(out[0], out.at(-1)!)) {
		out.pop()
	}
	return out
}

/** The point of a cubic Bézier given by its four control points at time `t`. */
function evaluateCubic(
	[p0, p1, p2, p3]: readonly [vec2, vec2, vec2, vec2],
	t: number
): vec2 {
	const s = 1 - t
	const a = s * s * s
	const b = 3 * s * s * t
	const c = 3 * s * t * t
	const d = t * t * t
	return [
		a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
		a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
	]
}

/** Chord-length parameterization of `points[first..last]`, normalized to [0, 1]. */
function chordLengthParameterize(
	points: readonly vec2[],
	first: number,
	last: number
): number[] {
	const u = [0]
	for (let i = first + 1; i <= last; i++) {
		u.push(u[i - first - 1] + vec2.distance(points[i], points[i - 1]))
	}
	const total = u[last - first]
	if (total > 0) {
		for (let i = 1; i <= last - first; i++) u[i] /= total
	} else {
		for (let i = 1; i <= last - first; i++) u[i] = i / (last - first)
	}
	return u
}

/**
 * The least-squares cubic through `points[first]` and `points[last]` whose handles lie along the unit tangents `tan1` (leaving the start) and `tan2` (entering the end from behind, i.e. pointing back into the curve), with the points placed at the parameters `u`.
 */
function generateBezier(
	points: readonly vec2[],
	first: number,
	last: number,
	u: readonly number[],
	tan1: vec2,
	tan2: vec2
): [vec2, vec2, vec2, vec2] {
	const epsilon = 1e-12
	const pt1 = points[first]
	const pt2 = points[last]

	// Normal equations of the two handle lengths
	let c00 = 0
	let c01 = 0
	let c11 = 0
	let x0 = 0
	let x1 = 0

	for (let i = 0; i <= last - first; i++) {
		const t = u[i]
		const s = 1 - t
		const b = 3 * t * s
		const b0 = s * s * s
		const b1 = b * s
		const b2 = b * t
		const b3 = t * t * t
		const a1 = vec2.scale(tan1, b1)
		const a2 = vec2.scale(tan2, b2)
		const tmp = vec2.sub(
			vec2.sub(points[first + i], vec2.scale(pt1, b0 + b1)),
			vec2.scale(pt2, b2 + b3)
		)
		c00 += vec2.dot(a1, a1)
		c01 += vec2.dot(a1, a2)
		c11 += vec2.dot(a2, a2)
		x0 += vec2.dot(a1, tmp)
		x1 += vec2.dot(a2, tmp)
	}

	const det = c00 * c11 - c01 * c01
	let alpha1: number
	let alpha2: number

	if (Math.abs(det) > epsilon) {
		alpha1 = (x0 * c11 - x1 * c01) / det
		alpha2 = (c00 * x1 - c01 * x0) / det
	} else {
		// The system is singular; fall back to a single shared length
		const c0 = c00 + c01
		const c1 = c01 + c11
		alpha1 = alpha2 =
			Math.abs(c0) > epsilon ? x0 / c0 : Math.abs(c1) > epsilon ? x1 / c1 : 0
	}

	const chord = vec2.distance(pt1, pt2)
	const eps = epsilon * chord

	if (alpha1 < eps || alpha2 < eps) {
		// Wu/Barsky heuristic: handles a third of the chord along the tangents
		alpha1 = alpha2 = chord / 3
	} else {
		// Reject handles that cross each other far beyond the chord
		const line = vec2.sub(pt2, pt1)
		const handle1 = vec2.scale(tan1, alpha1)
		const handle2 = vec2.scale(tan2, alpha2)
		if (vec2.dot(handle1, line) - vec2.dot(handle2, line) > chord * chord) {
			alpha1 = alpha2 = chord / 3
		}
	}

	return [
		pt1,
		vec2.scaleAndAdd(pt1, tan1, alpha1),
		vec2.scaleAndAdd(pt2, tan2, alpha2),
		pt2,
	]
}

/** One Newton–Raphson step of the parameter `u` towards the foot of `point` on the cubic. */
function findRoot(
	curve: readonly [vec2, vec2, vec2, vec2],
	point: vec2,
	u: number
): number {
	const [p0, p1, p2, p3] = curve
	// Control points of the first and second derivatives
	const d1: [vec2, vec2, vec2] = [
		vec2.scale(vec2.sub(p1, p0), 3),
		vec2.scale(vec2.sub(p2, p1), 3),
		vec2.scale(vec2.sub(p3, p2), 3),
	]
	const d2: [vec2, vec2] = [
		vec2.scale(vec2.sub(d1[1], d1[0]), 2),
		vec2.scale(vec2.sub(d1[2], d1[1]), 2),
	]

	const s = 1 - u
	const pt = evaluateCubic(curve, u)
	const pt1 = vec2.add(
		vec2.scale(d1[0], s * s),
		vec2.scale(d1[1], 2 * s * u),
		vec2.scale(d1[2], u * u)
	)
	const pt2 = vec2.lerp(d2[0], d2[1], u)

	const diff = vec2.sub(pt, point)
	const df = vec2.dot(pt1, pt1) + vec2.dot(diff, pt2)

	return Math.abs(df) < 1e-12 ? u : u - vec2.dot(diff, pt1) / df
}

/**
 * Moves every parameter towards the closest point of the cubic. Returns false when the parameters are no longer increasing, meaning the fit cannot be trusted.
 */
function reparameterize(
	points: readonly vec2[],
	first: number,
	last: number,
	u: number[],
	curve: readonly [vec2, vec2, vec2, vec2]
): boolean {
	for (let i = first; i <= last; i++) {
		u[i - first] = findRoot(curve, points[i], u[i - first])
	}
	for (let i = 1; i < u.length; i++) {
		if (u[i] <= u[i - 1]) return false
	}
	return true
}

/** The largest squared distance from a point to its parameter on the cubic, and where it is. */
function findMaxError(
	points: readonly vec2[],
	first: number,
	last: number,
	curve: readonly [vec2, vec2, vec2, vec2],
	u: readonly number[]
): {error: number; index: number} {
	let index = Math.floor((last - first + 1) / 2) + first
	let maxDist = 0
	for (let i = first + 1; i < last; i++) {
		const dist = vec2.sqrDist(evaluateCubic(curve, u[i - first]), points[i])
		if (dist >= maxDist) {
			maxDist = dist
			index = i
		}
	}
	return {error: maxDist, index}
}

/** Fits `points[first..last]` within `tolerance` by splitting recursively, appending the cubics to `out`. */
function fitCubic(
	points: readonly vec2[],
	first: number,
	last: number,
	tan1: vec2,
	tan2: vec2,
	tolerance: number,
	out: VertexC[]
) {
	const addCurve = ([, c1, c2, point]: readonly [vec2, vec2, vec2, vec2]) => {
		out.push({command: 'C', args: [c1, c2], point})
	}

	// Only two points: handles a third of the way along the tangents
	if (last - first === 1) {
		const pt1 = points[first]
		const pt2 = points[last]
		const dist = vec2.distance(pt1, pt2) / 3
		addCurve([
			pt1,
			vec2.scaleAndAdd(pt1, tan1, dist),
			vec2.scaleAndAdd(pt2, tan2, dist),
			pt2,
		])
		return
	}

	const {curve, error, index: split} = fitBest(points, first, last, tan1, tan2)

	if (error < tolerance * tolerance) {
		addCurve(curve)
		return
	}

	// Split at the point of the maximum error and fit both halves
	const tanCenter = centerTangent(
		points[split - 1],
		points[split],
		points[split + 1]
	)
	fitCubic(points, first, split, tan1, tanCenter, tolerance, out)
	fitCubic(points, split, last, vec2.neg(tanCenter), tan2, tolerance, out)
}

const MAX_ITERATIONS = 8

/**
 * The best single cubic through `points[first..last]` along the given tangents: the least-squares solution for the chord-length parameters, then refined by Newton–Raphson as long as the maximum error keeps shrinking and the parameters stay in order.
 */
function fitBest(
	points: readonly vec2[],
	first: number,
	last: number,
	tan1: vec2,
	tan2: vec2
): {curve: [vec2, vec2, vec2, vec2]; error: number; index: number} {
	const u = chordLengthParameterize(points, first, last)

	let curve = generateBezier(points, first, last, u, tan1, tan2)
	let max = findMaxError(points, first, last, curve, u)

	for (let i = 0; i < MAX_ITERATIONS && max.error > 0; i++) {
		if (!reparameterize(points, first, last, u, curve)) break
		const next = generateBezier(points, first, last, u, tan1, tan2)
		const nextMax = findMaxError(points, first, last, next, u)
		if (nextMax.error >= max.error) break
		curve = next
		max = nextMax
	}

	return {curve, ...max}
}

/**
 * Fits a single cubic Bézier from the first to the last of the points, with the handles along the given unit tangents (`tan1` leaving the start, `tan2` pointing back from the end). The parameters are refined by Newton–Raphson, and the best attempt is returned as the two control points.
 * @internal
 */
export function fitSingleCubic(
	points: readonly vec2[],
	tan1: vec2,
	tan2: vec2
): [control1: vec2, control2: vec2] {
	const {curve} = fitBest(points, 0, points.length - 1, tan1, tan2)
	return [curve[1], curve[2]]
}

/**
 * The unit tangent at `p0` of the parabola through `p0`, `p1` and `p2` parameterized by chord length, or the direction to `p1` when they are too close.
 */
function endTangent(p0: vec2, p1: vec2, p2: vec2 | undefined): vec2 {
	const d1 = vec2.distance(p0, p1)
	const d2 = p2 ? vec2.distance(p1, p2) : 0
	if (d1 === 0 || d2 === 0 || !p2) {
		return vec2.normalize(vec2.sub(p1, p0))
	}
	const sum = d1 + d2
	const tangent = vec2.add(
		vec2.scale(p0, -(2 * d1 + d2) / (d1 * sum)),
		vec2.scale(p1, sum / (d1 * d2)),
		vec2.scale(p2, -d1 / (d2 * sum))
	)
	return vec2.normalize(tangent)
}

/**
 * The unit tangent at `p1` of the parabola through `p0`, `p1` and `p2` parameterized by chord length; pointing from `p2` towards `p0` to match Schneider's convention for the end tangent of the first half of a split.
 */
function centerTangent(p0: vec2, p1: vec2, p2: vec2): vec2 {
	const d1 = vec2.distance(p0, p1)
	const d2 = vec2.distance(p1, p2)
	if (d1 === 0 || d2 === 0) {
		return vec2.normalize(vec2.sub(p0, p2))
	}
	const sum = d1 + d2
	const tangent = vec2.add(
		vec2.scale(p0, -d2 / (d1 * sum)),
		vec2.scale(p1, (d2 - d1) / (d1 * d2)),
		vec2.scale(p2, d1 / (d2 * sum))
	)
	return vec2.neg(vec2.normalize(tangent))
}

/** Points turning by at least this angle, in degrees, are kept as corners. */
const CORNER_ANGLE = 60

/**
 * Whether the points turn sharply at `p1`. Turns between chords no longer than the tolerance are regarded as noise.
 */
function isCorner(p0: vec2, p1: vec2, p2: vec2, tolerance: number): boolean {
	const a = vec2.sub(p1, p0)
	const b = vec2.sub(p2, p1)
	const la = vec2.len(a)
	const lb = vec2.len(b)
	if (la <= tolerance || lb <= tolerance) return false
	return vec2.dot(a, b) / (la * lb) < Math.cos(scalar.rad(CORNER_ANGLE))
}

/** The largest distance from `points[first..last]` to the chord between its ends. */
function chordDeviation(
	points: readonly vec2[],
	first: number,
	last: number
): number {
	const a = points[first]
	const b = points[last]
	const chord = vec2.sub(b, a)
	const len = vec2.len(chord)
	let max = 0
	for (let i = first + 1; i < last; i++) {
		const d = vec2.sub(points[i], a)
		const dist =
			len > 0 ? Math.abs(chord[0] * d[1] - chord[1] * d[0]) / len : vec2.len(d)
		max = Math.max(max, dist)
	}
	return max
}

/**
 * Fits `points[first..last]` as one run with one-sided tangents at both ends: a line when the points are straight within the tolerance, cubics otherwise.
 */
function fitRun(
	points: readonly vec2[],
	first: number,
	last: number,
	tolerance: number,
	out: Vertex[]
) {
	if (last - first === 1 || chordDeviation(points, first, last) <= tolerance) {
		out.push({point: points[last], command: 'L'})
		return
	}
	const tan1 = endTangent(points[first], points[first + 1], points[first + 2])
	const tan2 = endTangent(points[last], points[last - 1], points[last - 2])
	const cubics: VertexC[] = []
	fitCubic(points, first, last, tan1, tan2, tolerance, cubics)
	out.push(...cubics)
}

/**
 * Fits a smooth sequence of cubic Bézier curves to the given points, so that every point lies within `tolerance` of the result. The curve is split wherever a single cubic cannot follow the points, so the smaller the tolerance, the more vertices the result has. The algorithm is Schneider's: the points are parameterized by chord length, the handle lengths are solved in the least-squares sense, the parameters are refined by Newton–Raphson, and the range is split at the point of the largest error when that is not enough.
 *
 * Sharp corners are kept: where the points turn by 60° or more between chords longer than the tolerance, the curve gets a corner vertex with independent tangents on each side. A run of points that is straight within the tolerance becomes a line (`L`) rather than a cubic. Consecutive duplicate points are ignored. With fewer than two distinct points the result is an empty path or a dot; with exactly two it is a line.
 * @param points The points to fit
 * @param options The options
 * @returns The fitted path with a single curve
 * @category Primitives
 * @example
 * ```js:pave
 * const points = Array.from({length: 40}, (_, i) => {
 *   const t = i / 39
 *   return [10 + 80 * t, 50 + 30 * Math.sin(t * Math.PI * 2)]
 * })
 * const p = Path.fit(points, {tolerance: 1})
 * stroke(p)
 * ```
 */
export function fit(
	points: readonly vec2[],
	{tolerance = DEFAULT_TOLERANCE, closed = false}: FitOptions = {}
): Path {
	const pts = dedupePoints(points, closed)
	const n = pts.length

	if (n === 0) return {curves: []}

	if (n === 1) {
		return {curves: [{vertices: [{point: pts[0], command: 'L'}], closed}]}
	}

	if (n === 2) {
		return {
			curves: [
				{
					vertices: [
						{point: pts[0], command: 'L'},
						{point: pts[1], command: 'L'},
					],
					closed,
				},
			],
		}
	}

	const at = (i: number) => pts[((i % n) + n) % n]
	const corners: number[] = []
	for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
		if (isCorner(at(i - 1), at(i), at(i + 1), tolerance)) corners.push(i)
	}

	if (closed && corners.length === 0) {
		// Fit the loop as an open run from the first point back to itself, with the
		// tangent at the seam estimated across it, then close the curve by moving the
		// last segment onto the first vertex.
		const loop = [...pts, pts[0]]
		const tan2 = centerTangent(pts[n - 1], pts[0], pts[1])
		const cubics: VertexC[] = []
		fitCubic(loop, 0, n, vec2.neg(tan2), tan2, tolerance, cubics)

		const last = cubics.pop()!
		return {
			curves: [
				{
					vertices: [{point: pts[0], command: 'C', args: last.args}, ...cubics],
					closed: true,
				},
			],
		}
	}

	// Fit the runs between the corners (and the ends) one by one. A loop with corners
	// starts at its first corner and runs back to it.
	const shift = closed ? corners[0] : 0
	const run = closed
		? [...Array.from({length: n}, (_, i) => at(i + shift)), at(shift)]
		: pts
	const stops = [0, ...corners.map(i => i - shift), run.length - 1]

	const vertices: Vertex[] = [{point: run[0], command: 'L'}]
	for (let i = 0; i + 1 < stops.length; i++) {
		fitRun(run, stops[i], stops[i + 1], tolerance, vertices)
	}

	if (closed) {
		// The last vertex is the first one again; its segment closes the curve
		const last = vertices.pop()!
		vertices[0] = {...last, point: run[0]} as Vertex
	}

	return {curves: [{vertices, closed}]}
}

/**
 * Reduces the number of vertices of the path while keeping it within `tolerance` of the original. Each curve is flattened to points and then {@link Path.fit} to a new sequence of cubic Béziers, so collinear runs of lines collapse into one and dense polylines become a few smooth curves. Arcs are refit as cubics like everything else.
 *
 * The attributes of the path and of the curves are kept; those of the vertices are dropped, since the vertices are replaced.
 * @param path The path to simplify
 * @param options The options
 * @returns The simplified path
 * @category Modifiers
 * @example
 * ```js:pave
 * const dense = Path.flatten(Path.circle([50, 50], 40), 0.01)
 * const p = Path.simplify(dense, {tolerance: 0.5})
 * stroke(p)
 * ```
 */
export function simplify(
	path: Path,
	{tolerance = DEFAULT_TOLERANCE}: SimplifyOptions = {}
): Path {
	// The flattening and the fitting each take a share of the tolerance
	const flat = flatten(path, tolerance / 4)

	const curves = flat.curves.map((curve, i): Curve => {
		const original = path.curves[i]
		if (curve.vertices.length < 2) return original

		const fitted = fit(
			curve.vertices.map(v => v.point),
			{tolerance: (tolerance * 3) / 4, closed: curve.closed}
		)
		const vertices = fitted.curves[0]?.vertices ?? []

		return {
			vertices,
			closed: curve.closed,
			...(original.attrs ? {attrs: original.attrs} : {}),
		}
	})

	return withCurves(path, curves)
}

/**
 * Creates a smooth curve passing through all of the points, a cardinal (Catmull-Rom) spline converted to cubic Béziers. The handles of each point are parallel to the line between its neighbours; at the ends of an open spline, the missing neighbour is the reflection of the other one, so the curve leaves the end along the first chord.
 * @param points The points to pass through
 * @param options The options
 * @returns The newly created path with a single curve
 * @category Primitives
 * @example
 * ```js:pave
 * const p = Path.spline([[10, 50], [30, 20], [60, 80], [90, 40]])
 * stroke(p)
 * ```
 */
export function spline(
	points: readonly vec2[],
	{tension = 0.5, closed = false}: SplineOptions = {}
): Path {
	const pts = dedupePoints(points, closed)
	const n = pts.length

	if (n === 0) return {curves: []}

	if (n === 1) {
		return {curves: [{vertices: [{point: pts[0], command: 'L'}], closed}]}
	}

	const k = tension / 3

	const neighbour = (i: number): vec2 => {
		if (closed) return pts[((i % n) + n) % n]
		// Reflect the point across the end
		if (i < 0) return vec2.sub(vec2.scale(pts[0], 2), pts[1])
		if (i >= n) return vec2.sub(vec2.scale(pts[n - 1], 2), pts[n - 2])
		return pts[i]
	}

	// The vector of the out-handle of each point; the in-handle is its negation
	const handle = (i: number): vec2 =>
		vec2.scale(vec2.sub(neighbour(i + 1), neighbour(i - 1)), k)

	const segmentTo = (i: number): VertexC => {
		const prev = neighbour(i - 1)
		const point = pts[i]
		return {
			command: 'C',
			args: [vec2.add(prev, handle(i - 1)), vec2.sub(point, handle(i))],
			point,
		}
	}

	const vertices: Vertex[] = []

	if (closed) {
		vertices.push(segmentTo(0))
	} else {
		vertices.push({point: pts[0], command: 'L'})
	}
	for (let i = 1; i < n; i++) {
		vertices.push(segmentTo(i))
	}

	return {curves: [{vertices, closed}]}
}

/**
 * Makes the path smooth by recomputing the handles at every vertex from the neighbouring anchors, in the manner of a Catmull-Rom spline, while keeping the anchors in place. Every segment becomes a cubic Bézier, and the tangent is continuous at every vertex that has a neighbour on both sides, so {@link Path.vertexType} reports `'smooth'` there. At the ends of an open curve, an existing cubic handle is kept and a line gets a handle a third of the way along it.
 *
 * Arcs are first converted to cubic Béziers by {@link Path.unarc}, which may add vertices.
 * @param path The path to smooth
 * @param options The options
 * @returns The smoothed path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.smooth(Path.polyline([10, 50], [30, 20], [60, 80], [90, 40]))
 * stroke(p)
 * ```
 */
export function smooth(path: Path, {factor = 0.5}: SmoothOptions = {}): Path {
	const unarced = unarc(path)

	const curves = unarced.curves.map((curve): Curve => {
		const {vertices, closed} = curve
		const n = vertices.length
		if (n < 2) return curve

		const pt = (i: number) => vertices[((i % n) + n) % n].point

		// Absolute positions of the in- and out-handles of each vertex
		const handles: [vec2 | null, vec2 | null][] = vertices.map((v, i) => {
			const hasPrev = closed || i > 0
			const hasNext = closed || i < n - 1

			if (hasPrev && hasNext) {
				const p0 = pt(i - 1)
				const p1 = v.point
				const p2 = pt(i + 1)
				const d1 = vec2.distance(p0, p1) ** factor
				const d2 = vec2.distance(p1, p2) ** factor
				const d1sq = d1 * d1
				const d2sq = d2 * d2
				const sum = d1 + d2
				const a = vec2.sub(p2, p1)
				const b = vec2.sub(p0, p1)
				if (sum === 0 || d1 === 0 || d2 === 0) {
					return [p1, p1]
				}
				const out = vec2.scale(
					vec2.sub(vec2.scale(a, d1sq), vec2.scale(b, d2sq)),
					1 / (3 * d1 * sum)
				)
				const inn = vec2.scale(
					vec2.sub(vec2.scale(b, d2sq), vec2.scale(a, d1sq)),
					1 / (3 * d2 * sum)
				)
				return [vec2.add(p1, inn), vec2.add(p1, out)]
			}

			// An end of an open curve: keep a cubic handle, or take a third of a line
			const inn = hasPrev
				? v.command === 'C'
					? v.args[1]
					: vec2.lerp(v.point, pt(i - 1), 1 / 3)
				: null
			const next = hasNext ? vertices[i + 1] : null
			const out = next
				? next.command === 'C'
					? next.args[0]
					: vec2.lerp(v.point, next.point, 1 / 3)
				: null
			return [inn, out]
		})

		const out = vertices.map((v, i): Vertex => {
			if (!closed && i === 0) {
				const first: VertexL = {point: v.point, command: 'L'}
				return v.attrs ? {...first, attrs: v.attrs} : first
			}
			const prev = (i - 1 + n) % n
			const control1 = handles[prev][1] ?? vertices[prev].point
			const control2 = handles[i][0] ?? v.point
			const vertex: VertexC = {
				point: v.point,
				command: 'C',
				args: [control1, control2],
			}
			return v.attrs ? {...vertex, attrs: v.attrs} : vertex
		})

		return {
			vertices: out,
			closed,
			...(curve.attrs ? {attrs: curve.attrs} : {}),
		}
	})

	return withCurves(unarced, curves)
}

/**
 * Samples a segment at evenly spaced times, including both ends.
 * @internal
 */
export function sampleSegment(seg: Segment, count: number): vec2[] {
	const out: vec2[] = []
	for (let i = 0; i <= count; i++) {
		out.push(Segment.point(seg, {time: i / count}))
	}
	return out
}
