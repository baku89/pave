import {mat2d, scalar, vec2} from 'linearly'

import {Arc} from '../Arc'
import {type BareSegmentC, CubicBezier} from '../CubicBezier'
import {Curve} from '../Curve'
import {Iter} from '../Iter'
import type {PathLocation} from '../Location'
import type {Path, PathC, UnarcPath} from '../Path'
import {planarFlattenPath} from '../pathPlanar'
import {Segment} from '../Segment'
import {toTime} from './location'
import type {Vertex, VertexC, VertexL} from './types'

/**
 * @category Options
 */
export interface SpawnOptions {
	/**
	 * If true, the continuous open path will be joined
	 * @defaultValue true
	 */
	join?: boolean
}

/**
 * An options for {@link Path.reverse}
 * @category Options
 */
export interface ReverseOptions {
	/**
	 * The unit to reverse the path.
	 * @defaultValue 'path'
	 */
	per?: 'path' | 'curve'
}

/**
 * @category Options
 */
export interface DistortOptions {
	/**
	 * The maximum deviation allowed between the distorted path and the true image of the original path, in the same unit as the coordinates. Segments are subdivided until the fitted cubics stay within it.
	 * @default 0.05
	 */
	tolerance?: number
}

export function spawnVertex<
	V1 extends Vertex = Vertex,
	V2 extends Vertex = Vertex,
>(
	path: Path<V1>,
	fn: (segment: Segment<V1>, segmentIndex: number, curve: Curve) => V2 | V2[]
): Path<V2> {
	return {
		curves: path.curves.map(curve => {
			const vertices: V2[] = []

			if (!curve.closed && curve.vertices.length > 1) {
				// For open path, add the first vertex
				const lastToFirstSeg = {
					command: curve.vertices[0].command,
					start: curve.vertices.at(-1)!.point,
					point: curve.vertices[0].point,
					args: curve.vertices[0].args,
				} as Segment<V1>

				const lastToFirstVertices = fn(lastToFirstSeg, -1, curve)

				if (Array.isArray(lastToFirstVertices)) {
					vertices.push(...lastToFirstVertices.slice(-1))
				} else {
					vertices.push(lastToFirstVertices)
				}
			}

			vertices.push(
				...Curve.segments(curve).flatMap((segment, segmentIndex) =>
					fn(segment as Segment<V1>, segmentIndex, curve)
				)
			)

			if (curve.closed && vertices.length >= 1) {
				vertices.unshift(vertices.pop()!)
			}

			return {
				vertices,
				closed: curve.closed,
			}
		}),
	}
}

/**
 * Maps each curves in the path to a single or array of curves and creates a new path concatinating those curves. Unlike {@link spawnVertex}, you can also change the number of curves, or open/close state of the curves.
 * @param path The path to map
 * @param fn The curve mapping function.
 * @returns The newly created path
 * @category Modifiers
 */
export function spawnCurve<
	V1 extends Vertex = Vertex,
	V2 extends Vertex = Vertex,
>(
	path: Path<V1>,
	fn: (curve: Curve<V1>, curveIndex: number) => Curve<V2> | Curve<V2>[]
): Path<V2> {
	return {
		curves: path.curves.flatMap(fn),
	}
}

/**
 * Maps each segments in the path to a path and create a new path concatinating those paths.
 * @category Modifiers
 */
