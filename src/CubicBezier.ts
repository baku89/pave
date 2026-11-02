import type {SegmentC} from './Segment'

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
export * as CubicBezier from './ns/CubicBezier'
