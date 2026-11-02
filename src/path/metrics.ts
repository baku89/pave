import {Rect} from 'geome'
import {scalar} from 'linearly'

import {CubicBezier, Curve, type Path, Segment} from '../index'
import {planarPathArea} from '../pathPlanar'
import {memoize} from '../utils'
import {unite} from './boolean'

/**
 * Returns all segments
 * @param arg The path to iterate
 * @category Properties
 */
export const segments = /* @__PURE__ */ memoize((path: Path): Segment[] => {
	return path.curves.flatMap(Curve.segments)
})
/**
 * Returns the length of the given path. The returned value is memoized.
 * @param arg The path to measure
 * @returns The length of the path
 * @category Properties
 */
export const length = /* @__PURE__ */ memoize((path: Path): number => {
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
export const bounds = /* @__PURE__ */ memoize((path: Path): Rect => {
	return Rect.unite(...path.curves.map(Curve.bounds))
})

/**
 * Calculates an area of the given path (absolute value of the Green’s-theorem sum over closed subpaths). A path containing a cubic Bézier that crosses itself is measured by what gets filled under the non-zero rule, so the overlap of a loop counts once.
 * @param arg The path to calculate
 * @returns The area of the path
 * @category Properties
 */
export const area = /* @__PURE__ */ memoize((path: Path) => {
	return Math.abs(planarPathArea(hasCubicLoop(path) ? unite([path]) : path))
})

/**
 * Green's theorem counts the inside of a loop by its winding number, so a cubic crossing
 * itself would have its overlap counted twice or subtracted, unlike what gets filled.
 */
function hasCubicLoop(path: Path): boolean {
	return path.curves.some(curve =>
		Curve.segments(curve).some(
			seg =>
				seg.command === 'C' && CubicBezier.selfIntersectionTimes(seg) !== null
		)
	)
}

/**
 * Returns the count of segments in the given path.
 * @param arg The path to measure
 * @returns The count of segments in the path
 * @category Properties
 */
export const segmentCount = /* @__PURE__ */ memoize((path: Path) => {
	return path.curves.reduce((acc, curve) => acc + Curve.segmentCount(curve), 0)
})

/** Linear segment index where each curve starts (memoized). */
export const segmentCurveStarts = /* @__PURE__ */ memoize(
	(path: Path): readonly number[] => {
		const starts: number[] = []
		let acc = 0
		for (const curve of path.curves) {
			starts.push(acc)
			acc += Curve.segmentCount(curve)
		}
		return starts
	}
)

/**
 * Maps a linear segment index (optionally negative from the end) to curve and in-curve indices.
 */
export function splitLinearSegmentIndex(
	path: Path,
	linearIndex: number
): {curveIndex: number; segmentIndex: number} {
	const total = segmentCount(path)
	if (total <= 0) {
		throw new Error('Path has no segments')
	}
	let k = linearIndex < 0 ? total + linearIndex : linearIndex
	k = scalar.clamp(k, 0, total - 1)
	const starts = segmentCurveStarts(path)
	let lo = 0
	let hi = starts.length
	while (lo < hi) {
		const mid = (lo + hi) >>> 1
		if (starts[mid]! <= k) lo = mid + 1
		else hi = mid
	}
	const curveIndex = lo - 1
	return {curveIndex, segmentIndex: k - starts[curveIndex]!}
}

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
		const {curveIndex: ci, segmentIndex: si} = splitLinearSegmentIndex(
			path,
			curveIndex
		)
		const curve = path.curves[ci]
		const seg = Curve.segments(curve)[si]
		if (!seg) {
			throw new Error(`Linear segment index out of range: ${curveIndex}`)
		}
		return seg
	}
}

/**
 * Cumulative curve lengths: `prefix[i]` is the length before curve `i`, the last entry the total.
 * Built once per path so that offset lookups are a binary search instead of a scan.
 */
export const curveLengthPrefix = /* @__PURE__ */ memoize(
	(path: Path): Float64Array => {
		const prefix = new Float64Array(path.curves.length + 1)
		for (const [i, curve] of path.curves.entries()) {
			prefix[i + 1] = prefix[i] + Curve.length(curve)
		}
		return prefix
	}
)
