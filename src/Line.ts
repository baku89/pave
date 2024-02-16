import {vec2} from 'linearly'

import {VertexL} from './Path'
import {Rect} from './Rect'
import {SegmentL} from './Segment'

/**
 * A collection of functions to handle a line represented with {@link CommandL}.
 */
export namespace Line {
	export function bounds(line: SegmentL): Rect {
		const {start, end} = line
		return Rect.fromPoints(start, end)
	}

	export function pointAtTime(line: SegmentL, t: number) {
		const {start, end} = line
		return vec2.lerp(start, end, t)
	}

	export function divideAtTimes(line: SegmentL, times: number[]): VertexL[] {
		return [...times, 1].map(t => {
			return {point: vec2.lerp(line.start, line.end, t), command: line.command}
		})
	}
}
