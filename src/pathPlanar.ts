/**
 * Planar measures without Paper.js: signed area (Green’s theorem) and polyline flattening.
 * Internal helpers implement ∫ (x dy − y dx) for area and flatness heuristics for flatten.
 */
import {vec2} from 'linearly'

import {completeVertexAttrs, segmentAttrsAt, withCurves} from './attributes'
import {
	Arc,
	CubicBezier,
	Curve,
	type Path,
	Segment,
	type SegmentA,
	type SegmentC,
	type VertexL,
} from './index'
import {gaussLegendre} from './numeric'
import type {AttributeDefs} from './path/types'

/**
 * Green plane form for one straight edge from `start` → `end`:
 * ∫ (x dy − y dx) equals the shoelace increment x₀Δy − y₀Δx (exact for a line segment).
 */
function lineGreenPlaneIntegral(start: vec2, end: vec2): number {
	return start[0] * (end[1] - start[1]) - start[1] * (end[0] - start[0])
}

/**
 * Same Green integrand ∫ (x dy − y dx) for t ∈ [0,1] along a cubic Bézier, using
 * {@link CubicBezier.point} / {@link CubicBezier.derivative}. The integrand is a degree-5
 * polynomial, so Gauss–Legendre quadrature is exact. Kept here (not on `CubicBezier`)
 * because it exists only for {@link planarPathArea}.
 */
function cubicGreenPlaneIntegral(seg: SegmentC): number {
	return gaussLegendre(
		t => {
			const p = CubicBezier.point(seg, {time: t})
			const v = CubicBezier.derivative(seg, {time: t})
			return p[0] * v[1] - p[1] * v[0]
		},
		0,
		1
	)
}

/**
 * Same Green integrand for an SVG elliptic arc, using {@link Arc.point} /
 * {@link Arc.derivative} (true dp/dt). Degenerate arcs use the chord.
 */
function arcGreenPlaneIntegral(seg: SegmentA): number {
	const {start, point} = seg
	if (Arc.isStraight(seg)) {
		return lineGreenPlaneIntegral(start, point)
	}
	return gaussLegendre(
		t => {
			const p = Arc.point(seg, {time: t})
			const v = Arc.derivative(seg, {time: t})
			return p[0] * v[1] - p[1] * v[0]
		},
		0,
		1
	)
}

/**
 * Per-segment contribution to 2×signed area: line (closed form), cubic and arc (Gauss quadrature).
 */
function segmentGreenPlaneIntegral(seg: Segment): number {
	if (seg.command === 'L') {
		return lineGreenPlaneIntegral(seg.start, seg.point)
	}
	if (seg.command === 'C') {
		return cubicGreenPlaneIntegral(seg)
	}
	return arcGreenPlaneIntegral(seg)
}

/**
 * Half the sum of segment Green integrals for one closed `Curve`; 0 if open or empty.
 * Matches Green’s theorem: area = ½ ∮ (x dy − y dx) for a simple closed boundary.
 */
function curveSignedArea(curve: Curve): number {
	if (!curve.closed || curve.vertices.length === 0) {
		return 0
	}
	let sum = 0
	for (const seg of Curve.segments(curve)) {
		sum += segmentGreenPlaneIntegral(seg)
	}
	return sum * 0.5
}

/** Sum of {@link curveSignedArea} over all subpaths in `path`. */
export function planarPathArea(path: Path): number {
	let total = 0
	for (const c of path.curves) {
		total += curveSignedArea(c)
	}
	return total
}

/** Shortest distance from `p` to the closed segment ab (for flatness tests). */
function distPointToSegment(p: vec2, a: vec2, b: vec2): number {
	const ab = vec2.sub(b, a)
	const ap = vec2.sub(p, a)
	const lab2 = vec2.squaredLength(ab)
	if (lab2 < 1e-30) {
		return vec2.distance(p, a)
	}
	let t = (ap[0] * ab[0] + ap[1] * ab[1]) / lab2
	t = Math.max(0, Math.min(1, t))
	const proj = vec2.scaleAndAdd(a, ab, t)
	return vec2.distance(p, proj)
}

/**
 * Casteljau-style flatness: max distance of the two interior control points from the chord P₀–P₃.
 * If below `tolerance`, the cubic is replaced by a single line in {@link pushCubicFlat}.
 */
