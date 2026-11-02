/**
 * Raw parallel curves (segment offsets) and evolutes for {@link Segment}s.
 *
 * A parallel curve at signed distance `s` is `Q(t) = P(t) + s·n(t)` where `n` is
 * {@link Segment.normal}. Its speed is `(1 − s·κ(t))·‖P′(t)‖`, so wherever `s·κ > 1`
 * (the offset exceeds the radius of curvature) the parallel curve runs backwards
 * ("inverted"). Pieces are split at those fold points and at inflections so that each
 * piece has a constant sign; the sign is needed by `path/offset` to build swept regions.
 *
 * Lines and circular arcs are offset exactly. Cubic Béziers and elliptic arcs are fitted
 * with cubic chains ({@link fitCubicsToCurve}) within a tolerance.
 */
import {vec2} from 'linearly'

import {fitCubicsToCurve, type ParametricCurve} from './cubicBezierGeometry'
import {Arc, CubicBezier, Segment, type SegmentA} from './index'
import type {Attributes, Vertex, VertexC} from './path/types'

/** Scalar 2D cross product. */
export function cross2(a: vec2, b: vec2): number {
	return a[0] * b[1] - a[1] * b[0]
}

/**
 * Clamps a time to [0, 1]. Locations treat negative values as offsets from the end, so a
 * rounding error like `-1e-18` would otherwise wrap to the end of the segment.
 */
export function clampTime(t: number): number {
	return t <= 0 ? 0 : t >= 1 ? 1 : t
}

/** Point of the segment at a clamped time. */
export function pointAt(seg: Segment, t: number): vec2 {
	return Segment.point(seg, {time: clampTime(t)})
}

/** Unit normal (`rotate90` of the unit tangent) at time `t`; falls back to the chord. */
export function unitNormalAt(seg: Segment, t: number): vec2 {
	return vec2.rotate90(unitTangentAt(seg, t))
}

/** Unit tangent at time `t`; falls back to the chord direction for zero speed. */
export function unitTangentAt(seg: Segment, t: number): vec2 {
	const time = clampTime(t)
	let d = Segment.derivative(seg, {time})
	if (vec2.squaredLength(d) < 1e-8) {
		// Near a cusp the direction just inside the segment gives the limit of the tangent
		const inside = time < 0.5 ? time + 1e-4 : time - 1e-4
		d = Segment.derivative(seg, {time: inside})
	}
	if (vec2.squaredLength(d) < 1e-24) {
		d = vec2.sub(seg.point, seg.start)
	}
	return vec2.normalize(d)
}

function curvatureAt(seg: Segment, t: number): number {
	return Segment.curvature(seg, {time: clampTime(t)})
}

/**
 * A maximal parameter range of a segment on which the parallel curve at distance `s`
 * does not fold: `sign` is the sign of `1 − s·κ` on the piece.
 */
export interface ParallelPiece {
	t0: number
	t1: number
	sign: 1 | -1
}

const FOLD_SAMPLES = 48
const ROOT_ITERATIONS = 48

/** Bisects `f` for a sign change on [a, b]. */
function bisectRoot(f: (t: number) => number, a: number, b: number): number {
	let fa = f(a)
	for (let i = 0; i < ROOT_ITERATIONS; i++) {
		const m = (a + b) / 2
		const fm = f(m)
		if (fm === 0) return m
		if (fa < 0 === fm < 0) {
			a = m
			fa = fm
		} else {
			b = m
		}
	}
	return (a + b) / 2
}

/** Interior roots of `f` on [t0, t1] found by sampling sign changes. */
function sampledRoots(
	f: (t: number) => number,
	t0: number,
	t1: number,
	samples = FOLD_SAMPLES
): number[] {
	const roots: number[] = []
	let prevT = t0
	let prevV = f(t0)
	for (let i = 1; i <= samples; i++) {
		const t = t0 + ((t1 - t0) * i) / samples
		const v = f(t)
		if (prevV === 0) {
			if (prevT > t0) roots.push(prevT)
		} else if (v !== 0 && prevV < 0 !== v < 0) {
			roots.push(bisectRoot(f, prevT, t))
		}
		prevT = t
		prevV = v
	}
	return roots
}

