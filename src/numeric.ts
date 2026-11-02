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
