import type {vec2} from 'linearly'

import type {Curve as CurveSelf, Path as PathSelf} from './index'
import type {Vertex, VertexA, VertexC, VertexL} from './path/types'
export * from './Location'
export type {PartialBy} from './utils'

// The declaration emit cannot name a type that shares its name with a namespace re-export in
// the same file, so these types refer to one another through a self import.

/**
 * The angle range to check. `startAngle` is always in the range of [-π, π], and the `endAngle` is relative angle considering the rotation direction, with start angle as a reference.
 * @category Types
 */
export type AngleRange = readonly [startAngle: number, endAngle: number]

/**
 * Almost equivalent to {@link SegmentA}, but the redundant `command` field can be omitted. Used for the argument of Arc functions.
 * @category Types
 */
export type BareSegmentA = Omit<SegmentA, 'command'>

/**
 * A collection of functions to handle arcs represented with {@link SegmentA}.
 * @category Modules
 */
export * as Arc from './Arc'

/**
 * Almost equivalent to {@link SegmentC}, but the redundant `command` field can be omitted. Used for the argument of CubicBezier functions.
 * @category Types
 */
export type BareSegmentC = Omit<SegmentC, 'command'>

/**
 * A collection of functions to handle a cubic Bézier segment represented as {@link BareSegmentC}.
 *
 * The projection strategy follows bezier-js (MIT, https://github.com/Pomax/bezierjs).
 * @category Modules
 */
export * as CubicBezier from './CubicBezier'

/**
 * A single open or closed stroke represented as an array of vertices. All of the points are represented as tuple `[x: number, y: number]` and the commands are represented in absolute form.
 *
 * Values are immutable: do not mutate `vertices` or their elements in place. {@link Curve} helpers may memoize by reference.
 * @category Types
 */
export type Curve<V extends Vertex = Vertex> = {
	readonly vertices: V[]
	readonly closed: boolean
}

/** @category Types */
export type CurveL = CurveSelf<VertexL>

/** @category Types */
export type CurveC = CurveSelf<VertexC>

/** @category Types */
export type CurveA = CurveSelf<VertexA>

/**
 * A collection of functions to handle {@link Curve}. Inputs are never mutated; returned curves are new objects unless noted otherwise.
 * @category Modules
 */
export * as Curve from './Curve'

export type CurveGroup =
	| number
	| number[]
	| Set<number>
	| ((curve: CurveSelf, index: number) => boolean)

export * as CurveGroup from './CurveGroup'

/**
 * A collection of utility functions for working with iterables.
 * @category Modules
 */
export * as Iter from './Iter'

/**
 * Almost equivalent to {@link SegmentL}, but the redundant `command` field can be omitted. Used for the argument of Line functions.
 * @category Types
 */
export type BareSegmentL = Omit<SegmentL, 'command'>

/**
 * A collection of functions to handle a line represented with {@link SegmentL}.
 * @category Modules
 */
export * as Line from './Line'

/**
 * A segment of a path, which consists of a starting point, end point, and an interpolation command.
 * @category Types
 */
// prettier-ignore
export type Segment<V extends Vertex = Vertex> = V extends VertexL
	? SegmentL
	: V extends VertexC
	? SegmentC
	: V extends VertexA
	? SegmentA
	: SegmentL | SegmentC | SegmentA

/** @category Types */
export type SegmentL = VertexL & {start: vec2}

/** @category Types */
export type SegmentC = VertexC & {start: vec2}

/** @category Types */
export type SegmentA = VertexA & {start: vec2}

/**
 * A collection of functions to handle {@link Segment}.
 * @category Modules
 */
export * as Segment from './Segment'

export type {
	CommandArgsA,
	CommandArgsC,
	Vertex,
	VertexA,
	VertexC,
	VertexL,
	SVGCommand,
} from './path/types'

/**
 * A path that consists of multiple curves.
 *
 * Values are immutable: do not mutate `curves`, nested curves, or vertices in place. {@link Path} helpers may memoize by reference.
 * @category Types
 */
export type Path<V extends Vertex = Vertex> = {
	readonly curves: CurveSelf<V>[]
}

/**
 * A path that only consists of line (`L`) commands, which is a simple polygon or polyline.
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#Line_commands
 **/
export type PathL = PathSelf<VertexL>

/**
 * A path that only consists of cubic Bézier curve (`C`) commands.
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 **/
export type PathC = PathSelf<VertexC>

/**
 * A path that only consists of arc (`A`) commands.
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 **/
export type PathA = PathSelf<VertexA>

/**
 * A path that does not contain any {@link VertexA}. It can be obtained by {@link Path.unarc}, while approximating arcs to cubic Bézier curves. In some non-affine transformations such as {@link Path.distort}, all arcs are internally converted to this type of path.
 * @category Types
 */
export type UnarcPath = PathSelf<VertexL | VertexC>

/**
 * Functions for manipulating paths represented as {@link Path}.
 *
 * For creating new paths, see [Primitives](#primitives). Getting intrinsic properties of paths, see [Properties](#properties).
 * Manipulating existing paths, such as transforming, styling, deforming, etc., see [Modifiers](#modifiers).
 *
 * Inputs are never mutated; returned paths are new objects unless noted otherwise.
 *
 * @category Modules
 */
export * as Path from './path/index'