function dedupeSorted(ts: number[], eps = 1e-9): number[] {
	ts.sort((a, b) => a - b)
	const out: number[] = []
	for (const t of ts) {
		if (out.length === 0 || t - out[out.length - 1] > eps) {
			out.push(t)
		}
	}
	return out
}

/**
 * Splits the segment's parameter range at inflections and at the fold points of the
 * parallel curve at distance `s`.
 */
export function splitForParallel(seg: Segment, s: number): ParallelPiece[] {
	if (seg.command === 'L' || s === 0) {
		return [{t0: 0, t1: 1, sign: 1}]
	}

	const h = (t: number) => 1 - s * curvatureAt(seg, t)

	if (seg.command === 'A' && Arc.isCircular(seg)) {
		return [{t0: 0, t1: 1, sign: h(0.5) < 0 ? -1 : 1}]
	}

	const breaks: number[] = []
	if (seg.command === 'C') {
		breaks.push(...CubicBezier.inflectionTimes(seg))
	}
	breaks.push(...sampledRoots(h, 0, 1))

	const ts = dedupeSorted([0, ...breaks, 1]).filter(
		(t, i, a) => i === 0 || i === a.length - 1 || (t > 1e-9 && t < 1 - 1e-9)
	)

	const pieces: ParallelPiece[] = []
	for (let i = 0; i + 1 < ts.length; i++) {
		const t0 = ts[i]
		const t1 = ts[i + 1]
		if (t1 - t0 < 1e-12) continue
		pieces.push({t0, t1, sign: h((t0 + t1) / 2) < 0 ? -1 : 1})
	}
	return pieces
}

/**
 * Parametric view of the parallel curve at distance `s` on one piece.
 */
export function parallelParametric(
	seg: Segment,
	s: number,
	sign: 1 | -1
): ParametricCurve {
	return {
		point: t => vec2.scaleAndAdd(pointAt(seg, t), unitNormalAt(seg, t), s),
		direction: t => vec2.scale(unitTangentAt(seg, t), sign),
	}
}

/** Reverses the parameter direction of a parametric curve (`u = -t`). */
export function reverseParametric(curve: ParametricCurve): ParametricCurve {
	return {
		point: u => curve.point(0 - u),
		direction: u => vec2.negate(curve.direction(0 - u)),
	}
}

/**
 * Fits a parametric curve on [t0, t1] and returns `C` vertices (after the start point).
 */
export function fitVertices(
	curve: ParametricCurve,
	t0: number,
	t1: number,
	tolerance: number,
	attrsAt?: (t: number) => Attributes | undefined
): VertexC[] {
	return fitCubicsToCurve(curve, t0, t1, tolerance).map(h => {
		const attrs = attrsAt?.(h.endTime)
		return {
			command: 'C',
			args: h.args,
			point: h.point,
			...(attrs ? {attrs} : {}),
		}
	})
}

const HERMITE_SAMPLE_COUNT = 8
const HERMITE_MAX_DEPTH = 12

/**
 * Parallel curve of `seg` from parameter `from` to `to` (either direction), as `C` vertices
 * matching its position and derivative at both ends of each piece. Unlike a generic fit
 * this reproduces `seg` as `s` tends to 0: the error is proportional to `s`, so the number
 * of pieces does not grow however tight a tolerance proportional to `s` is. The parallel
 * curve must not fold on the range.
 */
