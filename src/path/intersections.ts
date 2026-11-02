/**
 * Segment–segment intersections for the planar boolean engine.
 *
 * Line pairs use the closed form from geome. Every other pair first checks whether the segments
 * overlap (share a stretch of the same curve) by projecting end points, and otherwise
 * falls back to recursive bounding-box subdivision followed by a Newton polish.
 */
import {Rect, Segment as LineSegment} from 'geome'
import {scalar, vec2} from 'linearly'

import {Segment} from '../index'
import {cross2} from '../parallelCurve'
import {rangeBounds} from '../segmentBounds'

/** Longest side of a rect. */
function rectExtent(r: Rect): number {
	return Math.max(...Rect.size(r))
}

/** An intersection as parameters on both segments plus the shared point. */
export interface SegmentIntersection {
	t1: number
	t2: number
	point: vec2
	/** True when the point bounds a stretch on which both segments coincide. */
	overlap?: boolean
}

const PARAM_EPS = 1e-9
const SUBDIVISION_BUDGET = 4096
const SUBDIVISION_MAX_DEPTH = 64
const NEWTON_ITERATIONS = 12

/**
 * Nearest parameter on the segment to `p` (sampling + golden-section refinement).
 */
export function nearestTime(
	seg: Segment,
	p: vec2
): {t: number; distance: number} {
	if (seg.command === 'L') {
		const d = vec2.sub(seg.point, seg.start)
		const l2 = vec2.squaredLength(d)
		const t =
			l2 < 1e-30
				? 0
				: scalar.clamp(vec2.dot(vec2.sub(p, seg.start), d) / l2, 0, 1)
		return {t, distance: vec2.distance(p, vec2.lerp(seg.start, seg.point, t))}
	}

	const dist2 = (t: number) =>
		vec2.squaredDistance(p, Segment.point(seg, {time: t}))

	const samples = 24
	let bestI = 0
	let best = Infinity
	for (let i = 0; i <= samples; i++) {
		const v = dist2(i / samples)
		if (v < best) {
			best = v
			bestI = i
		}
	}

	let a = Math.max(0, (bestI - 1) / samples)
	let b = Math.min(1, (bestI + 1) / samples)
	const phi = (Math.sqrt(5) - 1) / 2
	let c = b - phi * (b - a)
	let d = a + phi * (b - a)
	let fc = dist2(c)
	let fd = dist2(d)
	for (let i = 0; i < 60; i++) {
		if (fc < fd) {
			b = d
			d = c
			fd = fc
			c = b - phi * (b - a)
			fc = dist2(c)
		} else {
			a = c
			c = d
			fc = fd
			d = a + phi * (b - a)
			fd = dist2(d)
		}
	}
	const t = (a + b) / 2
	return {t, distance: Math.sqrt(dist2(t))}
}

/**
 * End-point correspondences, and the overlap intervals they bound if the segments share a
 * stretch of curve. Returns `null` when the segments do not overlap.
 */
function overlapIntersections(
	a: Segment,
	b: Segment,
	tolerance: number
): {candidates: SegmentIntersection[]; overlap: boolean} {
	const candidates: SegmentIntersection[] = []
	const add = (t1: number, t2: number, p: vec2, q: vec2) => {
		if (vec2.distance(p, q) > tolerance) return
		if (
			candidates.some(
				c =>
					Math.abs(c.t1 - t1) <= PARAM_EPS && Math.abs(c.t2 - t2) <= PARAM_EPS
			)
		) {
			return
		}
		candidates.push({t1, t2, point: vec2.lerp(p, q, 0.5)})
	}

	{
		const n = nearestTime(a, b.start)
		add(n.t, 0, Segment.point(a, {time: n.t}), b.start)
	}
	{
		const n = nearestTime(a, b.point)
		add(n.t, 1, Segment.point(a, {time: n.t}), b.point)
	}
	{
		const n = nearestTime(b, a.start)
		add(0, n.t, a.start, Segment.point(b, {time: n.t}))
	}
	{
		const n = nearestTime(b, a.point)
		add(1, n.t, a.point, Segment.point(b, {time: n.t}))
	}

	candidates.sort((p, q) => p.t1 - q.t1)

	let overlap = false
	for (let i = 0; i + 1 < candidates.length; i++) {
		const c0 = candidates[i]
		const c1 = candidates[i + 1]
		if (c1.t1 - c0.t1 <= PARAM_EPS) continue
		const tm = (c0.t1 + c1.t1) / 2
		const pm = Segment.point(a, {time: tm})
		const n = nearestTime(b, pm)
		if (n.distance <= tolerance) {
			overlap = true
			c0.overlap = true
			c1.overlap = true
		}
	}

	return {candidates, overlap}
}