export function spawn(
	path: Path,
	fn: (seg: Segment, segmentIndex: number, curve: Curve) => Path,
	{join = true}: SpawnOptions = {}
): Path {
	const newPath: Path = {curves: []}

	for (const originalCurve of path.curves) {
		const curves: Curve[] = []

		for (const [i, seg] of Curve.segments(originalCurve).entries()) {
			const segPath = fn(seg, i, originalCurve)

			if (!join) {
				curves.push(...segPath.curves)
				continue
			}

			// Join the path if possible
			const lastCurve = curves.at(-1)
			const firstCurve = segPath.curves.at(0)

			if (lastCurve && firstCurve && !lastCurve.closed && !firstCurve.closed) {
				const lastVertex = lastCurve.vertices.at(-1)
				const firstVertex = firstCurve.vertices.at(0)

				if (
					lastVertex &&
					firstVertex &&
					vec2.approx(lastVertex.point, firstVertex.point)
				) {
					lastCurve.vertices.push(...firstCurve.vertices.slice(1))
					segPath.curves.shift()
				}
			}

			// Append to the curves
			curves.push(...segPath.curves)
		}

		// Close the curve if it was originally closed
		if (originalCurve.closed) {
			const firstCurve = curves.at(0)
			const lastCurve = curves.at(-1)

			if (firstCurve && lastCurve && !firstCurve.closed && !lastCurve.closed) {
				const firstVertex = firstCurve.vertices.at(0)
				const lastVertex = lastCurve.vertices.at(-1)

				if (
					firstVertex &&
					lastVertex &&
					vec2.approx(firstVertex.point, lastVertex.point)
				) {
					if (firstCurve === lastCurve) {
						curves[0] = Curve.close(firstCurve)
					} else {
						lastCurve.vertices.push(...firstCurve.vertices.slice(1))
						curves.shift()
					}
				}
			}
		}

		newPath.curves.push(...curves)
	}

	return newPath
}

/**
 * Transforms the given path by the given matrix.
 * @param path The path to transform
 * @param matrix The matrix to transform the path by
 * @returns The transformed path
 * @category Modifiers
 */
export function transform(path: Path, matrix: mat2d): Path {
	return spawnVertex(path, (segment): Vertex[] => {
		const {command, args} = segment
		const point = vec2.transformMat2d(segment.point, matrix)

		if (command === 'L') {
			return [{point, command: 'L'}]
		} else if (command === 'C') {
			const c1 = vec2.transformMat2d(args[0], matrix)
			const c2 = vec2.transformMat2d(args[1], matrix)
			return [{point, command: 'C', args: [c1, c2]}]
		} else {
			const arc = Arc.transform(segment, matrix)
			return [{point, command: 'A', args: arc.args}]
		}
	})
}

/**
 * Reverses the given path.
 * @param path The path to reverse
 * @param options: The options
 * @returns The reversed path
 * @category Modifiers
 */
export function reverse(path: Path, {per = 'path'}: ReverseOptions = {}): Path {
	const curves = per === 'path' ? path.curves.slice().reverse() : path.curves

	return {curves: curves.flatMap(Curve.reverse)}
}

/**
 * Trims the path from the given location to the given location.
 * @param path The path to trim
 * @param from The start location
 * @param to The end location
 * @returns The trimmed path
 * @category Modifiers
 */
export function trim(
	path: Path,
	from: PathLocation,
	to: PathLocation,
	crossFirstPoint = true
): Path {
	let fromLoc = toTime(path, from)
	let toLoc = toTime(path, to)

	if (fromLoc.curveIndex === toLoc.curveIndex) {
		// If the range is in the same curve
		const curve = path.curves[fromLoc.curveIndex]

		if (crossFirstPoint && fromLoc.time > toLoc.time) {
			const firstCurve = Curve.trim(curve, fromLoc, 1)
			const secondCurve = Curve.trim(curve, 0, toLoc)

			if (curve.closed) {
				return {
					curves: [
						{
							vertices: [
								...firstCurve.vertices,
								...secondCurve.vertices.slice(1),
							],
							closed: false,
						},
					],
				}
			} else {
				return {
					curves: [firstCurve, secondCurve],
				}
			}
		} else {
			return {curves: [Curve.trim(curve, fromLoc, toLoc)]}
		}
	}

	const invert = fromLoc.curveIndex > toLoc.curveIndex

	if (invert) {
		;[fromLoc, toLoc] = [toLoc, fromLoc]
	}

	const trimmedPath = {
		curves: [
			Curve.trim(path.curves[fromLoc.curveIndex], fromLoc, 1),
			...path.curves.slice(fromLoc.curveIndex + 1, toLoc.curveIndex),
			Curve.trim(path.curves[toLoc.curveIndex], 0, toLoc),
		],
	}

	return invert ? reverse(trimmedPath) : trimmedPath
}

