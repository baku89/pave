import {Rect} from 'geome'
import {vec2} from 'linearly'

import {type Path, Segment} from '../index'
import type {TimePathLocation} from '../Location'
import {intersectSegments} from './intersections'
import {unlinearSegmentIndex} from './location'
import {bounds, segments} from './metrics'

/**
 * Where a ray hits the path.
 * @category Types
 */
export interface RayHit {
	/** The distance from the origin of the ray. Negative when behind the origin, which only happens with `both`. */
	distance: number
	point: vec2
	/** The unit normal of the path at the hit, see {@link Path.normal} */
	normal: vec2
	/** The unit tangent of the path at the hit */
	tangent: vec2
	location: Required<TimePathLocation>
	/** True when the ray hits the path from its normal side */
	front: boolean
}

/**
 * The options for {@link Path.raycast}.
 * @category Options
 */
export interface RaycastOptions {
	/**
	 * Hits farther than this are left out.
	 * @default Infinity
	 */
	maxDistance?: number
	/**
	 * When true, the ray extends behind the origin too, becoming a line.
	 * @default false
	 */
	both?: boolean
	/**
	 * Hits closer than this to one another are merged, which happens where the ray passes through a vertex.
	 * @default 1e-9 relative to the size of the path
	 */
	tolerance?: number
}

/**
 * Casts a ray from `origin` along `direction` and returns where it hits the path, nearest first.
 * @param path The path to cast against
 * @param origin The start of the ray
 * @param direction The direction of the ray. Its length does not matter.
 * @param options The options
 * @returns The hits sorted by distance
 * @category Properties
 */
export function raycast(
	path: Path,
	origin: vec2,
	direction: vec2,
	{maxDistance = Infinity, both = false, tolerance}: RaycastOptions = {}
): RayHit[] {
	const segs = segments(path)
	if (segs.length === 0) return []

	const dir = vec2.normalize(direction)
	if (vec2.len(dir) === 0) return []

	const box = bounds(path)
	const extent = Math.max(
		...[
			Rect.min(box),
			Rect.max(box),
			[Rect.left(box), Rect.bottom(box)] as vec2,
			[Rect.right(box), Rect.top(box)] as vec2,
		].map(corner => vec2.distance(origin, corner))
	)
	const reach = Math.min(maxDistance, extent + 1)
	const scale = Math.max(1, extent, ...Rect.size(box))
	const eps = tolerance ?? 1e-9 * scale

	const start = both ? vec2.scaleAndAdd(origin, dir, -reach) : origin
	const end = vec2.scaleAndAdd(origin, dir, reach)
	const span = both ? 2 * reach : reach
	const ray: Segment = {command: 'L', start, point: end}

	const hits: RayHit[] = []

	segs.forEach((seg, linearIndex) => {
		for (const {t1, t2} of intersectSegments(ray, seg, eps)) {
			const distance = t1 * span - (both ? reach : 0)
			if (distance > maxDistance) continue

			const normal = Segment.normal(seg, {time: t2})
			const tangent = Segment.tangent(seg, {time: t2})
			hits.push({
				distance,
				point: Segment.point(seg, {time: t2}),
				normal,
				tangent,
				location: {time: t2, ...unlinearSegmentIndex(path, linearIndex)},
				front: vec2.dot(dir, normal) < 0,
			})
		}
	})

	hits.sort((a, b) => a.distance - b.distance)

	// A ray through a vertex is reported by both segments meeting there
	return hits.filter(
		(hit, i) => i === 0 || Math.abs(hit.distance - hits[i - 1].distance) > eps
	)
}
