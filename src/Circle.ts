import {vec2} from 'linearly'

/**
 * A circle represented as a tuple of a center and a radius.
 * @category Type Aliases
 */
export type Circle = readonly [center: vec2, radius: number]

/**
 * Functions for manipulating circles represented as {@link Circle}.
 */
export namespace Circle {
	/**
	 * Returns the circumscribed circle of the given triangle.
	 * @param a The first point of the triangle
	 * @param b The second point of the triangle
	 * @param c The third point of the triangle
	 * @returns The circumscribed circle of the given triangle
	 */
	export function circumcircle(a: vec2, b: vec2, c: vec2): Circle {
		const d =
			2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
		const center = vec2.scale(
			vec2.add(
				vec2.mul(vec2.add(a, b), vec2.sub(b, c)),
				vec2.mul(vec2.add(b, c), vec2.sub(c, a)),
				vec2.mul(vec2.add(c, a), vec2.sub(a, b))
			),
			d
		)
		const radius = vec2.dist(center, a)
		return [center, radius]
	}
}
