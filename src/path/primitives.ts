import {Circle, Rect} from 'geome'
import {scalar, vec2} from 'linearly'

import type {CurveL} from '../Curve'
import {Iter} from '../Iter'
import type {Path, PathL} from '../Path'
import {fromSegment, merge} from './compound'
import {arcTo, close, moveTo, pen} from './drawAppend'
import {join} from './modifiers'
import type {Vertex} from './types'

/**
 * @category Options
 */
export interface CircleFromPointsOptions {
	/**
	 * If the given points are less than three and the circumcenter cannot be well-defined, the circle will be drawn in the direction of the sweep flag. (in Canvas API, it means clockwise).
	 * @default true
	 */
	preferredSweep?: boolean
}

/**
 * An options for {@link Path.arc}
 * @category Options
 */
export type ArcOptions = {
	/**
	 * The maximum angle step in degrees
	 * @default `360 - 1e-4`
	 */
	step?: number
	/**
	 * The alignment of the vertices
	 * @default 'uniform'
	 */
	align?: Iter.ResampleOptions['align']
	/**
	 * The total count of the segments in the arc. If this is specified, the `step` will be ignored and the arc will be deviced into the specified number of segments uniformly.
	 */
	count?: number
}

/**
 * The options for {@link Path.formula}
 * @category Options
 */
export interface FormulaOptions {
	/**
	 * The delta value for calculating the derivative of the formula
	 * @default 10e-6
	 */
	delta?: number
}

export const empty: Path = Object.freeze({
	curves: [],
})

/**
 * Creates a rectangle path from the given two points.
 * @param start The first point defining the rectangle
 * @param end The second point defining the rectangle
 * @returns The newly created path
 * @category Primitives
 * @example
 * ```js:pave
 * const p = Path.rectangle([10, 30], [90, 70])
 * stroke(p)
 * ```
 */
export function rectangle(start: vec2, end: vec2): Path {
	return {
		curves: [
			{
				vertices: [
					{point: start, command: 'L'},
					{point: [end[0], start[1]], command: 'L'},
					{point: end, command: 'L'},
					{point: [start[0], end[1]], command: 'L'},
				],
				closed: true,
			},
		],
	}
}

/**
 * Alias for {@link rectangle}
 * @category Primitives
 */
export const rect = rectangle

/**
 * Creates a rectangle path from the given center and size.
 * @param center The center of the rectangle
 * @param size The size of the rectangle
 * @returns The newly created path
 * @category Primitives
 */
export function rectFromCenter(center: vec2, size: vec2): Path {
	const halfSize = vec2.scale(size, 0.5)
	const start = vec2.sub(center, halfSize)
	const end = vec2.add(center, halfSize)
	return rectangle(start, end)
}

/**
 * Creates a rounded rectangle. The arguments are almost the same as the CanvasRenderingContext2D's `roundRect` method.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/roundRect
 * @category Primitives
 */
