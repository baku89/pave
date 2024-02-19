import {mat2d, scalar, vec2} from 'linearly'
import paper from 'paper'
import {OffsetOptions as PaperOffsetOptions, PaperOffset} from 'paperjs-offset'

import {Arc} from './Arc'
import {Circle} from './Circle'
import {CubicBezier} from './CubicBezier'
import {Curve} from './Curve'
import {CurveGroup} from './CurveGroup'
import {Line} from './Line'
import {PathLocation, SegmentLocation} from './Location'
import {Rect} from './Rect'
import {Segment, SegmentA, SegmentC} from './Segment'
import {memoize, toFixedSimple} from './utils'

paper.setup(document.createElement('canvas'))

/**
 * Cubic Bézier curve command.
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 */
export type CommandArgsC = readonly [control1: vec2, control2: vec2]

/**
 * Arc command
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#arcs
 */
export type CommandArgsA = readonly [
	/**
	 * The radii of the ellipse used to draw the arc.
	 */
	radii: vec2,
	/**
	 * The rotation angle of the ellipse's x-axis relative to the x-axis of the current coordinate system, expressed in degrees.
	 */
	xAxisRotation: number,
	/**
	 * If true, then draw the arc spanning greather than 180 degrees. Otherwise, draw the arc spanning less than 180 degrees.
	 */
	largeArcFlag: boolean,
	/**
	 * If true, then draw the arc in a "positive-angle" direction in the current coordinate system. Otherwise, draw it in a "negative-angle" direction.
	 */
	sweepFlag: boolean,
]

export type Vertex = VertexL | VertexC | VertexA

/**
 * A vertex of a path. It consists of a end point and a command.
 * @category Types
 */
export type VertexL = {
	readonly point: vec2
	readonly command: 'L'
	readonly args?: undefined
}

/** @category Types */
export type VertexC = {
	readonly point: vec2
	readonly command: 'C'
	readonly args: CommandArgsC
}

/** @category Types */
export type VertexA = {
	readonly point: vec2
	readonly command: 'A'
	readonly args: CommandArgsA
}

/**
 * A path that consists of multiple curves.
 * @category Types
 */
export type Path<V extends Vertex = Vertex> = {
	readonly curves: Curve<V>[]
}

/** @category Types */
export type PathL = Path<VertexL>

/** @category Types */
export type PathC = Path<VertexC>

/** @category Types */
export type PathA = Path<VertexA>

type UnarcPath = Path<VertexL | VertexC>

type SVGCommand =
	| 'M'
	| 'L'
	| 'H'
	| 'V'
	| 'Q'
	| 'T'
	| 'C'
	| 'S'
	| 'A'
	| 'Z'
	| 'm'
	| 'l'
	| 'h'
	| 'v'
	| 'q'
	| 't'
	| 'c'
	| 's'
	| 'a'
	| 'z'
	| vec2
	| boolean
	| number

/**
 * Functions for manipulating paths represented as {@link Path}.
 * @category Path
 */
export namespace Path {
	/**
	 * Empty path.
	 * @category Primitives
	 */
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

	export function semicircle(start: vec2, end: vec2, closed = true): Path {
		const r = vec2.dist(start, end) / 2

		const p = arcTo(moveTo(empty, start), [r, r], 0, false, true, end)

		return closed ? Path.close(p) : p
	}

	export interface CircleFromPointsOptions {
		/**
		 * If the given points are less than three and the circumcenter cannot be well-defined, the circle will be drawn in the direction of the sweep flag. (in Canvas API, it means clockwise).
		 * @default true
		 */
		preferredSweep?: boolean
	}