export function hermiteParallelVertices(
	seg: Segment,
	s: number,
	from: number,
	to: number,
	tolerance: number,
	attrsAt?: (t: number) => Attributes | undefined,
	depth = 0
): VertexC[] {
	const curve = parallelParametric(seg, s, 1)
	const derivativeAt = (t: number) =>
		vec2.scale(Segment.derivative(seg, {time: t}), 1 - s * curvatureAt(seg, t))

	const third = (to - from) / 3
	const start = curve.point(from)
	const point = curve.point(to)
	const hull = {
		start,
		args: [
			vec2.scaleAndAdd(start, derivativeAt(from), third),
			vec2.scaleAndAdd(point, derivativeAt(to), -third),
		] as const,
		point,
	}

	let error = 0
	for (let i = 1; i <= HERMITE_SAMPLE_COUNT; i++) {
		const u = i / (HERMITE_SAMPLE_COUNT + 1)
		error = Math.max(
			error,
			vec2.distance(
				CubicBezier.point(hull, {time: u}),
				curve.point(from + (to - from) * u)
			)
		)
	}

	if (error <= tolerance || depth >= HERMITE_MAX_DEPTH) {
		const attrs = attrsAt?.(to)
		return [{command: 'C', args: hull.args, point, ...(attrs ? {attrs} : {})}]
	}

	const mid = (from + to) / 2
	return [
		...hermiteParallelVertices(
			seg,
			s,
			from,
			mid,
			tolerance,
			attrsAt,
			depth + 1
		),
		...hermiteParallelVertices(seg, s, mid, to, tolerance, attrsAt, depth + 1),
	]
}

/** A piece of a parallel curve, drawn from parameter `from` to `to`. */
export interface VariableParallelPiece {
	from: number
	to: number
	vertex: VertexC
}

/**
 * The curve at the signed distance `s(t)` from the segment along its normal, as cubics matching
 * its position and derivative at both ends of each piece. Distances varying along the way tilt
 * the curve away from the direction of the segment, by the change of the distance.
 */
export function variableParallelPieces(
	seg: Segment,
	s: (t: number) => number,
	from: number,
	to: number,
	tolerance: number,
	depth = 0
): VariableParallelPiece[] {
	const pointOf = (t: number) =>
		vec2.scaleAndAdd(pointAt(seg, t), unitNormalAt(seg, t), s(t))

	const derivativeAt = (t: number) => {
		const h = 1e-5
		const lo = Math.max(t - h, 0)
		const hi = Math.min(t + h, 1)
		const ds = (s(hi) - s(lo)) / (hi - lo)
		const d = Segment.derivative(seg, {time: clampTime(t)})
		return vec2.scaleAndAdd(
			vec2.scale(d, 1 - s(t) * curvatureAt(seg, t)),
			unitNormalAt(seg, t),
			ds
		)
	}

	const third = (to - from) / 3
	const start = pointOf(from)
	const point = pointOf(to)
	const hull = {
		start,
		args: [
			vec2.scaleAndAdd(start, derivativeAt(from), third),
			vec2.scaleAndAdd(point, derivativeAt(to), -third),
		] as const,
		point,
	}

	let error = 0
	for (let i = 1; i <= HERMITE_SAMPLE_COUNT; i++) {
		const u = i / (HERMITE_SAMPLE_COUNT + 1)
		error = Math.max(
			error,
			vec2.distance(
				CubicBezier.point(hull, {time: u}),
				pointOf(from + (to - from) * u)
			)
		)
	}

	if (error <= tolerance || depth >= HERMITE_MAX_DEPTH) {
		return [{from, to, vertex: {command: 'C', args: hull.args, point}}]
	}

	const mid = (from + to) / 2
	return [
		...variableParallelPieces(seg, s, from, mid, tolerance, depth + 1),
		...variableParallelPieces(seg, s, mid, to, tolerance, depth + 1),
	]
}

/**
 * Where the parallel curve at the distance `s(t)` may fold or change its turning direction.
 */
export function variableParallelBreaks(
	seg: Segment,
	s: (t: number) => number
): number[] {
	if (seg.command === 'L') return [0, 1]

	const breaks = sampledRoots(t => 1 - s(t) * curvatureAt(seg, t), 0, 1)
	if (seg.command === 'C') {
		breaks.push(...CubicBezier.inflectionTimes(seg))
	}
	return dedupeSorted([0, ...breaks, 1])
}

/**
 * Parameters in (t0, t1) where the curvature has a local extremum (cusps of the evolute).
 */