/**
 *
 * @param path The path to convert
 * @param tolerance The maximum deviation allowed when approximating arcs by cubic Béziers
 * @returns The new path without arc commands
 * @category Modifiers
 *
 * @example
 * ```js:pave
 * const p = Path.arc([50, 50], 40, 0, 90)
 * stroke(p, 'skyblue', 5)
 * const pa = Path.unarc(p)
 * stroke(pa, 'tomato')
 * ```
 */
export function unarc(path: Path, tolerance = 0.05): UnarcPath {
	return spawnVertex(path, (seg): (VertexL | VertexC)[] => {
		if (seg.command === 'A') {
			return Arc.approximateByCubicBeziers(seg, tolerance)
		} else {
			return [seg]
		}
	})
}

/**
 * Converts all commands in the path to cubic Bézier curve commands.
 * @param path The path to convert
 * @param tolerance The maximum deviation allowed when approximating arc commands by cubic Béziers
 * @returns The new path with only cubic Bézier curve commands
 * @category Modifiers
 */
export function toCubicBezier(path: Path, tolerance = 0.05): PathC {
	return spawnVertex(path, (seg): VertexC[] => {
		if (seg.command === 'C') {
			return [{point: seg.point, command: 'C', args: seg.args}]
		} else if (seg.command === 'A') {
			return Arc.approximateByCubicBeziers(seg, tolerance)
		} else {
			const c1 = vec2.lerp(seg.start, seg.point, 1 / 3)
			const c2 = vec2.lerp(seg.start, seg.point, 2 / 3)
			return [{point: seg.point, command: 'C', args: [c1, c2]}]
		}
	})
}

/**
 * Alias for {@link toCubicBezier}
 * @category Aliases
 */
export const toC = toCubicBezier

/**
 * Joins the given paths into a single open paths.
 * @param paths The paths to join
 * @returns The joined path
 * @category Modifiers
 */
export function join(paths: Path[]): Path {
	return {
		curves: [
			{
				vertices: paths.flatMap(path => path.curves.flatMap(p => p.vertices)),
				closed: false,
			},
		],
	}
}

/**
 * Flattens the curves in path to straight lines (recursive midpoint split until chord / hull deviation ≤ `tolerance`).
 * @param path The path to flatten
 * @param tolerance The maximum distance between the path and the flattened path, in the same unit as the coordinates
 * @returns The flattened path consists of only M, L, and Z commands
 * @category Modifiers
 * @example
 * ```js:pave
 * const c = Path.circle([50, 50], 40)
 * stroke(c, 'skyblue')
 *
 * const fc = Path.flatten(c, 10)
 * stroke(fc, 'purple')
 * ```
 */
export function flatten(path: Path, tolerance = 0.05): Path {
	return planarFlattenPath(path, tolerance)
}

/**
 * Subdivides each segment in the path into specific number of sub-segments.
 * @param path The path to subdivide
 * @param division The number of division for each segment
 * @returns The newly created path
 * @category Modifiers
 */
export function subdivide(path: Path, division: number): Path {
	division = Math.floor(division)

	if (division <= 1) return path

	const times = Array.from({length: division - 1}, (_, i) => (i + 1) / division)

	return spawnVertex(path, segment => {
		return Segment.divideAtTimes(segment, times)
	})
}

/**
 * Alias for {@link subdivide}
 * @category Aliases
 */
export const subdiv = subdivide

/**
 * Splits the path into multiple paths at the given locations.
 * @param path The path to split
 * @param locs The locations to split
 * @returns The splitted paths
 * @category Modifiers
 */
