import {mat2d, scalar, vec2} from 'linearly'
import paper from 'paper'
import {OffsetOptions as PaperOffsetOptions, PaperOffset} from 'paperjs-offset'

import {Command, CommandA, ShortCommand} from './Command'
import {Rect} from './Rect'
import {Segment} from './Segment'
import {memoize, toFixedSimple} from './utils'

paper.setup(document.createElement('canvas'))

/**
 * A path represented as an array of commands. All of the points are represented as tuple of vector `[x: number, y: number]` and represented in absolute coordinates.
 * @category Type Aliases
 */
export type Path = readonly Command[]

/**
 * A path commands which also include short-hands. This can be converted to {@link Path} by {@link Path.unshort}.
 * @category Type Aliases
 */
export type PathWithShortCommand = readonly (Command | ShortCommand)[]

/**
 * Functions for manipulating paths represented as {@link Path}.
 */
export namespace Path {
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
		return [
			['M', start],
			['L', [end[0], start[1]]],
			['L', end],
			['L', [start[0], end[1]]],
			['Z'],
		]
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
		return [
			['M', [center[0] + radius[0], center[1]]],
			['A', radius, 0, false, true, [center[0] - radius[0], center[1]]],
			['A', radius, 0, false, true, [center[0] + radius[0], center[1]]],
			['Z'],
		]
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
		if (radius === 0) {
			return [['M', center]]
		}

		const start = vec2.add(center, vec2.direction(startAngle, radius))

		if (scalar.equals(startAngle, endAngle)) {
			return [['M', start]]
		}

		const radii: vec2 = [radius, radius]
		const sweepFlag = endAngle > startAngle

		const commands: CommandA[] = []

		while (Math.abs(endAngle - startAngle) > Math.PI) {
			startAngle += Math.PI * (sweepFlag ? 1 : -1)
			const through = vec2.add(center, vec2.direction(startAngle, radius))
			commands.push(['A', radii, 0, false, sweepFlag, through])
		}

		const end = vec2.add(center, vec2.direction(endAngle, radius))

		return [['M', start], ...commands, ['A', radii, 0, false, sweepFlag, end]]
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

		const innerRimL = [
			['L', ...innerRim[0].slice(1)],
			...innerRim.slice(1),
		] as Path

		return [...outerRim, ...innerRimL, ['Z']]
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
		return [
			['M', start],
			['L', end],
		]
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
		return [['M', point], ['Z']]
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
		if (points.length === 0) return []

		const [first, ...rest] = points

		return [['M', first], ...rest.map(p => ['L', p] as const)]
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
		if (points.length === 0) return []

