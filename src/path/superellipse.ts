/**
 * Cubic Bézier approximation of a superellipse corner, `x^e + y^e = 1` with `e = 2^shape`, from
 * (1, 0) to (0, 1). The apex of the corner is at (1, 1) and the center at the origin, so that an
 * affine map puts the result on any corner.
 *
 * The curve is symmetric about `x = y`, where its point and tangent are known, so only the half
 * up to there is fitted, and the other half is its mirror image. On that half the slope stays
 * within 45° of the axis it runs along, so moving evenly along the axis samples the curve almost
 * evenly by length, for any exponent. Pieces have tangents fixed at both ends: their handle
 * lengths are solved by least squares, and then by a search on the largest distance if needed.
 */
import {vec2} from 'linearly'

type Hull = {start: vec2; args: readonly [vec2, vec2]; point: vec2}

const SAMPLE_COUNT = 32
const REPARAMETERIZE_ITERATIONS = 8
const NEAREST_ITERATIONS = 2
const MAX_DEPTH = 8
const PATTERN = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
]

/**
 * The cubics from (1, 0) to (0, 1) within `tolerance`, measured in this unit frame.
 */
export function superellipseCubics(shape: number, tolerance: number): Hull[] {
	const half = fitRange(curveOf(shape), 0, 1, tolerance, 0)

	const mirror = ([x, y]: vec2): vec2 => [y, x]
	const mirrored = half
		.slice()
		.reverse()
		.map(
			(hull): Hull => ({
				start: mirror(hull.point),
				args: [mirror(hull.args[1]), mirror(hull.args[0])],
				point: mirror(hull.start),
			})
		)

	return [...half, ...mirrored]
}

/**
 * The half from (1, 0) to the diagonal, for `s` in [0, 1]. A convex curve runs along y and a
 * concave one along x, whichever keeps the slope at most 1.
 */
function curveOf(shape: number) {
	const e = 2 ** shape
	const middle = 2 ** (-1 / e)

	const other = (v: number) => Math.max(1 - v ** e, 0) ** (1 / e)

	return shape > 0
		? {
				point: (s: number): vec2 => {
					const y = s * middle
					return [other(y), y]
				},
				tangent: (s: number): vec2 => {
					const y = s * middle
					return vec2.normalize([-((y / other(y)) ** (e - 1)), 1])
				},
			}
		: {
				point: (s: number): vec2 => {
					const x = 1 - s * (1 - middle)
					return [x, other(x)]
				},
				tangent: (s: number): vec2 => {
					const x = 1 - s * (1 - middle)
					return vec2.normalize([-1, (other(x) / x) ** (1 - e)])
				},
			}
}

type HalfCurve = ReturnType<typeof curveOf>

function fitRange(
	curve: HalfCurve,
	s0: number,
	s1: number,
	tolerance: number,
	depth: number
): Hull[] {
	const samples = Array.from({length: SAMPLE_COUNT + 1}, (_, i) =>
		curve.point(s0 + ((s1 - s0) * i) / SAMPLE_COUNT)
	)
	const {hull, error} = fitPiece(
		samples,
		curve.tangent(s0),
		curve.tangent(s1),
		tolerance
	)

	if (error <= tolerance || depth >= MAX_DEPTH) return [hull]

	const middle = (s0 + s1) / 2
	return [
		...fitRange(curve, s0, middle, tolerance, depth + 1),
		...fitRange(curve, middle, s1, tolerance, depth + 1),
	]
}

/** The position and the first two derivatives of a cubic at a parameter. */
function evaluate(hull: Hull, u: number): [vec2, vec2, vec2] {
	const [p0x, p0y] = hull.start
	const [[p1x, p1y], [p2x, p2y]] = hull.args
	const [p3x, p3y] = hull.point

	const v = 1 - u
	const b0 = v * v * v
	const b1 = 3 * v * v * u
	const b2 = 3 * v * u * u
	const b3 = u * u * u
	const d0 = 3 * v * v
	const d1 = 6 * v * u
	const d2 = 3 * u * u
	const e0 = 6 * v
	const e1 = 6 * u

	return [
		[
			b0 * p0x + b1 * p1x + b2 * p2x + b3 * p3x,
			b0 * p0y + b1 * p1y + b2 * p2y + b3 * p3y,
		],
		[
			d0 * (p1x - p0x) + d1 * (p2x - p1x) + d2 * (p3x - p2x),
			d0 * (p1y - p0y) + d1 * (p2y - p1y) + d2 * (p3y - p2y),
		],
		[
			e0 * (p2x - 2 * p1x + p0x) + e1 * (p3x - 2 * p2x + p1x),
			e0 * (p2y - 2 * p1y + p0y) + e1 * (p3y - 2 * p2y + p1y),
		],
	]
}

