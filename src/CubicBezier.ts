import {Bezier as BezierJS, Point} from 'bezier-js'
import {vec2} from 'linearly'

/**
 * A cubic Bezier curve, whose control points are specified in absolute coordinates.
 */
export type CubicBezier = readonly [
	start: vec2,
	control1: vec2,
	control2: vec2,
	end: vec2,
]

export type QuadraticBezier = readonly [start: vec2, control: vec2, end: vec2]

/**
 * A collection of functions to handle {@link CubicBezier}.
 */
export namespace CubicBezier {
	export const toBezierJS = memoizeCubicBezierFunction(
		(bezier: CubicBezier): BezierJS => {
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
	): CubicBezier {
		const [start, control, end] = quadraticBezier

		const control1 = vec2.lerp(start, control, 2 / 3)
		const control2 = vec2.lerp(end, control, 2 / 3)

		return [start, control1, control2, end]
	}

	/**
	 * Calculates the length of the Bezier curve. Length is calculated using numerical approximation, specifically the Legendre-Gauss quadrature algorithm.
	 */
	export const length = memoizeCubicBezierFunction(
		(bezier: CubicBezier): number => {
			const bezierJS = toBezierJS(bezier)
			return bezierJS.length()
		}
	)

	/**
	 * Calculates the bounding box of this Bezier curve.
	 */
	export const bound = memoizeCubicBezierFunction(
		(bezier: CubicBezier): [vec2, vec2] => {
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
	export function atT(bezier: CubicBezier, t: number): vec2 {
		const bezierJS = toBezierJS(bezier)
		const {x, y} = bezierJS.get(t)
		return [x, y]
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Note that this yields a not-normalized vector.
	 */
	export function derivative(bezier: CubicBezier, t: number): vec2 {
		const bezierJS = toBezierJS(bezier)
		const {x, y} = bezierJS.derivative(t)
		return [x, y]
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Unlike {@link derivative}, this yields a normalized vector.
	 */
	export function tangent(bezier: CubicBezier, t: number): vec2 {
		return vec2.normalize(derivative(bezier, t))
	}

	/**
	 * Calculates the curve normal at the specified `t` value. Note that this yields a normalized vector.
	 */
	export function normal(bezier: CubicBezier, t: number): vec2 {
		const bezierJS = toBezierJS(bezier)
		const {x, y} = bezierJS.normal(t)
		return [x, y]
	}

	/**
	 * Finds the on-curve point closest to the specific off-curve point
	 */
	export function project(
		bezier: CubicBezier,
		origin: vec2
	): {position: vec2; t?: number; distance?: number} {
		const bezierJS = toBezierJS(bezier)
		const {x, y, t, d} = bezierJS.project(toPoint(origin))
		return {position: [x, y], t, distance: d}
	}
}

function toPoint([x, y]: vec2): Point {
	return {x, y}
}

function memoizeCubicBezierFunction<T>(f: (bezier: CubicBezier) => T) {
	const cache = new WeakMap<
		vec2,
		WeakMap<vec2, WeakMap<vec2, WeakMap<vec2, T>>>
	>()

	return (bezier: CubicBezier): T => {
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
