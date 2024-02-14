import {vec2} from 'linearly'

import {Command} from './Path'

/**
 * A segment of a path, which consists of a starting point, end point, and an interpolation command.
 * @category Types
 */
export interface Segment<C extends Command = Command> {
	start: vec2
	end: vec2
	command: C
}
