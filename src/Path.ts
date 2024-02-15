import {mat2d, scalar, vec2} from 'linearly'
import paper from 'paper'
import {OffsetOptions as PaperOffsetOptions, PaperOffset} from 'paperjs-offset'

import {Arc} from './Arc'
import {CubicBezier} from './CubicBezier'
import {Line} from './Line'
import {Rect} from './Rect'
import {Segment} from './Segment'
import {memoize, toFixedSimple} from './utils'

paper.setup(document.createElement('canvas'))

/**
 * Line-to command.
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#line_commands
 */
export type CommandL = readonly [code: 'L']

/**
 * Cubic Bézier curve command.
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 */
export type CommandC = readonly [code: 'C', control1: vec2, control2: vec2]

/**
 * Arc command
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#arcs
 */
export type CommandA = readonly [
	code: 'A',
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

/**
 * A command of a path, which only supports line-to, cubic Bézier curve, and arc commands.
 * @category Types
 *  */
export type Command = CommandL | CommandC | CommandA

/**
 * A vertex of a path. It consists of a end point and a command.
 * @category Types
 */
export type Vertex<C extends Command = Command> = {point: vec2; command: C}

export type VertexL = Vertex<CommandL>
export type VertexC = Vertex<CommandC>
export type VertexA = Vertex<CommandA>

/**
 * A single open or closed path represented as an array of . All of the points are represented as tuple of vector `[x: number, y: number]` and the commands are represented in absolute form.
 * @category Types
 */
export type Curve<C extends Command = Command> = {
	vertices: Vertex<C>[]
	closed: boolean
}

export type CurveL = Curve<CommandL>
export type CurveC = Curve<CommandC>
export type CurveA = Curve<CommandA>

/**
 * A path that consists of multiple curves.
 * @category Types
 */
export type Path<C extends Command = Command> = {
	curves: Curve<C>[]
}

export type PathL = Path<CommandL>
export type PathC = Path<CommandC>
export type PathA = Path<CommandA>

type UnarcPath = Path<CommandL | CommandC>

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
						{point: start, command: ['L']},
						{point: [end[0], start[1]], command: ['L']},
						{point: end, command: ['L']},
						{point: [start[0], end[1]], command: ['L']},
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
						{point: [cx + rx, cy], command: ['A', radius, 0, false, true]},
						{point: [cx - rx, cy], command: ['A', radius, 0, false, true]},
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
	 * const a = Path.arc([50, 50], 40, 0, Math.PI / 2)
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

		const points: Vertex[] = [{point: start, command: ['L']}]

		while (Math.abs(endAngle - startAngle) > Math.PI) {
			startAngle += Math.PI * (sweepFlag ? 1 : -1)
			const through = vec2.add(center, vec2.direction(startAngle, radius))

			points.push({point: through, command: ['A', radii, 0, false, sweepFlag]})
		}

		const end = vec2.add(center, vec2.direction(endAngle, radius))

		points.push({point: end, command: ['A', radii, 0, false, sweepFlag]})

		return {
			curves: [
				{
					vertices: points,
					closed: false,
				},
			],
		}
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
	 * const f = Path.fan([50, 50], 20, 40, 0, Math.PI / 2)
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

		return closePath(join([outerRim, innerRim]))
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
						{point: start, command: ['L']},
						{point: end, command: ['L']},
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
					vertices: [{point, command: ['L']}],
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
					vertices: points.map(point => ({point, command: ['L']})),
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
					vertices: points.map(point => ({point, command: ['L']})),
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
		const angleStep = (2 * Math.PI) / sides
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
	 * Returns the length of the given path. The returned value is memoized.
	 * @param path The path to measure
	 * @returns The length of the path
	 * @category Properties
	 */
	export const length = memoize((path: Path) => {
		return toPaperPath(path).length
	})

	/**
	 * Calculates the bound of the given path.
	 * @param path The path to calculate
	 * @returns The rect of the path
	 * @category Properties
	 */
	export const bounds = memoize((path: Path): Rect => {
		const bounds = toPaperPath(path).bounds
		return [
			paperPointToVec2(bounds.topLeft),
			paperPointToVec2(bounds.bottomRight),
		]
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
	 * Calculates the point on the path at the offset. If the path consists of multiple curves and the offset concides exactly with the endpoints of two curves, the start point of the later curve will be returned.
	 * @param path The path to calculate
	 * @param offset The offset on the path, where `0` is at the beginning of the path and `Path.length(path)` at the end. It will be clamped when it's out of range.
	 * @returns The point at the given offset
	 * @category Properties
	 */
	export function pointAtOffset(path: Path, offset: number): vec2 {
		return paperAttributeAtOffset(path, offset, (pp, o) =>
			paperPointToVec2(pp.getPointAt(o))
		)
	}

	/**
	 * The same as {@link pointAtOffset} but the offset ranges between [0, 1].
	 * @param path The path to calculate
	 * @param normalizedOffset The offset on the path, where `0` is at the beginning of the path and `1` at the end.
	 * @category Properties
	 */
	export function pointAtNormalizedOffset(
		path: Path,
		normalizedOffset: number
	): vec2 {
		return pointAtOffset(path, normalizedOffset * length(path))
	}

	/**
	 * Calculates the normalized tangent vector of the path at the given offset. If the path consists of multiple curves and the offset concides exactly with the endpoints of two curves, the tangent at start point of the later curve will be returned.
	 * @param path The path to calcuate
	 * @param offset The offset on the path, where `0` is at the beginning of the path and `Path.length(path)` at the end. It will be clamped when it's out of range.
	 * @returns The normalized tangent vector at the given offset
	 * @category Properties
	 */
	export function tangentAtOffset(path: Path, offset: number): vec2 {
		return paperAttributeAtOffset(path, offset, (pp, o) =>
			paperPointToVec2(pp.getTangentAt(o))
		)
	}

	/**
	 * The same as {@link tangentAtOffset} but the offset ranges between [0, 1].
	 * @param path The path to calculate
	 * @param normalizedOffset The offset on the path, where `0` is at the beginning of the path and `1` at the end.
	 * @category Properties
	 */
	export function tangentAtNormalizedOffset(
		path: Path,
		normalizedOffset: number
	): vec2 {
		return tangentAtOffset(path, normalizedOffset * length(path))
	}

	/**
	 * Calculates the normal vector (the perpendicular vector) of the path at the given offset. If the path consists of multiple curves and the offset concides exactly with the endpoints of two curves, the normal at start point of the later curve will be returned.
	 * @param path The path to calcuate
	 * @param offset The offset on the path, where `0` is at the beginning of the path and `Path.length(path)` at the end. It will be clamped when it's out of range.
	 * @returns The normal vector at the given offset
	 * @category Properties
	 */
	export function normalAtOffset(path: Path, offset: number): vec2 {
		const tangent = tangentAtOffset(path, offset)
		return vec2.rotate(tangent, Math.PI / 2)
	}

	/**
	 * The same as {@link normalAtOffset} but the offset ranges between [0, 1].
	 * @param path The path to calculate
	 * @param normalizedOffset The offset on the path, where `0` is at the beginning of the path and `1` at the end.
	 * @category Properties
	 */
	export function normalAtNormalizedOffset(
		path: Path,
		normalizedOffset: number
	): vec2 {
		return normalAtOffset(path, normalizedOffset * length(path))
	}

	/**
	 * Calculates the curvature of the path at the given offset. Curvatures indicate how sharply a path changes direction. A straight line has zero curvature, where as a circle has a constant curvature. The path’s radius at the given offset is the reciprocal value of its curvature.  f the path consists of multiple curves and the offset concides exactly with the endpoints of two curves, the curvature at start point of the later curve will be returned.
	 * @see http://paperjs.org/reference/path/#getcurvatureat-offset
	 * @param path The path to calcuate
	 * @param offset The offset on the path, where `0` is at the beginning of the path and `Path.length(path)` at the end. It will be clamped when it's out of range.
	 * @returns The curvature at the given offset
	 * @category Properties
	 */
	export function curvatureAtOffset(path: Path, offset: number): number {
		return paperAttributeAtOffset(path, offset, (pp, o) => pp.getCurvatureAt(o))
	}

	/**
	 * The same as {@link curvatureAtOffset} but the offset ranges between [0, 1].
	 * @param path The path to calculate
	 * @param normalizedOffset The offset on the path, where `0` is at the beginning of the path and `1` at the end.
	 * @category Properties
	 */
	export function curvatureAtNormalizedOffset(
		path: Path,
		normalizedOffset: number
	): vec2 {
		return tangentAtOffset(path, normalizedOffset * length(path))
	}

	/**
	 * Calculates the transformation matrix of the path at the given offset. The x-axis of the matrix is the tangent vector and the y-axis is the normal vector, and the translation is the point on the path.
	 * @param path The path to calculate
	 * @param normalizedOffset The offset on the path, where `0` is at the beginning of the path and `Path.length(path)` at the end. It will be clamped when it's out of range.
	 * @returns The transformation matrix at the given offset
	 * @category Properties
	 */
	export function transformAtOffset(path: Path, offset: number): mat2d {
		const point = pointAtOffset(path, offset)
		const xAxis = tangentAtOffset(path, offset)
		const yAxis = vec2.rotate(xAxis, Math.PI / 2)
		return [...xAxis, ...yAxis, ...point]
	}

	/**
	 * The same as {@link transformAtOffset} but the offset ranges between [0, 1].
	 * @param path The path to calculate
	 * @param normalizedOffset The offset on the path, where `0` is at the beginning of the path and `1` at the end.
	 * @returns The transformation matrix at the given offset
	 * @category Properties
	 */
	export function transformAtNormalizedOffset(
		path: Path,
		normalizedOffset: number
	): mat2d {
		return transformAtOffset(path, normalizedOffset * length(path))
	}

	/**
	 * Maps each segment in the path to a single or array of vertices and creates a new path concatinating those vertices. you can change the type of commands, and change the number of them in the path, but you cannot change the topology of the path. The segments that were originally continuous remains connected, and vice versa.
	 * @param path The path to map
	 * @param fn The vertex mapping function. It takes a {@link Segment} and returns a single or array of vertices.
	 * @returns The newly created path
	 * @category Modifiers
	 */
	export function flatMapVertex<
		C1 extends Command = Command,
		C2 extends Command = Command,
	>(
		path: Path<C1>,
		fn: (
			segment: Segment<C1>,
			index: number,
			curve: Curve
		) => Vertex<C2> | Vertex<C2>[]
	): Path<C2> {
		return {
			curves: path.curves.map(curve => {
				return {
					vertices: curve.vertices.flatMap((vertex, i, vertices) => {
						const segment: Segment<C1> = {
							start: vertices.at(i - 1)!.point,
							end: vertex.point,
							command: vertex.command,
						}
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
		return flatMapVertex(path, segment => {
			const point = vec2.transformMat2d(segment.end, matrix)
			let command: Command

			if (segment.command[0] === 'L') {
				command = segment.command
			} else if (segment.command[0] === 'C') {
				const c1 = vec2.transformMat2d(segment.command[1], matrix)
				const c2 = vec2.transformMat2d(segment.command[2], matrix)
				command = ['C', c1, c2]
			} else {
				command = Arc.transform(segment as Segment<CommandA>, matrix).command
			}

			return [{point, command}]
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
	 * const p = Path.arc([50, 50], 40, 0, Math.PI)
	 * stroke(p, 'skyblue', 5)
	 * const pa = Path.unarc(p)
	 * stroke(pa, 'tomato')
	 * ```
	 */
	export function unarc(path: Path, angle = scalar.rad(90)): UnarcPath {
		return flatMapVertex(path, ({start, end, command}) => {
			if (command[0] === 'A') {
				return Arc.approximateByCubicBeziers({start, end, command}, angle)
			} else {
				return [{point: end, command}]
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
	export function toCubicBezier(
		path: Path,
		unarcAngle: number = scalar.rad(45)
	): PathC {
		return flatMapVertex(path, segment => {
			if (segment.command[0] === 'C') {
				return [{point: segment.end, command: segment.command}]
			} else if (segment.command[0] === 'A') {
				return Arc.approximateByCubicBeziers(
					segment as Segment<CommandA>,
					unarcAngle ?? scalar.rad(45)
				)
			} else {
				const c1 = vec2.lerp(segment.start, segment.end, 1 / 3)
				const c2 = vec2.lerp(segment.start, segment.end, 2 / 3)
				return [{point: segment.end, command: ['C', c1, c2]}]
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

		return flatMapVertex(unarc(path), (segment): Vertex[] => {
			if (segment.command[0] === 'C') {
				return CubicBezier.divideAtTimes(segment as Segment<CommandC>, times)
			} else {
				return Line.divideAtTimes(segment as Segment<CommandL>, times)
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
	 *     1, Math.cos(phase) * width * freq,
	 *     0, 1,
	 *     x, y + Math.sin(phase) * width
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
		return flatMapVertex(
			toCubicBezier(subdivide(path, subdivideNum), unarcAngle),
			(segment): Vertex[] => {
				let [, c1, c2] = segment.command
				const startXform = transform(segment.start)
				const endXform = transform(segment.end)

				c1 = vec2.transformMat2d(vec2.sub(c1, segment.start), startXform)
				c2 = vec2.transformMat2d(vec2.sub(c2, segment.end), endXform)

				const point: vec2 = [endXform[4], endXform[5]]

				return [{point, command: ['C', c1, c2]}]
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
				const strs = curve.vertices.map(({point, command}, i) => {
					if (i === 0) {
						return `M ${vec2ToString(point)}`
					} else if (command[0] === 'L') {
						return `L ${vec2ToString(point)}`
					} else if (command[0] === 'C') {
						return commandCToString(point, command)
					} else if (command[0] === 'A') {
						return commandAToString(point, command)
					}
				})

				if (curve.closed) {
					const firstVertex = curve.vertices.at(0)

					if (firstVertex && firstVertex.command[0] !== 'L') {
						if (firstVertex.command[0] === 'C') {
							strs.push(
								commandCToString(firstVertex.point, firstVertex.command)
							)
						} else if (firstVertex.command[0] === 'A') {
							strs.push(
								commandAToString(firstVertex.point, firstVertex.command)
							)
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

		function commandCToString(point: vec2, command: CommandC) {
			const c1 = vec2ToString(command[1])
			const c2 = vec2ToString(command[2])
			const p = vec2ToString(point)
			return `C ${c1} ${c2} ${p}`
		}

		function commandAToString(point: vec2, command: CommandA) {
			const radii = vec2ToString(command[1])
			const xAxisRotation = toFixedSimple(command[2])
			const largeArc = command[3] ? '1' : '0'
			const sweep = command[4] ? '1' : '0'
			const p = vec2ToString(point)
			return `A ${radii} ${xAxisRotation} ${largeArc} ${sweep} ${p}`
		}
	}

	/**
	 * Iterates over the segments of the given path.
	 * @param path The path to iterate
	 * @category Utilities
	 */
	export function* iterateSegments(
		path: Path
	): Generator<Segment & {curveIndex: number; segmentIndex: number}> {
		for (const [curveIndex, curve] of path.curves.entries()) {
			let prevPoint: vec2 | undefined
			for (const [segmentIndex, {point, command}] of curve.vertices.entries()) {
				if (prevPoint) {
					yield {
						start: prevPoint,
						end: point,
						command,
						curveIndex,
						segmentIndex: segmentIndex - 1,
					}
				}
				prevPoint = point
			}

			if (curve.closed) {
				const firstVertex = curve.vertices.at(0)
				if (prevPoint && firstVertex) {
					yield {
						start: prevPoint,
						end: firstVertex.point,
						command: firstVertex.command,
						curveIndex,
						segmentIndex: curve.vertices.length - 1,
					}
				}
			}
		}
	}

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

				currentPath = {vertices: [{point, command: ['L']}], closed: false}
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

				currentPath.vertices.push({point, command: ['L']})

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

				currentPath.vertices.push({point, command: ['L']})

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

				currentPath.vertices.push({point, command: ['L']})

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

				const {command} = CubicBezier.fromQuadraticBezier(
					prevPoint,
					control,
					point
				)

				currentPath.vertices.push({point, command})

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

				const {command} = CubicBezier.fromQuadraticBezier(
					prevPoint,
					control,
					point
				)

				currentPath.vertices.push({point, command})

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

				currentPath.vertices.push({point, command: ['C', control1, control2]})

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
				currentPath.vertices.push({point, command: ['C', control1, control2]})

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
					command: ['A', radii, xAxisRotation, !!largeArc, !!sweep],
				})

				prevPoint = point
				prevControl = undefined
			} else if (code === 'Z') {
				if (firstPoint && prevPoint && vec2.equals(firstPoint, prevPoint)) {
					currentPath.vertices[0] = currentPath.vertices.at(-1)!
					currentPath.vertices.pop()
				}

				currentPath.closed = true
				paths.push(currentPath)
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

				for (const {point, command} of vertices) {
					switch (command[0]) {
						case 'L':
							paperPath.lineTo(toPoint(point))
							break
						case 'C':
							paperPath.cubicCurveTo(
								toPoint(command[1]),
								toPoint(command[2]),
								toPoint(point)
							)
							break
						case 'A': {
							const beziers = Arc.approximateByCubicBeziers(
								{start: prev!, end: point, command},
								scalar.rad(90)
							)

							for (const {point, command} of beziers) {
								paperPath.cubicCurveTo(
									toPoint(command[1]),
									toPoint(command[2]),
									toPoint(point)
								)
							}
							break
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
					return {point: paperPointToVec2(point2), command: ['L']}
				} else {
					return {
						point: paperPointToVec2(point2),
						command: [
							'C',
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
					command: ['L'],
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
					vertices: [{point, command: ['L']}],
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
	export function appendCommand(
		path: Path,
		point: vec2,
		command: Command
	): Path {
		const lastCurve = path.curves.at(-1)

		if (lastCurve) {
			return {
				curves: [
					...path.curves.slice(0, -1),
					{
						vertices: [...lastCurve.vertices, {point, command}],
						closed: lastCurve.closed,
					},
				],
			}
		} else {
			return {
				curves: [
					{
						vertices: [{point, command}],
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
		return appendCommand(path, point, ['L'])
	}

	/**
	 * Returns the new path with the new C (cubic Bézier curve) command at the end.
	 * @param path The base path
	 * @param control1 The first control point
	 * @param control2 The second control point
	 * @param end The end point
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function cubicBezierTo(
		path: Path,
		control1: vec2,
		control2: vec2,
		end: vec2
	): Path {
		return appendCommand(path, end, ['C', control1, control2])
	}

	/**
	 * Returns the new path with the new Q (quadratic Bézier curve) command at the end.
	 * @param path The base path
	 * @param control The control point
	 * @param end The end point
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function quadraticBezierTo(
		path: Path,
		control: vec2,
		end: vec2
	): Path {
		const lastPoint = path.curves.at(-1)?.vertices.at(-1)?.point

		if (!lastPoint) {
			throw new Error('The path is empty')
		}

		const control1 = vec2.lerp(lastPoint, control, 2 / 3)
		const control2 = vec2.lerp(end, control, 2 / 3)

		return appendCommand(path, end, ['C', control1, control2])
	}

	/**
	 * Returns the new path with the new A (arc) command at the end.
	 * @param path The base path
	 * @param radii The radii of the ellipse used to draw the arc
	 * @param xAxisRotation The rotation angle of the ellipse's x-axis relative to the x-axis of the current coordinate system, expressed in degrees
	 * @param largeArcFlag The large arc flag. If true, then draw the arc spanning greather than 180 degrees. Otherwise, draw the arc spanning less than 180 degrees.
	 * @param sweepFlag The sweep flag. If true, then draw the arc in a "positive-angle" direction in the current coordinate system. Otherwise, draw it in a "negative-angle" direction.
	 * @param end The end point of the arc
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function arcTo(
		path: Path,
		radii: vec2,
		xAxisRotation: number,
		largeArcFlag: boolean,
		sweepFlag: boolean,
		end: vec2
	): Path {
		return appendCommand(path, end, [
			'A',
			radii,
			xAxisRotation,
			largeArcFlag,
			sweepFlag,
		])
	}

	/**
	 * Returns the new path with the new Z (close path) command at the end.
	 * @param path The base path
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function closePath(path: Path): Path {
		const lastCurve = path.curves.at(-1)

		if (lastCurve) {
			return {
				curves: [
					...path.curves.slice(0, -1),
					{
						vertices: lastCurve.vertices,
						closed: true,
					},
				],
			}
		} else {
			return path
		}
	}
}

function paperPointToVec2(point: paper.Point): vec2 {
	return [point.x, point.y]
}

function paperAttributeAtOffset<T>(
	path: Path,
	offset: number,
	f: (pp: paper.Path, offset: number) => T
): T {
	const paperPath = Path.toPaperPath(path)

	const paperPaths =
		paperPath instanceof paper.Path
			? [paperPath]
			: (paperPath.children as paper.Path[])

	offset = scalar.clamp(offset, 0, paperPath.length)

	for (let i = 0; i < paperPaths.length; i++) {
		const pp = paperPaths[i]
		if (offset < pp.length || i === paperPaths.length - 1) {
			return f(pp, offset)
		}
		offset -= pp.length
	}

	throw new Error('Cannot find a point at the given offset')
}

function drawToRenderingContext(
	path: Path,
	context: Path2D | CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
) {
	for (const {vertices, closed} of path.curves) {
		vertices.forEach(({point, command}, i) => {
			if (i === 0) {
				context.moveTo(...point)
				return
			}

			if (command[0] === 'L') {
				context.lineTo(...point)
			} else if (command[0] === 'C') {
				context.bezierCurveTo(...command[1], ...command[2], ...point)
			} else if (command[0] === 'A') {
				const prev = vertices.at(i - 1)?.point

				if (!prev) throw new Error('The previous point is not found')

				arcTo(context, prev, point, command)
			}
		})

		if (closed) {
			const first = vertices.at(0)

			if (first && first.command[0] !== 'L') {
				const {point, command} = first
				if (command[0] === 'C') {
					context.bezierCurveTo(...command[1], ...command[2], ...point)
				} else if (first.command[0] === 'A') {
					const prev = vertices.at(-1)?.point

					if (!prev) throw new Error('The previous point is not found')

					arcTo(context, prev, point, command)
				}
			}

			context.closePath()
		}
	}

	function arcTo(
		contxt:
			| Path2D
			| CanvasRenderingContext2D
			| OffscreenCanvasRenderingContext2D,
		start: vec2,
		end: vec2,
		command: CommandA
	) {
		const ret = Arc.toCenterParameterization({
			start,
			end,
			command,
		})

		contxt.ellipse(
			...ret.center,
			...ret.radii,
			ret.xAxisRotation,
			...ret.angles,
			ret.counterclockwise
		)
	}
}
