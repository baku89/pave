import {scalar, vec2} from 'linearly'

import {Arc} from './Arc'
import {CubicBezier} from './CubicBezier'
import {CurveLocation, SegmentLocation} from './Location'
import {Vertex, VertexA, VertexC, VertexL} from './Path'
import {Rect} from './Rect'
import {Segment} from './Segment'
import {memoize} from './utils'
import {MultiSegment} from './MultiSegment'

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

	export const bounds = memoize((curve: Curve): Rect => {
		return Rect.unite(...segments(curve).map(seg => Segment.bounds(seg)))
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

	export function reverse(curve: Curve): Curve {
		const vertices: Vertex[] = []

		const numVertex = curve.vertices.length
		const iStart = curve.closed ? numVertex : numVertex - 1

		for (let i = iStart; i >= 0; i--) {
			if (!curve.closed && i === numVertex - 1) {
				vertices.push({
					command: 'L',
					point: curve.vertices[i].point,
				})
				continue
			}

			const point = curve.vertices[i % numVertex].point
			const {command, args} = curve.vertices[(i + 1) % numVertex]

			if (command === 'L') {
				vertices.push({command: 'L', point})
			} else if (command === 'C') {
				vertices.push({
					command: 'C',
					point,
					args: [args[1], args[0]],
				})
			} else {
				const [radii, xAxisRotation, largeArc, sweep] = args
				vertices.push({
					command: 'A',
					point,
					args: [radii, xAxisRotation, largeArc, !sweep],
				})
			}
		}

		return {vertices, closed: curve.closed}
	}

	export function trim(
		curve: Curve,
		from: CurveLocation,
		to: CurveLocation
	): Curve {
		const fromLoc = toSegmentLocation(curve, from)
		const toLoc = toSegmentLocation(curve, to)

		if (fromLoc.segmentIndex === toLoc.segmentIndex) {
			const seg = Segment.trim(
				fromLoc.segment,
				fromLoc.location,
				toLoc.location
			)
			const firstVertex: Vertex = {
				command: 'L',
				point: seg.start,
			}

			delete (seg as any)['start']

			return {
				vertices: [firstVertex, seg],
				closed: false,
			}
		} else if (fromLoc.segmentIndex < toLoc.segmentIndex) {
			const firstSeg = Segment.trim(fromLoc.segment, fromLoc.location, 1)
			const firstVertex: Vertex = {
				command: 'L',
				point: firstSeg.start,
			}

			const inbetweenVertices = curve.vertices.slice(
				fromLoc.segmentIndex + 2,
				toLoc.segmentIndex + 1
			)

			const time = Segment.toTime(toLoc.segment, toLoc.location)

			const lastVertices = scalar.approx(time, 0)
				? []
				: [Segment.trim(toLoc.segment, 0, {time})]

			return {
				vertices: [
					firstVertex,
					firstSeg,
					...inbetweenVertices,
					...lastVertices,
				],
				closed: false,
			}
		} else {
			// fromLoc.segmentIndex > toLoc.segmentIndex (reverse order)
			let firstVertices: Vertex[]

			const fromTime = Segment.toTime(fromLoc.segment, fromLoc.location)

			if (scalar.approx(fromTime, 0)) {
				firstVertices = [{command: 'L', point: fromLoc.segment.start}]
			} else {
				const firstSeg = Segment.trim(fromLoc.segment, {time: fromTime}, 0)

				firstVertices = [{command: 'L', point: firstSeg.start}, firstSeg]
			}

			const inbetweenVertices: MultiSegment = {
				start: toLoc.segment.point,
				vertices: curve.vertices.slice(
					toLoc.segmentIndex + 2,
					fromLoc.segmentIndex + 1
				),
			}

			const inbetweenVerticesReversed =
				MultiSegment.reverse(inbetweenVertices).vertices

			const lastSeg = Segment.trim(toLoc.segment, 1, toLoc.location)

			return {
				vertices: [...firstVertices, ...inbetweenVerticesReversed, lastSeg],
				closed: false,
			}
		}
	}

	export function close(curve: Curve, fuse = true): Curve {
		if (fuse) {
			const firstVertex = curve.vertices.at(0)
			const lastVertex = curve.vertices.at(-1)

			if (
				firstVertex &&
				lastVertex &&
				vec2.approx(firstVertex.point, lastVertex.point)
			) {
				return {
					vertices: [lastVertex, ...curve.vertices.slice(1)],
					closed: true,
				}
			}
		}

		return {
			...curve,
			closed: true,
		}
	}

	export interface ReduceOptions {
		/**
		 * If true, the function will convert straight lines to `L` commands
		 * @default true
		 */
		convertStraightLines?: boolean
	}

	/**
	 * Cleans up the curve by removing redundant vertices and segments
	 */
	export function reduce(
		curve: Curve,
		{convertStraightLines = true}: ReduceOptions = {}
	): Curve {
		let vertices = segments(curve).flatMap((seg): Vertex[] => {
			// Check if the segment is zero-length and remove it
			if (Segment.isZero(seg)) {
				return []
			}

			// Check if the cubic bezier segment is a straight line
			if (convertStraightLines && Segment.isStraight(seg)) {
				return [{command: 'L', point: seg.point}]
			}

			return [seg]
		})

		if (curve.closed) {
			if (vertices.length === 0) {
				if (curve.vertices.length > 0) {
					vertices = [curve.vertices[0]]
				}
			} else if (vertices.length > 1) {
				const last = vertices.pop()!
				vertices.unshift(last)
			}
		} else {
			if (curve.vertices.length >= 1) {
				const first = curve.vertices[0]
				vertices.unshift(first)
			}
		}

		return {vertices, closed: curve.closed}
	}

	export function hasLength(curve: Curve): boolean {
		const segs = segments(curve)

		return segs.length > 0 && segs.some(seg => !Segment.isZero(seg))
	}

	export function toSegmentLocation(
		curve: Curve,
		location: CurveLocation
	): {segment: Segment; location: SegmentLocation; segmentIndex: number} {
		if (typeof location === 'number') {
			location = {unit: location}
		}

		if (location.segmentIndex !== undefined) {
			const segment = Curve.segment(curve, location.segmentIndex)
			return {segment, location, segmentIndex: location.segmentIndex}
		}

		if ('time' in location) {
			const segCount = segmentCount(curve)
			let extendedTime = location.time * segCount
			let segmentIndex = Math.floor(extendedTime)

			if (segmentIndex < 0) {
				segmentIndex = 0
				extendedTime = 0
			} else if (segmentIndex >= segCount) {
				segmentIndex = segCount - 1
				extendedTime = segCount
			}

			const segment = Curve.segment(curve, segmentIndex)
			const time = extendedTime - segmentIndex
			return {segment, location: {time}, segmentIndex}
		}

		const curveLength = length(curve)

		let offset =
			'unit' in location ? location.unit * curveLength : location.offset
		offset = scalar.clamp(offset, 0, curveLength)

		const segs = segments(curve)

		for (const [segmentIndex, segment] of segs.entries()) {
			const segLength = Segment.length(segment)
			if (offset < segLength || segmentIndex === segs.length - 1) {
				return {segment, location: {offset}, segmentIndex}
			}
			offset -= segLength
		}

		throw new Error('Location is out of bounds')
	}
}
