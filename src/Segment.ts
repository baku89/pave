import {mat2d, vec2} from 'linearly'

import {Arc} from './Arc'
import {CubicBezier} from './CubicBezier'
import {Line} from './Line'
import {SegmentLocation} from './Location'
import {type Path, Vertex, VertexA, VertexC, VertexL} from './Path'
import {Rect} from './Rect'

/**
 * A segment of a path, which consists of a starting point, end point, and an interpolation command.
 * @category Types
 */
// prettier-ignore
export type Segment<V extends Vertex = Vertex> = V extends VertexL
	? SegmentL
	: V extends VertexC
	? SegmentC
	: V extends VertexA
	? SegmentA
	: SegmentL | SegmentC | SegmentA

/** @category Types */
export type SegmentL = VertexL & {start: vec2}

/** @category Types */
export type SegmentC = VertexC & {start: vec2}

/** @category Types */
export type SegmentA = VertexA & {start: vec2}

/**
 * A collection of functions to handle {@link Segment}.
 * @category Modules
 */
export namespace Segment {
	/**
	 * Returns the length of the segment.
	 */
	export const length = (seg: Segment): number => {
		if (seg.command === 'L') {
			return vec2.distance(seg.start, seg.point)
		} else if (seg.command === 'C') {
			return CubicBezier.length(seg)
		} else {
			return Arc.length(seg)
		}
	}

	/**
	 * Returns the bounding box of the segment.
	 */
	export const bounds = (seg: Segment): Rect => {
		if (seg.command === 'L') {
			return Line.bounds(seg)
		} else if (seg.command === 'C') {
			return CubicBezier.bounds(seg)
		} else {
			return Arc.bounds(seg)
		}
	}

	/**
	 * Returns the point of the segment at the given location.
	 */
	export function point(seg: Segment, loc: SegmentLocation): vec2 {
		if (seg.command === 'L') {
			return Line.point(seg, loc)
		} else if (seg.command === 'C') {
			return CubicBezier.point(seg, loc)
		} else {
			return Arc.point(seg, loc)
		}
	}

	/**
	 * Returns the derivative of the segment at the given location.
	 */
	export function derivative(seg: Segment, loc: SegmentLocation): vec2 {
		if (seg.command === 'L') {
			return Line.derivative(seg)
		} else if (seg.command === 'C') {
			return CubicBezier.derivative(seg, loc)
		} else {
			return Arc.derivative(seg, loc)
		}
	}

	/**
	 * Returns the tangent vector of the segment at the given location.
	 */
	export function tangent(seg: Segment, loc: SegmentLocation): vec2 {
		const d = Segment.derivative(seg, loc)
		return vec2.normalize(d)
	}

	/**
	 * Returns the normal vector of the segment at the given location., which is normally rotated 90 degrees clockwise in Y-down coordinate.
	 */
	export function normal(seg: Segment, loc: SegmentLocation): vec2 {
		const tangent = Segment.tangent(seg, loc)
		return vec2.rotate90(tangent)
	}

	/**
	 * Returns the orientation  matrix of the segment at the given location.
	 */
	export function orientation(seg: Segment, loc: SegmentLocation): mat2d {
		const p = point(seg, loc)
		const xAxis = tangent(seg, loc)
		const yAxis = vec2.rotate90(xAxis)
		return [...xAxis, ...yAxis, ...p]
	}

	/**
	 * Returns a new segment that is the result of trimming the given segment from the start to the end.
	 */
	export function trim(
		seg: Segment,
		from: SegmentLocation,
		to: SegmentLocation
	): Segment {
		if (seg.command === 'L') {
			return Line.trim(seg, from, to)
		} else if (seg.command === 'C') {
			return CubicBezier.trim(seg, from, to)
		} else {
			return Arc.trim(seg, from, to)
		}
	}

	/**
	 * Returns true if the segment is a zero-length segment.
	 */
	export function isZero(seg: Segment) {
		if (seg.command === 'L') {
			return Line.isZero(seg)
		} else if (seg.command === 'C') {
			return CubicBezier.isZero(seg)
		} else {
			return Arc.isZero(seg)
		}
	}

	/**
	 * Returns true if the segment is a straight line. Also returns true for zero-length segments.
	 */
	export function isStraight(seg: Segment) {
		if (seg.command === 'L') {
			return true
		} else if (seg.command === 'C') {
			return CubicBezier.isStraight(seg)
		} else {
			return Arc.isStraight(seg)
		}
	}

	/**
	 * Returns a new path with the segment offset by the given distance.
	 */
	export function offset(
		seg: Segment,
		distance: number,
		unarcAngle = 90
	): Path {
		if (seg.command === 'L') {
			return Line.offset(seg, distance)
		} else if (seg.command === 'C') {
			return CubicBezier.offset(seg, distance)
		} else {
			return Arc.offset(seg, distance, unarcAngle)
		}
	}

	/**
	 * Returns a new vertex array with the segment divided at the given times.
	 */
	export function divideAtTimes(
		seg: Segment,
		times: Iterable<number>
	): Vertex[] {
		if (seg.command === 'L') {
			return Line.divideAtTimes(seg, times)
		} else if (seg.command === 'C') {
			return CubicBezier.divideAtTimes(seg, times)
		} else {
			return Arc.divideAtTimes(seg, times)
		}
	}

	/**
	 * Returns the time of the segment at the given location.
	 */
	export function toTime(seg: Segment, loc: SegmentLocation): number {
		if (seg.command === 'L') {
			return Line.toTime(seg, loc)
		} else if (seg.command === 'C') {
			return CubicBezier.toTime(seg, loc)
		} else {
			return Arc.toTime(seg, loc)
		}
	}
}