function cubicMaxDeviationFromChord(seg: SegmentC): number {
	const p0 = seg.start
	const p3 = seg.point
	const [p1, p2] = seg.args
	return Math.max(
		distPointToSegment(p1, p0, p3),
		distPointToSegment(p2, p0, p3)
	)
}

const FLATTEN_MAX_DEPTH = 64

/** A point on a segment, along with its time to read the attributes there. */
interface FlatPoint {
	point: vec2
	time: number
}

/**
 * Recursively bisect a cubic at t=½ until the hull is within `tolerance` of the chord,
 * then append the end vertex. Outputs only interior breakpoints + end (caller owns start).
 */
function pushCubicFlat(
	seg: SegmentC,
	tolerance: number,
	out: FlatPoint[],
	depth: number,
	t0 = 0,
	t1 = 1
): void {
	if (
		depth > FLATTEN_MAX_DEPTH ||
		cubicMaxDeviationFromChord(seg) <= tolerance
	) {
		out.push({point: seg.point, time: t1})
		return
	}
	const tm = (t0 + t1) / 2
	const left = CubicBezier.trim(seg, {time: 0}, {time: 0.5})
	const right = CubicBezier.trim(seg, {time: 0.5}, {time: 1})
	pushCubicFlat(left, tolerance, out, depth + 1, t0, tm)
	pushCubicFlat(right, tolerance, out, depth + 1, tm, t1)
}

/** Midpoint (t=½) deviation from the chord; coarse upper bound on arc–line error for splitting. */
function arcMidChordDeviation(seg: SegmentA): number {
	const mid = Arc.point(seg, {time: 0.5})
	return distPointToSegment(mid, seg.start, seg.point)
}

/**
 * Like {@link pushCubicFlat}: bisect arc with {@link Arc.trim} until straight or chord error ≤ `tolerance`.
 */
function pushArcFlat(
	seg: SegmentA,
	tolerance: number,
	out: FlatPoint[],
	depth: number,
	t0 = 0,
	t1 = 1
): void {
	if (Arc.isStraight(seg)) {
		out.push({point: seg.point, time: t1})
		return
	}
	if (depth > FLATTEN_MAX_DEPTH || arcMidChordDeviation(seg) <= tolerance) {
		out.push({point: seg.point, time: t1})
		return
	}
	const tm = (t0 + t1) / 2
	const left = Arc.trim(seg, {time: 0}, {time: 0.5})
	const right = Arc.trim(seg, {time: 0.5}, {time: 1})
	pushArcFlat(left, tolerance, out, depth + 1, t0, tm)
	pushArcFlat(right, tolerance, out, depth + 1, tm, t1)
}

/**
 * One subpath → polyline (`L` only), walking {@link Curve.segments}; drops a closing duplicate of the first vertex when present.
 */
function flattenCurve(
	curve: Curve,
	tolerance: number,
	attrDefs?: AttributeDefs
): Curve & {vertices: VertexL[]} {
	const curveAttrs = curve.attrs ? {attrs: curve.attrs} : {}
	const segs = Curve.segments(curve)
	if (segs.length === 0) {
		return {vertices: [], closed: curve.closed, ...curveAttrs}
	}

	const first = curve.vertices[0]
	const verts: VertexL[] = [
		{
			point: first.point,
			command: 'L',
			...(first.attrs ? {attrs: first.attrs} : {}),
		},
	]

	for (const seg of segs) {
		const pts: FlatPoint[] = []
		if (seg.command === 'L') {
			pts.push({point: seg.point, time: 1})
		} else if (seg.command === 'C') {
			pushCubicFlat(seg, tolerance, pts, 0)
		} else {
			pushArcFlat(seg, tolerance, pts, 0)
		}
		for (const {point, time} of pts) {
			const attrs = segmentAttrsAt(seg, time, attrDefs)
			verts.push({point, command: 'L', ...(attrs ? {attrs} : {})})
		}
	}

	if (
		curve.closed &&
		verts.length >= 2 &&
		vec2.approx(verts[verts.length - 1]!.point, verts[0]!.point)
	) {
		verts.pop()
	}

	return {vertices: verts, closed: curve.closed, ...curveAttrs}
}

/** Map every curve through {@link flattenCurve} with shared `tolerance`. */
export function planarFlattenPath(path: Path, tolerance: number): Path {
	const complete = completeVertexAttrs(path)
	return withCurves(
		path,
		complete.curves.map(c => flattenCurve(c, tolerance, path.attrDefs))
	)
}