export function curvatureExtrema(
	seg: Segment,
	t0: number,
	t1: number
): number[] {
	const h = 1e-5 * (t1 - t0)
	const dk = (t: number) => curvatureAt(seg, t + h) - curvatureAt(seg, t - h)
	return sampledRoots(dk, t0 + 2 * h, t1 - 2 * h, 32)
}

/**
 * Parametric view of the evolute `E(t) = P(t) + n(t)/κ(t)` on a piece without inflections
 * and without curvature extrema. The evolute's tangent is along the normal; `sign` is the
 * sign of `dρ/dt` on the piece (see {@link evoluteDirectionSign}).
 */
export function evoluteParametric(seg: Segment, sign: 1 | -1): ParametricCurve {
	return {
		point: t => {
			// The curvature is reported as 0 where the speed vanishes: the evolute of a cusp
			// passes through the cusp itself
			const curvature = curvatureAt(seg, t)
			const radius = curvature !== 0 ? 1 / curvature : 0
			return vec2.scaleAndAdd(pointAt(seg, t), unitNormalAt(seg, t), radius)
		},
		direction: t => vec2.scale(unitNormalAt(seg, t), sign),
	}
}

/** Sign of `dρ/dt` (ρ = 1/κ) on [t0, t1], sampled away from the ends. */
export function evoluteDirectionSign(
	seg: Segment,
	t0: number,
	t1: number
): 1 | -1 {
	const a = t0 + (t1 - t0) * 0.25
	const b = t0 + (t1 - t0) * 0.75
	const rho = (t: number) => 1 / curvatureAt(seg, t)
	return rho(b) - rho(a) < 0 ? -1 : 1
}

/**
 * Circular arc as a vertex: from the current point `center + r·dir(fromDeg)` to
 * `center + r·dir(toDeg)`, sweeping `toDeg − fromDeg` (|Δ| must be < 360).
 */
export function arcVertex(
	center: vec2,
	radius: number,
	fromDeg: number,
	toDeg: number
): Vertex {
	const delta = toDeg - fromDeg
	const point = vec2.scaleAndAdd(center, vec2.direction(toDeg), radius)
	if (Math.abs(delta) < 1e-12 || radius < 1e-12) {
		return {command: 'L', point}
	}
	return {
		command: 'A',
		args: [[radius, radius], 0, Math.abs(delta) > 180, delta > 0],
		point,
	}
}

/**
 * Exact parallel of a circular arc: radius `r − σ·s` where σ is the sweep sign. A negative
 * resulting radius means the parallel is inverted (it lies across the center).
 */
export function circularParallelRadius(arc: SegmentA, s: number): number {
	const {radii, sweep} = Arc.toCenterParameterization(arc)
	return radii[0] - (sweep ? 1 : -1) * s
}

/**
 * Raw parallel curve of a segment at signed distance `s`, as vertices after the start
 * point `Q(0)`. Inverted pieces are included as-is, so the result may fold back.
 */
export function rawParallelVertices(
	seg: Segment,
	s: number,
	tolerance: number
): Vertex[] {
	if (seg.command === 'L') {
		return [
			{
				command: 'L',
				point: vec2.scaleAndAdd(seg.point, unitNormalAt(seg, 0), s),
			},
		]
	}

	if (seg.command === 'A' && Arc.isCircular(seg)) {
		const {
			center,
			angles: [a0, a1],
		} = Arc.toCenterParameterization(seg)
		const r = circularParallelRadius(seg, s)
		if (Math.abs(r) < 1e-12) {
			return [{command: 'L', point: center}]
		}
		if (r > 0) {
			return [arcVertex(center, r, a0, a1)]
		}
		return [arcVertex(center, -r, a0 + 180, a1 + 180)]
	}

	const out: Vertex[] = []
	for (const piece of splitForParallel(seg, s)) {
		out.push(
			...fitVertices(
				parallelParametric(seg, s, piece.sign),
				piece.t0,
				piece.t1,
				tolerance
			)
		)
	}
	return out
}

/** Start point of the parallel curve at distance `s`. */
export function parallelStart(seg: Segment, s: number): vec2 {
	return vec2.scaleAndAdd(seg.start, unitNormalAt(seg, 0), s)
}
