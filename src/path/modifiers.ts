import {mat2d, scalar, vec2} from 'linearly'

import {
	completeVertexAttrs,
	interpolateAttrs,
	interpolateValue,
	mergeAttrDefs,
	omit,
	pushDownCurveAttrs,
	pushDownPathAttrs,
	resolveAttribute,
	segmentAttrsAt,
	segmentToVertex,
	withCurves,
} from '../attributes'
import {
	Arc,
	type BareSegmentC,
	CubicBezier,
	Curve,
	type Path,
	type PathC,
	Segment,
	type SegmentC,
	type UnarcPath,
} from '../index'
import * as Iter from '../Iter'
import type {PathLocation} from '../Location'
import {unitNormalAt, unitTangentAt} from '../parallelCurve'
import {planarFlattenPath} from '../pathPlanar'
import {deleteAttribute, setAttribute} from './attributes'
import {toTime} from './location'
import {isSuperellipseStraight, superellipseCubics} from './superellipse'
import type {
	AttributeLike,
	Attributes,
	Vertex,
	VertexC,
	VertexContext,
	VertexL,
} from './types'

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
	/**
	 * How many times a segment can be halved to get within `tolerance`, each level allowing twice the pieces. Past this, it stays as far from the true image as it is.
	 * @default 10
	 */
	maxDepth?: number
}

export function spawnVertex<
	V1 extends Vertex = Vertex,
	V2 extends Vertex = Vertex,