		return closePath(polyline(...points))
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
	 * Calculates the rect of the given path.
	 * @param path The path to calculate
	 * @returns The rect of the path
	 * @category Properties
	 */
	export const bounds = memoize((path: Path): Rect => {
		const bounds = toPaperPath(path).bounds
		return [toVec2(bounds.topLeft), toVec2(bounds.bottomRight)]
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
	 * Returns if the given path is closed.
	 * @param path The path to check
	 * @returns True if the path is closed
	 * @category Properties
	 */
	export const closed = (path: Path) => {
		return path.at(-1)?.[0] === 'Z'
	}

	/**
	 * Calculates the point on the path at the offset. If the path consists of multiple subpaths and the offset concides exactly with the endpoints of two subpaths, the start point of the later subpath will be returned.
	 * @param path The path to calculate
	 * @param offset The offset on the path, where `0` is at the beginning of the path and `Path.length(path)` at the end. It will be clamped when it's out of range.
	 * @returns The point at the given offset
	 * @category Properties
	 */
	export function pointAtOffset(path: Path, offset: number): vec2 {
		const paperPath = toPaperPath(path)

		offset = scalar.clamp(offset, 0, paperPath.length)

		const subpaths =
			paperPath instanceof paper.Path
				? [paperPath]
				: (paperPath.children as paper.Path[])

		for (let i = 0; i < subpaths.length; i++) {
			const subpath = subpaths[i]
			if (offset < subpath.length || i === subpaths.length - 1) {
				return toVec2(subpath.getPointAt(offset))
			}
			offset -= subpath.length
		}

		throw new Error('Cannot find a point at the given offset')
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
	 * Calculates the normalized tangent vector of the path at the given offset.
	 * @param path The path to calcuate
	 * @param offset The offset on the path, where `0` is at the beginning of the path and `Path.length(path)` at the end. It will be clamped when it's out of range.
	 * @returns The normalized tangent vector at the given offset
	 * @category Properties
	 */
	export function tangentAtOffset(path: Path, offset: number): vec2 {
		const paperPath = toPaperPath(path)

		offset = scalar.clamp(offset, 0, paperPath.length)

		const subpaths =
			paperPath instanceof paper.Path
				? [paperPath]
				: (paperPath.children as paper.Path[])

		for (let i = 0; i < subpaths.length; i++) {
			const subpath = subpaths[i]
			if (offset < subpath.length || i === subpaths.length - 1) {
				return toVec2(subpath.getTangentAt(offset))
			}
			offset -= subpath.length
		}

		throw new Error('Cannot find a point at the given offset')
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
	 * Calculates the normal vector (the perpendicular vector) of the path at the given offset.
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
	 * Calculates the curvature of the path at the given offset. Curvatures indicate how sharply a path changes direction. A straight line has zero curvature, where as a circle has a constant curvature. The path’s radius at the given offset is the reciprocal value of its curvature.
	 * @see http://paperjs.org/reference/path/#getcurvatureat-offset
	 * @param path The path to calcuate
	 * @param offset The offset on the path, where `0` is at the beginning of the path and `Path.length(path)` at the end. It will be clamped when it's out of range.
	 * @returns The curvature at the given offset
	 * @category Properties
	 */
	export function curvatureAtOffset(path: Path, offset: number): number {
		const paperPath = toPaperPath(path)

		offset = scalar.clamp(offset, 0, paperPath.length)

		const subpaths =
			paperPath instanceof paper.Path
				? [paperPath]
				: (paperPath.children as paper.Path[])

		for (let i = 0; i < subpaths.length; i++) {
			const subpath = subpaths[i]
			if (offset < subpath.length || i === subpaths.length - 1) {
				return subpath.getCurvatureAt(offset)
			}
			offset -= subpath.length
		}

		throw new Error('Cannot find a point at the given offset')
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
	 * Transforms the given path by the given matrix.
	 * @param path The path to transform
	 * @param matrix The matrix to transform the path by
	 * @returns The transformed path
	 * @category Modifiers
	 */
	export function transform(path: Path, matrix: mat2d): Path {
		return path.map(seg => {
			switch (seg[0]) {
				case 'M':
				case 'L':
				case 'Q':
				case 'C':
					return [
						seg[0],
						...(seg.slice(1) as vec2[]).map(p =>
							vec2.transformMat2d(p, matrix)
						),
					]
				case 'A':
					throw new Error('Not implemented')
				case 'Z':
					return ['Z']
			}
		}) as Path
	}

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
	 * Joins the given paths into a single paths. If the last point of the previous path is approximately equal to point of the M command at the beginning of the next path, then the M command is omitted.
	 * @param paths The paths to join
	 * @returns The joined path
	 * @category Modifiers
	 */
	export function join(...paths: Path[]): Path {
		return paths.reduce((acc, path) => {
			// Check if the last point of the previous path is approximately equal to
			// the first point of the next path.
			if (acc.length > 0 && path.length > 0) {
				const lastSeg = acc.at(-1)!
				const firstSeg = path[0]
				if (lastSeg[0] !== 'Z' && firstSeg[0] === 'M') {
					const lastPoint = lastSeg.at(-1) as vec2
					if (vec2.equals(lastPoint, firstSeg[1])) {
						return [...acc, ...path.slice(1)]
					}
				}
			}

			return [...acc, ...path]
		}, [])
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
	 * Unites the given paths
	 * @param paths The paths to unite
	 * @returns The resulting path
	 * @category Boolean Operations
	 */
	export function unite(...paths: Path[]): Path {
		const paperPath = paths
			.map(toPaperPath)
			.reduce(
				(merged, p) => merged.unite(p, {insert: false}) as paper.CompoundPath,
				new paper.CompoundPath({})
			)

		return fromPaperPath(paperPath)
	}

	/**
	 * Subtracts the given paths
	 * @param paths The paths to subtract. The first path is substracted by the following paths.
	 * @returns The resulting path
	 * @category Boolean Operations
	 */
	export function subtract(...paths: Path[]): Path {
		if (paths.length === 0) {
			return []
		} else if (paths.length === 1) {
			return paths[0]
		}

		const [subject, ...tools] = paths.map(toPaperPath)

		const paperPath = tools.reduce(
			(merged, p) => merged.subtract(p, {insert: false}) as paper.CompoundPath,
			subject
		)

		return fromPaperPath(paperPath)
	}

	/**
	 * Converts the shorthand commands ({@link ShortCommand}) to the corresponding full commands.
	 * @param path The path to unshort
	 * @returns The unshorted path
	 * @category Converters
	 */
	export function unshort(path: PathWithShortCommand): Path {
		let prev: vec2 | undefined
		let prevControl: vec2 | undefined

		const unshortPath: Command[] = []

		for (const seg of path) {
			switch (seg[0]) {
				// Short commands
				case 'H':
					unshortPath.push(['L', [seg[1], prev![1]]])
					prev = [seg[1], prev![1]]
					break
				case 'V':
					unshortPath.push(['L', [prev![0], seg[1]]])
					prev = [prev![0], seg[1]]
					break
				case 'S': {
					const control1 = vec2.lerp(prev!, prevControl!, -1)
					const [, control2, end] = seg
					unshortPath.push(['C', control1, control2, end])
					prev = end
					prevControl = control2
					break
				}
				case 'T': {
					const control = vec2.lerp(prev!, prevControl!, -1)
					const [, end] = seg
					unshortPath.push(['Q', control, end])
					prev = end
					prevControl = control
					break
				}
				// Non-short commands
				case 'C': {
					const [, , control2, end] = seg
					unshortPath.push(seg)
					prev = end
					prevControl = control2
					break
				}
				case 'Q': {
					const [, control, end] = seg
					unshortPath.push(seg)
					prev = end
					prevControl = control
					break
				}
				case 'M':
				case 'L':
					unshortPath.push(seg)
					prev = seg[1]
					break
				case 'Z':
					unshortPath.push(seg)
					prev = undefined
					break
			}
		}

		return unshortPath
	}

	/**
	 * Converts the given path to a string that can be used as the d attribute of an SVG path element.
	 * @param path The path to convert
	 * @param fractionDigits The number of digits to appear after the decimal point
	 * @returns The string for the d attribute of the SVG path element
	 * @category Converters
	 */
	export function toSVG(path: Path, fractionDigits = 2): string {
		return path
			.map(([command, ...ps]) => {
				const strs = ps.map(p => {
					if (typeof p === 'number') {
						return toFixedSimple(p, fractionDigits)
					} else if (typeof p === 'boolean') {
						return p ? '1' : '0'
					} else {
						const x = toFixedSimple(p[0], fractionDigits)
						const y = toFixedSimple(p[1], fractionDigits)
						return `${x},${y}`
					}
				})

				return [command, ...strs].join(' ')
			})
			.join(' ')
	}

	/**
	 * Creates a Path2D instance with the given path data.
	 * @param path The path to convert
	 * @returns The newly created Path2D
	 * @category Converters
	 */
	export const toPath2D = memoize((path: Path): Path2D => {
		const path2d = new Path2D()

		let prev: vec2 | undefined

		for (const seg of path) {
			switch (seg[0]) {
				case 'M':
					path2d.moveTo(...seg[1])
					prev = seg[1]
					break
				case 'L':
					path2d.lineTo(...seg[1])
					prev = seg[1]
					break
				case 'C':
					path2d.bezierCurveTo(...seg[1], ...seg[2], ...seg[3])
					prev = seg[3]
					break
				case 'Q':
					path2d.quadraticCurveTo(...seg[1], ...seg[2])
					prev = seg[2]
					break
				case 'A': {
					const ret = Segment.arcCommandToCenterParameterization([prev!, seg])

					path2d.ellipse(
						...ret.center,
						...ret.radii,
						ret.xAxisRotation,
						...ret.angles,
						ret.counterclockwise
					)

					prev = seg[5]
					break
				}
				case 'Z':
					path2d.closePath()
					break
			}
		}

		return path2d
	})

	/**
	 * Converts the given path to paper.Path
	 * @see http://paperjs.org/reference/pathitem/
	 * @param path The path to convert
	 * @returns The newly created paper.Path instance
	 * @category Converters
	 */
	export const toPaperPath = memoize(
		(path: Path): paper.Path | paper.CompoundPath => {
			const paperPaths = [...iterateSubpath(path)].map(path => {
				const paperPath = new paper.Path()
				let prev: vec2 | undefined

				for (const seg of path) {
					switch (seg[0]) {
						case 'M':
							paperPath.moveTo(toPoint(seg[1]))
							prev = seg[1]
							break
						case 'L':
							paperPath.lineTo(toPoint(seg[1]))
							prev = seg[1]
							break
						case 'C':
							paperPath.cubicCurveTo(
								toPoint(seg[1]),
								toPoint(seg[2]),
								toPoint(seg[3])
							)
							prev = seg[3]
							break
						case 'Q':
							paperPath.quadraticCurveTo(toPoint(seg[1]), toPoint(seg[2]))
							prev = seg[2]
							break
						case 'A': {
							const [, [rx, ry], xAxisRotation, , , end] = seg

							if (rx !== ry || xAxisRotation !== 0) {
								throw new Error('Ellipse or tilted arc is not yet supported')
							}

							const ret = Segment.arcCommandToCenterParameterization([
								prev!,
								seg,
							])

							const midAngle = (ret.angles[0] + ret.angles[1]) / 2

							const through = vec2.add(ret.center, vec2.direction(midAngle, rx))

							paperPath.arcTo(toPoint(through), toPoint(end))

							prev = end

							break
						}
						case 'Z':
							paperPath.closePath()
							break
					}
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
		const subpaths =
			paperPath instanceof paper.CompoundPath
				? (paperPath.children as paper.Path[])
				: ([paperPath] as paper.Path[])

		const path: Command[] = []

		for (const subpath of subpaths) {
			let started = false

			for (const curve of subpath.curves) {
				if (!started) {
					path.push(['M', toVec2(curve.point1)])
					started = true
				}
				if (curve.isStraight()) {
					path.push(['L', toVec2(curve.point2)])
				} else {
					path.push([
						'C',
						toVec2(curve.point1.add(curve.handle1)),
						toVec2(curve.point2.add(curve.handle2)),
						toVec2(curve.point2),
					])
				}
			}

			if (subpath.closed) {
				// Delete the  redundant segment if it is a line segment
				const lastSeg = path.at(-1)
				if (lastSeg && lastSeg[0] === 'L') {
					path.pop()
				}
				// Close the path
				path.push(['Z'])
			}
		}

		return path
	})

	/**
	 * Returns the new path with the new M (move-to) command at the end.
	 * @param path The base path
	 * @param point The point to move to
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function moveTo(path: Path, point: vec2): Path {
		return [...path, ['M', point]]
	}

	/**
	 * Returns the new path with the new L (line-to) command at the end.
	 * @param path The base path
	 * @param point The point to draw a line to
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function lineTo(path: Path, point: vec2): Path {
		return [...path, ['L', point]]
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
		return [...path, ['C', control1, control2, end]]
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
		return [...path, ['Q', control, end]]
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
		return [...path, ['A', radii, xAxisRotation, largeArcFlag, sweepFlag, end]]
	}

	/**
	 * Returns the new path with the new Z (close path) command at the end.
	 * @param path The base path
	 * @returns The newely created path
	 * @category Draw Functions
	 */
	export function closePath(path: Path): Path {
		return [...path, ['Z']]
	}

	/**
	 * Iterate over the split sections of path, each of which begins with a M command
	 * @param path The path to subdivide
	 * @returns The iterator for subpaths
	 * @category Utilities
	 */
	export const iterateSubpath = memoize(function* (
		path: Path
	): Generator<Path> {
		let start = 0
		for (let end = start + 1; end <= path.length; end++) {
			if (end === path.length || path[end][0] === 'M') {
				yield path.slice(start, end)
				start = end
			}
		}
	})
}

function toVec2(point: paper.Point): vec2 {
	return [point.x, point.y]
}
