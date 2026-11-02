import {Rect} from 'geome'
import {scalar, vec2} from 'linearly'

import {segmentToVertex} from './attributes'
import {type Curve, Segment, Vertex} from './index'
import {CurveLocation, TimeCurveLocation} from './Location'
import {searchInterval} from './numeric'
import type {AttributeDefs} from './path/types'
import {memoize, normalizeIndex, normalizeOffset} from './utils'

export const length = /* @__PURE__ */ memoize((curve: Curve): number => {
	let total = 0
	for (const segment of segments(curve)) {
		total += Segment.length(segment)
	}
	return total
})

export const bounds = /* @__PURE__ */ memoize((curve: Curve): Rect => {
	return Rect.unite(...segments(curve).map(seg => Segment.bounds(seg)))
})

export function segmentCount(curve: Curve): number {
	return curve.closed ? curve.vertices.length : curve.vertices.length - 1
}

export function segment(curve: Curve, index: number): Segment {
	return segments(curve)[index]
}

export const segments = /* @__PURE__ */ memoize((curve: Curve): Segment[] => {
	const segs: Segment[] = []

	let prev: Vertex | undefined

	const segmentFrom = (from: Vertex, vertex: Vertex) =>
		({
			...vertex,
			start: from.point,
			...(from.attrs ? {startAttrs: from.attrs} : {}),
		}) as Segment

	for (const vertex of curve.vertices) {
		if (prev) {
			segs.push(segmentFrom(prev, vertex))
		}
		prev = vertex
	}

	if (curve.closed) {
		const firstVertex = curve.vertices.at(0)
		if (prev && firstVertex) {
			segs.push(segmentFrom(prev, firstVertex))
		}
	}

	return segs
})

export function neighborSegment(
	curve: Curve,
	segmentIndex: number,
	offset: number
): Segment | null {
	const segCount = segmentCount(curve)

	let index = segmentIndex + offset

	if (curve.closed) {
		index = scalar.mod(index, segCount)
	}

	if (index < 0 || index >= segCount) {
		return null
	}

	return segment(curve, index)
}

export function nextSegment(
	curve: Curve,
	segmentIndex: number
): Segment | null {
	return neighborSegment(curve, segmentIndex, 1)
}

export function prevSegment(
	curve: Curve,
	segmentIndex: number
): Segment | null {
	return neighborSegment(curve, segmentIndex, -1)
}

export function reverse(curve: Curve): Curve {
	const numVertex = curve.vertices.length
	const curveAttrs = curve.attrs ? {attrs: curve.attrs} : {}

	if (!curve.closed) {
		if (numVertex === 0) {
			return {vertices: [], closed: false, ...curveAttrs}
		}
		const v = curve.vertices
		const last = v[numVertex - 1]
		const first: Vertex = {
			command: 'L',
			point: last.point,
			...(last.attrs ? {attrs: last.attrs} : {}),
		}
		if (numVertex === 1) {
			return {vertices: [first], closed: false, ...curveAttrs}
		}
		return {
			vertices: [
				first,
				...Segment.reverseVertexChain(v[0].point, v.slice(1), v[0].attrs),
			],
			closed: false,
			...curveAttrs,
		}
	}

	const vertices: Vertex[] = []
	const iStart = numVertex - 1

	for (let i = iStart; i >= 0; i--) {
		const {point, attrs} = curve.vertices[i % numVertex]
		const carried = attrs ? {attrs} : {}
		const {command, args} = curve.vertices[(i + 1) % numVertex]

		if (command === 'L') {
			vertices.push({command: 'L', point, ...carried})
		} else if (command === 'C') {
			vertices.push({
				command: 'C',
				point,
				args: [args[1], args[0]],
				...carried,
			})
		} else {
			const [radii, xAxisRotation, largeArc, sweep] = args
			vertices.push({
				command: 'A',
				point,
				args: [radii, xAxisRotation, largeArc, !sweep],
				...carried,
			})
		}
	}

	return {vertices, closed: true, ...curveAttrs}
}

