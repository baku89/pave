import {mat2d, scalar, vec2} from 'linearly'
import {OffsetOptions as PaperOffsetOptions, PaperOffset} from 'paperjs-offset'

import {Arc} from '../Arc'
import {Curve} from '../Curve'
import {Iter} from '../Iter'
import type {PathLocation} from '../Location'
import type {Path, PathC, UnarcPath} from '../Path'
import {planarFlattenPath} from '../pathPlanar'
import {Segment} from '../Segment'
import {toTime} from './location'
import {fromPaperPath, toPaperPath} from './paper'
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
export interface OffsetOptions {
	/**
	 * The cap style of offset path
	 */
	cap?: PaperOffsetOptions['cap']
	/**
	 * The join style of offset path
	 * @defaultValue 'miter'
	 */
	lineJoin?: CanvasLineJoin
	/**
	 * The limit for miter style
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/miterLimit
	 * @defaultValue 10
	 */
	miterLimit?: number
}

/**
 * @category Options
 */
export interface OffsetStrokeOptions extends OffsetOptions {
	/**
	 * The cap style of offset path (`'square'` will be supported in future)
	 * @defaultValue 'butt'
	 */
	lineCap?: 'butt' | 'round'
}

/**
 * @category Options
 */
export interface DistortOptions {
	/**
	 * The angle step for approximating arc commands with cubic Béziers
	 * @default 5
	 */
	unarcAngle?: number
	/**
	 * The number of subdivision for each segment
	 * @default 1 (no subdivision applied)
	 */
	subdivide?: number
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
 * @param path
 * @param angle
 * @returns
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
export function unarc(path: Path, angle = 90): UnarcPath {
	return spawnVertex(path, (seg): (VertexL | VertexC)[] => {
		if (seg.command === 'A') {
			return Arc.approximateByCubicBeziers(seg, angle)
		} else {
			return [seg]
		}
	})
}

/**
 * Converts all commands in the path to cubic Bézier curve commands.
 * @param path The path to convert
 * @param unarcAngle The angle step for approximating arc commands with cubic Béziers
 * @returns The new path with only cubic Bézier curve commands
 * @category Modifiers
 */
export function toCubicBezier(path: Path, unarcAngle = 90): PathC {
	return spawnVertex(path, (seg): VertexC[] => {
		if (seg.command === 'C') {
			return [{point: seg.point, command: 'C', args: seg.args}]
		} else if (seg.command === 'A') {
			return Arc.approximateByCubicBeziers(seg, unarcAngle)
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
 * Creates an offset path from the given path.
 * @param path The path to offset
 * @param offset The width of offset
 * @param options The options
 * @returns The newly created path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.ngon([50, 50], 20, 5)
 * stroke(p, 'skyblue')
 * const po = Path.offset(p, 10, {lineJoin: 'round'})
 * stroke(po, 'tomato')
 * ```
 */
export function offset(
	path: Path,
	offset: number,
	options?: OffsetOptions
): Path {
	const paperPath = toPaperPath(path)

	const _options: PaperOffsetOptions = {
		cap: options?.cap,
		join: options?.lineJoin,
		limit: options?.miterLimit,
	}

	return fromPaperPath(PaperOffset.offset(paperPath, offset, _options))
}

/**
 * Creates an offset path from the given path.
 * @param path The path to offset
 * @param width The width of stroke
 * @param options The options
 * @returns The newly created path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.ngon([50, 50], 20, 5)
 * stroke(p, 'skyblue')
 * const po = Path.offsetStroke(p, 20, {lineJoin: 'round'})
 * stroke(po, 'tomato')
 * ```
 */
export function offsetStroke(
	path: Path,
	width: number,
	options?: OffsetStrokeOptions
) {
	const paperPath = toPaperPath(path)

	const _options: PaperOffsetOptions = {
		join: options?.lineJoin,
		cap: options?.lineCap,
		limit: options?.miterLimit,
	}

	return fromPaperPath(PaperOffset.offsetStroke(paperPath, width / 2, _options))
}

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
 * Flattens the curves in path to straight lines (recursive midpoint split until chord / hull deviation ≤ `flatness`).
 * @param path The path to flatten
 * @param flatness The maximum distance between the path and the flattened path
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
export function flatten(path: Path, flatness = 0.25): Path {
	return planarFlattenPath(path, flatness)
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
 * Distorts path by the given transformation function.  It assumes that the continuity of transformation is smooth in the spatial domain and has no singularities or cusps.
 * @param path The path to distort
 * @param transform The distort function that maps a point coordinate to a transformation matrix. The translation component is absolute, and affects points of Bézier curves. The rotation, scaling, and skewing components affect the orientation of two handles.
 * @returns The newly created path
 * @category Modifiers
 *
 * @example
 * ```js:pave
 * let p = Path.line([10, 50], [90, 50])
 * stroke(p, 'skyblue')
 *
 * const wave = (freq, width) => ([x, y]) => {
 *   const phase = x * freq
 *   return [
 *     1, scalar.cos(phase) * width * freq,
 *     0, 1,
 *     x, y + scalar.sin(phase) * width
 *   ]
 * }
 *
 * debug(Path.distort(p, wave(.2, 10), {subdivide: 10}))
 * ```
 */
export function distort(
	path: Path,
	transform: (position: vec2) => mat2d,
	{unarcAngle = 5, subdivide: subdivideN = 1}: DistortOptions = {}
) {
	return spawnVertex(
		toCubicBezier(subdivide(path, subdivideN), unarcAngle),
		(segment): Vertex[] => {
			let [c1, c2] = segment.args
			const startXform = transform(segment.start)
			const endXform = transform(segment.point)

			c1 = vec2.transformMat2d(vec2.sub(c1, segment.start), startXform)
			c2 = vec2.transformMat2d(vec2.sub(c2, segment.point), endXform)

			const point: vec2 = [endXform[4], endXform[5]]

			return [{point, command: 'C', args: [c1, c2]}]
		}
	)
}

/**
 * Chamfers the given path.
 * @param path The path to chamfer
 * @param distance The distance of chamfer
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
 * Fillets the given path.
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

		// NOTE: This assumes the two segments are straight lines. It should be improved to handle curves.
		const angle = Math.abs(
			vec2.angle(Segment.tangent(seg, 1), Segment.tangent(next, 0))
		)

		const trimLength = radius * scalar.tan(angle / 2)

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
