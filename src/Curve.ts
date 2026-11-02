import type {Curve as CurveSelf} from './Curve'
import type {Vertex, VertexA, VertexC, VertexL} from './Path'

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
export * as Curve from './ns/Curve'
