/**
 * Least-squares fitting of cubic Bézier chains to arbitrary parametric curves
 * (Schneider, "An Algorithm for Automatically Fitting Digitized Curves", Graphics Gems 1990).
 *
 * Used by `parallelCurve` to turn offset curves and evolutes, which have no closed cubic
 * form, into `C` vertices within a tolerance. Cubic evaluation itself comes from
 * {@link CubicBezier}.
 */
import {scalar, vec2} from 'linearly'

import {type BareSegmentC, CubicBezier} from './CubicBezier'

/**
 * A planar curve sampled by parameter, used as the target of {@link fitCubicsToCurve}.
 */
export interface ParametricCurve {
	/** Position at `t`. */
	point(t: number): vec2
	/** Unit direction of travel at `t` (the fitted tangent at the ends). */
	direction(t: number): vec2
}

const FIT_SAMPLE_COUNT = 12
const FIT_MAX_DEPTH = 14

type CubicFit = {hull: BareSegmentC; error: number; tSplit: number}

function cubicBasis(u: number): [number, number, number, number] {
	const mu = 1 - u
	return [mu * mu * mu, 3 * mu * mu * u, 3 * mu * u * u, u * u * u]
}

/**
 * Least-squares fit of a single cubic to `curve` on [t0, t1] with end tangents fixed to the
 * curve directions. Reports the max sample error after a Newton reparameterization.
 */
function fitOneCubic(curve: ParametricCurve, t0: number, t1: number): CubicFit {
	const n = FIT_SAMPLE_COUNT
	const ts: number[] = []
	const pts: vec2[] = []
	for (let i = 0; i < n; i++) {
		// Use the exact end parameters so rounding cannot push a sample outside [t0, t1]
		const t = i === 0 ? t0 : i === n - 1 ? t1 : t0 + ((t1 - t0) * i) / (n - 1)
		ts.push(t)
		pts.push(curve.point(t))
	}

	// Chord-length parameterization
	const us: number[] = [0]
	for (let i = 1; i < n; i++) {
		us.push(us[i - 1] + vec2.distance(pts[i], pts[i - 1]))
	}
	const total = us[n - 1]
	const p0 = pts[0]
	const p3 = pts[n - 1]

	if (total < 1e-14) {
		return {
			hull: {start: p0, args: [p0, p3], point: p3},
			error: 0,
			tSplit: (t0 + t1) / 2,
		}
	}
	for (let i = 0; i < n; i++) {
		us[i] /= total
	}

	const T0 = curve.direction(t0)
	const T1 = curve.direction(t1)

	let c11 = 0,
		c12 = 0,
		c22 = 0,
		x1 = 0,
		x2 = 0
	for (let i = 0; i < n; i++) {
		const [b0, b1, b2, b3] = cubicBasis(us[i])
		const a1 = vec2.scale(T0, b1)
		const a2 = vec2.scale(T1, -b2)
		c11 += vec2.dot(a1, a1)
		c12 += vec2.dot(a1, a2)
		c22 += vec2.dot(a2, a2)
		const tmp = vec2.sub(
			pts[i],
			vec2.add(vec2.scale(p0, b0 + b1), vec2.scale(p3, b2 + b3))
		)
		x1 += vec2.dot(a1, tmp)
		x2 += vec2.dot(a2, tmp)
	}

	const det = c11 * c22 - c12 * c12
	let alpha = NaN
	let beta = NaN
	if (Math.abs(det) > 1e-12 * Math.max(c11 * c22, c12 * c12, 1e-300)) {
		alpha = (x1 * c22 - x2 * c12) / det
		beta = (c11 * x2 - c12 * x1) / det
	}

	const chord = vec2.distance(p0, p3)
	const tiny = 1e-6 * Math.max(chord, total)
	if (
		!(alpha > tiny) ||
		!(beta > tiny) ||
		alpha > 2 * total ||
		beta > 2 * total
	) {
		// Wu/Barsky heuristic fallback
		alpha = beta = total / 3
	}

	const hull: BareSegmentC = {
		start: p0,
		args: [vec2.scaleAndAdd(p0, T0, alpha), vec2.scaleAndAdd(p3, T1, -beta)],
		point: p3,
	}

	let error = 0
	let tSplit = (t0 + t1) / 2
	for (let i = 1; i < n - 1; i++) {
		let u = us[i]
		for (let k = 0; k < 3; k++) {
			const q = vec2.sub(CubicBezier.point(hull, {time: u}), pts[i])
			const du = CubicBezier.derivative(hull, {time: u})
			const ddu = CubicBezier.secondDerivative(hull, {time: u})
			const den = vec2.dot(du, du) + vec2.dot(q, ddu)
			if (Math.abs(den) < 1e-18) break
			u = scalar.clamp(u - vec2.dot(q, du) / den, 0, 1)
		}
		const err = vec2.distance(CubicBezier.point(hull, {time: u}), pts[i])
		if (err > error) {
			error = err
			tSplit = ts[i]
		}
	}

	return {hull, error, tSplit}
}

/**
 * Approximates `curve` on [t0, t1] by a chain of cubic hulls whose sampled deviation is at
 * most `tolerance`, splitting recursively at the worst sample when a single cubic is not
 * accurate enough. Hulls are returned in parameter order; consecutive hulls share endpoints.
 */
export function fitCubicsToCurve(
	curve: ParametricCurve,
	t0: number,
	t1: number,
	tolerance: number,
	depth = 0
): BareSegmentC[] {
	const fit = fitOneCubic(curve, t0, t1)

	if (
		fit.error <= tolerance ||
		depth >= FIT_MAX_DEPTH ||
		Math.abs(t1 - t0) < 1e-10
	) {
		return [fit.hull]
	}

	// Keep splits away from the ends so pieces stay well conditioned
	let tm = fit.tSplit
	const lo = t0 + (t1 - t0) * 0.2
	const hi = t0 + (t1 - t0) * 0.8
	if (tm < lo || tm > hi) {
		tm = (t0 + t1) / 2
	}

	return [
		...fitCubicsToCurve(curve, t0, tm, tolerance, depth + 1),
		...fitCubicsToCurve(curve, tm, t1, tolerance, depth + 1),
	]
}
