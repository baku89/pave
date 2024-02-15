import {vec2} from 'linearly'

import {Vertex} from './Path'
import {Rect} from './Rect'
import {Segment} from './Segment'

/**
 * A collection of functions to handle a line represented with {@link CommandL}.
 */
export namespace Line {
	export function bounds(line: Segment<'L'>): Rect {
		const {start, end} = line
		return Rect.fromPoints(start, end)
	}

	export function pointAtTime(line: Segment<'L'>, t: number) {
		const {start, end} = line
		return vec2.lerp(start, end, t)
	}

	export function divideAtTimes(
		line: Segment<'L'>,
		times: number[]
	): Vertex<'L'>[] {
		return [...times, 1].map(t => {
			return {point: vec2.lerp(line.start, line.end, t), command: line.command}
		})
	}
}