>(
	path: Path<V1>,
	fn: (segment: Segment<V1>, segmentIndex: number, curve: Curve) => V2 | V2[]
): Path<V2> {
	const complete = completeVertexAttrs(path)
	const attrDefs = complete.attrDefs

	// What a vertex does not say for itself is taken from where it is on the segment,
	// assuming that the vertices returned for a segment divide it evenly
	const carry = (segment: Segment<V1>, result: V2 | V2[]): V2[] => {
		const out = Array.isArray(result) ? result : [result]
		const seg = segment as Segment
		return out.map((vertex, i) => {
			const rest = omit(vertex, 'start', 'startAttrs')
			const attrs =
				vertex.attrs ?? segmentAttrsAt(seg, (i + 1) / out.length, attrDefs)
			return (attrs ? {...rest, attrs} : rest) as unknown as V2
		})
	}

	return withCurves<Path<V2>>(
		path,
		complete.curves.map(curve => {
			const vertices: V2[] = []

			if (!curve.closed && curve.vertices.length > 1) {
				// For open path, add the first vertex
				const lastToFirstSeg = {
					command: curve.vertices[0].command,
					start: curve.vertices.at(-1)!.point,
					point: curve.vertices[0].point,
					args: curve.vertices[0].args,
					...(curve.vertices[0].attrs ? {attrs: curve.vertices[0].attrs} : {}),
				} as Segment<V1>

				vertices.push(
					...carry(lastToFirstSeg, fn(lastToFirstSeg, -1, curve)).slice(-1)
				)
			}

			vertices.push(
				...Curve.segments(curve).flatMap((segment, segmentIndex) =>
					carry(
						segment as Segment<V1>,
						fn(segment as Segment<V1>, segmentIndex, curve)
					)
				)
			)

			if (curve.closed && vertices.length >= 1) {
				vertices.unshift(vertices.pop()!)
			}

			return {
				vertices,
				closed: curve.closed,
				...(curve.attrs ? {attrs: curve.attrs} : {}),
			} as Curve<V2>
		}) as Curve[]
	)
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
	return withCurves<Path<V2>>(
		path,
		path.curves.flatMap((curve, i) => {
			const result = fn(curve, i)
			return (Array.isArray(result) ? result : [result]).map(c =>
				curve.attrs && !c.attrs ? {...c, attrs: curve.attrs} : c
			)
		}) as Curve[]
	)
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
	const newPath: Path = withCurves(path, [])

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

	return withCurves(path, curves.flatMap(Curve.reverse))
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
	path = completeVertexAttrs(path)
	const {attrDefs} = path

	let fromLoc = toTime(path, from)
	let toLoc = toTime(path, to)

	if (fromLoc.curveIndex === toLoc.curveIndex) {
		// If the range is in the same curve
		const curve = path.curves[fromLoc.curveIndex]

		if (crossFirstPoint && fromLoc.time > toLoc.time) {
			const firstCurve = Curve.trim(curve, fromLoc, 1, attrDefs)
			const secondCurve = Curve.trim(curve, 0, toLoc, attrDefs)

			if (curve.closed) {
				return withCurves(path, [
					{
						...firstCurve,
						vertices: [
							...firstCurve.vertices,
							...secondCurve.vertices.slice(1),
						],
						closed: false,
					},
				])
			} else {
				return withCurves(path, [firstCurve, secondCurve])
			}
		} else {
			return withCurves(path, [Curve.trim(curve, fromLoc, toLoc, attrDefs)])
		}
	}

	const invert = fromLoc.curveIndex > toLoc.curveIndex

	if (invert) {
		;[fromLoc, toLoc] = [toLoc, fromLoc]
	}

	const trimmedPath = withCurves<Path>(path, [
		Curve.trim(path.curves[fromLoc.curveIndex], fromLoc, 1, attrDefs),
		...path.curves.slice(fromLoc.curveIndex + 1, toLoc.curveIndex),
		Curve.trim(path.curves[toLoc.curveIndex], 0, toLoc, attrDefs),
	])

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
	const attrDefs = mergeAttrDefs(paths)
	const curves: Curve[] = [
		{
			// The curves become one, so what differed between them moves down to the vertices
			vertices: paths.flatMap(path =>
				path.curves.flatMap(
					curve => pushDownCurveAttrs(pushDownPathAttrs(path, curve)).vertices
				)
			),
			closed: false,
		},
	]
	return attrDefs ? {curves, attrDefs} : {curves}
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
		return Segment.divideAtTimes(segment, times, path.attrDefs)
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
	{tolerance = 0.05, maxDepth = 10}: DistortOptions = {}
) {
	tolerance = Math.max(tolerance, 1e-9)

	const mapHandle = (p: vec2, handle: vec2): vec2 => {
		const forward = map(vec2.add(p, handle))
		const backward = map(vec2.sub(p, handle))
		return vec2.scale(vec2.sub(forward, backward), 0.5)
	}

	const checkTimes = [0.25, 0.5, 0.75]

	const fit = (seg: SegmentC, depth: number): VertexC[] => {
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
				const [first, second] = Segment.divideAtTimes(
					seg,
					[0.5],
					path.attrDefs
				) as VertexC[]
				return [
					...fit(
						{
							...first,
							start,
							...(seg.startAttrs ? {startAttrs: seg.startAttrs} : {}),
						},
						depth + 1
					),
					...fit(
						{
							...second,
							start: first.point,
							...(first.attrs ? {startAttrs: first.attrs} : {}),
						},
						depth + 1
					),
				]
			}
		}

		return [
			{
				command: 'C',
				point: mappedPoint,
				args: fitted.args,
				...(seg.attrs ? {attrs: seg.attrs} : {}),
			},
		]
	}

	return spawnVertex(toCubicBezier(path, tolerance), seg => fit(seg, 0))
}

/**
 * An options for {@link Path.fillet} and {@link Path.chamfer}
 * @category Options
 */