export function split(path: Path, locs: Iterable<PathLocation>): Path[] {
	return [...Iter.pairwise(locs)].map(([from, to]) => {
		return trim(path, from, to)
	})
}

/**
 * Distorts path by the given point map. It assumes that the map is smooth in the spatial domain and has no singularities or cusps.
 *
 * Every vertex is moved to `map(point)`. Each Bézier handle `h` attached to a point `p` is re-estimated with the central difference `(map(p + h) - map(p - h)) / 2`, so the step is the handle itself and no unit-dependent epsilon is involved. Each segment is then subdivided until the fitted cubic stays within `tolerance` of the true image of the segment, so an affine map yields exactly {@link Path.transform} (with arcs approximated by cubics) without any extra vertices.
 * @param path The path to distort
 * @param map A function that returns, for any point in the plane, its image after the distortion.
 * @returns The newly created path
 * @category Modifiers
 *
 * @example
 * ```js:pave
 * const p = Path.line([10, 50], [90, 50])
 * stroke(p, 'skyblue')
 *
 * // Any point map works; see also Path.wave, Path.twirl and Path.bulge
 * const wave = ([x, y]) => [x, y + 8 * scalar.sin(x * 15)]
 * stroke(Path.distort(p, wave), 'coral')
 * ```
 */
export function distort(
	path: Path,
	map: (position: vec2) => vec2,
	{tolerance = 0.05}: DistortOptions = {}
) {
	tolerance = Math.max(tolerance, 1e-9)

	const mapHandle = (p: vec2, handle: vec2): vec2 => {
		const forward = map(vec2.add(p, handle))
		const backward = map(vec2.sub(p, handle))
		return vec2.scale(vec2.sub(forward, backward), 0.5)
	}

	// Each level halves the segment, so 10 levels allow up to 1024 pieces per segment
	const maxDepth = 10
	const checkTimes = [0.25, 0.5, 0.75]

	const fit = (seg: BareSegmentC, depth: number): VertexC[] => {
		const {start, point} = seg
		const [c1, c2] = seg.args

		const mappedStart = map(start)
		const mappedPoint = map(point)

		const fitted: BareSegmentC = {
			start: mappedStart,
			point: mappedPoint,
			args: [
				vec2.add(mappedStart, mapHandle(start, vec2.sub(c1, start))),
				vec2.add(mappedPoint, mapHandle(point, vec2.sub(c2, point))),
			],
		}

		if (depth < maxDepth) {
			const exceeds = checkTimes.some(time => {
				const expected = map(CubicBezier.point(seg, {time}))
				const actual = CubicBezier.point(fitted, {time})
				return vec2.distance(expected, actual) > tolerance
			})

			if (exceeds) {
				const [first, second] = CubicBezier.divideAtTimes(seg, [0.5])
				return [
					...fit({...first, start}, depth + 1),
					...fit({...second, start: first.point}, depth + 1),
				]
			}
		}

		return [{command: 'C', point: mappedPoint, args: fitted.args}]
	}

	return spawnVertex(toCubicBezier(path, tolerance), seg => fit(seg, 0))
}

/**
 * How a joint between two consecutive segments is cut: the first segment ends at time `u`,
 * the next one starts at time `v`, and `vertices` connect those two points.
 */
interface CornerCut {
	u: number
	v: number
	vertices: Vertex[]
	/** Arc length consumed on the incoming segment, measured back from the joint */
	before: number
	/** Arc length consumed on the outgoing segment, measured forward from the joint */
	after: number
}

/**
 * How much of each adjacent segment a joint may consume, as arc length from the joint.
 * A segment shared with another corner starts out split at its midpoint; whatever the other corner
 * does not use is then released to this one (see {@link cutCorners}).
 */
interface CornerBudget {
	/** Arc length available on the incoming segment, measured back from the joint */
	before: number
	/** Arc length available on the outgoing segment, measured forward from the joint */
	after: number
}

