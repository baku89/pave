/**
 * Planar measures without Paper.js: signed area (Green’s theorem) and polyline flattening.
 * Internal helpers implement ∫ (x dy − y dx) for area and flatness heuristics for flatten.
 */
import {vec2} from 'linearly'

import {Arc} from './Arc'
import {CubicBezier} from './CubicBezier'
import {
	cubicGreenPlaneIntegral,
	integrateOnUnitInterval,
} from './cubicBezierGeometry'
import {Curve} from './Curve'
import type {Path, VertexL} from './Path'
import {Segment, type SegmentA, type SegmentC} from './Segment'

/**
 * Green plane form for one straight edge from `start` → `end`:
 * ∫ (x dy − y dx) equals the shoelace increment x₀Δy − y₀Δx (exact for a line segment).
 */
function lineGreenPlaneIntegral(start: vec2, end: vec2): number {
	return start[0] * (end[1] - start[1]) - start[1] * (end[0] - start[0])
}

/**
 * Same Green integrand ∫ (x dy − y dx) for t ∈ [0,1] along an SVG elliptic arc,
 * using {@link Arc.point} / {@link Arc.derivative} (true dp/dt). Degenerate arcs use the chord.
 * Kept here (not on `Arc`) because it exists only for {@link planarPathArea}.
 */
function arcGreenPlaneIntegral(seg: SegmentA): number {
	const {start, point} = seg
	if (Arc.isStraight(seg)) {
		return lineGreenPlaneIntegral(start, point)
	}
	return integrateOnUnitInterval(t => {
		const p = Arc.point(seg, {time: t})
		const v = Arc.derivative(seg, {time: t})
		return p[0] * v[1] - p[1] * v[0]
	})
}

/**
 * Per-segment contribution to 2×signed area: line (closed form), cubic (Gauss quadrature in geometry),
 * arc (see {@link arcGreenPlaneIntegral}).
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
 * If below `flatness`, the cubic is replaced by a single line in {@link pushCubicFlat}.
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

/**
 * Recursively bisect a cubic at t=½ until the hull is within `flatness` of the chord,
 * then append the end vertex. Outputs only interior breakpoints + end (caller owns start).
 */
function pushCubicFlat(
	seg: SegmentC,
	flatness: number,
	out: vec2[],
	depth: number
): void {
	if (
		depth > FLATTEN_MAX_DEPTH ||
		cubicMaxDeviationFromChord(seg) <= flatness
	) {
		out.push(seg.point)
		return
	}
	const left = CubicBezier.trim(seg, {time: 0}, {time: 0.5})
	const right = CubicBezier.trim(seg, {time: 0.5}, {time: 1})
	pushCubicFlat(left, flatness, out, depth + 1)
	pushCubicFlat(right, flatness, out, depth + 1)
}

/** Midpoint (t=½) deviation from the chord; coarse upper bound on arc–line error for splitting. */
function arcMidChordDeviation(seg: SegmentA): number {
	const mid = Arc.point(seg, {time: 0.5})
	return distPointToSegment(mid, seg.start, seg.point)
}

/**
 * Like {@link pushCubicFlat}: bisect arc with {@link Arc.trim} until straight or chord error ≤ `flatness`.
 */
function pushArcFlat(
	seg: SegmentA,
	flatness: number,
	out: vec2[],
	depth: number
): void {
	if (Arc.isStraight(seg)) {
		out.push(seg.point)
		return
	}
	if (depth > FLATTEN_MAX_DEPTH || arcMidChordDeviation(seg) <= flatness) {
		out.push(seg.point)
		return
	}
	const left = Arc.trim(seg, {time: 0}, {time: 0.5})
	const right = Arc.trim(seg, {time: 0.5}, {time: 1})
	pushArcFlat(left, flatness, out, depth + 1)
	pushArcFlat(right, flatness, out, depth + 1)
}

/**
 * One subpath → polyline (`L` only), walking {@link Curve.segments}; drops a closing duplicate of the first vertex when present.
 */
function flattenCurve(
	curve: Curve,
	flatness: number
): Curve & {vertices: VertexL[]} {
	const segs = Curve.segments(curve)
	if (segs.length === 0) {
		return {vertices: [], closed: curve.closed}
	}

	const verts: VertexL[] = [{point: curve.vertices[0].point, command: 'L'}]

	for (const seg of segs) {
		if (seg.command === 'L') {
			verts.push({point: seg.point, command: 'L'})
		} else if (seg.command === 'C') {
			const pts: vec2[] = []
			pushCubicFlat(seg, flatness, pts, 0)
			for (const p of pts) {
				verts.push({point: p, command: 'L'})
			}
		} else {
			const pts: vec2[] = []
			pushArcFlat(seg, flatness, pts, 0)
			for (const p of pts) {
				verts.push({point: p, command: 'L'})
			}
		}
	}

	if (
		curve.closed &&
		verts.length >= 2 &&
		vec2.approx(verts[verts.length - 1]!.point, verts[0]!.point)
	) {
		verts.pop()
	}

	return {vertices: verts, closed: curve.closed}
}

/** Map every curve through {@link flattenCurve} with shared `flatness`. */
export function planarFlattenPath(path: Path, flatness: number): Path {
	return {
		curves: path.curves.map(c => flattenCurve(c, flatness)),
	}
}
