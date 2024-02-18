import {mat2d, vec2} from 'linearly'

import {Arc} from './Arc'
import {CubicBezier} from './CubicBezier'
import {Line} from './Line'
import {SegmentLocation} from './Location'
import {Command, CommandA, CommandC, CommandL} from './Path'
import {memoize} from './utils'

/**
 * A segment of a path, which consists of a starting point, end point, and an interpolation command.
 * @category Types
 */
export type Segment<C extends Command = Command> = {
	readonly start: vec2
	readonly end: vec2
	readonly command: C
}

/** @category Types */
export type SegmentL = Segment<CommandL>

/** @category Types */
export type SegmentC = Segment<CommandC>

/** @category Types */
export type SegmentA = Segment<CommandA>

export namespace Segment {
	export const length = memoize((seg: Segment): number => {
		if (seg.command[0] === 'L') {
			return vec2.distance(seg.start, seg.end)
		} else if (seg.command[0] === 'C') {
			return CubicBezier.length(seg as SegmentC)
		} else {
			return Arc.length(seg as SegmentA)
		}
	})

	export function point(seg: Segment, loc: SegmentLocation): vec2 {
		if (seg.command[0] === 'L') {
			return Line.point(seg as SegmentL, loc)
		} else if (seg.command[0] === 'C') {
			return CubicBezier.point(seg as SegmentC, loc)
		} else {
			return Arc.point(seg as SegmentA, loc)
		}
	}

	export function derivative(seg: Segment, loc: SegmentLocation): vec2 {
		if (seg.command[0] === 'L') {
			return Line.derivative(seg as SegmentL)
		} else if (seg.command[0] === 'C') {
			return CubicBezier.derivative(seg as SegmentC, loc)
		} else {
			return Arc.derivative(seg as SegmentA, loc)
		}
	}

	export function tangent(seg: Segment, loc: SegmentLocation): vec2 {
		const d = Segment.derivative(seg, loc)
		return vec2.normalize(d)
	}

	export function normal(seg: Segment, loc: SegmentLocation): vec2 {
		const tangent = Segment.tangent(seg, loc)
		return vec2.rotate(tangent, 90)
	}

	export function orientation(seg: Segment, loc: SegmentLocation): mat2d {
		const p = point(seg, loc)
		const xAxis = tangent(seg, loc)
		const yAxis = vec2.rotate(xAxis, 90)
		return [...xAxis, ...yAxis, ...p]
	}

	export const toTime = (seg: Segment, loc: SegmentLocation): number => {
		if (seg.command[0] === 'L') {
			return Line.toTime(seg as SegmentL, loc)
		} else if (seg.command[0] === 'C') {
			return CubicBezier.toTime(seg as SegmentC, loc)
		} else {
			return Arc.toTime(seg as SegmentA, loc)
		}
	}
}
