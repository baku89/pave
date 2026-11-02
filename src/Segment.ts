import {Rect} from 'geome'
import {mat2d, vec2} from 'linearly'

import {segmentAttrsAt, withSegmentAttrs} from './attributes'
import {Arc, CubicBezier, Line, type Path, type Segment, Vertex} from './index'
import {SegmentLocation} from './Location'
import type {AttributeDefs, Attributes} from './path/types'

/**
 * Returns the length of the segment.
 */
export const length = (seg: Segment): number => {
	if (seg.command === 'L') {
		return Line.length(seg)
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
	const d = derivative(seg, loc)
	return vec2.normalize(d)
}

/**
 * Returns the normal vector of the segment at the given location., which is normally rotated 90 degrees clockwise in Y-down coordinate.
 */
export function normal(seg: Segment, loc: SegmentLocation): vec2 {
	return vec2.rotate90(tangent(seg, loc))
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
	to: SegmentLocation,
	attrDefs?: AttributeDefs
): Segment {
	const piece =
		seg.command === 'L'
			? Line.trim(seg, from, to)
			: seg.command === 'C'
				? CubicBezier.trim(seg, from, to)
				: Arc.trim(seg, from, to)

	if (!seg.attrs && !seg.startAttrs) return piece

	return withSegmentAttrs(
		piece,
		seg,
		toTime(seg, from),
		toTime(seg, to),
		attrDefs
	)
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
 * Returns the signed curvature at the given location. Positive when the segment turns towards its {@link normal} side.
 */
export function curvature(seg: Segment, loc: SegmentLocation): number {
	if (seg.command === 'L') {
		return 0
	} else if (seg.command === 'C') {
		return CubicBezier.curvature(seg, loc)
	} else {
		return Arc.curvature(seg, loc)
	}
}

/**
 * Returns the raw parallel curve of the segment at the given signed distance along its {@link normal}, as an open path. Lines and circular arcs are offset exactly; cubic Béziers and elliptic arcs are approximated by cubic Béziers within `tolerance`. Where the distance exceeds the radius of curvature, the parallel curve folds back on itself; use {@link Path.offset} for a trimmed result.
 */
export function offset(seg: Segment, distance: number, tolerance = 0.05): Path {
	if (seg.command === 'L') {
		return Line.offset(seg, distance)
	} else if (seg.command === 'C') {
		return CubicBezier.offset(seg, distance, tolerance)
	} else {
		return Arc.offset(seg, distance, tolerance)
	}
}

/**
 * Returns the segment traversed in the opposite direction.
 */
export function reverse(seg: Segment): Segment {
	const attrs = {
		...(seg.attrs ? {startAttrs: seg.attrs} : {}),
		...(seg.startAttrs ? {attrs: seg.startAttrs} : {}),
	}

	if (seg.command === 'L') {
		return {command: 'L', start: seg.point, point: seg.start, ...attrs}
	} else if (seg.command === 'C') {
		return {
			command: 'C',
			start: seg.point,
			args: [seg.args[1], seg.args[0]],
			point: seg.start,
			...attrs,
		}
	} else {
		const [radii, xAxisRotation, largeArc, sweep] = seg.args
		return {
			command: 'A',
			start: seg.point,
			args: [radii, xAxisRotation, largeArc, !sweep],
			point: seg.start,
			...attrs,
		}
	}
}

/**
 * Returns a new vertex array with the segment divided at the given times.
 */
export function divideAtTimes(
	seg: Segment,
	times: Iterable<number>,
	attrDefs?: AttributeDefs
): Vertex[] {
	const stops = [...times]
	const vertices: Vertex[] =
		seg.command === 'L'
			? Line.divideAtTimes(seg, stops)
			: seg.command === 'C'
				? CubicBezier.divideAtTimes(seg, stops)
				: Arc.divideAtTimes(seg, stops)

	if (!seg.attrs && !seg.startAttrs) return vertices

	return vertices.map((vertex, i) => {
		const attrs = segmentAttrsAt(seg, stops[i] ?? 1, attrDefs)
		return (attrs ? {...vertex, attrs} : vertex) as Vertex
	})
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

/**
 * Reverses a vertex chain: `start` is the pen position before `vertices[0]`,
 * and each vertex draws to its `point` from the previous position.
 */
export function reverseVertexChain<V extends Vertex = Vertex>(
	start: vec2,
	vertices: readonly V[],
	startAttrs?: Attributes
): V[] {
	const out: Vertex[] = []

	for (let i = vertices.length - 1; i >= 0; i--) {
		const point = i >= 1 ? vertices[i - 1].point : start
		const attrs = i >= 1 ? vertices[i - 1].attrs : startAttrs
		const carried = attrs ? {attrs} : {}

		const {command, args} = vertices[i]

		if (command === 'L') {
			out.push({command: 'L', point, ...carried})
		} else if (command === 'C') {
			out.push({
				command: 'C',
				point,
				args: [args[1], args[0]],
				...carried,
			})
		} else {
			const [radii, xAxisRotation, largeArc, sweep] = args
			out.push({
				command: 'A',
				point,
				args: [radii, xAxisRotation, largeArc, !sweep],
				...carried,
			})
		}
	}

	return out as V[]
}