/**
 * Signed turn angle at a joint in degrees, or `null` when the joint is smooth (nothing to cut)
 * or reverses onto itself (no corner to speak of).
 */
function jointTurn(seg: Segment, next: Segment): number | null {
	const turn = vec2.angle(Segment.tangent(seg, 1), Segment.tangent(next, 0))
	if (!Number.isFinite(turn) || Math.abs(turn) < 1e-6) return null
	if (180 - Math.abs(turn) < 1e-6) return null
	return turn
}

/**
 * Rebuilds every curve by cutting its joints (including the closing joint of a closed curve):
 * each segment is trimmed to `[v of the previous joint, u of the next joint]`, so both sides of a
 * corner keep their exact geometry, and the cut vertices are inserted between.
 *
 * A segment with corners at both ends is shared between them. Each corner first gets half of it;
 * then, in relaxation passes, a corner that is held back is allowed to use whatever its neighbour
 * actually leaves (`length − neighbour's consumption`). Consumption never shrinks in those passes,
 * so cuts never overlap and the process settles after a few passes. A segment whose other end is
 * a path end or a smooth joint is available in full. Joints where `cut` returns `null` are left as
 * they are.
 */
function cutCorners(
	path: Path,
	cut: (seg: Segment, next: Segment, budget: CornerBudget) => CornerCut | null
): Path {
	return spawnCurve(path, (curve): Curve => {
		const segs = Curve.segments(curve)
		const n = segs.length
		if (n === 0) return curve

		const lengths = segs.map(seg => Segment.length(seg))
		const nextIndexOf = (i: number): number | null =>
			i + 1 < n ? i + 1 : curve.closed ? 0 : null
		const prevIndexOf = (i: number): number | null =>
			i > 0 ? i - 1 : curve.closed ? n - 1 : null

		// Which joints are corners decides how the segments between them are shared.
		// Joint i sits between segment i and segment nextIndexOf(i).
		const isCorner = segs.map((seg, i) => {
			const next = nextIndexOf(i)
			return next !== null && jointTurn(seg, segs[next]) !== null
		})
		const cornerAtStart = (i: number) => {
			const prev = prevIndexOf(i)
			return prev !== null && isCorner[prev]
		}

		// Pass 0: split shared segments at their midpoints
		const budgets: (CornerBudget | null)[] = segs.map((_seg, i) => {
			const next = nextIndexOf(i)
			if (next === null || !isCorner[i]) return null
			return {
				before: lengths[i] * (cornerAtStart(i) ? 0.5 : 1),
				after: lengths[next] * (isCorner[next] ? 0.5 : 1),
			}
		})
		const cuts: (CornerCut | null)[] = segs.map((seg, i) => {
			const budget = budgets[i]
			const next = nextIndexOf(i)
			return budget && next !== null ? cut(seg, segs[next], budget) : null
		})

		// Relaxation: release what each neighbour leaves unused
		const epsilon = 1e-9 * Math.max(...lengths, 1)
		for (let pass = 0; pass < n + 1; pass++) {
			let changed = false

			for (let i = 0; i < n; i++) {
				const budget = budgets[i]
				const next = nextIndexOf(i)
				if (!budget || next === null) continue

				const prev = prevIndexOf(i)
				const prevCut = prev !== null ? cuts[prev] : null
				const nextCut = cuts[next]
				const released: CornerBudget = {
					before: prevCut ? lengths[i] - prevCut.after : lengths[i],
					after: nextCut ? lengths[next] - nextCut.before : lengths[next],
				}

				if (
					released.before > budget.before + epsilon ||
					released.after > budget.after + epsilon
				) {
					budgets[i] = released
					const grown = cut(segs[i], segs[next], released)
					if (grown) {
						cuts[i] = grown
						changed = true
					}
				}
			}

			if (!changed) break
		}

		const out: Segment[] = []
		for (const [i, seg] of segs.entries()) {
			const prev = prevIndexOf(i)
			const prevCut = prev !== null ? cuts[prev] : null
			const startTime = prevCut?.v ?? 0
			const endTime = cuts[i]?.u ?? 1
			const trimmed = Segment.trim(seg, {time: startTime}, {time: endTime})

			// Two corners meeting leave nothing in between
			if (Segment.length(trimmed) > 1e-6 * lengths[i]) {
				out.push(trimmed)
			}

			let start =
				out.length > 0
					? out[out.length - 1].point
					: Segment.point(seg, {time: startTime})
			for (const vertex of cuts[i]?.vertices ?? []) {
				out.push({...vertex, start} as Segment)
				start = vertex.point
			}
		}

		if (out.length === 0) return curve

		const toVertex = ({command, args, point}: Segment): Vertex =>
			({command, args, point}) as Vertex

		const vertices: Vertex[] = curve.closed
			? [
					{...toVertex(out[out.length - 1]), point: out[0].start} as Vertex,
					...out.slice(0, -1).map(toVertex),
				]
			: [{point: out[0].start, command: 'L'}, ...out.map(toVertex)]

		return {vertices, closed: curve.closed}
	})
}