export function roundRect(
	start: vec2,
	end: vec2,
	radii:
		| number
		| [allCorner: number]
		| [topLeftAndBottomRight: number, topRightAndBottomLeft: number]
		| [topLeft: number, topRightAndBottomLeft: number, bottomRight: number]
		| [
				topLeft: number,
				topRight: number,
				bottomRight: number,
				bottomLeft: number,
		  ]
): Path {
	let tl: number
	let tr: number
	let br: number
	let bl: number

	// Assigns the radii
	if (typeof radii === 'number') {
		tl = tr = br = bl = radii
	} else if (radii.length === 1) {
		tl = tr = br = bl = radii[0]
	} else if (radii.length === 2) {
		;[tl, tr] = radii
		;[br, bl] = radii
	} else if (radii.length === 3) {
		;[tl, tr, br] = radii
		bl = tr
	} else {
		;[tl, tr, br, bl] = radii
	}

	// Clamps the radii to the half of the width and height
	// NOTE: might be possible to exceed the half of the width and height
	const [width, height] = vec2.sub(end, start)
	const halfWidth = Math.abs(width) / 2
	const halfHeight = Math.abs(height) / 2

	tl = Math.min(Math.abs(tl), halfWidth, halfHeight)
	tr = Math.min(Math.abs(tr), halfWidth, halfHeight)
	br = Math.min(Math.abs(br), halfWidth, halfHeight)
	bl = Math.min(Math.abs(bl), halfWidth, halfHeight)

	const sweep = width * height > 0

	const xSign = Math.sign(width)
	const ySign = Math.sign(height)

	// Creates the path
	return pen()
		.M([start[0], start[1] + tl * ySign])
		.A([tl, tl], 0, false, sweep, [start[0] + tl * xSign, start[1]])
		.H(end[0] - tr * xSign)
		.A([tr, tr], 0, false, sweep, [end[0], start[1] + tr * ySign])
		.V(end[1] - br * ySign)
		.A([br, br], 0, false, sweep, [end[0] - br * xSign, end[1]])
		.H(start[0] + bl * xSign)
		.A([bl, bl], 0, false, sweep, [start[0], end[1] - bl * ySign])
		.Z()
		.get()
}

/**
 * Creates a circle path from the given center and radius.
 * @param center The center of the circle
 * @param radius The radius of the circle
 * @returns The newly created path
 * @category Primitives
 * @example
 * ```js:pave
 * const c = Path.circle([50, 50], 40)
 * stroke(c)
 * ```
 */
export function circle(center: vec2, radius: number): Path {
	return ellipse(center, [radius, radius])
}

/**
 * Creates a semicircle path from the given start and end points.
 * @category Primitives
 */
export function semicircle(start: vec2, end: vec2, closed = true): Path {
	const r = vec2.dist(start, end) / 2

	const p = arcTo(moveTo(empty, start), [r, r], 0, false, true, end)

	return closed ? close(p) : p
}

/**
 * Creates an infinite line path from the given two points. Unlike {@link line}, the line will be drawn nearly infinitely in both directions.
 * @param point0 The first point
 * @param point1 The second point
 * @param distance  The length of the infinite line for each direction
 * @returns The infinite line path
 * @category Primitives
 */
export function infiniteLine(point0: vec2, point1: vec2, distance = 1e8): Path {
	const dir = vec2.normalize(vec2.sub(point1, point0))
	const pointAtInfinity0 = vec2.scaleAndAdd(point0, dir, distance)
	const pointAtInfinity1 = vec2.scaleAndAdd(point0, dir, -distance)
	return line(pointAtInfinity0, pointAtInfinity1)
}

/**
 * Creates a [half-line](https://en.wikipedia.org/wiki/Line_(geometry)#Ray), infinite line in one direction from a starting point and a point that the line passes through. It is not actually an inifinite, but one with a very large length.
 * @param point The starting point
 * @param through The point that the line passes through
 * @param distance The length of the half-line
 * @returns The half-line path
 * @category Primitives
 */
export function halfLine(point: vec2, through: vec2, distance = 1e8): Path {
	const dir = vec2.normalize(vec2.sub(through, point))
	const pointAtInfinity = vec2.scaleAndAdd(point, dir, distance)
	return line(point, pointAtInfinity)
}

