import {vec2} from 'linearly'

import {Arc} from './Arc'
import {CubicBezier} from './CubicBezier'
import {CurveLocation} from './Location'
import {Command, CommandA, CommandC, CommandL, Vertex} from './Path'
import {Segment, SegmentA, SegmentC} from './Segment'
import {memoize} from './utils'

/**
 * A single open or closed path represented as an array of . All of the points are represented as tuple of vector `[x: number, y: number]` and the commands are represented in absolute form.
 * @category Types
 */
export type Curve<C extends Command = Command> = {
	readonly vertices: Vertex<C>[]
	readonly closed: boolean
}

/** @category Types */
export type CurveL = Curve<CommandL>

/** @category Types */
export type CurveC = Curve<CommandC>

/** @category Types */
export type CurveA = Curve<CommandA>

export namespace Curve {
	export const length = memoize((curve: Curve): number => {
		let length = 0
		for (const segment of iterateSegments(curve)) {
			if (segment.command[0] === 'L') {
				length += vec2.distance(segment.start, segment.end)
			} else if (segment.command[0] === 'C') {
				length += CubicBezier.length(segment as SegmentC)
			} else {
				length += Arc.length(segment as SegmentA)
			}
		}

		return length
	})

	export function segmentCount(curve: Curve): number {
		return curve.closed ? curve.vertices.length : curve.vertices.length - 1
	}

	export function segment(curve: Curve, index: number): Segment {
		return [...Curve.iterateSegments(curve)][index]
	}

	export function segmentAndLocation(
		curve: Curve,
		loc: CurveLocation
	): [segment: Segment, time: number] {
		if (typeof loc === 'number') {
			loc = {unit: loc}
		}

		if ('time' in loc) {
			const segCount = segmentCount(curve)
			const extendedTime = loc.time * segCount
			const segmentIndex = Math.floor(extendedTime)

			const seg = Curve.segment(curve, segmentIndex)
			const time = extendedTime - segmentIndex
			return [seg, time]
		}

		if ('unit' in loc) {
			const segLength = length(curve)
			loc = {offset: loc.unit * segLength}
		}

		let offset = loc.offset

		for (const segment of iterateSegments(curve)) {
			const segLength = Segment.length(segment)
			if (offset < segLength) {
				return [segment, offset / segLength]
			}
			offset -= segLength
		}

		throw new Error('Location is out of bounds')
	}

	export const iterateSegments = function* (
		curve: Curve
	): Generator<Segment & {segmentIndex: number}> {
		let prevPoint: vec2 | undefined
		for (const [segmentIndex, {point, command}] of curve.vertices.entries()) {
			if (prevPoint) {
				yield {
					start: prevPoint,
					end: point,
					command,
					segmentIndex: segmentIndex - 1,
				}
			}
			prevPoint = point
		}

		if (curve.closed) {
			const firstVertex = curve.vertices.at(0)
			if (prevPoint && firstVertex) {
				yield {
					start: prevPoint,
					end: firstVertex.point,
					command: firstVertex.command,
					segmentIndex: curve.vertices.length - 1,
				}
			}
		}
	}
}