/**
 * Time at the given arc length back from the end of the segment. A negative offset counts
 * from the end, but `-0` is not negative: `{offset: -0}` would give the start instead.
 */
function timeBeforeEnd(seg: Segment, distance: number): number {
	return distance > 0 ? Segment.toTime(seg, {offset: -distance}) : 1
}

/**
 * Chamfers the path by replacing each corner with a straight cut.
 * Distances are measured along segment arc length (line, cubic, or arc) from the joint, and both
 * segments are trimmed there, so curved segments keep their exact shape up to the cut. The cut
 * on each side is capped at what the segment can give (see {@link fillet} for the sharing rule).
 * Smooth joints are left untouched.
 * @param path The path to chamfer
 * @param distance The distance of chamfer along each segment from the joint
 * @returns The newly created path
 * @category Modifiers
 */
export function chamfer(path: Path, distance: number): Path {
	return cutCorners(path, (seg, next, budget) => {
		if (jointTurn(seg, next) === null || !(distance > 0)) return null

		const before = Math.min(distance, budget.before)
		const after = Math.min(distance, budget.after)
		const u = timeBeforeEnd(seg, before)
		const v = Segment.toTime(next, {offset: after})

		return {
			u,
			v,
			before,
			after,
			vertices: [{command: 'L', point: Segment.point(next, {time: v})}],
		}
	})
}

/**
 * Fillets corners with a circular arc of the given radius, tangent to both segments.
 * For each corner the two tangent points are solved exactly, also on curved segments, by
 * finding the circle of the given radius that touches both; the segments are trimmed there and
 * the arc is emitted as an `A` command. When the radius does not fit, the largest radius that fits
 * is used instead: a corner may consume a whole adjacent segment when its other end is a path end
 * or a smooth joint; when that end is another corner, the two share the segment, each taking what
 * the other leaves (half each when both are held back), so neighbouring fillets never overlap.
 * Smooth joints are left untouched.
 * @param path The path to fillet
 * @param radius The radius of fillet
 * @returns The newly created path
 * @category Modifiers
 *
 * @example
 * ```js:pave
 * const p = Path.fromSVG(['M', [10, 90], 'C', [30, 80], [50, 30], [50, 10], 'L', [90, 90]])
 * stroke(p, 'skyblue')
 * stroke(Path.fillet(p, 15), 'tomato')
 * ```
 */
export function fillet(path: Path, radius: number): Path {
	return cutCorners(path, (seg, next, budget) =>
		filletCorner(seg, next, radius, budget)
	)
}