/** Moves each parameter to the nearest point of the cubic, and returns the largest distance. */
function refine(hull: Hull, samples: vec2[], us: number[]) {
	let error = 0
	for (let i = 1; i < samples.length - 1; i++) {
		const [qx, qy] = samples[i]
		let u = us[i]
		for (let k = 0; k < NEAREST_ITERATIONS; k++) {
			const [p, d1, d2] = evaluate(hull, u)
			const dx = p[0] - qx
			const dy = p[1] - qy
			const denominator =
				d1[0] * d1[0] + d1[1] * d1[1] + dx * d2[0] + dy * d2[1]
			if (Math.abs(denominator) < 1e-18) break
			u = Math.min(Math.max(u - (dx * d1[0] + dy * d1[1]) / denominator, 0), 1)
		}
		us[i] = u
		const [p] = evaluate(hull, u)
		error = Math.max(error, Math.hypot(p[0] - qx, p[1] - qy))
	}
	return error
}

function fitPiece(
	samples: vec2[],
	t0: vec2,
	t1: vec2,
	tolerance: number
): {hull: Hull; error: number} {
	const n = samples.length
	const p0 = samples[0]
	const p3 = samples[n - 1]

	let us: number[] = [0]
	for (let i = 1; i < n; i++) {
		us.push(us[i - 1] + vec2.distance(samples[i], samples[i - 1]))
	}
	const total = us[n - 1]
	us = us.map(u => u / total)

	const hullOf = (alpha: number, beta: number): Hull => ({
		start: p0,
		args: [vec2.scaleAndAdd(p0, t0, alpha), vec2.scaleAndAdd(p3, t1, -beta)],
		point: p3,
	})

	let alpha = total / 3
	let beta = total / 3
	let hull = hullOf(alpha, beta)
	let error = Infinity

	for (let iteration = 0; iteration < REPARAMETERIZE_ITERATIONS; iteration++) {
		let c11 = 0
		let c12 = 0
		let c22 = 0
		let x1 = 0
		let x2 = 0

		for (let i = 0; i < n; i++) {
			const u = us[i]
			const v = 1 - u
			const b1 = 3 * v * v * u
			const b2 = 3 * v * u * u
			const toP0 = v * v * v + b1
			const toP3 = b2 + u * u * u
			const rx = samples[i][0] - toP0 * p0[0] - toP3 * p3[0]
			const ry = samples[i][1] - toP0 * p0[1] - toP3 * p3[1]
			const a1x = t0[0] * b1
			const a1y = t0[1] * b1
			const a2x = -t1[0] * b2
			const a2y = -t1[1] * b2
			c11 += a1x * a1x + a1y * a1y
			c12 += a1x * a2x + a1y * a2y
			c22 += a2x * a2x + a2y * a2y
			x1 += a1x * rx + a1y * ry
			x2 += a2x * rx + a2y * ry
		}

		const det = c11 * c22 - c12 * c12
		if (Math.abs(det) > 1e-14 * Math.max(c11 * c22, 1e-300)) {
			const a = (x1 * c22 - x2 * c12) / det
			const b = (c11 * x2 - c12 * x1) / det
			if (a > 0 && b > 0) {
				alpha = a
				beta = b
				hull = hullOf(a, b)
			}
		}

		error = refine(hull, samples, us)
		if (error <= tolerance) return {hull, error}
	}

	// Alternating converges slowly, stopping several times off the best fit. When it matters,
	// search directly on the largest distance from the samples.
	let step = 0.25 * Math.max(alpha, beta)
	const finest = 5e-4 * total

	while (step > finest) {
		let improved = false
		for (const [da, db] of PATTERN) {
			const a = alpha + da * step
			const b = beta + db * step
			if (a <= 0 || b <= 0) continue
			const candidate = hullOf(a, b)
			const trial = us.slice()
			const e = refine(candidate, samples, trial)
			if (e < error) {
				alpha = a
				beta = b
				hull = candidate
				error = e
				us = trial
				improved = true
				if (error <= tolerance) return {hull, error}
			}
		}
		if (!improved) step /= 2
	}

	return {hull, error}
}
