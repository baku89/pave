import {Bezier as BezierJS, Point} from 'bezier-js'
import {vec2} from 'linearly'

import {VertexC} from './Path'
import {SegmentC} from './Segment'
import {memoizeSegmentFunction} from './utils'

/**
 * A collection of functions to handle a cubic bezier represented with {@link CommandC}.
 */
export namespace CubicBezier {
	export const toBezierJS = memoizeSegmentFunction(
		(bezier: SegmentC): BezierJS => {
			const {
				start,
				command: [, control1, control2],
				end,
			} = bezier
			return new BezierJS(
				start[0],
				start[1],
				control1[0],
				control1[1],
				control2[0],
				control2[1],
				end[0],
				end[1]
			)
		}
	)

	export function fromQuadraticBezier(
		start: vec2,
		control: vec2,
		end: vec2
	): SegmentC {
		const control1 = vec2.lerp(start, control, 2 / 3)
		const control2 = vec2.lerp(end, control, 2 / 3)

		return {start, command: ['C', control1, control2], end}
	}

	/**
	 * Calculates the length of the Bezier curve. Length is calculated using numerical approximation, specifically the Legendre-Gauss quadrature algorithm.
	 */
	export const length = memoizeSegmentFunction((bezier: SegmentC): number => {
		const bezierJS = toBezierJS(bezier)
		return bezierJS.length()
	})

	/**
	 * Calculates the rect of this Bezier curve.
	 */
	export const bounds = memoizeSegmentFunction(
		(bezier: SegmentC): [vec2, vec2] => {
			const bezierJS = toBezierJS(bezier)
			const {x, y} = bezierJS.bbox()

			return [
				[x.min, y.min],
				[x.max, y.max],
			]
		}
	)

	/**
	 * Calculates the point on the curve at the specified `t` value.
	 */
	export function pointAtTime(bezier: SegmentC, t: number): vec2 {
		const {
			start,
			command: [, control1, control2],
			end,
		} = bezier
		const x =
			(1 - t) ** 3 * start[0] +
			3 * (1 - t) ** 2 * t * control1[0] +
			3 * (1 - t) * t ** 2 * control2[0] +
			t ** 3 * end[0]
		const y =
			(1 - t) ** 3 * start[1] +
			3 * (1 - t) ** 2 * t * control1[1] +
			3 * (1 - t) * t ** 2 * control2[1] +
			t ** 3 * end[1]

		return [x, y]
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Note that this yields a not-normalized vector.
	 */
	export function derivativeAtTime(bezier: SegmentC, t: number): vec2 {
		const bezierJS = toBezierJS(bezier)
		const {x, y} = bezierJS.derivative(t)
		return [x, y]
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Unlike {@link derivativeAtTime}, this yields a normalized vector.
	 */
	export function tangentAtTime(bezier: SegmentC, t: number): vec2 {
		return vec2.normalize(derivativeAtTime(bezier, t))
	}

	/**
	 * Calculates the curve normal at the specified `t` value. Note that this yields a normalized vector.
	 */
	export function normalAtTime(bezier: SegmentC, t: number): vec2 {
		const bezierJS = toBezierJS(bezier)
		const {x, y} = bezierJS.normal(t)
		return [x, y]
	}

	/**
	 * Finds the on-curve point closest to the specific off-curve point
	 */
	export function project(
		bezier: SegmentC,
		origin: vec2
	): {position: vec2; t?: number; distance?: number} {
		const bezierJS = toBezierJS(bezier)
		const {x, y, t, d} = bezierJS.project(toPoint(origin))
		return {position: [x, y], t, distance: d}
	}

	export function divideAtTimes(segment: SegmentC, times: number[]): VertexC[] {
		const bezier = toBezierJS(segment)

		const vertices: VertexC[] = []

		times = [0, ...times, 1]

		for (let i = 1; i < times.length; i++) {
			const from = times[i - 1]
			const to = times[i]

			const points = bezier.split(from, to).points

			const [c1, c2, point] = points.slice(1).map(({x, y}) => [x, y] as vec2)

			vertices.push({command: ['C', c1, c2], point})
		}

		return vertices
	}
}

function toPoint([x, y]: vec2): Point {
	return {x, y}
}
