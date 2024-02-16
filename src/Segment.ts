import {vec2} from 'linearly'

import {Command, CommandA, CommandC, CommandL} from './Path'

/**
 * A segment of a path, which consists of a starting point, end point, and an interpolation command.
 * @category Types
 */
export type Segment<C extends Command = Command> = {
	start: vec2
	end: vec2
	command: C
}

/** @category Types */
export type SegmentL = Segment<CommandL>

/** @category Types */
export type SegmentC = Segment<CommandC>

/** @category Types */
export type SegmentA = Segment<CommandA>
