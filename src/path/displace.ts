/**
 * Displacement of a path in the local frame of its tangent and normal, from which waves, coils,
 * scallops and the like can be made. The result is fitted by cubic Béziers between the points
 * where it can have a corner: the joints of the source, and the breaks given by the caller.
 */
import {vec2} from 'linearly'

import {completeVertexAttrs, segmentAttrsAt} from '../attributes'
import {Curve, type Path, Segment} from '../index'
import {fitVertices, unitNormalAt, unitTangentAt} from '../parallelCurve'
import {spawnCurve} from './modifiers'
import type {Attributes, Vertex} from './types'

/**
 * Where a point being displaced is, passed to the function of {@link Path.displace}.
 * @category Types
 */
export interface DisplaceContext {
	/** The point on the path */
	point: vec2
	/** The unit direction of the path */
	tangent: vec2
	/** The unit normal of the path */
	normal: vec2
	/** The arc length of the curve */
	length: number
	/** The curve being displaced */
	curve: Curve
	curveIndex: number
	/** The attributes of the vertices, interpolated here */
	attrs: Attributes | undefined
}

/**
 * @category Options
 */
export interface DisplaceOptions {
	/**
	 * The maximum deviation allowed when approximating the result by cubic Béziers
	 * @defaultValue 0.05
	 */
	tolerance?: number
	/**
	 * The units on each curve where the displacement has a corner, such as the peak of a triangular wave. A corner can only appear exactly on one of them, or on a joint of the path.
	 */
	breaks?: Iterable<number>
}

const DENSE_SAMPLES = 512

/** Where the fitted pieces should end at the latest, in the angle the curve turns by. */
const MAX_TURN = (2 * Math.PI) / 3

/**
 * Displaces the path in the local frame of its tangent and normal. Each point moves by what the given function returns: along the tangent, and across towards the normal. This is the base of waves, coils and scallops.
 *
 * Where the source has a corner, the frame jumps, so the two sides are connected by a straight line. A closed curve is closed the same way if the displacement does not return to the same value.
 * @param path The path to displace
 * @param displacement Takes the unit along the curve (by arc length, from 0 to 1) and where it is, and returns `[along, across]`
 * @param options The options
 * @returns The new path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.circle([50, 50], 30)
 * stroke(p, 'skyblue')
 * const wave = u => [0, 4 * Math.sin(u * 8 * 2 * Math.PI)]
 * stroke(Path.displace(p, wave), 'tomato')
 * const coil = u => {
 *   const a = u * 24 * 2 * Math.PI
 *   return [3 * Math.cos(a), 3 * Math.sin(a)]
 * }
 * stroke(Path.displace(Path.circle([50, 50], 15), coil), 'gold')
 * ```
 */
export function displace(
	path: Path,
	displacement: (
		u: number,
		context: DisplaceContext
	) => readonly [number, number],
	{tolerance = 0.05, breaks = []}: DisplaceOptions = {}
): Path {
	const fitTolerance = Math.max(tolerance, 1e-9)
	const userBreaks = [...breaks]
	const source = completeVertexAttrs(path)
	const attrDefs = source.attrDefs

	return spawnCurve(source, (curve, curveIndex): Curve => {
		const segments = Curve.segments(curve).filter(s => !Segment.isZero(s))
		const length = segments.reduce((sum, s) => sum + Segment.length(s), 0)
		if (length === 0) return curve

		const vertices: Vertex[] = []
		let walked = 0
		const pieces = segments.map(segment => {
			const size = Segment.length(segment)
			const piece = {segment, from: walked / length, size}
			walked += size
			return piece
		})

		for (const {segment, from, size} of pieces) {
			const to = from + size / length

			const timeOf = (u: number) =>
				Segment.toTime(segment, {
					offset: Math.min(Math.max((u - from) * length, 0), size),
				})

			const place = (u: number): vec2 => {
				const time = timeOf(u)
				const point = Segment.point(segment, {time})
				const tangent = unitTangentAt(segment, time)
				const normal = unitNormalAt(segment, time)
				const [along, across] = displacement(u, {
					point,
					tangent,
					normal,
					length,
					curve,
					curveIndex,
					attrs: segmentAttrsAt(segment, time, attrDefs),
				})
				return [
					point[0] + tangent[0] * along + normal[0] * across,
					point[1] + tangent[1] * along + normal[1] * across,
				]
			}

			const attrsAt = (u: number) =>
				segmentAttrsAt(segment, timeOf(u), attrDefs)

			for (const [u0, u1] of spansOf(place, from, to, userBreaks)) {
				const h = (u1 - u0) * 1e-3
				const curveOf = {
					point: place,
					direction: (u: number): vec2 => {
						const lo = Math.max(u - h, u0)
						const hi = Math.min(u + h, u1)
						const d = vec2.sub(place(hi), place(lo))
						return vec2.len(d) > 0
							? vec2.normalize(d)
							: unitTangentAt(segment, timeOf(u))
					},
				}

				const start = place(u0)
				const last = vertices.at(-1)
				if (!last || vec2.distance(last.point, start) > fitTolerance * 1e-3) {
					const attrs = attrsAt(u0)
					vertices.push({
						command: 'L',
						point: start,
						...(attrs ? {attrs} : {}),
					})
				}
				vertices.push(...fitVertices(curveOf, u0, u1, fitTolerance, attrsAt))
			}
		}

		if (!curve.closed) return {vertices, closed: false}

		// The chain starts with a line to its first point, which becomes the closing segment
		const first = vertices[0]
		const last = vertices[vertices.length - 1]
		if (vec2.distance(first.point, last.point) <= fitTolerance * 1e-3) {
			return {
				vertices: [
					{...last, point: first.point} as Vertex,
					...vertices.slice(1, -1),
				],
				closed: true,
			}
		}
		return {vertices, closed: true}
	})
}

/**
 * Cuts a range into spans for the fitting: at the given breaks, and wherever the curve has turned
 * too much for one cubic, so that fast waves are not lost between the samples of a fit.
 */
function spansOf(
	place: (u: number) => vec2,
	from: number,
	to: number,
	breaks: number[]
): [number, number][] {
	const count = Math.max(8, Math.ceil(DENSE_SAMPLES * (to - from)))
	const stops = [from]

	let turned = 0
	let previous = place(from)
	let direction: vec2 | null = null
	for (let i = 1; i < count; i++) {
		const u = from + ((to - from) * i) / count
		const point = place(u)
		const step = vec2.sub(point, previous)
		if (vec2.len(step) > 0) {
			if (direction) {
				turned += Math.abs(
					Math.atan2(
						direction[0] * step[1] - direction[1] * step[0],
						direction[0] * step[0] + direction[1] * step[1]
					)
				)
			}
			direction = step
			if (turned > MAX_TURN) {
				stops.push(u)
				turned = 0
			}
		}
		previous = point
	}

	const all = [...stops, ...breaks.filter(b => b > from && b < to), to].sort(
		(a, b) => a - b
	)

	const spans: [number, number][] = []
	for (let i = 0; i + 1 < all.length; i++) {
		if (all[i + 1] - all[i] > 1e-9) spans.push([all[i], all[i + 1]])
	}
	return spans
}
