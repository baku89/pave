import {Bezier as BezierJS, Point} from 'bezier-js'
import {scalar, vec2} from 'linearly'
import paper from 'paper'

import {SegmentLocation} from './Location'
import {VertexC} from './Path'
import {SegmentC} from './Segment'
import {memoize, PartialBy} from './utils'

/**
 * Almost equivalent to {@link SegmentC}, but the redundant `command` field can be ommited. Used for the argument of CubicBezier functions.
 */
type SimpleSegmentC = PartialBy<SegmentC, 'command'>

/**
 * A collection of functions to handle a cubic bezier represented with {@link SimpleSegment}.
 */
export namespace CubicBezier {
	export function of(start: vec2, control1: vec2, control2: vec2, point: vec2) {
		return {command: 'C', start, args: [control1, control2], point}
	}

	export const toPaperBezier = memoize((beizer: SimpleSegmentC) => {
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
	export const length = memoize((bezier: SimpleSegmentC): number => {
		const bezierJS = toBezierJS(bezier)
		return bezierJS.length()
	})

	/**
	 * Calculates the rect of this Bezier curve.
	 */
	export const bounds = memoize((bezier: SimpleSegmentC): [vec2, vec2] => {
		const bezierJS = toBezierJS(bezier)
		const {x, y} = bezierJS.bbox()

		return [
			[x.min, y.min],
			[x.max, y.max],
		]
	})

	export function toTime(bezier: SimpleSegmentC, loc: SegmentLocation): number {
		if (typeof loc === 'number') {
			return scalar.clamp(loc, 0, 1)
		} else if ('time' in loc) {
			return scalar.clamp(loc.time, 0, 1)
		}

		const paperBezier = toPaperBezier(bezier)

		if ('unit' in loc) {
			loc = {offset: loc.unit * paperBezier.length}
		}

		if (loc.offset < 0) {
			return 0
		} else if (loc.offset > paperBezier.length) {
			return 1
		}

		return paperBezier.getTimeAt(loc.offset)
	}

	/**
	 * Calculates the point on the curve at the specified `t` value.
	 */
	export function point(bezier: SimpleSegmentC, loc: SegmentLocation): vec2 {
		const t = toTime(bezier, loc)

		const {
			start,
			args: [control1, control2],
			point,
		} = bezier
		const x =
			(1 - t) ** 3 * start[0] +
			3 * (1 - t) ** 2 * t * control1[0] +
			3 * (1 - t) * t ** 2 * control2[0] +
			t ** 3 * point[0]
		const y =
			(1 - t) ** 3 * start[1] +
			3 * (1 - t) ** 2 * t * control1[1] +
			3 * (1 - t) * t ** 2 * control2[1] +
			t ** 3 * point[1]

		return [x, y]
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Note that this yields a not-normalized vector.
	 */
	export function derivative(
		bezier: SimpleSegmentC,
		loc: SegmentLocation
	): vec2 {
		const time = toTime(bezier, loc)

		const derivativeFn = getDerivativeFn(bezier)

		return derivativeFn(time)
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Unlike {@link derivative}, this yields a normalized vector.
	 */
	export function tangent(bezier: SimpleSegmentC, loc: SegmentLocation): vec2 {
		return vec2.normalize(derivative(bezier, loc))
	}

	/**
	 * Calculates the curve normal at the specified `t` value. Note that this yields a normalized vector.
	 */
	export function normal(bezier: SimpleSegmentC, loc: SegmentLocation): vec2 {
		return vec2.rotate(tangent(bezier, loc), 90)
	}

	/**
	 * Finds the on-curve point closest to the specific off-curve point
	 */
	export function project(
		bezier: SimpleSegmentC,
		origin: vec2
	): {position: vec2; t?: number; distance?: number} {
		const bezierJS = toBezierJS(bezier)
		const {x, y, t, d} = bezierJS.project(toPoint(origin))
		return {position: [x, y], t, distance: d}
	}

	export function trim(
		bezier: SimpleSegmentC,
		start: SegmentLocation,
		end: SegmentLocation
	): SegmentC {
		let startTime = toTime(bezier, start)
		let endTime = toTime(bezier, end)

		if (startTime === 0 && endTime === 1) {
			return (
				'command' in bezier ? bezier : {...bezier, command: 'C'}
			) as SegmentC
		}

		// Make sure that startTime < endTime
		const shouldFlip = startTime > endTime
		if (shouldFlip) {
			;[startTime, endTime] = [endTime, startTime]
		}

		// Trim to [0, 1] -> [startTime, 1]
		let newStart: vec2, midC1: vec2, midC2: vec2

		if (startTime === 0) {
			newStart = bezier.start
			;[midC1, midC2] = bezier.args
		} else {
			;[, , newStart, midC1, midC2] = splitCubicBezierAtTime(bezier, startTime)
		}

		// Trim to [startTime, 1] -> [startTime, endTime]
		let newC1: vec2, newC2: vec2, newEnd: vec2

		if (endTime === 1) {
			newEnd = bezier.point
			;[newC1, newC2] = [midC1, midC2]
		} else {
			;[newC1, newC2, newEnd] = splitCubicBezierAtTime(
				{start: newStart, args: [midC1, midC2], point: bezier.point},
				scalar.invlerp(startTime, 1, endTime)
			)
		}

		// Flip back if necessary
		if (shouldFlip) {
			;[newStart, newEnd] = [newEnd, newStart]
			;[newC1, newC2] = [newC2, newC1]
		}

		return {command: 'C', start: newStart, args: [newC1, newC2], point: newEnd}
	}

	export function divideAtTimes(
		segment: SimpleSegmentC,
		times: number[]
	): VertexC[] {
		times = [0, ...times, 1]

		const vertices: VertexC[] = []

		for (let i = 1; i < times.length; i++) {
			const from = times[i - 1]
			const to = times[i]

			vertices.push(trim(segment, from, to))
		}

		return vertices
	}

	export function isZero(bezier: SimpleSegmentC) {
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
}

function toPoint([x, y]: vec2): Point {
	return {x, y}
}

const getDerivativeFn = memoize((bezier: SimpleSegmentC) => {
	// https://github.com/paperjs/paper.js/blob/develop/src/path/Curve.js#L1403-L1424

	// Calculate the coefficients of a Bezier derivative.
	const {
		start: [x0, y0],
		args: [[x1, y1], [x2, y2]],
		point: [x3, y3],
	} = bezier

	const ax = 9 * (x1 - x2) + 3 * (x3 - x0),
		bx = 6 * (x0 + x2) - 12 * x1,
		cx = 3 * (x1 - x0),
		ay = 9 * (y1 - y2) + 3 * (y3 - y0),
		by = 6 * (y0 + y2) - 12 * y1,
		cy = 3 * (y1 - y0)

	return (time: number): vec2 => {
		// Calculate quadratic equations of derivatives for x and y
		const dx = (ax * time + bx) * time + cx,
			dy = (ay * time + by) * time + cy
		return [dx, dy]
	}
})

function splitCubicBezierAtTime(
	bezier: SimpleSegmentC,
	time: number
): [
	newControl1: vec2,
	inControl: vec2,
	midPoint: vec2,
	outControl: vec2,
	newControl2: vec2,
] {
	// Use de Casteljau's algorithm
	// https://pomax.github.io/bezierinfo/#splitting

	const [c1, c2] = bezier.args

	// Find the start point and c1
	const newControl1 = vec2.lerp(bezier.start, c1, time)
	const p12 = vec2.lerp(c1, c2, time)
	const newControl2 = vec2.lerp(c2, bezier.point, time)

	const inControl = vec2.lerp(newControl1, p12, time)
	const outControl = vec2.lerp(p12, newControl2, time)

	const midPoint = vec2.lerp(inControl, outControl, time)

	return [newControl1, inControl, midPoint, outControl, newControl2]
}

const toBezierJS = memoize((bezier: SimpleSegmentC): BezierJS => {
	const {
		start,
		args: [control1, control2],
		point,
	} = bezier
	return new BezierJS(
		start[0],
		start[1],
		control1[0],
		control1[1],
		control2[0],
		control2[1],
		point[0],
		point[1]
	)
})
