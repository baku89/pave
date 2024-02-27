import {scalar, vec2} from 'linearly'

import {Arc} from './Arc'
import {CubicBezier} from './CubicBezier'
import {CurveLocation, SegmentLocation} from './Location'
import {Vertex, VertexA, VertexC, VertexL} from './Path'
import {Rect} from './Rect'
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
			const lastSeg = Segment.trim(toLoc.segment, 0, toLoc.location)

			const inbetweenVertices = curve.vertices.slice(
				fromLoc.segmentIndex + 2,
				toLoc.segmentIndex + 1
			)

			delete (firstSeg as any)['start']
			delete (lastSeg as any)['start']

			return {
				vertices: [firstVertex, firstSeg, ...inbetweenVertices, lastSeg],
				closed: false,
			}
		} else {
			// fromLoc.segmentIndex > toLoc.segmentIndex (reverse order)
			const firstSeg = Segment.trim(fromLoc.segment, fromLoc.location, 0)

			const firstVertex: Vertex = {
				command: 'L',
				point: firstSeg.start,
			}
			const lastSeg = Segment.trim(toLoc.segment, 1, toLoc.location)

			const inbetweenVertices = curve.vertices
				.slice(toLoc.segmentIndex + 1, fromLoc.segmentIndex)
				.reverse()

			delete (firstSeg as any)['start']
			delete (lastSeg as any)['start']

			return {
				vertices: [firstVertex, firstSeg, ...inbetweenVertices, lastSeg],
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
