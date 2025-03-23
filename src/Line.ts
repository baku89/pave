import {Rect} from 'geome'
import {mat2d, vec2} from 'linearly'

import {SegmentLocation} from './Location'
import {Path, PathL, VertexL} from './Path'
import {SegmentL} from './Segment'
import {normalizeOffset, PartialBy} from './utils'

type SimpleSegmentL = PartialBy<SegmentL, 'command'>

/**
 * A collection of functions to handle a line represented with {@link SegmentL}.
 * @category Modules
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
		return vec2.rotate90(tangent(line))
	}

	export const curvature = 0

	export function orientation(
		line: SimpleSegmentL,
		loc: SegmentLocation
	): mat2d {
		const p = point(line, loc)
		const xAxis = tangent(line)
		const yAxis = vec2.rotate90(xAxis)
		return [...xAxis, ...yAxis, ...p]
	}

	export function trim(
		line: SimpleSegmentL,
		start: SegmentLocation,
		end: SegmentLocation
	): SegmentL {
		const startTime = toTime(line, start)
		const endTime = toTime(line, end)

		const newStart = point(line, startTime)
		const newEnd = point(line, endTime)

		return {start: newStart, point: newEnd, command: 'L'}
	}

	export function divideAtTimes(
		line: SimpleSegmentL,
		times: Iterable<number>
	): VertexL[] {
		return [...times, 1].map(t => {
			return {point: vec2.lerp(line.start, line.point, t), command: 'L'}
		})
	}

	/**
	 * Returns true if the length of line segment is zero.
	 */
	export function isZero(line: SimpleSegmentL) {
		return vec2.approx(line.start, line.point)
	}

	export function offset(line: SimpleSegmentL, distance: number): PathL {
		const n = normal(line)
		const offset = vec2.scale(n, distance)

		return Path.line(vec2.add(line.start, offset), vec2.add(line.point, offset))
	}

	/**
	 * Converts a signed location to a time between 0 and 1.
	 * @param line
	 * @param loc
	 * @returns
	 */
	export function toTime(line: SimpleSegmentL, loc: SegmentLocation): number {
		if (typeof loc !== 'number') {
			if ('time' in loc) {
				loc = loc.time
			} else if ('unit' in loc) {
				loc = loc.unit
			} else {
				loc = loc.offset / vec2.distance(line.start, line.point)
			}
		}

		return normalizeOffset(loc, 1)
	}
}