	/**
	 * Creates a circle path which passes through the given points.
	 * @param p1 The first point
	 * @param p2 The second point
	 * @param p3 The third point
	 * @returns The circle path, whose first point matches to `p1`. After duplicating points are removed, if there are only one point, creates a circle with zero radius. For two points, creates a circle from the two points as the diameter. Otherwise, creates a circle that passes through the three points.
	 * @category Primitives
	 * @example
	 * ```js:pave
	 * const p1 = [30, 30]
	 * const p2 = [70, 30]
	 * const p3 = [50, 60]
	 *
	 * dot(p1)
	 * dot(p2)
	 * dot(p3)
	 *
	 * stroke(Path.circleFromPoints(p1, p2))
	 * stroke(Path.circleFromPoints(p1, p2, p3), 'skyblue')
	 * ```
	 */
	export function circleFromPoints(
		p1: vec2,
		p2?: vec2 | null,
		p3?: vec2 | null,
		{preferredSweep = true}: CircleFromPointsOptions = {}
	): Path {
		// Remove duplicate points
		if (p2 && p3 && vec2.equals(p2, p3)) {
			p3 = undefined
		}
		if (p3 && vec2.equals(p3, p1)) {
			p3 = undefined
		}
		if (p2 && vec2.equals(p1, p2)) {
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

		const [, radius] = Circle.circumcircle(p1, p2, p3)
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
		endAngle: number
	): Path {
		const start = vec2.add(center, vec2.direction(startAngle, radius))

		const radii: vec2 = [radius, radius]
		const sweepFlag = endAngle > startAngle

		const points: Vertex[] = [{point: start, command: 'L'}]

		while (Math.abs(endAngle - startAngle) > 180) {
			startAngle += 180 * (sweepFlag ? 1 : -1)
			const through = vec2.add(center, vec2.direction(startAngle, radius))

			points.push({
				point: through,
				command: 'A',
				args: [radii, 0, false, sweepFlag],
			})
		}

		const point = vec2.add(center, vec2.direction(endAngle, radius))

		points.push({point, command: 'A', args: [radii, 0, false, sweepFlag]})

		return {
			curves: [
				{
					vertices: points,
					closed: false,
				},
			],
		}
	}

	export function arcFromPoints(start: vec2, through: vec2, end: vec2): Path {
		const [center, radius] = Circle.circumcircle(start, through, end)

		const CS = vec2.sub(start, center)
		const CT = vec2.sub(through, center)
		const CE = vec2.sub(end, center)

		const angleSOE = vec2.angle(CS, CE)
		const angleSOT = vec2.angle(CS, CT)
		const angleEOT = vec2.angle(CE, CT)

		let largeArc: boolean
		let sweep: boolean

		if (angleSOE < 0) {
			if (angleSOT < 0 && angleEOT > 0) {
				largeArc = false
				sweep = false
			} else {
				largeArc = true
				sweep = true
			}
		} else {
			if (angleSOT > 0 && angleEOT < 0) {
				largeArc = false
				sweep = true
			} else {
				largeArc = true
				sweep = false
			}
		}

		return Path.fromSegment({
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
	 */
	export function arcFromPointsAndTangent(
		start: vec2,
		startTangent: vec2,
		end: vec2
	): Path {
		// https://gist.github.com/baku89/b6b92c352c14779c57ba9a61c426258b#file-arc-pen-L49-L59

		const SE = vec2.sub(end, start)
		const phi = vec2.angle(startTangent, SE) / 2
		const cosPhi = scalar.cos(phi)

		if (scalar.equals(cosPhi, 0)) {
			return line(start, end)
		}

		const lenSE = vec2.len(SE)
		const dirSE = vec2.normalize(SE)

		const mDist = lenSE / 2 / cosPhi
		const mDir = vec2.normalize(vec2.add(startTangent, dirSE))

		const mid = vec2.scaleAndAdd(start, mDir, mDist)

		return arcFromPoints(start, mid, end)
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
	export function line(start: vec2, end: vec2): Path {
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
	export function dot(point: vec2): Path {
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
	export function polyline(...points: vec2[]): Path {
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
	export function polygon(...points: vec2[]): Path {
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
	): Path {
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
	 * Creates an open path consist of only a single command.
	 * @param segment The segment to create
	 * @returns The newly created path
	 */
	export function fromSegment(segment: Segment): Path {
		return {
			curves: [
				{
					vertices: [
						{point: segment.start, command: 'L'},
						{
							point: segment.point,
							command: segment.command,
							args: segment.args,
						} as Vertex,
					],
					closed: false,
				},
			],
		}
	}

	/**
	 * Returns the length of the given path. The returned value is memoized.
	 * @param path The path to measure
	 * @returns The length of the path
	 * @category Properties
	 */
	export const length = memoize((path: Path): number => {
		let length = 0

		for (const seg of segments(path)) {
			if (seg.command === 'L') {
				length += vec2.distance(seg.start, seg.point)
			} else if (seg.command === 'C') {
				length += CubicBezier.length(seg)
			} else {
				length += Arc.length(seg)
			}
		}

		return length
	})

	/**
	 * Calculates the bound of the given path.
	 * @param path The path to calculate
	 * @returns The rect of the path
	 * @category Properties
	 * @example
	 * ```js:pave
	 * const p = Path.ellipse([50, 50], [20, 40])
	 * stroke(p, 'skyblue')
	 *
	 * const b = Path.bounds(p)
	 * stroke(Path.rect(...b))
	 * ```
	 */
	export const bounds = memoize((path: Path): Rect => {
		let min: vec2 = [Infinity, Infinity]
		let max: vec2 = [-Infinity, -Infinity]

		for (const seg of segments(path)) {
			if (seg.command === 'L') {
				min = vec2.min(min, seg.start, seg.point)
				max = vec2.max(max, seg.start, seg.point)
			} else if (seg.command[0] === 'C') {
				const [sMin, sMax] = CubicBezier.bounds(seg as SegmentC)
				min = vec2.min(min, sMin)
				max = vec2.max(max, sMax)
			} else {
				const [sMin, sMax] = Arc.bounds(seg as SegmentA)
				min = vec2.min(min, sMin)
				max = vec2.max(max, sMax)
			}
		}

		return [min, max]
	})

	/**
	 * Calculates an area of the given path.
	 * @param path The path to calculate
	 * @returns The area of the path
	 * @category Properties
	 */
	export const area = memoize((path: Path) => {
		return toPaperPath(path).area
	})

	/**
	 * Returns the count of segments in the given path.
	 * @param path The path to measure
	 * @returns The count of segments in the path
	 * @category Properties
	 */
	export const segmentCount = memoize((path: Path) => {
		return path.curves.reduce((acc, curve) => {
			return curve.closed
				? acc + curve.vertices.length
				: acc + curve.vertices.length - 1
		}, 0)
	})

	/**
	 * Returns the segment of the path at the given linear index、それはパス
	 * @param path
	 * @param index
	 * @returns Properties
	 */
	export function linearSegment(path: Path, index: number): Segment {
		for (const curve of path.curves) {
			const segCount = Curve.segmentCount(curve)

			if (index < segCount) {
				return Curve.segments(curve)[index]
			}

			index -= segCount
		}

		throw new Error(`Linear segment index out of range: ${index}`)
	}

	/**
	 *
	 * @param path
	 * @param curveIndex
	 * @param segmentIndex
	 * @returns
	 * @category Properties
	 */
	export function segment(
		path: Path,
		curveIndex: number,
		segmentIndex: number
	): Segment {
		const curve = path.curves.at(curveIndex)

		if (!curve) {
			throw new Error(`Curve index out of range: ${curveIndex}`)
		}

		return Curve.segment(curve, segmentIndex)
	}

	export function toSegmentLocation(
		path: Path,
		loc: PathLocation
	): [segment: Segment, loc: SegmentLocation] {
		// TODO: Fix this

		if (typeof loc === 'number') {
			loc = {unit: loc}
		}

		const segs = segments(path)

		let curveIndex = loc.curveIndex ?? null
		if (typeof curveIndex === 'number') {
			if (curveIndex < 0) {
				curveIndex = 0
			} else if (curveIndex > path.curves.length - 1) {
				curveIndex = path.curves.length - 1
				loc = {time: 1}
			}
		}

		let segmentIndex = loc.segmentIndex ?? null
		if (typeof segmentIndex === 'number') {
			if (segmentIndex < 0) {
				segmentIndex = 0
			} else if (segmentIndex > segs.length - 1) {
				segmentIndex = segs.length - 1
				loc = {time: 1}
			}
		}

		if (curveIndex !== null && segmentIndex !== null) {
			// Location in the specified segment
			const seg = segment(path, curveIndex, segmentIndex)

			return [seg, loc]
		}

		if (curveIndex !== null && segmentIndex === null) {
			// Location in the specific curve
			const curve = path.curves[curveIndex]

			return Curve.toSegmentLocation(curve, loc)
		}

		if (curveIndex === null && segmentIndex === null) {
			// Location in the whole path

			if ('time' in loc) {
				const extendedTime = loc.time * segs.length
				const linearSegmentIndex = scalar.clamp(
					Math.floor(extendedTime),
					0,
					segs.length - 1
				)

				const seg = segs[linearSegmentIndex]
				const time = extendedTime - linearSegmentIndex

				return [seg, {time}]
			} else {
				const pathLen = length(path)

				if ('unit' in loc) {
					loc = {offset: loc.unit * pathLen}
				}

				let offset = scalar.clamp(loc.offset, 0, pathLen)

				for (const seg of segs) {
					const segLength = Segment.length(seg)
					if (offset < segLength) {
						return [seg, {offset}]
					}
					offset -= segLength
				}

				const lastSeg = segs.at(-1)
				if (lastSeg) {
					offset = Segment.length(lastSeg)
					return [lastSeg, {offset}]
				}
			}
		} else if (curveIndex === null && segmentIndex !== null) {
			// Location in the segment specified by linear index

			if ('time' in loc) {
				const seg = segs[segmentIndex]
				return [seg, loc]
			}

			const pathLen = length(path)

			if ('unit' in loc) {
				loc = {offset: loc.unit * pathLen}
			}

			let offset = scalar.clamp(loc.offset, 0, pathLen)

			for (const seg of segs) {
				const segLength = Segment.length(seg)
				if (offset < segLength) {
					return [seg, {offset}]
				}
				offset -= segLength
			}

			const lastSeg = segs.at(-1)
			if (lastSeg) {
				offset = Segment.length(lastSeg)
				return [lastSeg, {offset}]
			}
		}

		throw new Error('Location is out of bounds')
	}

	/**
	 * Calculates the position on the path at the given location.
	 * @param path The path to calculate
	 * @param loc The location on the path
	 * @returns The position at the given offset
	 * @category Properties
	 */
	export function point(path: Path, loc: PathLocation): vec2 {
		const [seg, segLoc] = toSegmentLocation(path, loc)
		return Segment.point(seg, segLoc)
	}

	/**
	 * Calculates the normalized tangent vector of the path at the given location.
	 * @param path The path to calcuate
	 * @param lc The location on the path
	 * @returns The tangent vector
	 * @category Properties
	 */
	export function derivative(path: Path, loc: PathLocation): vec2 {
		const [seg, segLoc] = toSegmentLocation(path, loc)
		return Segment.derivative(seg, segLoc)
	}

	/**
	 * Calculates the normalized tangent vector of the path at the given location.
	 * @param path The path to calcuate
	 * @param lc The location on the path
	 * @returns The tangent vector
	 * @category Properties
	 */
	export function tangent(path: Path, loc: PathLocation): vec2 {
		const [seg, segLoc] = toSegmentLocation(path, loc)
		return Segment.tangent(seg, segLoc)
	}

	/**
	 * Calculates the normalized tangent vector of the path at the given location.
	 * @param path The path to calcuate
	 * @param lc The location on the path
	 * @returns The tangent vector
	 * @category Properties
	 */
	export function normal(path: Path, loc: PathLocation): vec2 {
		const [seg, segLoc] = toSegmentLocation(path, loc)
		return Segment.normal(seg, segLoc)
	}

	/**
	 * Calculates the transformation matrix of the path at the given location. The x-axis of the matrix is the tangent vector and the y-axis is the normal vector, and the translation is the point on the path.
	 * @param path The path to calculate
	 * @param location The locationon the path
	 * @returns The transformation matrix at the given offset
	 * @category Properties
	 */
	export function orientation(path: Path, loc: PathLocation): mat2d {
		const [seg, segLoc] = toSegmentLocation(path, loc)
		return Segment.orientation(seg, segLoc)
	}

	/**
	 * Maps each segment in the path to a single or array of vertices and creates a new path concatinating those vertices. you can change the type of commands, and change the number of them in the path, but you cannot change the topology of the path. The segments that were originally continuous remains connected, and vice versa.
	 * @param path The path to map
	 * @param fn The vertex mapping function. It takes a {@link Segment} and returns a single or array of vertices.
	 * @returns The newly created path
	 * @category Modifiers
	 */
	export function spawnVertex<
		V1 extends Vertex = Vertex,
		V2 extends Vertex = Vertex,
	>(
		path: Path<V1>,
		fn: (segment: Segment<V1>, index: number, curve: Curve) => V2 | V2[]
	): Path<V2> {
		return {
			curves: path.curves.map(curve => {
				return {
					vertices: curve.vertices.flatMap((vertex, i, vertices) => {
						const segment = {
							start: vertices.at(i - 1)!.point,
							point: vertex.point,
							command: vertex.command,
							args: vertex.args,
						} as Segment<V1>
						return fn(segment, i, curve)
					}),
					closed: curve.closed,
				}
			}),
		}
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
	 * @category Modifiers
	 */
	export const toC = toCubicBezier

	export interface OffsetOptions {
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
			join: options?.lineJoin,
			limit: options?.miterLimit,
		}

		return fromPaperPath(PaperOffset.offset(paperPath, offset, _options))
	}

	export interface OffsetStrokeOptions extends OffsetOptions {
		/**
		 * The cap style of offset path (`'square'` will be supported in future)
		 * @defaultValue 'butt'
		 */
		lineCap?: 'butt' | 'round'
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

		return fromPaperPath(
			PaperOffset.offsetStroke(paperPath, width / 2, _options)
		)
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
	 * Flattens the curves in path to straight lines.
	 * @see http://paperjs.org/reference/path/#flatten
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
		const paperPath = toPaperPath(path).clone()
		paperPath.flatten(flatness)
		return fromPaperPath(paperPath)
	}

	/**
	 * Subdivides each segment in the path into specific number of sub-segments.
	 * @param path The path to subdivide
	 * @param division The number of division for each segment
	 * @returns The newly created path
	 * @category Modifiers
	 */
	export function subdivide(path: Path, division: number): Path {
		if (division <= 1) return path

		const times = Array(division - 1)
			.fill(0)
			.map((_, i) => (i + 1) / division)

		return spawnVertex(path, (segment): Vertex[] => {
			if (segment.command === 'L') {
				return Line.divideAtTimes(segment, times)
			} else if (segment.command === 'C') {
				return CubicBezier.divideAtTimes(segment, times)
			} else {
				return Arc.divideAtTimes(segment, times)
			}
		})
	}

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
		{unarcAngle = 5, subdivide: subdivideNum = 1}: DistortOptions = {}
	) {
		return spawnVertex(
			toCubicBezier(subdivide(path, subdivideNum), unarcAngle),
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
	 * Unites the given paths.
	 * @param paths The paths to unite
	 * @returns The resulting path
	 * @category Boolean Operations
	 */
	export function unite(paths: Path[]): Path {
		const paperPath = paths
			.map(toPaperPath)
			.reduce(
				(merged, p) => merged.unite(p, {insert: false}) as paper.CompoundPath,
				new paper.CompoundPath({})
			)

		return fromPaperPath(paperPath)
	}

	/**
	 * Subtracts the tools from the subject.
	 * @param subject The target path to be subtracted
	 * @param tools The paths to subtract
	 * @returns The resulting path
	 * @category Boolean Operations
	 */
	export function subtract(subject: Path, tools: Path[]): Path {
		// const [subject, ...tools] = paths.map(toPaperPath)

		const paperSubject = toPaperPath(subject)
		const paperTools = tools.map(toPaperPath)

		const paperPath = paperTools.reduce(
			(merged, p) => merged.subtract(p, {insert: false}) as paper.CompoundPath,
			paperSubject
		)

		return fromPaperPath(paperPath)
	}

	/**
	 * Converts the given path to a string that can be used as the d attribute of an SVG path element.
	 * @param path The path to convert
	 * @returns The string for the d attribute of the SVG path element
	 * @category Converters
	 */
	export function toSVGString(path: Path): string {
		return path.curves
			.flatMap(curve => {
				const strs = curve.vertices.map(({point, command, args}, i) => {
					if (i === 0) {
						return `M ${vec2ToString(point)}`
					} else if (command === 'L') {
						return `L ${vec2ToString(point)}`
					} else if (command === 'C') {
						return commandCToString(point, args)
					} else if (command === 'A') {
						return commandAToString(point, args)
					}
				})

				if (curve.closed) {
					const firstVertex = curve.vertices.at(0)

					if (firstVertex && firstVertex.command !== 'L') {
						if (firstVertex.command === 'C') {
							strs.push(commandCToString(firstVertex.point, firstVertex.args))
						} else if (firstVertex.command === 'A') {
							strs.push(commandAToString(firstVertex.point, firstVertex.args))
						}
					}

					strs.push('Z')
				}

				return strs
			})
			.join(' ')

		function vec2ToString(v: vec2): string {
			return `${v[0]},${v[1]}`
		}

		function commandCToString(point: vec2, command: CommandArgsC) {
			const c1 = vec2ToString(command[0])
			const c2 = vec2ToString(command[1])
			const p = vec2ToString(point)
			return `C ${c1} ${c2} ${p}`
		}

		function commandAToString(point: vec2, command: CommandArgsA) {
			const radii = vec2ToString(command[0])
			const xAxisRotation = toFixedSimple(command[1])
			const largeArc = command[2] ? '1' : '0'
			const sweep = command[3] ? '1' : '0'
			const p = vec2ToString(point)
			return `A ${radii} ${xAxisRotation} ${largeArc} ${sweep} ${p}`
		}
	}

	/**
	 * Returns all segmentse
	 * @param path The path to iterate
	 * @category Properties
	 */
	export const segments = memoize((path: Path): Segment[] => {
		return path.curves.flatMap(Curve.segments)
	})

	/**
	 * Converts an array of SVG commands to a {@link Path}.
	 * @param commands The array of SVG commands
	 * @returns The newly created path
	 * @category Converters
	 */
	export function fromSVG(commands: SVGCommand[]): Path {
		const paths: Curve[] = []

		let firstPoint: vec2 | undefined
		let prevPoint: vec2 | undefined
		let prevControl: vec2 | undefined

		let currentPath: Curve | undefined

		for (let i = 0; i < commands.length; i++) {
			let code = commands[i]

			if (typeof code !== 'string') {
				throw new Error('Invalid command')
			}

			const isRelative = code.toLowerCase() === code
			code = code.toUpperCase() as SVGCommand

			if (code === 'M') {
				if (currentPath) {
					paths.push(currentPath)
				}

				let point = commands[++i]

				if (!isVec2(point)) {
					throw new Error('Invalid command M')
				}

				if (isRelative) {
					if (!prevPoint) {
						throw new Error('Relative command is used without a previous point')
					}
					point = vec2.add(prevPoint, point)
				}

				currentPath = {vertices: [{point, command: 'L'}], closed: false}
				firstPoint = prevPoint = point
				continue
			}

			if (!currentPath) {
				throw new Error('The path is not started')
			}

			if (code === 'L') {
				let point = commands[++i]

				if (!isVec2(point)) {
					throw new Error('Invalid command L')
				}

				if (isRelative) {
					if (!prevPoint) {
						throw new Error('Relative command is used without a previous point')
					}
					point = vec2.add(prevPoint, point)
				}

				currentPath.vertices.push({point, command: 'L'})

				prevPoint = point
				prevControl = undefined
			} else if (code === 'H') {
				const x = commands[++i]

				if (typeof x !== 'number' || !prevPoint) {
					throw new Error('Invalid command H')
				}

				let point: vec2 = [x, prevPoint[1]]

				if (isRelative) {
					if (!prevPoint) {
						throw new Error('Relative command is used without a previous point')
					}
					point = [point[0] + prevPoint[0], point[1]]
				}

				currentPath.vertices.push({point, command: 'L'})

				prevPoint = point
				prevControl = undefined
			} else if (code === 'V') {
				const y = commands[++i]

				if (typeof y !== 'number' || !prevPoint) {
					throw new Error('Invalid command V')
				}

				let point: vec2 = [prevPoint[0], y]

				if (isRelative) {
					if (!prevPoint) {
						throw new Error('Relative command is used without a previous point')
					}
					point = [point[0], point[1] + prevPoint[1]]
				}

				currentPath.vertices.push({point, command: 'L'})

				prevPoint = point
				prevControl = undefined
			} else if (code === 'Q') {
				let control = commands[++i]
				let point = commands[++i]

				if (!isVec2(control) || !isVec2(point) || !prevPoint) {
					throw new Error('Invalid command Q')
				}

				if (isRelative) {
					if (!prevPoint) {
						throw new Error('Relative command is used without a previous point')
					}
					control = vec2.add(prevPoint, control)
					point = vec2.add(prevPoint, point)
				}

				const {command, args} = CubicBezier.fromQuadraticBezier(
					prevPoint,
					control,
					point
				)

				currentPath.vertices.push({point, command, args})

				prevPoint = point
				prevControl = undefined
			} else if (code === 'T') {
				let point = commands[++i]

				if (!isVec2(point) || !prevPoint || !prevControl) {
					throw new Error('Invalid command T')
				}

				if (isRelative) {
					if (!prevPoint) {
						throw new Error('Relative command is used without a previous point')
					}
					point = vec2.add(prevPoint, point)
				}

				const control = vec2.sub(prevPoint, prevControl)

				const {command, args} = CubicBezier.fromQuadraticBezier(
					prevPoint,
					control,
					point
				)

				currentPath.vertices.push({point, command, args})

				prevPoint = point
				prevControl = control
			} else if (code === 'C') {
				let control1 = commands[++i]
				let control2 = commands[++i]
				let point = commands[++i]

				if (!isVec2(control1) || !isVec2(control2) || !isVec2(point)) {
					throw new Error('Invalid command C')
				}

				if (isRelative) {
					if (!prevPoint) {
						throw new Error('Relative command is used without a previous point')
					}
					control1 = vec2.add(prevPoint, control1)
					control2 = vec2.add(prevPoint, control2)
					point = vec2.add(prevPoint, point)
				}

				currentPath.vertices.push({
					point,
					command: 'C',
					args: [control1, control2],
				})

				prevPoint = point
				prevControl = control2
			} else if (code === 'S') {
				let control2 = commands[++i]
				let point = commands[++i]

				if (!isVec2(control2) || !isVec2(point) || !prevPoint || !prevControl) {
					throw new Error('Invalid command S')
				}

				if (isRelative) {
					if (!prevPoint) {
						throw new Error('Relative command is used without a previous point')
					}
					control2 = vec2.add(prevPoint, control2)
					point = vec2.add(prevPoint, point)
				}

				const control1 = vec2.sub(prevPoint, prevControl)
				currentPath.vertices.push({
					point,
					command: 'C',
					args: [control1, control2],
				})

				prevPoint = point
				prevControl = control2
			} else if (code === 'A') {
				const radii = commands[++i]
				const xAxisRotation = commands[++i]
				const largeArc = commands[++i]
				const sweep = commands[++i]
				let point = commands[++i]

				if (
					!isVec2(radii) ||
					typeof xAxisRotation !== 'number' ||
					!isVec2(point)
				) {
					throw new Error('Invalid command A')
				}

				if (isRelative) {
					if (!prevPoint) {
						throw new Error('Relative command is used without a previous point')
					}
					point = vec2.add(prevPoint, point)
				}

				currentPath.vertices.push({
					point,
					command: 'A',
					args: [radii, xAxisRotation, !!largeArc, !!sweep],
				})

				prevPoint = point
				prevControl = undefined
			} else if (code === 'Z') {
				if (firstPoint && prevPoint && vec2.equals(firstPoint, prevPoint)) {
					currentPath.vertices[0] = currentPath.vertices.at(-1)!
					currentPath.vertices.pop()
				}

				paths.push({...currentPath, closed: true})
				currentPath = undefined
			}
		}

		if (currentPath) {
			paths.push(currentPath)
		}

		return {curves: paths}

		function isVec2(v: SVGCommand): v is vec2 {
			return Array.isArray(v)
		}
	}

	/**
	 * Creates a Path2D instance with the given path data.
	 * @param path The path to convert
	 * @returns The newly created Path2D
	 * @category Converters
	 */
	export const toPath2D = memoize((path: Path): Path2D => {
		const path2d = new Path2D()

		drawToRenderingContext(path, path2d)

		return path2d
	})

	/**
	 * Draws the given path to the context. It calls `context.beginPath` at the beginning, so please note that the sub-paths already stacked on the context are also cleared. Note that you also need to call `context.stroke` or `context.fill` to actually draw the path.
	 * @param path The path to draw
	 * @param context The Canvas context
	 * @category Converters
	 */
	export function drawToCanvas(
		path: Path,
		context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
	) {
		context.beginPath()
		drawToRenderingContext(path, context)
	}

	/**
	 * Converts the given path to paper.Path
	 * @see http://paperjs.org/reference/pathitem/
	 * @param path The path to convert
	 * @returns The newly created paper.Path instance
	 * @category Converters
	 */
	export const toPaperPath = memoize(
		(path: Path): paper.Path | paper.CompoundPath => {
			const paperPaths = path.curves.map(({vertices, closed}) => {
				const paperPath = new paper.Path()
				let prev: vec2 | undefined

				const firstVertex = vertices.at(0)

				if (firstVertex) {
					paperPath.moveTo(toPoint(firstVertex.point))
					prev = firstVertex.point

					vertices = vertices.slice(1)

					if (closed) {
						vertices.push(firstVertex)
					}
				}

				for (const {point, command, args} of vertices) {
					if (command === 'L') {
						paperPath.lineTo(toPoint(point))
					} else if (command === 'C') {
						paperPath.cubicCurveTo(
							toPoint(args[0]),
							toPoint(args[1]),
							toPoint(point)
						)
					} else {
						const beziers = Arc.approximateByCubicBeziers(
							{start: prev!, point, args},
							90
						)

						for (const {point, args} of beziers) {
							paperPath.cubicCurveTo(
								toPoint(args[0]),
								toPoint(args[1]),
								toPoint(point)
							)
						}
					}

					prev = point
				}

				if (closed) {
					paperPath.closePath()
				}

				return paperPath
			})

			return paperPaths.length > 1
				? new paper.CompoundPath({children: paperPaths})
				: paperPaths[0]

			function toPoint(point: vec2): paper.PointLike {
				return {x: point[0], y: point[1]}
			}
		}
	)

	/**
	 * Creates a path from the given paper.Path instance.
	 * @paperPath The paper.Path instance to convert
	 * @returns The newly created path
	 * @category Converters
	 */
	export const fromPaperPath = memoize((paperPath: paper.PathItem): Path => {
		const paperPaths =
			paperPath instanceof paper.CompoundPath
				? (paperPath.children as paper.Path[])
				: ([paperPath] as paper.Path[])

		const paths = paperPaths.map(({curves, closed}) => {
			const vertices: Vertex[] = curves.map(curve => {
				const {point1, point2, handle1, handle2} = curve
				if (curve.isStraight()) {
					return {point: paperPointToVec2(point2), command: 'L'}
				} else {
					return {
						point: paperPointToVec2(point2),
						command: 'C',
						args: [
							paperPointToVec2(point1.add(handle1)),
							paperPointToVec2(point2.add(handle2)),
						],
					}
				}
			})

			if (closed) {
				const lastVertex = vertices.at(-1)!
				vertices.pop()
				vertices.unshift(lastVertex)
			} else {
				vertices.unshift({
					point: paperPointToVec2(curves[0].point1),
					command: 'L',
				})
			}

			return {vertices, closed}
		})

		return {curves: paths}
	})

	/**
	 * Returns the new path with the new M (move-to) command at the end.
	 * @param path The base path
	 * @param point The point to move to
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function moveTo(path: Path, point: vec2): Path {
		return {
			curves: [
				...path.curves,
				{
					vertices: [{point, command: 'L'}],
					closed: false,
				},
			],
		}
	}

	/**
	 * Appends the given command to the end of the path.
	 * @param path The base path
	 * @param point The newly added point
	 * @param command The command to append
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function addVertex(path: Path, vertex: Vertex): Path {
		const lastCurve = path.curves.at(-1)

		if (lastCurve) {
			return {
				curves: [
					...path.curves.slice(0, -1),
					{
						vertices: [...lastCurve.vertices, vertex],
						closed: lastCurve.closed,
					},
				],
			}
		} else {
			return {
				curves: [
					{
						vertices: [vertex],
						closed: false,
					},
				],
			}
		}
	}

	/**
	 * Returns the new path with the new L (line-to) command at the end.
	 * @param path The base path
	 * @param point The point to draw a line to
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function lineTo(path: Path, point: vec2): Path {
		return addVertex(path, {point, command: 'L'})
	}

	/**
	 * Returns the new path with the new C (cubic Bézier curve) command at the end.
	 * @param path The base path
	 * @param control1 The first control point
	 * @param control2 The second control point
	 * @param point The end point
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function cubicBezierTo(
		path: Path,
		control1: vec2,
		control2: vec2,
		point: vec2
	): Path {
		return addVertex(path, {
			point,
			command: 'C',
			args: [control1, control2],
		})
	}

	/**
	 * Returns the new path with the new Q (quadratic Bézier curve) command at the end.
	 * @param path The base path
	 * @param control The control point
	 * @param point The end point
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function quadraticBezierTo(
		path: Path,
		control: vec2,
		point: vec2
	): Path {
		const lastPoint = path.curves.at(-1)?.vertices.at(-1)?.point

		if (!lastPoint) {
			throw new Error('The path is empty')
		}

		const control1 = vec2.lerp(lastPoint, control, 2 / 3)
		const control2 = vec2.lerp(point, control, 2 / 3)

		return addVertex(path, {
			point,
			command: 'C',
			args: [control1, control2],
		})
	}

	/**
	 * Returns the new path with the new A (arc) command at the end.
	 * @param path The base path
	 * @param radii The radii of the ellipse used to draw the arc
	 * @param xAxisRotation The rotation angle of the ellipse's x-axis relative to the x-axis of the current coordinate system, expressed in degrees
	 * @param largeArcFlag The large arc flag. If true, then draw the arc spanning greather than 180 degrees. Otherwise, draw the arc spanning less than 180 degrees.
	 * @param sweepFlag The sweep flag. If true, then draw the arc in a "positive-angle" direction in the current coordinate system. Otherwise, draw it in a "negative-angle" direction.
	 * @param point The end point of the arc
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function arcTo(
		path: Path,
		radii: vec2,
		xAxisRotation: number,
		largeArcFlag: boolean,
		sweepFlag: boolean,
		point: vec2
	): Path {
		return addVertex(path, {
			command: 'A',
			args: [radii, xAxisRotation, largeArcFlag, sweepFlag],
			point,
		})
	}

	export type PathCloseOptions = {
		/**
		 * If true, deletes overwrapped first and last vertices.
		 * @default true
		 */
		fuse?: boolean
		/**
		 * Specifies which curves to close. Default is the last curve.
		 * @default -1
		 */
		group?: CurveGroup
	}

	/**
	 * Closes the specified curves
	 * @param path The base path
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function close(
		path: Path,
		{fuse = true, group = -1}: PathCloseOptions = {}
	): Path {
		const lastCurve = path.curves.at(-1)

		const matcher = CurveGroup.getMatcher(group, path)

		if (lastCurve) {
			return {
				curves: path.curves.map((curve, i) =>
					matcher(curve, i) ? Curve.close(curve, fuse) : curve
				),
			}
		}

		// Empty path
		return path
	}
}

function paperPointToVec2(point: paper.Point): vec2 {
	return [point.x, point.y]
}

function drawToRenderingContext(
	path: Path,
	context: Path2D | CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
) {
	for (const {vertices, closed} of path.curves) {
		vertices.forEach(({point, command, args}, i) => {
			if (i === 0) {
				context.moveTo(...point)
				return
			}

			if (command === 'L') {
				context.lineTo(...point)
			} else if (command === 'C') {
				context.bezierCurveTo(...args[0], ...args[1], ...point)
			} else if (command === 'A') {
				const start = vertices.at(i - 1)?.point

				if (!start) throw new Error('The start point is not found')

				arcTo(context, start, point, args)
			}
		})

		if (closed) {
			const first = vertices.at(0)

			if (first && first.command !== 'L') {
				const {point, command, args} = first
				if (command === 'C') {
					context.bezierCurveTo(...args[0], ...args[1], ...point)
				} else if (command === 'A') {
					const prev = vertices.at(-1)?.point

					if (!prev) throw new Error('The previous point is not found')

					arcTo(context, prev, point, args)
				}
			}

			context.closePath()
		}
	}

	function arcTo(
		context:
			| Path2D
			| CanvasRenderingContext2D
			| OffscreenCanvasRenderingContext2D,
		start: vec2,
		point: vec2,
		args: CommandArgsA
	) {
		const ret = Arc.toCenterParameterization({
			start,
			point,
			command: 'A',
			args,
		})

		context.ellipse(
			...ret.center,
			...ret.radii,
			scalar.rad(ret.xAxisRotation),
			scalar.rad(ret.angles[0]),
			scalar.rad(ret.angles[1]),
			!ret.sweep
		)
	}
}
