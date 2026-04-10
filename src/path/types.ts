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
}

/**
 * A vertex representing a cubic Bézier curve (`C`) command.
 * @category Types
 **/
export type VertexC = {
	readonly point: vec2
	readonly command: 'C'
	readonly args: CommandArgsC
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