export function circleFromPoints(
	p1: vec2,
	p2?: vec2 | null,
	p3?: vec2 | null,
	{preferredSweep = true}: CircleFromPointsOptions = {}
): Path {
	// Remove duplicate points
	if (p2 && p3 && vec2.approx(p2, p3)) {
		p3 = undefined
	}
	if (p3 && vec2.approx(p3, p1)) {
		p3 = undefined
	}
	if (p2 && vec2.approx(p1, p2)) {
		p2 = p3
		p3 = undefined
	}

	// If there are only one point, create a circle with zero radius
	if (!p2) {
		p2 = p1
	}

	// If there are only two points, create a circle from the two points as the diameter
	if (!p3) {
		const radius = vec2.distance(p1, p2) / 2
		const radii: vec2 = [radius, radius]
		return {
			curves: [
				{
					vertices: [
						{
							point: p1,
							command: 'A',
							args: [radii, 0, false, preferredSweep],
						},
						{
							point: p2,
							command: 'A',
							args: [radii, 0, false, preferredSweep],
						},
					],
					closed: true,
				},
			],
		}
	}

	const circumcircle = Circle.circumcircle(p1, p2, p3)

	if (!circumcircle) {
		throw new Error('Circumcircle is not defined')
	}

	const {radius} = circumcircle
	const radii: vec2 = [radius, radius]

	const sweep = vec2.angle(vec2.sub(p2, p1), vec2.sub(p3, p1)) > 0

	return {
		curves: [
			{
				vertices: [
					{
						point: p1,
						command: 'A',
						args: [radii, 0, false, sweep],
					},
					{
						point: p2,
						command: 'A',
						args: [radii, 0, false, sweep],
					},
					{
						point: p3,
						command: 'A',
						args: [radii, 0, false, sweep],
					},
				],
				closed: true,
			},
		],
	}
}

/**
 * Creates an ellipse path from the given center and radius.
 * @param center The center of the ellipse
 * @param radius The radius of the ellipse
 * @returns The newly created path
 * @category Primitives
 * @example
 * ```js:pave
 * const e = Path.ellipse([50, 50], [20, 40])
 * stroke(e)
 * ```
 */
export function ellipse(center: vec2, radius: vec2): Path {
	const [cx, cy] = center
	const [rx] = radius

	return {
		curves: [
			{
				vertices: [
					{
						point: [cx + rx, cy],
						command: 'A',
						args: [radius, 0, false, true],
					},
					{
						point: [cx - rx, cy],
						command: 'A',
						args: [radius, 0, false, true],
					},
				],
				closed: true,
			},
		],
	}
}

/**
 * Creates an arc path.
 * @param center The center of the arc
 * @param radius The radius of the arc
 * @param startAngle The start angle in radians
 * @param endAngle The end angle in radians
 * @returns The newly created path
 * @category Primitives
 * @example
 * ```js:pave
 * const a = Path.arc([50, 50], 40, 0, 90)
 * stroke(a)
 * ```
 */
export function arc(
	center: vec2,
	radius: number,
	startAngle: number,
	endAngle: number,
	options: ArcOptions = {}
): Path {
	// Clamp the angle step not to be zero or negative, or exceed 360 degrees
	const maxAngleStep = 360 - 1e-4
	let step = options.step ?? maxAngleStep
	step = scalar.clamp(Math.abs(step), 0.1, maxAngleStep)

	const radii: vec2 = [radius, radius]
	const sweep = endAngle > startAngle

	// Add intermediate vertices
	const angles = Iter.resample(startAngle, endAngle, {
		align: 'uniform',
		step,
		...options,
	})

	const vertices: Vertex[] = [
		{command: 'L', point: vec2.dir(startAngle, radius, center)},
	]

	for (const [prevAngle, throughAngle] of Iter.pairwise(angles)) {
		const largeArc = Math.abs(throughAngle - prevAngle) > 180

		vertices.push({
			point: vec2.dir(throughAngle, radius, center),
			command: 'A',
			args: [radii, 0, largeArc, sweep],
		})
	}

	return {curves: [{vertices, closed: false}]}
}

/**
 * Creates an arc path from the given three points. If the points are collinear, it will create a straight line path.
 * @param start The start point
 * @param through The point that the arc passes through
 * @param end The end point
 * @returns The newly created path
 * @category Primitives
 */
