import {Rect} from 'geome'
import {vec2} from 'linearly'

import {CubicBezier, type Path, Segment} from '../index'
import type {TimePathLocation} from '../Location'
import {intersectSegments, nearestTime} from './intersections'
import {unlinearSegmentIndex} from './location'
import {bounds, segments} from './metrics'
import {flatten} from './modifiers'
import {windingNumber} from './planar'

/**
 * The fill rule deciding which regions a self-overlapping path fills, as in SVG.
 * @category Types
 */
export type FillRule = 'nonzero' | 'evenodd'

/**
 * The options for {@link Path.contains}.
 * @category Options
 */
export interface ContainsOptions {
	/**
	 * @default 'nonzero'
	 */
	fillRule?: FillRule
}

/**
 * The nearest point of a path to a point.
 * @category Types
 */
export interface NearestPoint {
	point: vec2
	distance: number
	location: Required<TimePathLocation>
}

/**
 * The options for {@link Path.hitTest}.
 * @category Options
 */
export interface HitTestOptions {
	/**
	 * How far from a vertex, a handle or the stroke a point still counts as hitting it.
	 * @default 4
	 */
	tolerance?: number
	/**
	 * The fill rule used for hits on the inside of the path. Set to `null` to never report the fill.
	 * @default 'nonzero'
	 */
	fillRule?: FillRule | null
}

/**
 * What {@link Path.hitTest} found under the point, in the order they are looked for.
 * @category Types
 */
export type HitTestResult =
	| {type: 'vertex'; curveIndex: number; vertexIndex: number; point: vec2}
	| {
			type: 'handle'
			curveIndex: number
			vertexIndex: number
			/** `in` for the handle arriving at the vertex, `out` for the one leaving it */
			side: 'in' | 'out'
			point: vec2
	  }
	| {
			type: 'stroke'
			point: vec2
			distance: number
			location: Required<TimePathLocation>
	  }
	| {type: 'fill'}

/**
 * The options for {@link Path.intersections} and {@link Path.selfIntersections}.
 * @category Options
 */
export interface IntersectionsOptions {
	/**
	 * How close two curves have to come to count as touching.
	 * @default 1e-9 relative to the size of the paths
	 */
	tolerance?: number
}

/**
 * A point where two paths cross.
 * @category Types
 */
export interface PathIntersection {
	point: vec2
	/** Where on the first path */
	a: Required<TimePathLocation>
	/** Where on the second path */
	b: Required<TimePathLocation>
}

/**
 * Whether the point lies inside the path. Open curves are regarded as closed by a straight line.
 * @param path The path
 * @param point The point to test
 * @param options The options
 * @category Properties
 */
export function contains(
	path: Path,
	point: vec2,
	{fillRule = 'nonzero'}: ContainsOptions = {}
): boolean {
	const winding = windingNumber(path.curves, point)
	return fillRule === 'evenodd' ? winding % 2 !== 0 : winding !== 0
}

/**
 * The point of the path nearest to `point`.
 * @param path The path
 * @param point The point to measure from
 * @returns The nearest point, or null for an empty path
 * @category Properties
 */
export function nearest(path: Path, point: vec2): NearestPoint | null {
	let best = null as NearestPoint | null

	segments(path).forEach((seg, linearIndex) => {
		const {t, distance} = nearestTime(seg, point)
		if (!best || distance < best.distance) {
			best = {
				point: Segment.point(seg, {time: t}),
				distance,
				location: {time: t, ...unlinearSegmentIndex(path, linearIndex)},
			}
		}
	})

	return best
}

/**
 * Finds what lies under a point, the way a node tool would: a vertex, then a handle of a cubic Bézier, then the stroke, then the fill.
 * @param path The path
 * @param point The point to test, usually the pointer
 * @param options The options
 * @returns What was hit, or null
 * @category Properties
 */
export function hitTest(
	path: Path,
	point: vec2,
	{tolerance = 4, fillRule = 'nonzero'}: HitTestOptions = {}
): HitTestResult | null {
	let closest = null as HitTestResult | null
	let closestDistance = tolerance

	path.curves.forEach(({vertices}, curveIndex) => {
		vertices.forEach((vertex, vertexIndex) => {
			const distance = vec2.distance(vertex.point, point)
			if (distance <= closestDistance) {
				closestDistance = distance
				closest = {type: 'vertex', curveIndex, vertexIndex, point: vertex.point}
			}
		})
	})
	if (closest) return closest

	path.curves.forEach(({vertices, closed}, curveIndex) => {
		vertices.forEach((vertex, vertexIndex) => {
			if (vertex.command !== 'C') return
			const [c1, c2] = vertex.args
			// The first handle belongs to the previous vertex
			const prevIndex =
				vertexIndex === 0
					? closed
						? vertices.length - 1
						: -1
					: vertexIndex - 1
			const candidates: [vec2, number, 'in' | 'out'][] = [
				[c2, vertexIndex, 'in'],
			]
			if (prevIndex >= 0) candidates.push([c1, prevIndex, 'out'])
			for (const [handle, index, side] of candidates) {
				const distance = vec2.distance(handle, point)
				if (distance <= closestDistance) {
					closestDistance = distance
					closest = {
						type: 'handle',
						curveIndex,
						vertexIndex: index,
						side,
						point: handle,
					}
				}
			}
		})
	})
	if (closest) return closest

	const near = nearest(path, point)
	if (near && near.distance <= tolerance) {
		return {type: 'stroke', ...near}
	}

	if (fillRule && contains(path, point, {fillRule})) {
		return {type: 'fill'}
	}

	return null
}

