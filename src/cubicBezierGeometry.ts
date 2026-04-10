/**
 * Pure numeric geometry for planar cubic Bézier curves in {@link BareSegmentC} form
 * (`start`, two control points, `point`).
 *
 * **Why this module exists:** {@link CubicBezier} in `CubicBezier.ts` is the public API;
 * Paper.js is only used for path boolean/offset in {@link Path}. All closed-form and
 * numerical curve math that does not need Paper lives here so the API stays testable
 * without pulling in extra dependencies.
 *
 * **Consumers:** `CubicBezier.length`, `bounds`, `point`/`derivative`, `trim`, `divideAtTimes`,
 * `project`, and `offset` delegate to these functions.
 *
 * Offset and projection strategies follow the same ideas as bezier-js (MIT,
 * https://github.com/Pomax/bezierjs); we only keep what the library actually uses.
 */
import {scalar, vec2} from 'linearly'

import type {BareSegmentC} from './CubicBezier'
import {memoize} from './utils'

/** Abscissae and weights for 24-point Gauss–Legendre quadrature on [0, 1] (mapped from [-1, 1]). */
/* eslint-disable no-loss-of-precision -- high-precision abscissae/weights */
const LG_T = [
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

const LG_C = [
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

const {sqrt, abs: absN, acos, min: minN, max: maxN} = Math

/**
 * Evaluates the cubic Bézier at parameter `t` in [0, 1] using the Bernstein basis.
 * Needed for almost every operation (bounds, length integrand, projection samples, offset).
 */
export function cubicPointAt(hull: BareSegmentC, t: number): vec2 {
	const {
		start,
		args: [c1, c2],
		point,
	} = hull
	const mt = 1 - t
	const mt2 = mt * mt
	const t2 = t * t
	const a = mt2 * mt
	const b = mt2 * t * 3
	const c = mt * t2 * 3
	const d = t * t2
	return [
		a * start[0] + b * c1[0] + c * c2[0] + d * point[0],
		a * start[1] + b * c1[1] + c * c2[1] + d * point[1],
	]
}

/**
 * Returns `t ↦ dB/dt` for the given hull. The derivative is a quadratic in `t`; coefficients
 * are folded once per hull and reused (memoized) for arc length, normals, and offset.
 */
export const getCubicDerivativeFn = memoize((hull: BareSegmentC) => {
	const {
		start: [x0, y0],
		args: [[x1, y1], [x2, y2]],
		point: [x3, y3],
	} = hull

	const ax = 9 * (x1 - x2) + 3 * (x3 - x0),
		bx = 6 * (x0 + x2) - 12 * x1,
		cx = 3 * (x1 - x0),
		ay = 9 * (y1 - y2) + 3 * (y3 - y0),
		by = 6 * (y0 + y2) - 12 * y1,
		cy = 3 * (y1 - y0)

	return (time: number): vec2 => {
		const dx = (ax * time + bx) * time + cx
		const dy = (ay * time + by) * time + cy
		return [dx, dy]
	}
})

/**
 * De Casteljau split at `time`: left/right control nets share the on-curve point at `time`.
 * Not exported; only {@link trimCubicBetweenTimes} needs a subcurve in cubic form.
 */
function splitCubicBezierAtTime(
	hull: BareSegmentC,
	time: number
): [vec2, vec2, vec2, vec2, vec2] {
	const [c1, c2] = hull.args
	const newC1 = vec2.lerp(hull.start, c1, time)
	const p12 = vec2.lerp(c1, c2, time)
	const newC2 = vec2.lerp(c2, hull.point, time)
	const inC = vec2.lerp(newC1, p12, time)
	const outC = vec2.lerp(p12, newC2, time)
	const mid = vec2.lerp(inC, outC, time)
	return [newC1, inC, mid, outC, newC2]
}

/**
 * Subcurve from `from` to `to` (both in [0, 1]) as a new cubic hull `[start, c1, c2, end]`.
 * Used by `CubicBezier.trim` / `divideAtTimes` and by the offset reducer to split at extrema.
 */
export function trimCubicBetweenTimes(
	hull: BareSegmentC,
	from: number,
	to: number
): [vec2, vec2, vec2, vec2] {
	let newStart: vec2, midC1: vec2, midC2: vec2

	if (from === 0) {
		newStart = hull.start
		;[midC1, midC2] = hull.args
	} else {
		;[, , newStart, midC1, midC2] = splitCubicBezierAtTime(hull, from)
	}

	let newC1: vec2, newC2: vec2, newEnd: vec2

	if (to === 1) {
		newEnd = hull.point
		;[newC1, newC2] = [midC1, midC2]
	} else {
		;[newC1, newC2, newEnd] = splitCubicBezierAtTime(
			{start: newStart, args: [midC1, midC2], point: hull.point},
			scalar.invlerp(from, 1, to)
		)
	}

	return [newStart, newC1, newC2, newEnd]
}

/**
 * Real roots of a quadratic or linear Bernstein polynomial on (0, 1), expressed in t-space.
 * Used to find where each coordinate of `B(t)` has zero first or second derivative → extrema
 * for axis-aligned bounding boxes.
 */
function droots(p: number[]): number[] {
	if (p.length === 3) {
		const a = p[0],
			b = p[1],
			c = p[2],
			d = a - 2 * b + c
		if (d !== 0) {
			const m1 = -sqrt(b * b - a * c),
				m2 = -a + b,
				v1 = -(m1 + m2) / d,
				v2 = -(-m1 + m2) / d
			return [v1, v2]
		}
		if (b !== c && d === 0) {
			return [(2 * b - c) / (2 * (b - c))]
		}
		return []
	}
	if (p.length === 2) {
		const a = p[0],
			b = p[1]
		if (a !== b) {
			return [a / (a - b)]
		}
		return []
	}
	return []
}

/** Control values of d/dt B_x or d/dt B_y as a quadratic Bernstein poly (three coeffs). */
function firstDerivScalarControls(hull: BareSegmentC, dim: 0 | 1): number[] {
	const {
		start: p0,
		args: [p1, p2],
		point: p3,
	} = hull
	return [
		3 * (p1[dim] - p0[dim]),
		3 * (p2[dim] - p1[dim]),
		3 * (p3[dim] - p2[dim]),
	]
}

/** Second derivative along one axis as a linear Bernstein poly (two coeffs). */
function secondDerivScalarControls(hull: BareSegmentC, dim: 0 | 1): number[] {
	const d = firstDerivScalarControls(hull, dim)
	return [2 * (d[1] - d[0]), 2 * (d[2] - d[1])]
}

/** Critical t values in [0, 1] where B_x or B_y may attain min/max (interior extrema). */
function extremaTListForDim(hull: BareSegmentC, dim: 0 | 1): number[] {
	let roots = droots(firstDerivScalarControls(hull, dim))
	roots = roots.concat(droots(secondDerivScalarControls(hull, dim)))
	return roots.filter(t => t >= 0 && t <= 1).sort((a, b) => a - b)
}

/** Min/max of one coordinate over the hull, sampling endpoints and interior critical times. */
function minMaxAlongDim(
	hull: BareSegmentC,
	dim: 0 | 1,
	roots: number[]
): [number, number] {
	const ts = [0, ...roots, 1].filter((v, i, a) => a.indexOf(v) === i)
	let minV = Number.POSITIVE_INFINITY,
		maxV = Number.NEGATIVE_INFINITY
	for (const t of ts) {
		const v = cubicPointAt(hull, t)[dim]
		minV = minN(minV, v)
		maxV = maxN(maxV, v)
	}
	return [minV, maxV]
}

/**
 * ∫₀¹ f(t) dt via the same 24-point Gauss–Legendre rule as arc length / Green integrals.
 */
export function integrateOnUnitInterval(fn: (t: number) => number): number {
	const z = 0.5
	let sum = 0
	for (let i = 0; i < LG_T.length; i++) {
		const t = z * LG_T[i] + z
		sum += LG_C[i] * fn(t)
	}
	return z * sum
}

/**
 * Euclidean arc length ∫₀¹ ‖B′(t)‖ dt via Gauss–Legendre quadrature on [0, 1].
 * Needed for `CubicBezier.length` without depending on Paper’s numerical length.
 */
export function cubicArcLength(hull: BareSegmentC): number {
	const dfn = getCubicDerivativeFn(hull)
	return integrateOnUnitInterval(t => {
		const d = dfn(t)
		return Math.hypot(d[0], d[1])
	})
}

/**
 * Green’s theorem edge term for a cubic: ∫₀¹ (x(t)y′(t) − y(t)x′(t)) dt (polynomial × quadrature).
 * Summed with line/arc terms and halved → signed area of a closed path (see `planarPathArea`).
 */
export function cubicGreenPlaneIntegral(hull: BareSegmentC): number {
	const dfn = getCubicDerivativeFn(hull)
	return integrateOnUnitInterval(t => {
		const p = cubicPointAt(hull, t)
		const v = dfn(t)
		return p[0] * v[1] - p[1] * v[0]
	})
}

function bareHullFromTrim(
	hull: BareSegmentC,
	from: number,
	to: number
): BareSegmentC {
	const [s, c1, c2, e] = trimCubicBetweenTimes(hull, from, to)
	return {start: s, args: [c1, c2], point: e}
}

/** Arc length along the hull from parameter `t0` to `t1` (0 ≤ t0 ≤ t1 ≤ 1). */
export function cubicArcLengthBetween(
	hull: BareSegmentC,
	t0: number,
	t1: number
): number {
	if (t1 <= t0) {
		return 0
	}
	return cubicArcLength(bareHullFromTrim(hull, t0, t1))
}

const ARC_TIME_AT_LEN_REL_TOL = 1e-11
const ARC_TIME_AT_LEN_MAX_IT = 64

/**
 * Parameter t ∈ [0, 1] whose arc-length from the curve start equals `s` (clamped to total length).
 * Monotone bisection on cumulative arc length; pairs with {@link cubicArcLength}.
 */
export function cubicTimeAtArcLength(hull: BareSegmentC, s: number): number {
	const total = cubicArcLength(hull)
	if (total <= 1e-15) {
		return 0
	}
	const target = scalar.clamp(s, 0, total)
	let lo = 0
	let hi = 1
	for (let i = 0; i < ARC_TIME_AT_LEN_MAX_IT; i++) {
		const mid = (lo + hi) * 0.5
		const acc = cubicArcLengthBetween(hull, 0, mid)
		const err = Math.abs(acc - target)
		if (err <= ARC_TIME_AT_LEN_REL_TOL * total || hi - lo < 1e-15) {
			return mid
		}
		if (acc < target) {
			lo = mid
		} else {
			hi = mid
		}
	}
	return (lo + hi) * 0.5
}

/**
 * Tight axis-aligned bounding box: endpoints plus interior extrema per axis (not just control hull).
 * Feeds `CubicBezier.bounds` / `Segment` bounding queries.
 */
export function cubicAxisAlignedBounds(hull: BareSegmentC): [vec2, vec2] {
	const rx = extremaTListForDim(hull, 0)
	const ry = extremaTListForDim(hull, 1)
	const [minX, maxX] = minMaxAlongDim(hull, 0, rx)
	const [minY, maxY] = minMaxAlongDim(hull, 1, ry)
	return [
		[minX, minY],
		[maxX, maxY],
	]
}

/**
 * Closest on-curve point to `origin` using a coarse LUT plus local refinement.
 * Good enough for hit-testing style use; `CubicBezier.project` wraps this (optional t/distance).
 * Not an exact algebraic perpendicular foot for cubics.
 */
export function cubicProject(
	hull: BareSegmentC,
	origin: vec2
): {position: vec2; t: number; distance: number} {
	const steps = 100
	const lut: vec2[] = []
	for (let i = 0; i <= steps; i++) {
		lut.push(cubicPointAt(hull, i / steps))
	}
	let mdist = Number.POSITIVE_INFINITY
	let mpos = 0
	for (let i = 0; i < lut.length; i++) {
		const d = vec2.distance(origin, lut[i])
		if (d < mdist) {
			mdist = d
			mpos = i
		}
	}
	const l = steps
	const t1 = (mpos - 1) / l
	const t2 = (mpos + 1) / l
	const fineStep = 0.1 / l
	let ft = t1
	mdist += 1
	for (let t = t1; t < t2 + fineStep; t += fineStep) {
		const p = cubicPointAt(hull, t)
		const d = vec2.distance(origin, p)
		if (d < mdist) {
			mdist = d
			ft = t
		}
	}
	ft = ft < 0 ? 0 : ft > 1 ? 1 : ft
	const position = cubicPointAt(hull, ft)
	return {
		position,
		t: ft,
		distance: vec2.distance(origin, position),
	}
}

/** Rigid transform placing `p1` at origin and `p2` on +x; used to test “nearly straight” curves. */
function alignToChord(points: readonly vec2[], p1: vec2, p2: vec2): vec2[] {
	const [tx, ty] = p1
	const a = -Math.atan2(p2[1] - ty, p2[0] - tx)
	const co = Math.cos(a)
	const si = Math.sin(a)
	return points.map(
		([x, y]): vec2 => [
			(x - tx) * co - (y - ty) * si,
			(x - tx) * si + (y - ty) * co,
		]
	)
}

/**
 * Heuristic: curve is treated as linear for offset if control deviations from the chord are tiny.
 * Avoids the general offset construction for degenerate/near-line cubics.
 */
function isBezierJsLinear(hull: BareSegmentC): boolean {
	const {
		start: p0,
		args: [p1, p2],
		point: p3,
	} = hull
	const aligned = alignToChord([p0, p1, p2, p3], p0, p3)
	const base = vec2.distance(p0, p3)
	const sum = aligned.reduce((acc, p) => acc + absN(p[1]), 0)
	return sum < base / 50
}

/** Left unit normal from the (unnormalized) tangent; fallback when speed is zero. */
function cubicNormalUnit(t: number, derivFn: (u: number) => vec2): vec2 {
	const d = derivFn(t)
	const q = Math.hypot(d[0], d[1])
	if (q === 0) {
		return [0, 1]
	}
	return [-d[1] / q, d[0] / q]
}

/** Signed angle ∠(v1−o, v2−o) in (-π, π]; used to detect control points crossing the chord. */
function planarAngle(o: vec2, v1: vec2, v2: vec2): number {
	const dx1 = v1[0] - o[0],
		dy1 = v1[1] - o[1],
		dx2 = v2[0] - o[0],
		dy2 = v2[1] - o[1]
	const cross = dx1 * dy2 - dy1 * dx2
	const dot = dx1 * dx2 + dy1 * dy2
	return Math.atan2(cross, dot)
}

/**
 * “Simple” segment for offset: handles stay on one side of the chord and endpoint normals do not
 * swing too far apart. Non-simple pieces must be subdivided before the bezier-js-style offset.
 */
function cubicSimple(
	hull: BareSegmentC,
	derivFn: (t: number) => vec2
): boolean {
	const {
		start: p0,
		args: [p1, p2],
		point: p3,
	} = hull
	const a1 = planarAngle(p0, p3, p1)
	const a2 = planarAngle(p0, p3, p2)
	if ((a1 > 0 && a2 < 0) || (a1 < 0 && a2 > 0)) {
		return false
	}
	const n1 = cubicNormalUnit(0, derivFn)
	const n2 = cubicNormalUnit(1, derivFn)
	const s = n1[0] * n2[0] + n1[1] * n2[1]
	return absN(acos(minN(1, maxN(-1, s)))) < Math.PI / 3
}

/** Line–line intersection (2D); false if parallel. Used when constructing offset control geometry. */
function lli8(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	x3: number,
	y3: number,
	x4: number,
	y4: number
): vec2 | false {
	const nx = (x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4),
		ny = (x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4),
		d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
	if (d === 0) {
		return false
	}
	return [nx / d, ny / d]
}

/** `lli8` wrapper for two segments given as point pairs. */
function lli4(p1: vec2, p2: vec2, p3: vec2, p4: vec2): vec2 | false {
	return lli8(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1])
}

/** Point on curve, unit normal, and a point offset along that normal (construction aid). */
type OffsetRay = {curve: vec2; offset: vec2; n: vec2}

/** Samples position and outward normal at `t`, plus a far point along the normal ray. */
function offsetRayAt(
	hull: BareSegmentC,
	t: number,
	dist: number,
	derivFn: (u: number) => vec2
): OffsetRay {
	const c = cubicPointAt(hull, t)
	const n = cubicNormalUnit(t, derivFn)
	return {
		curve: c,
		n,
		offset: [c[0] + n[0] * dist, c[1] + n[1] * dist],
	}
}

/**
 * Parallel offset of a nearly straight cubic: same normal at all four hull points.
 * Produces one replacement cubic hull at distance `dist`.
 */
function linearOffsetHull(hull: BareSegmentC, dist: number): BareSegmentC {
	const derivFn = getCubicDerivativeFn(hull)
	const n = cubicNormalUnit(0, derivFn)
	const pts: vec2[] = [hull.start, hull.args[0], hull.args[1], hull.point]
	return {
		start: vec2.scaleAndAdd(pts[0], n, dist),
		args: [
			vec2.scaleAndAdd(pts[1], n, dist),
			vec2.scaleAndAdd(pts[2], n, dist),
		],
		point: vec2.scaleAndAdd(pts[3], n, dist),
	}
}

/**
 * Non-linear offset for one “simple” cubic: intersect offset rays at the ends and solve for inner
 * controls via line intersections (bezier-js `raise` / scaling style). Throws if geometry is singular.
 */
function scaleOffsetNonLinear(
	hull: BareSegmentC,
	d: number,
	derivFn: (t: number) => vec2
): BareSegmentC {
	const r1 = d,
		r2 = d
	const v0 = offsetRayAt(hull, 0, 10, derivFn)
	const v1 = offsetRayAt(hull, 1, 10, derivFn)
	const o = lli4(v0.offset, v0.curve, v1.offset, v1.curve)
	if (!o) {
		throw new Error('cannot scale this curve. Try reducing it first.')
	}

	const pts: vec2[] = [hull.start, hull.args[0], hull.args[1], hull.point]
	const np: vec2[] = []
	const order = 3

	np[0] = vec2.scaleAndAdd(pts[0], v0.n, r1)
	np[order] = vec2.scaleAndAdd(pts[order], v1.n, r2)

	for (const endT of [0, 1] as const) {
		const p = np[endT * order]
		const dpt = derivFn(endT)
		const p2 = vec2.scaleAndAdd(p, dpt, 1)
		const hit = lli4(p, p2, o, pts[endT + 1])
		if (!hit) {
			throw new Error('cannot scale this curve. Try reducing it first.')
		}
		np[endT + 1] = hit
	}

	return {start: np[0], args: [np[1], np[2]], point: np[3]}
}

/** Single simple segment: linear shortcut or general offset once. */
function offsetOneSimple(hull: BareSegmentC, d: number): BareSegmentC {
	const derivFn = getCubicDerivativeFn(hull)
	if (isBezierJsLinear(hull)) {
		return linearOffsetHull(hull, d)
	}
	return scaleOffsetNonLinear(hull, d, derivFn)
}

/** Sorted union of x- and y-extrema times; splitting here prevents cusps/loops inside one offset step. */
function mergeExtremaTs(hull: BareSegmentC): number[] {
	const rx = extremaTListForDim(hull, 0)
	const ry = extremaTListForDim(hull, 1)
	const roots = [...rx, ...ry].sort((a, b) => a - b)
	const out: number[] = []
	for (const v of roots) {
		if (out.length === 0 || out[out.length - 1] !== v) {
			out.push(v)
		}
	}
	return out
}

/** First reduction: split the curve at every axis extremum so each piece is monotone in x and y. */
function reducePass1(hull: BareSegmentC): BareSegmentC[] {
	let extrema = mergeExtremaTs(hull)
	if (extrema[0] !== 0) {
		extrema = [0, ...extrema]
	}
	if (extrema[extrema.length - 1] !== 1) {
		extrema = [...extrema, 1]
	}
	const pass1: BareSegmentC[] = []
	for (let i = 0; i + 1 < extrema.length; i++) {
		const t1 = extrema[i]
		const t2 = extrema[i + 1]
		const [s, c1, c2, e] = trimCubicBetweenTimes(hull, t1, t2)
		pass1.push({start: s, args: [c1, c2], point: e})
	}
	return pass1
}

/**
 * Second reduction: walk in small t-steps until `cubicSimple` fails, then commit the longest
 * simple prefix. Returns [] if a step cannot be resolved (caller treats as offset failure).
 */
function reducePass2Segment(p1: BareSegmentC): BareSegmentC[] {
	const step = 0.01
	const pass2: BareSegmentC[] = []
	let t1 = 0
	let t2 = 0
	while (t2 <= 1) {
		for (t2 = t1 + step; t2 <= 1 + step; t2 += step) {
			const [s, c1, c2, e] = trimCubicBetweenTimes(p1, t1, t2)
			const seg: BareSegmentC = {start: s, args: [c1, c2], point: e}
			if (!cubicSimple(seg, getCubicDerivativeFn(seg))) {
				t2 -= step
				if (absN(t1 - t2) < step) {
					return []
				}
				const trimmed = trimCubicBetweenTimes(p1, t1, t2)
				pass2.push({
					start: trimmed[0],
					args: [trimmed[1], trimmed[2]],
					point: trimmed[3],
				})
				t1 = t2
				break
			}
		}
	}
	if (t1 < 1) {
		const [s, c1, c2, e] = trimCubicBetweenTimes(p1, t1, 1)
		pass2.push({start: s, args: [c1, c2], point: e})
	}
	return pass2
}

/** Full pipeline: extrema split, then subdivide until every subsegment is “simple” for offsetting. */
function reduceToSimple(hull: BareSegmentC): BareSegmentC[] {
	const pass1 = reducePass1(hull)
	const pass2: BareSegmentC[] = []
	for (const seg of pass1) {
		const part = reducePass2Segment(seg)
		if (part.length === 0) {
			return []
		}
		pass2.push(...part)
	}
	return pass2
}

/**
 * Offset curve as a list of cubic hulls at signed `distance` along the left normal.
 * Complex curves are reduced first; each piece is offset separately, then `CubicBezier.offset`
 * stitches them into a `Path`. Empty array means the reducer could not produce safe segments.
 */
export function cubicOffsetHulls(
	hull: BareSegmentC,
	distance: number
): BareSegmentC[] {
	if (isBezierJsLinear(hull)) {
		return [linearOffsetHull(hull, distance)]
	}
	const reduced = reduceToSimple(hull)
	if (reduced.length === 0) {
		return []
	}
	return reduced.map(seg => {
		if (isBezierJsLinear(seg)) {
			return linearOffsetHull(seg, distance)
		}
		return offsetOneSimple(seg, distance)
	})
}
