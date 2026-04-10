import {Rect} from 'geome'

import {Curve} from '../Curve'
import type {Path} from '../Path'
import {planarPathArea} from '../pathPlanar'
import {Segment} from '../Segment'
import {memoize} from '../utils'

/**
 * Returns all segmentse
 * @param arg The path to iterate
 * @category Properties
 */
export const segments = memoize((path: Path): Segment[] => {
	return path.curves.flatMap(Curve.segments)
})
/**
 * Returns the length of the given path. The returned value is memoized.
 * @param arg The path to measure
 * @returns The length of the path
 * @category Properties
 */
export const length = memoize((path: Path): number => {
	let total = 0
	for (const seg of segments(path)) {
		total += Segment.length(seg)
	}
	return total
})

/**
 * Calculates the bound of the given path.
 * @param arg The path to calculate
 * @returns The rect of the path
 * @category Properties
 * @example
 * ```js:pave
 * const p = Path.ellipse([50, 50], [20, 40])
 * stroke(p, 'skyblue')
 *
 * const b = Path.bounds(p)
 * stroke(Path.rect(...b))
 * ```
 */
export const bounds = memoize((path: Path): Rect => {
	return Rect.unite(...path.curves.map(Curve.bounds))
})

/**
 * Calculates an area of the given path (absolute value of the Green’s-theorem sum over closed subpaths).
 * @param arg The path to calculate
 * @returns The area of the path
 * @category Properties
 */
export const area = memoize((path: Path) => {
	return Math.abs(planarPathArea(path))
})

/**
 * Returns the count of segments in the given path.
 * @param arg The path to measure
 * @returns The count of segments in the path
 * @category Properties
 */
export const segmentCount = memoize((path: Path) => {
	return path.curves.reduce((acc, curve) => acc + Curve.segmentCount(curve), 0)
})

/**
 * Returns the segment of the path by indices. If the segmentIndex is omitted, the curveIndex is treated as the linear segment index of the whole path. It also supports negative indices, which count from the end of the path or curve.
 * @param path The path that contains the segment
 * @param curveIndex The index of the curve.
 * @param segmentIndex The index of the segment in the curve.
 * @returns The segment
 * @category Properties
 */
export function segment(
	path: Path,
	curveIndex: number,
	segmentIndex?: number
): Segment {
	if (typeof segmentIndex === 'number') {
		// Both curveIndex and segmentIndex are specified
		const curve = path.curves.at(curveIndex)

		if (!curve) {
			throw new Error(`Curve index out of range: ${curveIndex}`)
		}

		const seg = Curve.segments(curve).at(segmentIndex)

		if (!seg) {
			throw new Error(
				`Segment index out of range: curve[${curveIndex}] segment[${segmentIndex}]`
			)
		}

		return seg
	} else {
		// If segmentIndex is omitted,
		//the linear index is treated as the linear segment index of the whole path

		segmentIndex = curveIndex
		for (const curve of path.curves) {
			const segCount = Curve.segmentCount(curve)

			if (segmentIndex < segCount) {
				return Curve.segments(curve)[segmentIndex]
			}

			segmentIndex -= segCount
		}

		throw new Error(`Linear segment index out of range: ${segmentIndex}`)
	}
}