function filletCorner(
	seg: Segment,
	next: Segment,
	radius: number,
	budget: CornerBudget
): CornerCut | null {
	const turn = jointTurn(seg, next)
	if (turn === null || !(radius > 0)) return null

	// Tangent points must stay within the arc length each segment can give to this joint
	const uMin = timeBeforeEnd(seg, budget.before)
	const vMax = Segment.toTime(next, {offset: budget.after})

	// The arc sits on the inner side of the turn: left of the tangent for a left turn.
	const side = Math.sign(turn)

	/** Center of the circle of radius `r` tangent to `s` at `time`, on the inner side. */
	const centerAt = (s: Segment, time: number, r: number): vec2 =>
		vec2.scaleAndAdd(
			Segment.point(s, {time}),
			vec2.rotate(Segment.tangent(s, {time}), 90 * side),
			r
		)

	/** ∂center/∂time by a central difference kept inside [0, 1]. */
	const centerDerivative = (s: Segment, time: number, r: number): vec2 => {
		const h = 1e-6
		const lo = Math.max(time - h, 0)
		const hi = Math.min(time + h, 1)
		return vec2.scale(
			vec2.sub(centerAt(s, hi, r), centerAt(s, lo, r)),
			1 / (hi - lo)
		)
	}

	/**
	 * Solves for the tangent times (u on `seg`, v on `next`) where one circle of radius `r`
	 * touches both, by Newton–Raphson on the difference of the two implied centers. Returns
	 * `null` when it does not converge or the tangent points leave the budget.
	 */
	const solve = (r: number) => {
		// Start from the straight-line construction: tangent points at r·tan(θ/2) from the joint
		const trim = r * scalar.tan(Math.abs(turn) / 2)
		let u = Segment.toTime(seg, {offset: -trim})
		let v = Segment.toTime(next, {offset: trim})

		for (let i = 0; i < 32; i++) {
			const f = vec2.sub(centerAt(seg, u, r), centerAt(next, v, r))
			if (vec2.length(f) <= r * 1e-12) {
				// Converged; it only counts when the tangent points respect the budget
				if (u < uMin - 1e-12 || v > vMax + 1e-12) return null
				return {u, v, center: centerAt(seg, u, r)}
			}

			const fu = centerDerivative(seg, u, r)
			const fv = vec2.neg(centerDerivative(next, v, r))
			const det = fu[0] * fv[1] - fu[1] * fv[0]
			if (!(Math.abs(det) > 1e-18)) return null

			const du = (f[0] * fv[1] - f[1] * fv[0]) / det
			const dv = (fu[0] * f[1] - fu[1] * f[0]) / det
			const nu = u - du
			const nv = v - dv
			// A solution beyond the budget means the radius does not fit this joint
			if (nu < uMin - 1e-12 || nu > 1 + 1e-12) return null
			if (nv < -1e-12 || nv > vMax + 1e-12) return null
			u = scalar.clamp(nu, uMin, 1)
			v = scalar.clamp(nv, 0, vMax)
		}

		return null
	}

	let r = radius
	let solution = solve(r)

	if (!solution) {
		// Shrink to the largest radius that fits, by bisection
		let lo = 0
		let hi = radius
		for (let i = 0; i < 40; i++) {
			const mid = (lo + hi) / 2
			const candidate = solve(mid)
			if (candidate) {
				lo = mid
				solution = candidate
				r = mid
			} else {
				hi = mid
			}
		}
		if (!solution) return null
	}

	const {u, v, center} = solution
	const from = Segment.point(seg, {time: u})
	const to = Segment.point(next, {time: v})
	const fromDeg = vec2.angle(vec2.sub(from, center))
	const toDeg = vec2.angle(vec2.sub(to, center))
	const delta = ((((toDeg - fromDeg) % 360) + 540) % 360) - 180

	return {
		u,
		v,
		before: Segment.length(Segment.trim(seg, {time: u}, {time: 1})),
		after: Segment.length(Segment.trim(next, {time: 0}, {time: v})),
		vertices: [{command: 'A', args: [[r, r], 0, false, delta > 0], point: to}],
	}
}
