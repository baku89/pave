import {mat2d, vec2} from 'linearly'

import {Arc} from './Arc'
import {CubicBezier} from './CubicBezier'
import {Line} from './Line'
import {SegmentLocation} from './Location'
import {Vertex, VertexA, VertexC, VertexL} from './Path'
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

export namespace Segment {
	export const length = (seg: Segment): number => {
		if (seg.command === 'L') {
			return vec2.distance(seg.start, seg.point)
		} else if (seg.command === 'C') {
			return CubicBezier.length(seg)
		} else {
			return Arc.length(seg)
		}
	}

	export const bounds = (seg: Segment): Rect => {
		if (seg.command === 'L') {
			return Line.bounds(seg)
		} else if (seg.command === 'C') {
			return CubicBezier.bounds(seg)
		} else {
			return Arc.bounds(seg)
		}
	}

	export function point(seg: Segment, loc: SegmentLocation): vec2 {
		if (seg.command === 'L') {
			return Line.point(seg, loc)
		} else if (seg.command === 'C') {
			return CubicBezier.point(seg, loc)
		} else {
			return Arc.point(seg, loc)
		}
	}

	export function derivative(seg: Segment, loc: SegmentLocation): vec2 {
		if (seg.command === 'L') {
			return Line.derivative(seg)
		} else if (seg.command === 'C') {
			return CubicBezier.derivative(seg, loc)
		} else {
			return Arc.derivative(seg, loc)
		}
	}

	export function tangent(seg: Segment, loc: SegmentLocation): vec2 {
		const d = Segment.derivative(seg, loc)
		return vec2.normalize(d)
	}

	export function normal(seg: Segment, loc: SegmentLocation): vec2 {
		const tangent = Segment.tangent(seg, loc)
		return vec2.rotate90(tangent)
	}

	export function orientation(seg: Segment, loc: SegmentLocation): mat2d {
		const p = point(seg, loc)
		const xAxis = tangent(seg, loc)
		const yAxis = vec2.rotate90(xAxis)
		return [...xAxis, ...yAxis, ...p]
	}

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

	export function isZero(seg: Segment) {
		if (seg.command === 'L') {
			return Line.isZero(seg)
		} else if (seg.command === 'C') {
			return CubicBezier.isZero(seg)
		} else {
			return Arc.isZero(seg)
		}
	}

	export function isStraight(seg: Segment) {
		if (seg.command === 'L') {
			return true
		} else if (seg.command === 'C') {
			return CubicBezier.isStraight(seg)
		} else {
			return Arc.isStraight(seg)
		}
	}

	export const toTime = (seg: Segment, loc: SegmentLocation): number => {
		if (seg.command === 'L') {
			return Line.toTime(seg, loc)
		} else if (seg.command === 'C') {
			return CubicBezier.toTime(seg, loc)
		} else {
			return Arc.toTime(seg, loc)
		}
	}
}