export function arcByPoints(start: vec2, through: vec2, end: vec2): Path {
	const circumcircle = Circle.circumcircle(start, through, end)

	if (!circumcircle) {
		const vStart = vec2.sub(through, start)
		const vEnd = vec2.sub(through, end)

		if (vec2.dot(vStart, vEnd) <= 0) {
			// o-----o-------o
			// start through end
			return line(start, end)
		} else if (vec2.len(vStart) < vec2.len(vEnd)) {
			// o-------o-----o
			// through start end
			const endTo = vec2.add(end, vec2.sub(start, through))
			return merge([halfLine(start, through), halfLine(end, endTo)])
		} else {
			// o-----o-------o
			// start end through
			const startTo = vec2.add(start, vec2.sub(end, through))
			return merge([halfLine(start, startTo), halfLine(end, through)])
		}
	}

	const {center, radius} = circumcircle

	const CS = vec2.sub(start, center)
	const CT = vec2.sub(through, center)
	const CE = vec2.sub(end, center)

	const angleSCE = vec2.angle(CS, CE)
	const angleSOC = vec2.angle(CS, CT)
	const angleECT = vec2.angle(CE, CT)

	let largeArc: boolean
	let sweep: boolean

	if (angleSCE < 0) {
		if (angleSOC < 0 && angleECT > 0) {
			largeArc = false
			sweep = false
		} else {
			largeArc = true
			sweep = true
		}
	} else {
		if (angleSOC > 0 && angleECT < 0) {
			largeArc = false
			sweep = true
		} else {
			largeArc = true
			sweep = false
		}
	}

	return fromSegment({
		start,
		command: 'A',
		args: [[radius, radius], 0, largeArc, sweep],
		point: end,
	})
}

/**
 * Creates an arc path from start point, start tangent, and end point.
 * @param start The start point
 * @param startTangent The tangent at the start point
 * @param end The end point
 * @returns A newly created open arc path
 * @category Primitives
 */
export function arcByPointsTangent(
	start: vec2,
	startTangent: vec2,
	end: vec2
): Path {
	// https://gist.github.com/baku89/b6b92c352c14779c57ba9a61c426258b#file-arc-pen-L49-L59

	const SE = vec2.sub(end, start)
	const phi = vec2.angle(startTangent, SE) / 2

	if (scalar.approx(phi, 0)) {
		return line(start, end)
	}

	const cosPhi = scalar.cos(phi)

	const lenSE = vec2.len(SE)
	const dirSE = vec2.normalize(SE)

	const mDist = lenSE / 2 / cosPhi
	const mDir = vec2.normalize(vec2.add(startTangent, dirSE))

	const mid = vec2.scaleAndAdd(start, mDir, mDist)

	return arcByPoints(start, mid, end)
}

/**
 * Creates an arc path from two points and an angle.
 * @param start The start point
 * @param end The end point
 * @param angle The angle of arc in degrees. If the angle is positive, the arc will be drawn in the sweep direction (clockwise in Y-down coordinate system).
 * @returns The newly created path
 * @category Primitives
 */
export function arcByPointsAngle(start: vec2, end: vec2, angle: number): Path {
	if (scalar.approx(angle, 0)) {
		return line(start, end)
	}
	if (Math.abs(angle) >= 360) {
		const dir = vec2.sub(end, start)
		return merge([
			halfLine(start, vec2.sub(start, dir)),
			halfLine(end, vec2.add(end, dir)),
		])
	}
	if (angle === 180) {
		return semicircle(start, end, false)
	}
	if (angle === -180) {
		return semicircle(end, start, false)
	}

	const sign = Math.sign(angle)
	angle = Math.abs(angle)

	const SE = vec2.sub(end, start)

	const phi = 90 - angle / 2

	const d = vec2.len(SE)
	const r = d / (2 * scalar.cos(phi))

	const center = vec2.scaleAndAdd(
		start,
		vec2.rotate(vec2.normalize(SE), phi * sign),
		r
	)

	const CS = vec2.sub(start, center)
	const CE = vec2.sub(end, center)

	const angleStart = vec2.angle(CS)
	let deltaAngle = vec2.angle(CS, CE)

	if (phi < 0) {
		deltaAngle += 360 * sign
	}

	const angleEnd = angleStart + deltaAngle

	return arc(center, r, angleStart, angleEnd)
}

