import {vec2} from 'linearly'

/**
 * Move-to command.
 * @category Type Aliases
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#line_commands
 */
export type CommandM = readonly ['M', end: vec2]

/**
 * Line-to command.
 * @category Type Aliases
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#line_commands
 */
export type CommandL = readonly ['L', end: vec2]

/**
 * Horizontal line-to command.
 * @category Type Aliases
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#line_commands
 */
export type CommandH = readonly ['H', end: number]

/**
 * Vertical line-to command.
 * @category Type Aliases
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#line_commands
 */
export type CommandV = readonly ['V', end: number]

/**
 * Cubic Bézier curve command.
 * @category Type Aliases
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 */
export type CommandC = readonly ['C', control1: vec2, control2: vec2, end: vec2]

/**
 * Cubic Bézier curve command with implicit first control point (the reflection of the previous control point).
 * @category Type Aliases
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 */
export type CommandS = readonly ['S', control2: vec2, end: vec2]

/**
 * Quadratic Bézier curve command.
 * @category Type Aliases
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 */
export type CommandQ = readonly ['Q', control: vec2, end: vec2]

/**
 * Quadratic Bézier curve command with implicit control point (the reflection of the previous control point).
 * @category Type Aliases
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 */
export type CommandT = readonly ['T', end: vec2]

/**
 * Close path command
 * @category Type Aliases
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#line_commands
 */
export type CommandZ = readonly ['Z']

/**
 * Arc command
 * @category Type Aliases
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#arcs
 */
export type CommandA = [
	'A',
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
	/**
	 * The end point of the arc.
	 */
	end: vec2,
]

/**
 * SVG path commands that can be used in Pathed.js directly.
 * @category Type Aliases
 */
export type Command =
	| CommandM
	| CommandL
	| CommandC
	| CommandQ
	| CommandZ
	| CommandA

/**
 * SVG path commands that use short-hand notation by depending on the previous command. In Pathed.js, these commands are converted to the corresponding full commands for simplicity.
 * @category Type Aliases
 */
export type ShortCommand = CommandH | CommandV | CommandS | CommandT
