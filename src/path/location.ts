import {mat2d, scalar, vec2} from 'linearly'

import {Curve} from '../Curve'
import type {PathLocation, TimePathLocation} from '../Location'
import type {Path} from '../Path'
import {Segment} from '../Segment'
import {normalizeIndex, normalizeOffset} from '../utils'
import {length, segment as pickSegment, segmentCount, segments} from './metrics'

/**
 * Retrieves the segment location information from the given path and path-based signed location.
 * @param path The path to retrieve the segment location
 * @param location The path-based location
 * @returns The information of the segment location
 * @category Utilities
 */
export function toTime(
	path: Path,
	location: PathLocation
): Required<TimePathLocation> & {segment: Segment} {
	// TODO: Fix this

	if (typeof location === 'number') {
		location = {unit: location}
	}

	const pathSegmentCount = segmentCount(path)

	let curveIndex = location.curveIndex ?? null
	let segmentIndex = location.segmentIndex ?? null

	if (curveIndex !== null && segmentIndex !== null) {
		// Location in the specified curve and segment

		curveIndex = normalizeIndex(curveIndex, path.curves.length)
		const segmentCount = Curve.segmentCount(path.curves[curveIndex])
		segmentIndex = normalizeIndex(segmentIndex, segmentCount)

		const segment = pickSegment(path, curveIndex, segmentIndex)

		return {
			segment,
			time: Segment.toTime(segment, location),
			curveIndex,
			segmentIndex,
		}
	}

	if (curveIndex !== null && segmentIndex === null) {
		// Location in the specific curve
		curveIndex = normalizeOffset(curveIndex, path.curves.length)

		const curve = path.curves[curveIndex]

		return {curveIndex, ...Curve.toTime(curve, location)}
	}

	const segs = segments(path)

	if (curveIndex === null && segmentIndex !== null) {
		// Location in the segment specified by linear index
		segmentIndex = normalizeIndex(segmentIndex, pathSegmentCount)

		const segment = segs[segmentIndex]

		return {
			segment,
			time: Segment.toTime(segment, location),
			...unlinearSegmentIndex(path, segmentIndex),
		}
	} else if (curveIndex === null && segmentIndex === null) {
		// Location in the whole path

		if ('time' in location) {
			const extendedTime = normalizeOffset(location.time, 1) * pathSegmentCount
			const linearSegmentIndex = scalar.clamp(
				Math.floor(extendedTime),
				0,
				pathSegmentCount - 1
			)

			const segment = segs[linearSegmentIndex]
			const time = extendedTime - linearSegmentIndex

			const {curveIndex, segmentIndex} = unlinearSegmentIndex(
				path,
				linearSegmentIndex
			)

			return {segment, time, curveIndex, segmentIndex}
		} else {
			// 'offset' | 'unit' in location

			const pathLen = length(path)

			let offset = normalizeOffset(
				'unit' in location ? location.unit * pathLen : location.offset,
				pathLen
			)

			if (offset < pathLen) {
				for (const [curveIndex, curve] of path.curves.entries()) {
					const curveLen = Curve.length(curve)
					if (offset < curveLen) {
						return {
							...Curve.toTime(curve, {offset}),
							curveIndex,
						}
					}
					offset -= curveLen
				}
			} else {
				const segment = segs.at(-1)
				if (segment) {
					return {
						segment,
						time: 1,
						curveIndex: path.curves.length - 1,
						segmentIndex: segs.length - 1,
					}
				}
			}
		}
	}

	throw new Error(
		'Location is out of bounds. It’s likely a bug in the library.'
	)
}

/**
 * Converts a signed linear segment index to a pair of curve and unsgined segment index.
 * @category Utilities
 */
export function unlinearSegmentIndex(
	path: Path,
	linearSegmentIndex: number
): {curveIndex: number; segmentIndex: number} {
	let segmentIndex = linearSegmentIndex
	let curveIndex = 0

	if (segmentIndex < 0) {
		segmentIndex = segmentCount(path) + segmentIndex
	}

	// TODO: Refactor this to avoid O(n) search
	for (const curve of path.curves) {
		const segmentCount = Curve.segmentCount(curve)
		if (segmentIndex < segmentCount) {
			break
		}
		curveIndex++
		segmentIndex -= segmentCount
	}

	return {curveIndex, segmentIndex}
}

/**
 * Calculates the position on the path at the given location.
 * @param path The path to calculate
 * @param loc The location on the path
 * @returns The position at the given offset
 * @category Properties
 */
export function point(path: Path, loc: PathLocation): vec2 {
	const segLoc = toTime(path, loc)
	return Segment.point(segLoc.segment, segLoc)
}

/**
 * Calculates the normalized tangent vector of the path at the given location.
 * @param path The path to calcuate
 * @param loc The location on the path
 * @returns The tangent vector
 * @category Properties
 */
export function derivative(path: Path, loc: PathLocation): vec2 {
	const segLoc = toTime(path, loc)
	return Segment.derivative(segLoc.segment, segLoc)
}

/**
 * Calculates the normalized tangent vector of the path at the given location.
 * @param path The path to calcuate
 * @param loc The location on the path
 * @returns The tangent vector
 * @category Properties
 */
export function tangent(path: Path, loc: PathLocation): vec2 {
	const segLoc = toTime(path, loc)
	return Segment.tangent(segLoc.segment, segLoc)
}

/**
 * Calculates the normalized tangent vector of the path at the given location.
 * @param path The path to calcuate
 * @param loc The location on the path
 * @returns The tangent vector
 * @category Properties
 */
export function normal(path: Path, loc: PathLocation): vec2 {
	const segLoc = toTime(path, loc)
	return Segment.normal(segLoc.segment, segLoc)
}

/**
 * Calculates the transformation matrix of the path at the given location. The x-axis of the matrix is the tangent vector and the y-axis is the normal vector, and the translation is the point on the path.
 * @param path The path to calculate
 * @param loc The location on the path
 * @returns The transformation matrix at the given offset
 * @category Properties
 */
export function orientation(path: Path, loc: PathLocation): mat2d {
	const segLoc = toTime(path, loc)
	return Segment.orientation(segLoc.segment, segLoc)
}
