import type {SegmentL} from './Segment'

/**
 * Almost equivalent to {@link SegmentL}, but the redundant `command` field can be omitted. Used for the argument of Line functions.
 * @category Types
 */
export type BareSegmentL = Omit<SegmentL, 'command'>

/**
 * A collection of functions to handle a line represented with {@link SegmentL}.
 * @category Modules
 */
export * as Line from './ns/Line'
