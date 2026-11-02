import type {vec2} from 'linearly'

/**
 * Arguments for cubic Bézier curve (`C`) command.
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 * @category Types
 */
export type CommandArgsC = readonly [control1: vec2, control2: vec2]

/**
 * Arguments for arc (`A`) command
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

/**
 * The value of an attribute. Numbers and arrays of numbers can be interpolated.
 * @category Attributes
 */
export type AttributeValue = number | boolean | string | readonly number[]

/**
 * Named attributes. They can be set on a vertex, a curve or a whole path; reading one looks up those levels in this order. A group is just a boolean attribute.
 * @category Attributes
 */
export type Attributes = Readonly<Record<string, AttributeValue>>

/**
 * How an attribute changes along a segment. The names keep a path representable in JSON.
 *
 * - `linear`: Interpolates numbers and arrays of numbers.
 * - `oklab`: Regards `[r, g, b]` or `[r, g, b, a]` as sRGB in the range of 0 to 1, and interpolates in OKLab.
 * - `step`: Keeps the value of the start.
 * - `and`: Becomes true only when both ends are true.
 *
 * A function must not depend on how the segment is subdivided: interpolating at `t` between `a` and the value at `s` must equal interpolating at `s * t` between `a` and `b`.
 * @category Attributes
 */
export type AttributeInterpolation =
	| 'linear'
	| 'oklab'
	| 'step'
	| 'and'
	| ((a: any, b: any, t: number) => AttributeValue)

/**
 * The definition of an attribute.
 * @category Attributes
 */
export interface AttributeDef {
	/** The value when it is not set on any level */
	readonly default?: AttributeValue
	readonly interpolate?: AttributeInterpolation
}

/** @category Attributes */
export type AttributeDefs = Readonly<Record<string, AttributeDef>>

/** @category Attributes */
export type AttributeLevel = 'vertex' | 'curve' | 'path'

/**
 * Where a vertex is, passed to the functions reading it.
 * @category Attributes
 */
export interface VertexContext {
	/** The index of the vertex in the curve */
	index: number
	curve: import('../index').Curve
	curveIndex: number
	path: import('../index').Path
}

/** @category Attributes */
export interface CurveContext {
	index: number
	path: import('../index').Path
}

/**
 * Anything that can be read like an attribute of a vertex: a constant, the name of a stored attribute, or a function computing it on the fly.
 * @category Attributes
 */
export type AttributeLike<T extends AttributeValue = AttributeValue> =
	| Exclude<T, string>
	| string
	| ((vertex: Vertex, context: VertexContext) => T)

/**
 * A vertex of a path. It consists of a end point and an interpolation command from the previous vertex, which is either a line (`L`) command, a cubic Bézier curve (`C`) command, or an arc (`A`) command.
 * @category Types
 */
export type Vertex = VertexL | VertexC | VertexA

/**
 * A vertex representing a line (`L`) command.
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#Line_commands
 * @category Types
 */
export type VertexL = {
	readonly point: vec2
	readonly command: 'L'
	readonly args?: undefined
	readonly attrs?: Attributes
}

/**
 * A vertex representing a cubic Bézier curve (`C`) command.
 * @category Types
 **/
export type VertexC = {
	readonly point: vec2
	readonly command: 'C'
	readonly args: CommandArgsC
	readonly attrs?: Attributes
}

/**
 * A vertex representing an arc (`A`) command.
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#arcs
 **/
export type VertexA = {
	readonly point: vec2
	readonly command: 'A'
	readonly args: CommandArgsA
	readonly attrs?: Attributes
}

/**
 * A token or numeric argument in a sequence passed to {@link Path.fromSVG}.
 * @category Types
 */
export type SVGCommand =
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
