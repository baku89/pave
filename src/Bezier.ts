import {Bezier as BezierJS, Point} from 'bezier-js'
import {vec2} from 'linearly'

/**
 * A cubic Bezier curve, whose control points are specified in absolute coordinates.
 * @category Type Aliases
 */
export type Bezier = readonly [
	start: vec2,
	control1: vec2,
	control2: vec2,
	end: vec2,
]

export type QuadraticBezier = readonly [start: vec2, control: vec2, end: vec2]

/**
 * A collection of functions to handle {@link Bezier}.
 */
export namespace Bezier {
	export const toBezierJS = memoizeBezierFunction(
		(bezier: Bezier): BezierJS => {
			const [start, control1, control2, end] = bezier
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
		quadraticBezier: QuadraticBezier
	): Bezier {
		const [start, control, end] = quadraticBezier

		const control1 = vec2.lerp(start, control, 2 / 3)
		const control2 = vec2.lerp(end, control, 2 / 3)

		return [start, control1, control2, end]
	}

	/**
	 * Calculates the length of the Bezier curve. Length is calculated using numerical approximation, specifically the Legendre-Gauss quadrature algorithm.
	 */
	export const length = memoizeBezierFunction((bezier: Bezier): number => {
		const bezierJS = toBezierJS(bezier)
		return bezierJS.length()
	})

	/**
	 * Calculates the bounding box of this Bezier curve.
	 */
	export const bounds = memoizeBezierFunction(
		(bezier: Bezier): [vec2, vec2] => {
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
	export function pointAtTime(bezier: Bezier, t: number): vec2 {
		const [start, control1, control2, end] = bezier
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
	export function derivativeAtTime(bezier: Bezier, t: number): vec2 {
		const bezierJS = toBezierJS(bezier)
		const {x, y} = bezierJS.derivative(t)
		return [x, y]
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Unlike {@link derivativeAtTime}, this yields a normalized vector.
	 */
	export function tangentAtTime(bezier: Bezier, t: number): vec2 {
		return vec2.normalize(derivativeAtTime(bezier, t))
	}

	/**
	 * Calculates the curve normal at the specified `t` value. Note that this yields a normalized vector.
	 */
	export function normalAtTime(bezier: Bezier, t: number): vec2 {
		const bezierJS = toBezierJS(bezier)
		const {x, y} = bezierJS.normal(t)
		return [x, y]
	}

	/**
	 * Finds the on-curve point closest to the specific off-curve point
	 */
	export function project(
		bezier: Bezier,
		origin: vec2
	): {position: vec2; t?: number; distance?: number} {
		const bezierJS = toBezierJS(bezier)
		const {x, y, t, d} = bezierJS.project(toPoint(origin))
		return {position: [x, y], t, distance: d}
	}

	/**
	 * Approximates the given circular arc with a single cubic Bezier curve.
	 * @param center The center of the arc
	 * @param radius The radius of the arc
	 * @param angles The start and end angles of the arc, in radians
	 * @returns A cubic Bezier curve approximating the arc
	 */
	export function unarc(center: vec2, radius: number, angles: vec2): Bezier {
		const [startAngle, endAngle] = angles

		const theta = endAngle - startAngle
		const k = (4 / 3) * Math.tan(theta / 4)

		const start = vec2.add(center, vec2.direction(startAngle, radius))
		const end = vec2.add(center, vec2.direction(endAngle, radius))

		const control1 = vec2.add(center, vec2.direction(startAngle + Math.PI, k))
		const control2 = vec2.add(center, vec2.direction(endAngle + Math.PI, k))

		return [start, control1, control2, end]
	}
}

function toPoint([x, y]: vec2): Point {
	return {x, y}
}

function memoizeBezierFunction<T>(f: (bezier: Bezier) => T) {
	const cache = new WeakMap<
		vec2,
		WeakMap<vec2, WeakMap<vec2, WeakMap<vec2, T>>>
	>()

	return (bezier: Bezier): T => {
		const [start, control1, control2, end] = bezier

		if (!cache.has(start)) {
			cache.set(start, new WeakMap())
		}

		const cache1 = cache.get(start)!

		if (!cache1.has(control1)) {
			cache1.set(control1, new WeakMap())
		}

		const cache2 = cache1.get(control1)!

		if (!cache2.has(control2)) {
			cache2.set(control2, new WeakMap())
		}

		const cache3 = cache2.get(control2)!

		if (!cache3.has(end)) {
			cache3.set(end, f(bezier))
		}

		return cache3.get(end)!
	}
}
