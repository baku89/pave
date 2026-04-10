import {scalar, vec2} from 'linearly'
import paper from 'paper'

import {
	cubicArcLength,
	cubicAxisAlignedBounds,
	cubicOffsetHulls,
	cubicPointAt,
	cubicProject,
	getCubicDerivativeFn,
	trimCubicBetweenTimes,
} from './cubicBezierGeometry'
import {Iter} from './Iter'
import {SegmentLocation} from './Location'
import {ensurePaperScope} from './paperScope'
import {Path, VertexC} from './Path'
import {SegmentC} from './Segment'
import {memoize, normalizeOffset} from './utils'

/**
 * Almost equivalent to {@link SegmentC}, but the redundant `command` field can be omitted. Used for the argument of CubicBezier functions.
 * @category Types
 */
export type BareSegmentC = Omit<SegmentC, 'command'>

/**
 * A collection of functions to handle a cubic Bézier segment represented as {@link BareSegmentC}.
 * @category Modules
 */
export namespace CubicBezier {
	export function of(
		start: vec2,
		control1: vec2,
		control2: vec2,
		point: vec2
	): SegmentC {
		return {command: 'C', start, args: [control1, control2], point}
	}

	const toPaperBezier = memoize((beizer: BareSegmentC) => {
		ensurePaperScope()
		const {
			start: [x0, y0],
			args: [[x1, y1], [x2, y2]],
			point: [x3, y3],
		} = beizer

		return new paper.Curve(
			new paper.Point(x0, y0),
			new paper.Point(x1 - x0, y1 - y0),
			new paper.Point(x2 - x3, y2 - y3),
			new paper.Point(x3, y3)
		)
	})

	export function fromQuadraticBezier(
		start: vec2,
		control: vec2,
		point: vec2
	): SegmentC {
		const control1 = vec2.lerp(start, control, 2 / 3)
		const control2 = vec2.lerp(point, control, 2 / 3)

		return {command: 'C', start, args: [control1, control2], point}
	}

	/**
	 * Calculates the length of the Bezier curve. Length is calculated using numerical approximation, specifically the Legendre-Gauss quadrature algorithm.
	 */
	export const length = memoize((bezier: BareSegmentC): number => {
		return cubicArcLength(bezier)
	})

	/**
	 * Calculates the rect of this Bezier curve.
	 */
	export const bounds = memoize((bezier: BareSegmentC): [vec2, vec2] => {
		return cubicAxisAlignedBounds(bezier)
	})

	export function toTime(bezier: BareSegmentC, loc: SegmentLocation): number {
		if (typeof loc === 'number') {
			loc = {unit: loc}
		}

		if ('time' in loc) {
			return normalizeOffset(loc.time, 1)
		}

		const paperBezier = toPaperBezier(bezier)

		const offset = normalizeOffset(
			'unit' in loc ? loc.unit * paperBezier.length : loc.offset,
			paperBezier.length
		)

		return paperBezier.getTimeAt(offset)
	}

	/**
	 * Calculates the point on the curve at the specified `t` value.
	 */
	export function point(bezier: BareSegmentC, loc: SegmentLocation): vec2 {
		const t = toTime(bezier, loc)
		return cubicPointAt(bezier, t)
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Note that this yields a not-normalized vector.
	 */
	export function derivative(bezier: BareSegmentC, loc: SegmentLocation): vec2 {
		const time = toTime(bezier, loc)
		return getCubicDerivativeFn(bezier)(time)
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Unlike {@link derivative}, this yields a normalized vector.
	 */
	export function tangent(bezier: BareSegmentC, loc: SegmentLocation): vec2 {
		return vec2.normalize(derivative(bezier, loc))
	}

	/**
	 * Calculates the curve normal at the specified `t` value. Note that this yields a normalized vector.
	 */
	export function normal(bezier: BareSegmentC, loc: SegmentLocation): vec2 {
		return vec2.rotate(tangent(bezier, loc), 90)
	}

	/**
	 * Finds the on-curve point closest to the specific off-curve point
	 */
	export function project(
		bezier: BareSegmentC,
		origin: vec2
	): {position: vec2; t?: number; distance?: number} {
		const {position, t, distance} = cubicProject(bezier, origin)
		return {position, t, distance}
	}

	export function trim(
		bezier: BareSegmentC,
		start: SegmentLocation,
		end: SegmentLocation
	): SegmentC {
		let startTime = toTime(bezier, start)
		let endTime = toTime(bezier, end)

		if (startTime === 0 && endTime === 1) {
			// Early return if the curve is not trimmed
			return (
				'command' in bezier ? bezier : {...bezier, command: 'C'}
			) as SegmentC
		}

		// Make sure that startTime < endTime
		const shouldFlip = startTime > endTime
		if (shouldFlip) {
			;[startTime, endTime] = [endTime, startTime]
		}

		let [newStart, newC1, newC2, newEnd] = trimCubicBetweenTimes(
			bezier,
			startTime,
			endTime
		)

		// Flip back if necessary
		if (shouldFlip) {
			;[newStart, newC1, newC2, newEnd] = [newEnd, newC2, newC1, newStart]
		}

		return {
			command: 'C',
			start: newStart,
			args: [newC1, newC2],
			point: newEnd,
		}
	}

	export function divideAtTimes(
		segment: BareSegmentC,
		times: Iterable<number>
	): VertexC[] {
		times = [0, ...times, 1]

		const vertices: VertexC[] = []

		for (const [from, to] of Iter.pairwise(times)) {
			const [, c1, c2, point] = trimCubicBetweenTimes(segment, from, to)

			vertices.push({command: 'C', args: [c1, c2], point})
		}

		return vertices
	}

	export function isZero(bezier: BareSegmentC) {
		const {
			start,
			args: [c1, c2],
			point,
		} = bezier
		return (
			vec2.approx(start, point) &&
			vec2.approx(start, c1) &&
			vec2.approx(start, c2)
		)
	}

	export function isStraight(bezier: BareSegmentC) {
		if (isZero(bezier)) {
			return true
		}

		const {
			start,
			point,
			args: [c1, c2],
		} = bezier

		if (vec2.approx(start, c1) && vec2.approx(point, c2)) {
			// Both handles are zero-length
			return true
		}

		if (vec2.approx(start, point)) {
			// Zero-length line, with some handles defined
			return true
		}

		const sp = vec2.sub(point, start)
		const sc1 = vec2.sub(c1, start)
		const sc2 = vec2.sub(c2, start)

		const spLen = vec2.len(sp)

		// All of control points are on the line
		return (
			scalar.approx(vec2.angle(sp, sc1), 0) &&
			scalar.approx(vec2.angle(sp, sc2), 0) &&
			vec2.len(sc1) < spLen &&
			vec2.len(sc2) < spLen
		)
	}

	export function offset(bezier: BareSegmentC, distance: number): Path {
		const offsetHulls = cubicOffsetHulls(bezier, distance)

		const pen = Path.pen()

		if (offsetHulls.length === 0) {
			throw new Error('Offsetting a bezier curve failed')
		}

		const [x0, y0] = offsetHulls[0].start
		pen.M([x0, y0])

		for (const h of offsetHulls) {
			pen.C(h.args[0], h.args[1], h.point)
		}

		return pen.get()
	}
}
