/**
 * Spirals, whose exact curves have no cubic form: they are fitted piece by piece within a
 * tolerance. Pieces first are split so that each turns by a quarter at most, which a cubic
 * follows well, and the fit subdivides further only where it needs to.
 */
import {vec2} from 'linearly'

import type {Path} from '../index'
import {gaussLegendre} from '../numeric'
import {fitVertices} from '../parallelCurve'
import {dot, line} from './primitives'
import type {Vertex} from './types'

/**
 * The options for {@link spiral}
 * @category Options
 */
export interface SpiralOptions {
	/**
	 * The angle at the start in degrees, in which 0° is +X and the angle increases clockwise on a Y-down canvas.
	 * @default 0
	 */
	startAngle?: number
	/**
	 * How the radius changes along the angle. `'archimedean'` grows by the same amount for each turn, like a coil of rope, so that the gaps stay even. `'logarithmic'` grows by the same ratio, like a nautilus shell, so that the shape looks the same at any scale, and both radii must be positive.
	 * @default 'archimedean'
	 */
	type?: 'archimedean' | 'logarithmic'
	/**
	 * The largest distance allowed from the exact curve.
	 * @default 0.05
	 */
	tolerance?: number
}

/**
 * The options for {@link clothoid}
 * @category Options
 */
export interface ClothoidOptions {
	/**
	 * The largest distance allowed from the exact curve.
	 * @default 0.05
	 */
	tolerance?: number
}

const TAU = Math.PI * 2
const QUARTER = Math.PI / 2

/**
 * Creates a spiral around a point.
 * @param center The center of the spiral
 * @param startRadius The radius at the start
 * @param endRadius The radius at the end
 * @param turns The number of the turns, which can be fractional. A positive value runs towards increasing angles, which is clockwise on a Y-down canvas, and a negative one runs the other way.
 * @param options The options
 * @returns The newly created open path
 * @category Primitives
 * @example
 * ```js:pave
 * const p = Path.spiral([50, 50], 4, 42, 5)
 * stroke(p)
 * ```
 */
export function spiral(
	center: vec2,
	startRadius: number,
	endRadius: number,
	turns: number,
	{startAngle = 0, type = 'archimedean', tolerance = 0.05}: SpiralOptions = {}
): Path {
	if (!(startRadius >= 0 && endRadius >= 0)) {
		throw new Error('The radii of a spiral must not be negative')
	}
	if (type === 'logarithmic' && !(startRadius > 0 && endRadius > 0)) {
		throw new Error('The radii of a logarithmic spiral must be positive')
	}

	const angle0 = (startAngle * Math.PI) / 180
	const sweep = turns * TAU
	const growth = Math.log(endRadius / startRadius)
	const logarithmic = type === 'logarithmic'

	const radiusAt = (t: number) =>
		logarithmic
			? startRadius * Math.exp(growth * t)
			: startRadius + (endRadius - startRadius) * t
	const radiusSlopeAt = (t: number) =>
		logarithmic ? radiusAt(t) * growth : endRadius - startRadius

	const point = (t: number): vec2 => {
		const r = radiusAt(t)
		const a = angle0 + sweep * t
		return [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]
	}

	if (turns === 0) {
		return startRadius === endRadius ? dot(point(0)) : line(point(0), point(1))
	}
	if (startRadius === 0 && endRadius === 0) return dot(center)

	const direction = (t: number): vec2 => {
		const a = angle0 + sweep * t
		const c = Math.cos(a)
		const s = Math.sin(a)
		const radial = radiusSlopeAt(t)
		const around = radiusAt(t) * sweep
		return vec2.normalize([radial * c - around * s, radial * s + around * c])
	}

	return fitted({point, direction}, Math.abs(turns) * 4, tolerance)
}

/**
 * Creates a clothoid, also known as an Euler spiral: the curve whose curvature changes in proportion to the distance traveled. Railways and roads use it to ease into a bend, because a vehicle following it turns its wheel at a constant speed. A positive curvature turns towards increasing angles, which is clockwise on a Y-down canvas, and its reciprocal is the radius of the bend.
 * @param start The start point
 * @param startAngle The direction of travel at the start, in degrees
 * @param length The length of the curve
 * @param startCurvature The curvature at the start
 * @param endCurvature The curvature at the end
 * @param options The options
 * @returns The newly created open path
 * @category Primitives
 * @example
 * ```js:pave
 * const p = Path.clothoid([10, 80], 0, 150, 0, 0.1)
 * stroke(p)
 * ```
 */
export function clothoid(
	start: vec2,
	startAngle: number,
	length: number,
	startCurvature: number,
	endCurvature: number,
	{tolerance = 0.05}: ClothoidOptions = {}
): Path {
	if (!(length >= 0)) {
		throw new Error('The length of a clothoid must not be negative')
	}
	if (length === 0) return dot(start)

	const angle0 = (startAngle * Math.PI) / 180
	const slope = (endCurvature - startCurvature) / length

	const angleAt = (s: number) => angle0 + s * (startCurvature + (slope * s) / 2)

	// Each span between the nodes turns by a quarter at most, where Gauss-Legendre quadrature is
	// accurate far beyond any tolerance
	const spanCount = Math.max(
		1,
		Math.ceil(
			(length * Math.max(Math.abs(startCurvature), Math.abs(endCurvature))) /
				QUARTER
		)
	)
	const spanLength = length / spanCount

	const advance = (from: vec2, s0: number, s1: number): vec2 => [
		from[0] + gaussLegendre(s => Math.cos(angleAt(s)), s0, s1),
		from[1] + gaussLegendre(s => Math.sin(angleAt(s)), s0, s1),
	]

	const nodes: vec2[] = [start]
	for (let i = 0; i < spanCount; i++) {
		nodes.push(advance(nodes[i], i * spanLength, (i + 1) * spanLength))
	}

	const point = (t: number): vec2 => {
		const s = t * length
		const index = Math.min(Math.floor(s / spanLength), spanCount - 1)
		return advance(nodes[index], index * spanLength, s)
	}

	if (startCurvature === 0 && endCurvature === 0) {
		return line(start, point(1))
	}

	const direction = (t: number): vec2 => {
		const a = angleAt(t * length)
		return [Math.cos(a), Math.sin(a)]
	}

	return fitted({point, direction}, spanCount, tolerance)
}

/**
 * The open path along a curve on [0, 1], first split evenly into the given number of pieces.
 */
function fitted(
	curve: {point: (t: number) => vec2; direction: (t: number) => vec2},
	pieces: number,
	tolerance: number
): Path {
	const count = Math.max(1, Math.ceil(pieces))

	const vertices: Vertex[] = [{command: 'L', point: curve.point(0)}]
	for (let i = 0; i < count; i++) {
		vertices.push(...fitVertices(curve, i / count, (i + 1) / count, tolerance))
	}

	return {curves: [{vertices, closed: false}]}
}