/**
 * Creates a fan path.
 * @param center The center of the fan
 * @param innerRadius The inner radius of the fan
 * @param outerRadius The outer radius of the fan
 * @param startAngle The start angle in radians
 * @param endAngle The end angle in radians
 * @returns The newly created path
 * @category Primitives
 * @example
 * ```js:pave
 * const f = Path.fan([50, 50], 20, 40, 0, 90)
 * stroke(f)
 * ```
 */
export function fan(
	center: vec2,
	innerRadius: number,
	outerRadius: number,
	startAngle: number,
	endAngle: number
): Path {
	const outerRim = arc(center, outerRadius, startAngle, endAngle)
	const innerRim = arc(center, innerRadius, endAngle, startAngle)

	return close(join([outerRim, innerRim]))
}

/**
 * Creates a linear path from two points describing a line.
 * @param start The line's starting point
 * @param end The line's ending point
 * @returns The newly created path
 * @category Primitives
 * @example
 * ```js:pave
 * const p = Path.line([10, 10], [90, 90])
 * stroke(p)
 * ```
 */
export function line(start: vec2, end: vec2): PathL {
	return {
		curves: [
			{
				vertices: [
					{point: start, command: 'L'},
					{point: end, command: 'L'},
				],
				closed: false,
			},
		],
	}
}

/**
 * Creates a “dot“ path, which consists of only a M command to the specified point followed by Z command. This will be rendered only if the lineCap of the drawing context is set to `'round'` or `'square'`.
 * @param point The center point of the dot
 * @returns The newly created paths
 * @category Primitives
 * @example
 * ```js:pave
 * const a = Path.dot([50, 50])
 * stroke(a, 'skyblue', 10)
 * ```
 */
export function dot(point: vec2): PathL {
	return {
		curves: [
			{
				vertices: [{point, command: 'L'}],
				closed: true,
			},
		],
	}
}

/**
 * Creates a open polyline from the given points.
 * @param points The points describing the polygon
 * @returns The newly created path
 * @category Primitives
 * @example
 * ```js:pave
 * const p = Path.polyline([10, 10], [30, 80], [80, 50])
 * stroke(p)
 * ```
 */
export function polyline(...points: vec2[]): PathL {
	return {
		curves: [
			{
				vertices: points.map(point => ({point, command: 'L'})),
				closed: false,
			},
		],
	}
}

/**
 * Creates a closed polyline from the given points.
 * @param points The points describing the polygon
 * @returns The newly created path
 * @category Primitives
 * @example
 * ```js:pave
 * const p = Path.polygon([10, 10], [30, 80], [80, 50])
 * stroke(p)
 * ```
 */
export function polygon(...points: vec2[]): PathL {
	return {
		curves: [
			{
				vertices: points.map(point => ({point, command: 'L'})),
				closed: true,
			},
		],
	}
}

/**
 * Creates a regular polygon. The first vertex will be placed at the +X axis relative to the center.
 * @param center The center of the polygon
 * @param radius The radius of the circumcircle of the polygon
 * @param sides The number o sides of the polygon
 * @returns The newly created path
 * @category Primitives
 * @example
 * ```js:pave
 * const p = Path.regularPolygon([50, 50], 40, 5)
 * stroke(p)
 * ```
 */
export function regularPolygon(
	center: vec2,
	radius: number,
	sides: number
): PathL {
	const angleStep = 360 / sides
	const points: vec2[] = []

	for (let i = 0; i < sides; i++) {
		const p = vec2.add(center, vec2.rotate([radius, 0], angleStep * i))
		points.push(p)
	}

	return polygon(...points)
}

/**
 * Alias for {@link regularPolygon}
 * @category Primitives
 */
export const ngon = regularPolygon

/**
 * @category Primitives
 */
