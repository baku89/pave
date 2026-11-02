/**
 * Shared numerical routines: Gauss–Legendre quadrature and a stable quadratic solver.
 * Curve modules ({@link Arc}, {@link CubicBezier}) and the planar helpers build on these
 * so that every arc length, area integral, and root search uses one implementation.
 */

/* eslint-disable no-loss-of-precision -- high-precision abscissae/weights */
/** Abscissae for 24-point Gauss–Legendre quadrature on [-1, 1]. */
const GL_ABSCISSAE = [
	-0.0640568928626056260850430826247450385909,
	0.0640568928626056260850430826247450385909,
	-0.1911188674736163091586398207570696318404,
	0.1911188674736163091586398207570696318404,
	-0.3150426796961633743867932913198102407864,
	0.3150426796961633743867932913198102407864,
	-0.4337935076260451384870842319133497124524,
	0.4337935076260451384870842319133497124524,
	-0.5454214713888395356583756172183723700107,
	0.5454214713888395356583756172183723700107,
	-0.6480936519369755692524957869107476266696,
	0.6480936519369755692524957869107476266696,
	-0.7401241915785543642438281030999784255232,
	0.7401241915785543642438281030999784255232,
	-0.8200019859739029219539498726697452080761,
	0.8200019859739029219539498726697452080761,
	-0.8864155270044010342131543419821967550873,
	0.8864155270044010342131543419821967550873,
	-0.9382745520027327585236490017087214496548,
	0.9382745520027327585236490017087214496548,
	-0.9747285559713094981983919930081690617411,
	0.9747285559713094981983919930081690617411,
	-0.9951872199970213601799974097007368118745,
	0.9951872199970213601799974097007368118745,
] as const

/** Weights for {@link GL_ABSCISSAE}. */
const GL_WEIGHTS = [
	0.1279381953467521569740561652246953718517,
	0.1279381953467521569740561652246953718517,
	0.1258374563468282961213753825111836887264,
	0.1258374563468282961213753825111836887264,
	0.121670472927803391204463153476262425607,
	0.121670472927803391204463153476262425607,
	0.1155056680537256013533444839067835598622,
	0.1155056680537256013533444839067835598622,
	0.1074442701159656347825773424466062227946,
	0.1074442701159656347825773424466062227946,
	0.0976186521041138882698806644642471544279,
	0.0976186521041138882698806644642471544279,
	0.086190161531953275917185202983742667185,
	0.086190161531953275917185202983742667185,
	0.0733464814110803057340336152531165181193,
	0.0733464814110803057340336152531165181193,
	0.0592985849154367807463677585001085845412,
	0.0592985849154367807463677585001085845412,
	0.0442774388174198061686027482113382288593,
	0.0442774388174198061686027482113382288593,
	0.0285313886289336631813078159518782864491,
	0.0285313886289336631813078159518782864491,
	0.0123412297999871995468056670700372915759,
	0.0123412297999871995468056670700372915759,
] as const
/* eslint-enable no-loss-of-precision */

/**
 * ∫ₐᵇ f(t) dt by 24-point Gauss–Legendre quadrature. Exact for polynomials up to degree 47
 * and accurate to near machine precision for smooth integrands; split the range at any
 * kink or sharp feature before calling. The result is signed: it is negative when `b < a`.
 */
export function gaussLegendre(
	f: (t: number) => number,
	a: number,
	b: number
): number {
	const mid = (a + b) * 0.5
	const half = (b - a) * 0.5
	let sum = 0
	for (let i = 0; i < GL_ABSCISSAE.length; i++) {
		sum += GL_WEIGHTS[i] * f(mid + half * GL_ABSCISSAE[i])
	}
	return half * sum
}

/**
 * Real roots of `a·x² + b·x + c = 0`, in ascending order. Degenerates gracefully to the
 * linear case; returns [] when there is no isolated root.
 */
export function solveQuadratic(a: number, b: number, c: number): number[] {
	const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c))
	if (scale === 0) {
		return []
	}
	if (Math.abs(a) <= 1e-14 * scale) {
		if (Math.abs(b) <= 1e-14 * scale) {
			return []
		}
		return [-c / b]
	}
	const disc = b * b - 4 * a * c
	if (disc < 0) {
		return []
	}
	if (disc === 0) {
		return [-b / (2 * a)]
	}
	// Citardauq-style evaluation to avoid cancellation
	const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(disc))
	const r1 = q / a
	const r2 = q !== 0 ? c / q : -b / a
	return r1 < r2 ? [r1, r2] : [r2, r1]
}

/**
 * Roots of `a·x³ + b·x² + c·x + d = 0` inside the open range (`lo`, `hi`), ascending. The range
 * is cut at the critical points so that the cubic is monotone on each piece, and every sign
 * change is then refined by Newton–Raphson with a bisection fallback. Critical points where
 * the magnitude of the value is within `tolerance` are reported too, so double roots are not
 * lost to rounding.
 */
export function solveCubic(
	a: number,
	b: number,
	c: number,
	d: number,
	lo: number,
	hi: number,
	tolerance = 0
): number[] {
	const f = (x: number) => ((a * x + b) * x + c) * x + d
	const df = (x: number) => (3 * a * x + 2 * b) * x + c

	const breaks = [
		lo,
		...solveQuadratic(3 * a, 2 * b, c).filter(x => x > lo && x < hi),
		hi,
	]

	const roots: number[] = []
	for (let i = 0; i + 1 < breaks.length; i++) {
		const x0 = breaks[i]
		const x1 = breaks[i + 1]
		const f0 = f(x0)
		const f1 = f(x1)

		if (Math.abs(f0) <= tolerance) {
			if (i > 0) roots.push(x0)
		} else if (Math.abs(f1) > tolerance && f0 * f1 < 0) {
			roots.push(refineBracketedRoot(f, df, x0, x1, f0))
		}
	}
	return roots
}