function newtonPolish(
	a: Segment,
	b: Segment,
	t1: number,
	t2: number
): [number, number] {
	for (let i = 0; i < NEWTON_ITERATIONS; i++) {
		const pa = Segment.point(a, {time: t1})
		const pb = Segment.point(b, {time: t2})
		const f = vec2.sub(pa, pb)
		if (vec2.squaredLength(f) < 1e-30) break
		const da = Segment.derivative(a, {time: t1})
		const db = Segment.derivative(b, {time: t2})
		// Solve [da, -db]·[d1, d2] = -f
		const det = cross2(da, vec2.negate(db))
		if (Math.abs(det) < 1e-18) break
		const d1 = cross2(vec2.negate(f), vec2.negate(db)) / det
		const d2 = cross2(da, vec2.negate(f)) / det
		const n1 = scalar.clamp(t1 + d1, 0, 1)
		const n2 = scalar.clamp(t2 + d2, 0, 1)
		const moved = Math.abs(n1 - t1) + Math.abs(n2 - t2)
		t1 = n1
		t2 = n2
		if (moved < 1e-15) break
	}
	return [t1, t2]
}

function subdivide(
	a: Segment,
	b: Segment,
	tolerance: number
): SegmentIntersection[] {
	type Node = {
		ta0: number
		ta1: number
		tb0: number
		tb1: number
		depth: number
	}

	const stack: Node[] = [{ta0: 0, ta1: 1, tb0: 0, tb1: 1, depth: 0}]
	const raw: [number, number][] = []
	let budget = SUBDIVISION_BUDGET

	while (stack.length > 0 && budget-- > 0) {
		const n = stack.pop()!
		const ba = rangeBounds(a, n.ta0, n.ta1)
		const bb = rangeBounds(b, n.tb0, n.tb1)
		if (!Rect.intersects(Rect.offset(ba, tolerance), bb)) continue

		const sa = rectExtent(ba)
		const sb = rectExtent(bb)
		if (
			(sa <= tolerance && sb <= tolerance) ||
			n.depth >= SUBDIVISION_MAX_DEPTH
		) {
			raw.push([(n.ta0 + n.ta1) / 2, (n.tb0 + n.tb1) / 2])
			continue
		}

		if (sa >= sb) {
			const tm = (n.ta0 + n.ta1) / 2
			stack.push({...n, ta1: tm, depth: n.depth + 1})
			stack.push({...n, ta0: tm, depth: n.depth + 1})
		} else {
			const tm = (n.tb0 + n.tb1) / 2
			stack.push({...n, tb1: tm, depth: n.depth + 1})
			stack.push({...n, tb0: tm, depth: n.depth + 1})
		}
	}

	const out: SegmentIntersection[] = []
	for (const [r1, r2] of raw) {
		const [t1, t2] = newtonPolish(a, b, r1, r2)
		const pa = Segment.point(a, {time: t1})
		const pb = Segment.point(b, {time: t2})
		if (vec2.distance(pa, pb) > tolerance) continue
		const point = vec2.lerp(pa, pb, 0.5)
		if (
			out.some(
				o =>
					vec2.distance(o.point, point) <= tolerance ||
					(Math.abs(o.t1 - t1) <= 1e-7 && Math.abs(o.t2 - t2) <= 1e-7)
			)
		) {
			continue
		}
		out.push({t1, t2, point})
	}
	return out
}

/**
 * All intersections between two segments within `tolerance` (absolute distance).
 */
export function intersectSegments(
	a: Segment,
	b: Segment,
	tolerance: number
): SegmentIntersection[] {
	if (
		!Rect.intersects(
			Rect.offset(Segment.bounds(a), tolerance),
			Segment.bounds(b)
		)
	) {
		return []
	}

	if (a.command === 'L' && b.command === 'L') {
		return LineSegment.intersections(
			[a.start, a.point],
			[b.start, b.point],
			tolerance
		)
	}

	const {candidates, overlap} = overlapIntersections(a, b, tolerance)
	if (overlap) {
		return candidates.filter(c => c.overlap)
	}

	const out = [...candidates]
	for (const x of subdivide(a, b, tolerance)) {
		if (out.some(o => vec2.distance(o.point, x.point) <= tolerance)) continue
		out.push(x)
	}
	return out
}