export function grid(rect: Rect, divs: vec2): PathL {
	const [xdiv, ydiv] = divs
	const [start, end] = rect

	const curves: CurveL[] = []

	for (let t = 0; t <= xdiv; t++) {
		const x = scalar.lerp(start[0], end[0], t / xdiv)
		curves.push({
			vertices: [
				{command: 'L', point: [x, start[1]]},
				{command: 'L', point: [x, end[1]]},
			],
			closed: false,
		})
	}

	for (let t = 0; t <= ydiv; t++) {
		const y = scalar.lerp(start[1], end[1], t / ydiv)
		curves.push({
			vertices: [
				{command: 'L', point: [start[0], y]},
				{command: 'L', point: [end[0], y]},
			],
			closed: false,
		})
	}

	return {curves}
}

/**
 * Creates a path consisting of a single C command.
 * @param start The start point
 * @param control1  The first control point
 * @param control2  The second control point
 * @param point The end point
 * @returns The newly created path
 * @category Primitives
 */
export function cubicBezier(
	start: vec2,
	control1: vec2,
	control2: vec2,
	point: vec2
): Path {
	return {
		curves: [
			{
				vertices: [
					{point: start, command: 'L'},
					{point, command: 'C', args: [control1, control2]},
				],
				closed: false,
			},
		],
	}
}

/**
 * Creates a quadratic Bézier curve path from the given points.
 * @param start The start point
 * @param control The control point
 * @param point The end point
 * @returns THe newly created path
 * @category Primitives
 */
export function quadraticBezier(start: vec2, control: vec2, point: vec2): Path {
	const c1 = vec2.lerp(start, control, 2 / 3)
	const c2 = vec2.lerp(point, control, 2 / 3)
	return cubicBezier(start, c1, c2, point)
}

/**
 * Create a path consisting of cubic Bézier curves approximating the arbitrary higher-order Bézier curve.
 * @param points The control points of the Bézier curve
 * @returns The newly created path
 * @category Primitives
 */
export function nBezier(points: vec2[]): Path {
	if (points.length === 0) {
		return empty
	}
	if (points.length === 1) {
		return dot(points[0])
	}
	if (points.length === 2) {
		return line(points[0], points[1])
	}
	if (points.length === 3) {
		return quadraticBezier(points[0], points[1], points[2])
	}
	if (points.length === 4) {
		return cubicBezier(points[0], points[1], points[2], points[3])
	}

	const vertices: vec2[] = []

	const order = points.length - 1

	const coeffs = Array(order + 1)
		.fill(0)
		.map((_, i) => combination(order, i))

	for (const t of Iter.resample(0, 1, {count: order * 10})) {
		let point = vec2.zero
		for (const [i, p] of points.entries()) {
			const weight = coeffs[i] * Math.pow(1 - t, order - i) * Math.pow(t, i)
			point = vec2.scaleAndAdd(point, p, weight)
		}
		vertices.push(point)
	}

	return polyline(...vertices)

	function combination(n: number, k: number) {
		let result = 1
		for (let i = 1; i <= k; i++) {
			result *= (n - i + 1) / i
		}
		return result
	}
}
export function formula(
	f: (t: number) => vec2,
	iter: Iterable<number>,
	{delta = 10e-6}: FormulaOptions = {}
): Path {
	const ts = Array.isArray(iter) ? iter : [...iter]

	const points = ts.map(f)

	const vertices: Vertex[] = [{point: points[0], command: 'L'}]

	for (const [i, [prevT, t]] of Iter.enumerate(Iter.pairwise(ts))) {
		const prevPoint = points[i]
		const point = points[i + 1]
		const handleMultiplier = (t - prevT) / delta / 3

		const control1 = vec2.scaleAndAdd(
			prevPoint,
			vec2.sub(f(prevT + delta), prevPoint),
			handleMultiplier
		)

		const control2 = vec2.scaleAndAdd(
			point,
			vec2.sub(f(t - delta), point),
			handleMultiplier
		)

		vertices.push({point, command: 'C', args: [control1, control2]})
	}

	return {curves: [{vertices, closed: false}]}
}
