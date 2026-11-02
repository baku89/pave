import type {SegmentA} from './Segment'

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
export * as Arc from './ns/Arc'
