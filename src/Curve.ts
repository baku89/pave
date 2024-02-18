import {vec2} from 'linearly'

import {Arc} from './Arc'
import {CubicBezier} from './CubicBezier'
import {CurveLocation} from './Location'
import {Vertex, VertexA, VertexC, VertexL} from './Path'
import {Segment} from './Segment'
import {memoize} from './utils'

/**
 * A single open or closed path represented as an array of . All of the points are represented as tuple of vector `[x: number, y: number]` and the commands are represented in absolute form.
 * @category Types
 */
export type Curve<V extends Vertex = Vertex> = {
	readonly vertices: V[]
	readonly closed: boolean
}

/** @category Types */
export type CurveL = Curve<VertexL>

/** @category Types */
export type CurveC = Curve<VertexC>

/** @category Types */
export type CurveA = Curve<VertexA>

export namespace Curve {
	export const length = memoize((curve: Curve): number => {
		let length = 0
		for (const segment of segments(curve)) {
			if (segment.command === 'L') {
				length += vec2.distance(segment.start, segment.point)
			} else if (segment.command === 'C') {
				length += CubicBezier.length(segment)
			} else {
				length += Arc.length(segment)
			}
		}

		return length
	})

	export function segmentCount(curve: Curve): number {
		return curve.closed ? curve.vertices.length : curve.vertices.length - 1
	}

	export function segment(curve: Curve, index: number): Segment {
		return segments(curve)[index]
	}

	export const segments = memoize((curve: Curve): Segment[] => {
		const segs: Segment[] = []

		let start: vec2 | undefined

		for (const vertex of curve.vertices) {
			if (start) {
				segs.push({...vertex, start})
			}
			start = vertex.point
		}

		if (curve.closed) {
			const firstVertex = curve.vertices.at(0)
			if (start && firstVertex) {
				segs.push({
					...firstVertex,
					start,
				})
			}
		}

		return segs
	})

	export function toSegmentLocation(
		curve: Curve,
		loc: CurveLocation
	): [segment: Segment, time: number] {
		if (typeof loc === 'number') {
			loc = {unit: loc}
		}

		if ('time' in loc) {
			const segCount = segmentCount(curve)
			let extendedTime = loc.time * segCount
			let segmentIndex = Math.floor(extendedTime)

			if (segmentIndex < 0) {
				segmentIndex = 0
				extendedTime = 0
			} else if (segmentIndex >= segCount) {
				segmentIndex = segCount - 1
				extendedTime = segCount
			}

			const seg = Curve.segment(curve, segmentIndex)
			const time = extendedTime - segmentIndex
			return [seg, time]
		}

		if ('unit' in loc) {
			const segLength = length(curve)
			loc = {offset: loc.unit * segLength}
		}

		let offset = loc.offset

		for (const segment of segments(curve)) {
			const segLength = Segment.length(segment)
			if (offset < segLength) {
				return [segment, offset / segLength]
			}
			offset -= segLength
		}

		throw new Error('Location is out of bounds')
	}
}
