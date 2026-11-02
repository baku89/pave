import type {Curve} from './Curve'
import type {Path as PathSelf} from './Path'
import type {Vertex, VertexA, VertexC, VertexL} from './path/types'

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
	readonly curves: Curve<V>[]
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
