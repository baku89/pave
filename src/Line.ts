import {mat2d, vec2} from 'linearly'

import {SegmentLocation} from './Location'
import {VertexL} from './Path'
import {Rect} from './Rect'
import {SegmentL} from './Segment'
import {PartialBy} from './utils'

type SimpleSegmentL = PartialBy<SegmentL, 'command'>

/**
 * A collection of functions to handle a line represented with {@link CommandL}.
 */
export namespace Line {
	export function bounds(line: SimpleSegmentL): Rect {
		const {start, point} = line
		return Rect.fromPoints(start, point)
	}

	export function point(line: SimpleSegmentL, loc: SegmentLocation): vec2 {
		const time = toTime(line, loc)
		return vec2.lerp(line.start, line.point, time)
	}

	export function derivative(line: SimpleSegmentL): vec2 {
		return vec2.sub(line.point, line.start)
	}

	export function tangent(line: SimpleSegmentL): vec2 {
		return vec2.normalize(derivative(line))
	}

	export function normal(line: SimpleSegmentL): vec2 {
		return vec2.rotate(tangent(line), 90)
	}

	export const curvature = 0

	export function orientation(
		line: SimpleSegmentL,
		loc: SegmentLocation
	): mat2d {
		const p = point(line, loc)
		const xAxis = tangent(line)
		const yAxis = vec2.rotate(xAxis, 90)
		return [...xAxis, ...yAxis, ...p]
	}

	export function divideAtTimes(
		line: SimpleSegmentL,
		times: number[]
	): VertexL[] {
		return [...times, 1].map(t => {
			return {point: vec2.lerp(line.start, line.point, t), command: 'L'}
		})
	}

	/**
	 * Returns true if the length of line segment is zero.
	 */
	export function isZero(line: SimpleSegmentL) {
		return vec2.equals(line.start, line.point)
	}

	export function toTime(line: SimpleSegmentL, loc: SegmentLocation): number {
		if (typeof loc === 'number') {
			return loc
		} else if ('time' in loc) {
			return loc.time
		} else if ('unit' in loc) {
			return loc.unit
		} else {
			return loc.offset / vec2.distance(line.start, line.point)
		}
	}
}
