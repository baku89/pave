import {vec2} from 'linearly'

import {Code, CommandForCode} from './Path'

/**
 * A segment of a path, which consists of a starting point, end point, and an interpolation command.
 * @category Types
 */
export type Segment<C extends Code = Code> = {
	start: vec2
	end: vec2
	command: CommandForCode<C>
}