function defaultTolerance(...paths: Path[]): number {
	const sizes = paths.flatMap(path =>
		segments(path).length > 0 ? Rect.size(bounds(path)) : []
	)
	return 1e-9 * Math.max(1, ...sizes)
}

/**
 * Where two paths cross or touch.
 * @param a The first path
 * @param b The second path
 * @param options The options
 * @returns The intersections, ordered along the first path
 * @category Properties
 */
export function intersections(
	a: Path,
	b: Path,
	{tolerance}: IntersectionsOptions = {}
): PathIntersection[] {
	const eps = tolerance ?? defaultTolerance(a, b)
	const segsA = segments(a)
	const segsB = segments(b).map(seg => ({
		seg,
		bounds: Rect.offset(Segment.bounds(seg), eps),
	}))
	const out: PathIntersection[] = []

	segsA.forEach((segA, ia) => {
		const boundsA = Rect.offset(Segment.bounds(segA), eps)
		segsB.forEach(({seg: segB, bounds: boundsB}, ib) => {
			if (!Rect.intersects(boundsA, boundsB)) return
			for (const {t1, t2, point} of intersectSegments(segA, segB, eps)) {
				out.push({
					point,
					a: {time: t1, ...unlinearSegmentIndex(a, ia)},
					b: {time: t2, ...unlinearSegmentIndex(b, ib)},
				})
			}
		})
	})

	return dedupe(sortByA(out), eps)
}

/**
 * Where the path crosses itself, including a cubic Bézier looping through its own point.
 * @param path The path
 * @param options The options
 * @returns The self-intersections, ordered along the path. `a` comes before `b` along the path.
 * @category Properties
 */
export function selfIntersections(
	path: Path,
	{tolerance}: IntersectionsOptions = {}
): PathIntersection[] {
	const eps = tolerance ?? defaultTolerance(path)
	const segs = segments(path).map(seg => ({
		seg,
		bounds: Rect.offset(Segment.bounds(seg), eps),
	}))
	const out: PathIntersection[] = []

	const sharesEnd = (p: vec2, i: number, j: number) =>
		[
			segs[i].seg.start,
			segs[i].seg.point,
			segs[j].seg.start,
			segs[j].seg.point,
		].some(q => vec2.distance(p, q) <= eps)

	segs.forEach(({seg, bounds: boundsI}, i) => {
		if (seg.command === 'C') {
			const times = loopTimes(seg)
			if (times) {
				const location = unlinearSegmentIndex(path, i)
				out.push({
					point: Segment.point(seg, {time: times[0]}),
					a: {time: times[0], ...location},
					b: {time: times[1], ...location},
				})
			}
		}

		for (let j = i + 1; j < segs.length; j++) {
			const {seg: other, bounds: boundsJ} = segs[j]
			if (!Rect.intersects(boundsI, boundsJ)) continue
			for (const {t1, t2, point} of intersectSegments(seg, other, eps)) {
				// Neighbouring segments always meet at their shared vertex
				if (sharesEnd(point, i, j)) continue
				out.push({
					point,
					a: {time: t1, ...unlinearSegmentIndex(path, i)},
					b: {time: t2, ...unlinearSegmentIndex(path, j)},
				})
			}
		}
	})

	return dedupe(sortByA(out), eps)
}

function loopTimes(seg: Segment): [number, number] | null {
	return seg.command === 'C' ? CubicBezier.selfIntersectionTimes(seg) : null
}

function sortByA(list: PathIntersection[]): PathIntersection[] {
	return list.sort(
		(p, q) =>
			p.a.curveIndex - q.a.curveIndex ||
			p.a.segmentIndex - q.a.segmentIndex ||
			p.a.time - q.a.time
	)
}

function dedupe(list: PathIntersection[], eps: number): PathIntersection[] {
	return list.filter(
		(item, i) => i === 0 || vec2.distance(item.point, list[i - 1].point) > eps
	)
}

/**
 * The centroid of the area enclosed by the path. Open curves are regarded as closed by a straight line. When the path encloses no area, the mean of its vertices is returned instead.
 * @param path The path
 * @param tolerance How finely curves are flattened for the computation
 * @returns The centroid, or null for an empty path
 * @category Properties
 */
export function centroid(path: Path, tolerance = 0.05): vec2 | null {
	let area = 0
	let cx = 0
	let cy = 0
	let count = 0
	let sx = 0
	let sy = 0

	for (const {vertices} of flatten(path, tolerance).curves) {
		const points = vertices.map(v => v.point)
		for (let i = 0; i < points.length; i++) {
			const [x0, y0] = points[i]
			const [x1, y1] = points[(i + 1) % points.length]
			const c = x0 * y1 - x1 * y0
			area += c
			cx += (x0 + x1) * c
			cy += (y0 + y1) * c
			sx += x0
			sy += y0
			count++
		}
	}

	if (count === 0) return null

	if (Math.abs(area) < 1e-12 * Math.max(1, sx * sx + sy * sy)) {
		return [sx / count, sy / count]
	}

	return [cx / (3 * area), cy / (3 * area)]
}
