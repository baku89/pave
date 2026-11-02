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
 * Chamfers the path by replacing each internal corner with a straight cut.
 * Distances are measured along segment arc length (line, cubic, or arc).
 * @param path The path to chamfer
 * @param distance The distance of chamfer along each segment from the joint
 * @returns The newly created path
 * @category Modifiers
 */
export function chamfer(path: Path, distance: number): Path {
	return spawnVertex(path, (seg, index, curve) => {
		const next = Curve.nextSegment(curve, index)

		if (!next || index === -1) {
			return seg
		}

		const point = Segment.point(next, {offset: distance})

		return [Segment.trim(seg, 0, {offset: -distance}), {command: 'L', point}]
	})
}

/**
 * Fillets internal corners with a cubic that approximates a circular arc of the given radius.
 * Trims are arc-length along each segment; the wedge angle is refit once using tangents at
 * the trim points so curved segments behave better than a pure vertex-tangent estimate.
 * @param path The path to fillet
 * @param radius The radius of fillet
 * @returns The newly created path
 * @category Modifiers
 */
export function fillet(path: Path, radius: number): Path {
	return spawnVertex(path, (seg, index, curve) => {
		const next = Curve.nextSegment(curve, index)

		if (!next || index === -1) {
			return seg
		}

		const tJoint0 = Segment.tangent(seg, 1)
		const tJoint1 = Segment.tangent(next, 0)
		let angle = Math.abs(vec2.angle(tJoint0, tJoint1))
		let trimLength = radius * scalar.tan(angle / 2)

		angle = Math.abs(
			vec2.angle(
				Segment.tangent(seg, {offset: -trimLength}),
				vec2.neg(Segment.tangent(next, {offset: trimLength}))
			)
		)
		trimLength = radius * scalar.tan(angle / 2)

		const start = Segment.point(seg, {offset: -trimLength})
		const end = Segment.point(next, {offset: trimLength})
		const startTangent = Segment.tangent(seg, {offset: -trimLength})
		const endTangent = Segment.tangent(next, {offset: trimLength})

		const handleLength = (4 / 3) * scalar.tan(angle / 4) * radius

		const c1 = vec2.scaleAndAdd(start, startTangent, handleLength)
		const c2 = vec2.scaleAndAdd(end, endTangent, -handleLength)

		return [
			Segment.trim(seg, 0, {offset: -trimLength}),
			{command: 'C', args: [c1, c2], point: end},
		]
	})
}
