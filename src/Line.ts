import {vec2} from 'linearly'

import {CommandL, Vertex} from './Path'
import {Rect} from './Rect'
import {Segment} from './Segment'

/**
 * A collection of functions to handle a line represented with {@link CommandL}.
 */
export namespace Line {
	export function bounds(line: Segment<CommandL>): Rect {
		const {start, end} = line
		return Rect.fromPoints(start, end)
	}

	export function pointAtTime(line: Segment<CommandL>, t: number) {
		const {start, end} = line
		return vec2.lerp(start, end, t)
	}

	export function divideAtTimes(
		line: Segment<CommandL>,
		times: number[]
	): Vertex<CommandL>[] {
		return [...times, 1].map(t => {
			return {point: vec2.lerp(line.start, line.end, t), command: line.command}
		})
	}
}