/** Safeguarded Newton–Raphson for a root bracketed by [`lo`, `hi`], where `f(lo) = fLo`. */
function refineBracketedRoot(
	f: (x: number) => number,
	df: (x: number) => number,
	lo: number,
	hi: number,
	fLo: number
): number {
	let x = (lo + hi) * 0.5
	for (let i = 0; i < 64 && hi - lo > 1e-15 * Math.max(1, Math.abs(x)); i++) {
		const fx = f(x)
		if (fx === 0) return x

		if (fx * fLo > 0) {
			lo = x
		} else {
			hi = x
		}

		const next = x - fx / df(x)
		x = next > lo && next < hi ? next : (lo + hi) * 0.5
	}
	return x
}

/**
 * Largest index `i` in `[0, prefix.length - 2]` with `prefix[i] <= value`, by binary search.
 * `prefix` must be non-decreasing; it is the usual shape of a cumulative-length table, where
 * `prefix[i]` is the length before interval `i` and the last entry is the total.
 */
export function searchInterval(
	prefix: ArrayLike<number>,
	value: number
): number {
	let lo = 0
	let hi = prefix.length - 2
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1
		if (prefix[mid] <= value) {
			lo = mid
		} else {
			hi = mid - 1
		}
	}
	return Math.max(lo, 0)
}

/**
 * Per-object precomputation for inverting an arc-length function s(x) on `[0, span]`:
 * cumulative lengths and speeds at `n + 1` uniform nodes, plus the integrand callbacks.
 * Build it once per curve (memoized on the curve) and answer queries with {@link invertArcLength}.
 */
export interface ArcLengthTable {
	/** Cumulative arc length at node `i` (node `i` sits at `x = i / n * span`). */
	readonly s: Float64Array
	/** Speed ds/dx at node `i`. */
	readonly v: Float64Array
	readonly span: number
	/** Total arc length, the last entry of `s`. */
	readonly total: number
	readonly speed: (x: number) => number
	/** Signed arc length between two parameters. */
	readonly lengthBetween: (x0: number, x1: number) => number
}

const ARC_LENGTH_TABLE_INTERVALS = 8

export function buildArcLengthTable(
	speed: (x: number) => number,
	lengthBetween: (x0: number, x1: number) => number,
	span: number,
	n = ARC_LENGTH_TABLE_INTERVALS
): ArcLengthTable {
	const s = new Float64Array(n + 1)
	const v = new Float64Array(n + 1)
	v[0] = speed(0)
	for (let i = 1; i <= n; i++) {
		const x0 = ((i - 1) / n) * span
		const x1 = (i / n) * span
		s[i] = s[i - 1] + lengthBetween(x0, x1)
		v[i] = speed(x1)
	}
	return {s, v, span, total: s[n], speed, lengthBetween}
}

/**
 * Parameter `x ∈ [0, span]` whose arc length from the start equals `target` (clamped to the
 * table's total). The table gives the bracketing interval and a cubic Hermite estimate from the
 * node lengths and speeds; Newton–Raphson with exact increments then refines it to
 * `total * 1e-12`, integrating only from the interval's start node. Bisection bounds guard
 * against a step leaving the bracket (e.g. near a cusp where the speed vanishes).
 */
export function invertArcLength(table: ArcLengthTable, target: number): number {
	const {s, v, span, speed, lengthBetween} = table
	const n = s.length - 1
	const total = s[n]

	if (total <= 1e-15 || target <= 0) return 0
	if (target >= total) return span

	const k = searchInterval(s, target)
	const h = span / n
	const x0 = k * h
	const x1 = x0 + h
	const s0 = s[k]
	const s1 = s[k + 1]
	const m0 = v[k] * h
	const m1 = v[k + 1] * h

	// Cubic Hermite estimate of s on [x0, x1], solved for u ∈ [0, 1]
	let u = s1 > s0 ? (target - s0) / (s1 - s0) : 0.5
	for (let i = 0; i < 3; i++) {
		const u2 = u * u
		const u3 = u2 * u
		const f =
			(2 * u3 - 3 * u2 + 1) * s0 +
			(u3 - 2 * u2 + u) * m0 +
			(-2 * u3 + 3 * u2) * s1 +
			(u3 - u2) * m1 -
			target
		const df =
			(6 * u2 - 6 * u) * s0 +
			(3 * u2 - 4 * u + 1) * m0 +
			(-6 * u2 + 6 * u) * s1 +
			(3 * u2 - 2 * u) * m1
		if (!(df > 0)) break
		u = Math.min(Math.max(u - f / df, 0), 1)
	}

	const tolerance = total * 1e-12
	let lower = x0
	let upper = x1
	let x = x0 + u * h
	let acc = s0 + lengthBetween(x0, x)

	for (let i = 0; i < 32 && upper - lower > 1e-15 * span; i++) {
		const err = acc - target
		if (Math.abs(err) <= tolerance) break

		if (err < 0) {
			lower = x
		} else {
			upper = x
		}

		const sp = speed(x)
		let next = sp > 0 ? x - err / sp : NaN
		if (!(next > lower && next < upper)) {
			next = (lower + upper) * 0.5
		} else if (
			Math.abs(err) <= total * 1e-7 &&
			Math.abs(next - x) <= 1e-3 * h &&
			sp >= 0.25 * (total / span)
		) {
			// Newton converges quadratically where the speed is not degenerate, so from a residual
			// this small the step lands within tolerance; skip the verifying integration. Near a
			// cusp (speed far below the mean) the curvature of s(x) is too large to trust that.
			return next
		}

		acc += lengthBetween(x, next)
		x = next
	}

	return x
}