export function trim(
	curve: Curve,
	from: CurveLocation,
	to: CurveLocation,
	attrDefs?: AttributeDefs
): Curve {
	const fromLoc = toTime(curve, from)
	const toLoc = toTime(curve, to)
	const curveAttrs = curve.attrs ? {attrs: curve.attrs} : {}

	/** The vertex a chain starting at the segment's start begins with. */
	const startOf = (seg: Segment): Vertex => ({
		command: 'L',
		point: seg.start,
		...(seg.startAttrs ? {attrs: seg.startAttrs} : {}),
	})

	if (fromLoc.segmentIndex === toLoc.segmentIndex) {
		const seg = Segment.trim(fromLoc.segment, fromLoc, toLoc, attrDefs)

		return {
			vertices: [startOf(seg), segmentToVertex(seg)],
			closed: false,
			...curveAttrs,
		}
	} else if (fromLoc.segmentIndex < toLoc.segmentIndex) {
		const firstSeg = Segment.trim(fromLoc.segment, fromLoc, 1, attrDefs)

		const inbetweenVertices = curve.vertices.slice(
			fromLoc.segmentIndex + 2,
			toLoc.segmentIndex + 1
		)

		const time = Segment.toTime(toLoc.segment, toLoc)

		const lastVertices = scalar.approx(time, 0)
			? []
			: [segmentToVertex(Segment.trim(toLoc.segment, 0, {time}, attrDefs))]

		return {
			vertices: [
				startOf(firstSeg),
				segmentToVertex(firstSeg),
				...inbetweenVertices,
				...lastVertices,
			],
			closed: false,
			...curveAttrs,
		}
	} else {
		// fromLoc.segmentIndex > toLoc.segmentIndex (reverse order)
		let firstVertices: Vertex[]

		const fromTime = Segment.toTime(fromLoc.segment, fromLoc)

		if (scalar.approx(fromTime, 0)) {
			firstVertices = [startOf(fromLoc.segment)]
		} else {
			const firstSeg = Segment.trim(
				fromLoc.segment,
				{time: fromTime},
				0,
				attrDefs
			)

			firstVertices = [startOf(firstSeg), segmentToVertex(firstSeg)]
		}

		const inbetweenVerticesReversed = Segment.reverseVertexChain(
			toLoc.segment.point,
			curve.vertices.slice(toLoc.segmentIndex + 2, fromLoc.segmentIndex + 1),
			toLoc.segment.attrs
		)

		const lastSeg = Segment.trim(toLoc.segment, 1, toLoc, attrDefs)

		return {
			vertices: [
				...firstVertices,
				...inbetweenVerticesReversed,
				segmentToVertex(lastSeg),
			],
			closed: false,
			...curveAttrs,
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
				...curve,
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
			return [
				{
					command: 'L',
					point: seg.point,
					...(seg.attrs ? {attrs: seg.attrs} : {}),
				},
			]
		}

		return [segmentToVertex(seg)]
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

	return {...curve, vertices, closed: curve.closed}
}

export function isZero(curve: Curve): boolean {
	const segs = segments(curve)

	return segs.length === 0 || segs.every(seg => Segment.isZero(seg))
}

/**
 * Retrieves the segment location information from a signed curve loocation
 * @param curve The cuve to retrieve the segment location from
 * @param location The location on the curve
 * @returns The information of the segment location
 */
export function toTime(
	curve: Curve,
	location: CurveLocation
): Required<TimeCurveLocation> & {segment: Segment} {
	if (typeof location === 'number') {
		location = {unit: location}
	}

	if (location.segmentIndex !== undefined) {
		const segmentIndex = normalizeIndex(
			location.segmentIndex,
			segmentCount(curve)
		)
		const seg = segment(curve, segmentIndex)

		return {
			segment: seg,
			segmentIndex,
			time: Segment.toTime(seg, location),
		}
	}

	if ('time' in location) {
		const segCount = segmentCount(curve)
		const extendedTime = normalizeOffset(location.time, 1) * segCount

		const segmentIndex = Math.floor(extendedTime)
		const time = extendedTime - segmentIndex

		return {segment: segment(curve, segmentIndex), time, segmentIndex}
	}

	const curveLength = length(curve)

	const offset = normalizeOffset(
		'unit' in location ? location.unit * curveLength : location.offset,
		curveLength
	)

	const segs = segments(curve)
	if (segs.length === 0) {
		throw new Error('Location is out of bounds')
	}

	const prefix = lengthPrefix(curve)
	const segmentIndex = searchInterval(prefix, offset)
	const seg = segs[segmentIndex]

	return {
		segment: seg,
		segmentIndex,
		time: Segment.toTime(seg, {offset: offset - prefix[segmentIndex]}),
	}
}

/**
 * Cumulative segment lengths: `prefix[i]` is the length before segment `i`, the last entry the total.
 * Built once per curve so that offset lookups are a binary search instead of a scan.
 */
const lengthPrefix = /* @__PURE__ */ memoize((curve: Curve): Float64Array => {
	const segs = segments(curve)
	const prefix = new Float64Array(segs.length + 1)
	for (const [i, seg] of segs.entries()) {
		prefix[i + 1] = prefix[i] + Segment.length(seg)
	}
	return prefix
})