export interface CornerOptions {
	/**
	 * Which corners to process: a boolean attribute's name, or a function of the vertex at the corner. All of them by default.
	 */
	group?: AttributeLike<boolean>
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
 * does not use is then released to this one (see {@link cutJoints}).
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
function cutJoints(
	path: Path,
	amount: AttributeLike<number>,
	{group}: CornerOptions,
	cut: (
		seg: Segment,
		next: Segment,
		budget: CornerBudget,
		amount: number,
		place: {vertex: Vertex; context: VertexContext}
	) => CornerCut | null
): Path {
	path = completeVertexAttrs(path)
	const {attrDefs} = path
	const readAmount = resolveAttribute(amount, path)
	const readGroup = group === undefined ? null : resolveAttribute(group, path)

	return spawnCurve(path, (curve, curveIndex): Curve => {
		const segs = Curve.segments(curve)
		const n = segs.length
		if (n === 0) return curve

		const placeOf = (i: number) => {
			const index = (i + 1) % curve.vertices.length
			return {
				vertex: curve.vertices[index],
				context: {index, curve, curveIndex, path},
			}
		}

		// The amount for the joint at the end of each segment; 0 leaves the joint as it is
		const amounts = segs.map((_seg, i) => {
			const {vertex, context} = placeOf(i)
			if (readGroup && !readGroup(vertex, context)) return 0
			const value = readAmount(vertex, context)
			return typeof value === 'number' && value > 0 ? value : 0
		})

		const lengths = segs.map(seg => Segment.length(seg))
		const nextIndexOf = (i: number): number | null =>
			i + 1 < n ? i + 1 : curve.closed ? 0 : null
		const prevIndexOf = (i: number): number | null =>
			i > 0 ? i - 1 : curve.closed ? n - 1 : null

		// Which joints are corners decides how the segments between them are shared.
		// Joint i sits between segment i and segment nextIndexOf(i).
		const isCorner = segs.map((seg, i) => {
			const next = nextIndexOf(i)
			return (
				next !== null && amounts[i] > 0 && jointTurn(seg, segs[next]) !== null
			)
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
			return budget && next !== null
				? cut(seg, segs[next], budget, amounts[i], placeOf(i))
				: null
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
					const grown = cut(
						segs[i],
						segs[next],
						released,
						amounts[i],
						placeOf(i)
					)
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
			const trimmed = Segment.trim(
				seg,
				{time: startTime},
				{time: endTime},
				attrDefs
			)

			// Two corners meeting leave nothing in between
			if (Segment.length(trimmed) > 1e-6 * lengths[i]) {
				out.push(trimmed)
			}

			let start =
				out.length > 0
					? out[out.length - 1].point
					: Segment.point(seg, {time: startTime})
			let startAttrs =
				out.length > 0
					? out[out.length - 1].attrs
					: segmentAttrsAt(seg, startTime, attrDefs)
			const nextIndex = nextIndexOf(i)
			const inserted = cuts[i]?.vertices ?? []
			// The last inserted vertex lands on the next segment, at the end of the cut;
			// the ones on the way change evenly unless they say otherwise
			const cutStartAttrs = startAttrs
			const cutEndAttrs =
				nextIndex !== null
					? segmentAttrsAt(segs[nextIndex], cuts[i]?.v ?? 0, attrDefs)
					: undefined
			for (const [k, vertex] of inserted.entries()) {
				const attrs =
					vertex.attrs ??
					interpolateAttrs(
						cutStartAttrs,
						cutEndAttrs,
						(k + 1) / inserted.length,
						attrDefs
					)
				out.push({
					...vertex,
					start,
					...(startAttrs ? {startAttrs} : {}),
					...(attrs ? {attrs} : {}),
				} as Segment)
				start = vertex.point
				startAttrs = attrs
			}
		}

		if (out.length === 0) return curve

		const firstAttrs = out[0].startAttrs ? {attrs: out[0].startAttrs} : {}

		const vertices: Vertex[] = curve.closed
			? [
					{
						...segmentToVertex(out[out.length - 1]),
						point: out[0].start,
					} as Vertex,
					...out.slice(0, -1).map(segmentToVertex),
				]
			: [
					{point: out[0].start, command: 'L', ...firstAttrs},
					...out.map(segmentToVertex),
				]

		return {vertices, closed: curve.closed}
	})
}

/**
 * @category Options
 */
export interface ZigzagOptions {
	/**
	 * Draws waves instead of straight zigzags.
	 * @defaultValue false
	 */
	smooth?: boolean
	/**
	 * Shifts the zigzag along the path, in periods, so that animating it from 0 to 1 makes a seamless loop. A positive value moves the peaks backwards along the path. An open curve keeps its ends in place only when this is a multiple of 0.5; otherwise they follow the wave, so that no peak pops in or out at the ends.
	 * @defaultValue 0
	 */
	phase?: number
}

/** The ratio of a cubic's handle to its length, closest to half a period of a sine wave. */
const WAVE_HANDLE = 0.3642

/**
 * Makes the path zigzag along its normal. The peaks are evenly spaced along each curve, and a whole number of them fits: open curves keep their ends in place, and closed curves get an even number so that they stay closed.
 * @param path The path to make zigzag
 * @param amplitude The distance of the peaks from the path, towards its normal first. It can vary along the path, as the name of an attribute or a function of the vertex; the value between the vertices is interpolated.
 * @param wavelength The approximate length along the path of one period, of two peaks
 * @param options The options
 * @returns The new path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.circle([50, 50], 30)
 * stroke(p, 'skyblue')
 * stroke(Path.zigzag(p, 5, 12), 'tomato')
 * stroke(Path.zigzag(Path.circle([50, 50], 15), 3, 12, {smooth: true}), 'gold')
 * ```
 */
export function zigzag(
	path: Path,
	amplitude: AttributeLike<number>,
	wavelength: number,
	{smooth = false, phase = 0}: ZigzagOptions = {}
): Path {
	if (!(wavelength > 0)) return path

	const reads = typeof amplitude !== 'number'
	const name = '__zigzagAmplitude'
	const source = reads
		? setAttribute(completeVertexAttrs(path), name, amplitude)
		: completeVertexAttrs(path)
	const def =
		typeof amplitude === 'string' ? path.attrDefs?.[amplitude] : undefined
	const attrDefs = source.attrDefs

	const zigzagged = spawnCurve(source, (curve): Curve => {
		const length = Curve.length(curve)
		if (length === 0 || Curve.segments(curve).length === 0) return curve

		const count = curve.closed
			? Math.max(2, 2 * Math.round(length / wavelength))
			: Math.max(1, Math.round((2 * length) / wavelength))
		const spacing = length / count

		/** The place at the given unit, moved across the path by the amplitude there. */
		const placeAt = (unit: number, across: number) => {
			const {segment, time} = Curve.toTime(curve, {unit})
			const value = reads
				? interpolateValue(
						segment.startAttrs?.[name],
						segment.attrs?.[name],
						time,
						def
					)
				: amplitude
			const distance = (typeof value === 'number' ? value : 0) * across
			return {
				point:
					distance === 0
						? Segment.point(segment, {time})
						: vec2.scaleAndAdd(
								Segment.point(segment, {time}),
								unitNormalAt(segment, time),
								distance
							),
				tangent: unitTangentAt(segment, time),
				attrs: segmentAttrsAt(segment, time, attrDefs),
			}
		}

		// Peaks sit at (m + 0.5 - 2 * phase) / count for every integer m, alternating sides. On a
		// closed curve the count is even, so this wraps around seamlessly.
		const shift = 2 * phase
		const firstPeak = Math.ceil(shift - 0.5)
		const peaks = Array.from({length: count + 2}, (_, i) => firstPeak + i)
			.map(m => ({unit: (m + 0.5 - shift) / count, m}))
			.filter(({unit}) =>
				curve.closed ? unit >= 0 && unit < 1 : unit > 1e-9 && unit < 1 - 1e-9
			)
			.map(({unit, m}) => placeAt(unit, scalar.mod(m, 2) === 0 ? 1 : -1))

		const carried = (attrs: Attributes | undefined) => (attrs ? {attrs} : {})

		const segmentTo = (
			prev: {point: vec2; tangent?: vec2},
			next: {point: vec2; tangent?: vec2; attrs?: Attributes}
		): Vertex => {
			if (!smooth) {
				return {command: 'L', point: next.point, ...carried(next.attrs)}
			}
			const h = spacing * WAVE_HANDLE
			const inHandle = next.tangent
				? vec2.scaleAndAdd(next.point, next.tangent, -h)
				: vec2.lerp(next.point, prev.point, 1 / 3)
			const outHandle = prev.tangent
				? vec2.scaleAndAdd(prev.point, prev.tangent, h)
				: vec2.lerp(prev.point, inHandle, 1 / 3)
			return {
				command: 'C',
				args: [
					outHandle,
					next.tangent ? inHandle : vec2.lerp(next.point, outHandle, 1 / 3),
				],
				point: next.point,
				...carried(next.attrs),
			}
		}

		if (curve.closed) {
			return {
				closed: true,
				vertices: peaks.map((peak, i) =>
					segmentTo(peaks[(i + peaks.length - 1) % peaks.length], peak)
				),
			}
		}

		// The ends follow the wave: 0 at a whole number of half periods, as when there is no phase
		const waveAt = (unit: number) => {
			const x = scalar.mod((unit * count) / 2 + phase, 1)
			if (smooth) return Math.sin(x * 2 * Math.PI)
			return x < 0.25 ? 4 * x : x < 0.75 ? 2 - 4 * x : 4 * x - 4
		}
		const place = (unit: number) => {
			const {point, attrs} = placeAt(unit, waveAt(unit))
			return {point, attrs}
		}
		const start = place(0)
		const end = place(1)

		return {
			closed: false,
			vertices: [
				{command: 'L', point: start.point, ...carried(start.attrs)},
				...peaks.map((peak, i) =>
					segmentTo(i === 0 ? start : peaks[i - 1], peak)
				),
				segmentTo(peaks.length > 0 ? peaks[peaks.length - 1] : start, end),
			],
		}
	})

	return reads ? deleteAttribute(zigzagged, name, {level: 'vertex'}) : zigzagged
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
 * @param distance The distance of chamfer along each segment from the joint. It can vary per corner, as the name of an attribute or a function of the vertex at the corner.
 * @param options The options
 * @returns The newly created path
 * @category Modifiers
 */
export function chamfer(
	path: Path,
	distance: AttributeLike<number>,
	options: CornerOptions = {}
): Path {
	return cutCorners(path, distance, () => [], options)
}

/**
 * A corner being cut, passed to the function that fills the gap in {@link Path.cutCorners}.
 * @category Types
 */
export interface Corner {
	/** Where the incoming segment now ends */
	start: vec2
	/** The unit direction of the incoming segment at `start` */
	startTangent: vec2
	/** Where the outgoing segment now starts */
	end: vec2
	/** The unit direction of the outgoing segment at `end` */
	endTangent: vec2
	/** Where the tangents at `start` and `end` meet. It is the original point between straight segments, and falls back on it when the tangents do not meet ahead. */
	apex: vec2
	/** The original point of the corner */
	joint: vec2
	/** How much the path turns from `startTangent` to `endTangent`, in degrees */
	turn: number
	/** The vertex at the corner */
	vertex: Vertex
	/** Where the vertex is */
	context: VertexContext
}

function intersectRays(
	p0: vec2,
	d0: vec2,
	p1: vec2,
	d1: vec2
): {point: vec2; along0: number; along1: number} | null {
	const det = d0[0] * d1[1] - d0[1] * d1[0]
	if (Math.abs(det) < 1e-9) return null
	const dx = p1[0] - p0[0]
	const dy = p1[1] - p0[1]
	const along0 = (dx * d1[1] - dy * d1[0]) / det
	const along1 = (dx * d0[1] - dy * d0[0]) / det
	return {point: vec2.scaleAndAdd(p0, d0, along0), along0, along1}
}

/**
 * Cuts each corner by the same arc length along both segments, and fills the gap with what the given function returns. Chamfers and other corner shapes can be made on it. Smooth joints are left untouched. How much a corner can cut is capped as in {@link fillet}.
 * @param path The base path
 * @param trim The arc length to cut from each side, which can vary per corner
 * @param fill Returns the vertices from `corner.start` to `corner.end`. The last one is moved onto `corner.end` exactly, and a straight line is drawn when there are none.
 * @param options The options
 * @returns The new path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.rect([20, 20], [80, 80])
 * stroke(p, 'skyblue')
 * const notch = Path.cutCorners(p, 12, ({start, joint, end}) => [
 *   {command: 'L', point: vec2.lerp(vec2.lerp(start, end, 0.5), joint, -1)},
 *   {command: 'L', point: end},
 * ])
 * stroke(notch, 'tomato')
 * ```
 */
export function cutCorners(
	path: Path,
	trim: AttributeLike<number>,
	fill: (corner: Corner) => Vertex[],
	options: CornerOptions = {}
): Path {
	return cutJoints(
		path,
		trim,
		options,
		(seg, next, budget, amount, {vertex, context}) => {
			if (jointTurn(seg, next) === null || !(amount > 0)) return null

			const before = Math.min(amount, budget.before)
			const after = Math.min(amount, budget.after)
			const u = timeBeforeEnd(seg, before)
			const v = Segment.toTime(next, {offset: after})

			const start = Segment.point(seg, {time: u})
			const end = Segment.point(next, {time: v})
			const startTangent = unitTangentAt(seg, u)
			const endTangent = unitTangentAt(next, v)

			const hit = intersectRays(
				start,
				startTangent,
				end,
				vec2.negate(endTangent)
			)
			const ahead = hit !== null && hit.along0 > 0 && hit.along1 > 0

			const vertices = fill({
				start,
				startTangent,
				end,
				endTangent,
				apex: ahead ? hit.point : seg.point,
				joint: seg.point,
				turn: vec2.angle(startTangent, endTangent),
				vertex,
				context,
			})

			const last = vertices.at(-1)
			return {
				u,
				v,
				before,
				after,
				vertices: last
					? [...vertices.slice(0, -1), {...last, point: end} as Vertex]
					: [{command: 'L', point: end}],
			}
		}
	)
}

/**
 * @category Options
 */
export interface CornerCubicOptions extends CornerOptions {
	/**
	 * The length of the handles, relative to the distance from each cut to the point where the tangents meet. It is 0 for a chamfer, 2/3 for a parabola, 1 for a sharp tip and 2 for a cusp; beyond that the curve makes a loop. By default, it is the value closest to a circular arc, off by 0.03% of the radius at right angles and 0.3% at a turn of 135°.
	 */
	handle?: AttributeLike<number>
}

/**
 * Rounds corners by a cubic Bézier. Unlike {@link fillet} it is measured by the arc length to cut, and its handle length gives a family of shapes from a chamfer to a loop.
 * @param path The base path
 * @param trim The arc length to cut from each side, which can vary per corner
 * @param options The options
 * @returns The new path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.ngon([50, 50], 40, 5)
 * stroke(p, 'skyblue')
 * stroke(Path.cornerCubic(p, 10, {handle: 3}), 'tomato')
 * ```
 */
export function cornerCubic(
	path: Path,
	trim: AttributeLike<number>,
	{handle, group}: CornerCubicOptions = {}
): Path {
	const readHandle =
		handle === undefined ? null : resolveAttribute(handle, path)

	return cutCorners(
		path,
		trim,
		({start, end, apex, turn, vertex, context}) => {
			const given = readHandle?.(vertex, context)
			const k =
				typeof given === 'number' ? given : circularHandle(Math.abs(turn))
			return [
				{
					command: 'C',
					args: [vec2.lerp(start, apex, k), vec2.lerp(end, apex, k)],
					point: end,
				},
			]
		},
		{group}
	)
}

/** The ratio of a cubic's handle to the distance to the apex, closest to a circular arc. */
function circularHandle(turn: number): number {
	return (4 / 3) * (scalar.tan(turn / 4) / scalar.tan(turn / 2))
}

/**
 * @category Options
 */
export interface CornerShapeOptions extends CornerOptions {
	/**
	 * The maximum deviation allowed when approximating a shape by cubic Béziers
	 * @defaultValue 0.05
	 */
	tolerance?: number
}

/**
 * Shapes corners by a superellipse, as `superellipse()` of `corner-shape` in CSS: the curve `x^e + y^e = 1` with `e = 2^shape`, between the cuts, by two to six cubic Béziers per corner at the default tolerance.
 *
 * - `0` is a chamfer (`bevel`).
 * - `1` is an ellipse (`round`), which is a circular arc only at right angles. See {@link fillet} for an exact circle at any angle.
 * - `2` is a squircle.
 * - `-1` is a concave curve (`scoop`).
 * - `Infinity` keeps the corner (`square`), and `-Infinity` cuts it inwards (`notch`).
 * @param path The base path
 * @param trim The arc length to cut from each side, which can vary per corner
 * @param shape The parameter of the superellipse, which can vary per corner
 * @param options The options
 * @returns The new path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.rect([20, 20], [80, 80])
 * stroke(p, 'skyblue')
 * stroke(Path.cornerShape(p, 25, 2), 'tomato')
 * ```
 */
export function cornerShape(
	path: Path,
	trim: AttributeLike<number>,
	shape: AttributeLike<number> = 1,
	{group, tolerance = 0.05}: CornerShapeOptions = {}
): Path {
	const readShape = resolveAttribute(shape, path)

	return cutCorners(
		path,
		trim,
		({start, end, apex, vertex, context}) => {
			const value = readShape(vertex, context)
			const k = typeof value === 'number' ? value : 1

			if (k === 0) return []

			// The vertex of the parallelogram opposite to the apex is the center of the superellipse
			const center = vec2.sub(vec2.add(start, end), apex)

			if (isSuperellipseStraight(k)) {
				return [
					{command: 'L', point: k > 0 ? apex : center},
					{command: 'L', point: end},
				]
			}

			const toStart = vec2.sub(start, center)
			const toEnd = vec2.sub(end, center)

			if (k === 1) {
				const {args} = Arc.transform(
					{start: [1, 0], point: [0, 1], args: [[1, 1], 0, false, true]},
					[toStart[0], toStart[1], toEnd[0], toEnd[1], center[0], center[1]]
				)
				return [{command: 'A', args, point: end}]
			}

			// The most a distance in the unit frame stretches on the corner: the largest
			// singular value of the map
			const aa = vec2.dot(toStart, toStart)
			const bb = vec2.dot(toEnd, toEnd)
			const ab = vec2.dot(toStart, toEnd)
			const stretch = Math.sqrt((aa + bb + Math.hypot(aa - bb, 2 * ab)) / 2)
			const place = ([x, y]: vec2): vec2 => [
				center[0] + toStart[0] * x + toEnd[0] * y,
				center[1] + toStart[1] * x + toEnd[1] * y,
			]

			return superellipseCubics(k, tolerance / stretch).map(hull => ({
				command: 'C',
				args: [place(hull.args[0]), place(hull.args[1])],
				point: place(hull.point),
			}))
		},
		{group}
	)
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
 * @param radius The radius of fillet. It can vary per corner, as the name of an attribute or a function of the vertex at the corner.
 * @param options The options
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
export function fillet(
	path: Path,
	radius: AttributeLike<number>,
	options: CornerOptions = {}
): Path {
	return cutJoints(path, radius, options, (seg, next, budget, radius) =>
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
