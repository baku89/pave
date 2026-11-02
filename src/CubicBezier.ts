import {scalar, vec2} from 'linearly'

import {Iter} from './Iter'
import {SegmentLocation} from './Location'
import {
	buildArcLengthTable,
	gaussLegendre,
	invertArcLength,
	solveQuadratic,
} from './numeric'
import {parallelStart, rawParallelVertices} from './parallelCurve'
import {Path, VertexC} from './Path'
import {SegmentC} from './Segment'
import {memoize, normalizeOffset} from './utils'

/**
 * Almost equivalent to {@link SegmentC}, but the redundant `command` field can be omitted. Used for the argument of CubicBezier functions.
 * @category Types
 */
export type BareSegmentC = Omit<SegmentC, 'command'>

/**
 * A collection of functions to handle a cubic Bézier segment represented as {@link BareSegmentC}.
 *
 * The projection strategy follows bezier-js (MIT, https://github.com/Pomax/bezierjs).
 * @category Modules
 */
export namespace CubicBezier {
	export function of(
		start: vec2,
		control1: vec2,
		control2: vec2,
		point: vec2
	): SegmentC {
		return {command: 'C', start, args: [control1, control2], point}
	}

	export function fromQuadraticBezier(
		start: vec2,
		control: vec2,
		point: vec2
	): SegmentC {
		const control1 = vec2.lerp(start, control, 2 / 3)
		const control2 = vec2.lerp(point, control, 2 / 3)

		return {command: 'C', start, args: [control1, control2], point}
	}

	/**
	 * Calculates the length of the Bezier curve. Length is calculated using numerical approximation, specifically the Legendre-Gauss quadrature algorithm.
	 */
	export function length(bezier: BareSegmentC): number {
		return arcLengthTable(bezier).total
	}

	/**
	 * Calculates the rect of this Bezier curve.
	 */
	export const bounds = memoize((bezier: BareSegmentC): [vec2, vec2] => {
		const rx = extremaTimesAlongDim(bezier, 0)
		const ry = extremaTimesAlongDim(bezier, 1)
		const [minX, maxX] = minMaxAlongDim(bezier, 0, rx)
		const [minY, maxY] = minMaxAlongDim(bezier, 1, ry)
		return [
			[minX, minY],
			[maxX, maxY],
		]
	})

	export function toTime(bezier: BareSegmentC, loc: SegmentLocation): number {
		if (typeof loc === 'number') {
			loc = {unit: loc}
		}

		if ('time' in loc) {
			return normalizeOffset(loc.time, 1)
		}

		const len = length(bezier)
		const offset = normalizeOffset(
			'unit' in loc ? loc.unit * len : loc.offset,
			len
		)

		return timeAtArcLength(bezier, offset, len)
	}

	/**
	 * Calculates the point on the curve at the specified `t` value.
	 */
	export function point(bezier: BareSegmentC, loc: SegmentLocation): vec2 {
		const t = toTime(bezier, loc)
		return pointAt(bezier, t)
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Note that this yields a not-normalized vector.
	 */
	export function derivative(bezier: BareSegmentC, loc: SegmentLocation): vec2 {
		const time = toTime(bezier, loc)
		return derivativeFn(bezier)(time)
	}

	/**
	 * Calculates the second derivative `d²B/dt²` at the specified `t` value.
	 */
	export function secondDerivative(
		bezier: BareSegmentC,
		loc: SegmentLocation
	): vec2 {
		const time = toTime(bezier, loc)
		return secondDerivativeFn(bezier)(time)
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Unlike {@link derivative}, this yields a normalized vector.
	 */
	export function tangent(bezier: BareSegmentC, loc: SegmentLocation): vec2 {
		return vec2.normalize(derivative(bezier, loc))
	}

	/**
	 * Calculates the curve normal at the specified `t` value. Note that this yields a normalized vector.
	 */
	export function normal(bezier: BareSegmentC, loc: SegmentLocation): vec2 {
		return vec2.rotate(tangent(bezier, loc), 90)
	}

	/**
	 * Signed curvature κ = (B′ × B″) / ‖B′‖³ at the specified location. Positive when the curve turns towards its {@link normal} side. Returns 0 where the speed vanishes.
	 */
	export function curvature(
		bezier: BareSegmentC,
		loc: SegmentLocation
	): number {
		const time = toTime(bezier, loc)
		const d = derivativeFn(bezier)(time)
		const dd = secondDerivativeFn(bezier)(time)
		const speed = Math.hypot(d[0], d[1])
		if (speed < 1e-12) {
			return 0
		}
		return (d[0] * dd[1] - d[1] * dd[0]) / (speed * speed * speed)
	}

	/**
	 * Sorted, unique `t` values in (0, 1) where x(t) or y(t) has an extremum. Splitting at these times yields pieces that are monotone along both axes.
	 */
	export function extremaTimes(bezier: BareSegmentC): number[] {
		const ts = [
			...extremaTimesAlongDim(bezier, 0),
			...extremaTimesAlongDim(bezier, 1),
		]
			.filter(t => t > 1e-9 && t < 1 - 1e-9)
			.sort((a, b) => a - b)
		return ts.filter((t, i) => i === 0 || t - ts[i - 1] > 1e-9)
	}

	/**
	 * Sorted `t` values in (0, 1) where the curvature changes sign (`B′ × B″ = 0`).
	 */
	export function inflectionTimes(bezier: BareSegmentC): number[] {
		const {
			start: [x0, y0],
			args: [[x1, y1], [x2, y2]],
			point: [x3, y3],
		} = bezier

		// B′(t) = A t² + B t + C
		const A: vec2 = [
			9 * (x1 - x2) + 3 * (x3 - x0),
			9 * (y1 - y2) + 3 * (y3 - y0),
		]
		const B: vec2 = [6 * (x0 + x2) - 12 * x1, 6 * (y0 + y2) - 12 * y1]
		const C: vec2 = [3 * (x1 - x0), 3 * (y1 - y0)]

		const cross = (p: vec2, q: vec2) => p[0] * q[1] - p[1] * q[0]

		// B′ × B″ = -(A×B) t² + 2 (C×A) t + (C×B)
		return solveQuadratic(-cross(A, B), 2 * cross(C, A), cross(C, B)).filter(
			t => t > 1e-9 && t < 1 - 1e-9
		)
	}

	/**
	 * The two `t` values at which the curve passes through the same point, or `null` if it has no loop. Solved in closed form: with `B(t) = at³ + bt² + ct + d`, dividing `B(s) - B(t)` by `s - t` leaves an equation in `s + t` and `st`.
	 */
	export function selfIntersectionTimes(
		bezier: BareSegmentC
	): [number, number] | null {
		const [a, b, c] = powerCoefficients(bezier)

		const crossAB = a[0] * b[1] - a[1] * b[0]
		const aa = vec2.dot(a, a)
		const scale = Math.sqrt(aa * vec2.dot(b, b))
		if (scale === 0 || Math.abs(crossAB) <= 1e-12 * scale) return null

		// a(u² - v) + bu + c = 0, where u = s + t and v = st
		const u = -(a[0] * c[1] - a[1] * c[0]) / crossAB
		const w = -(a[0] * (b[0] * u + c[0]) + a[1] * (b[1] * u + c[1])) / aa
		const disc = u * u - 4 * (u * u - w)
		if (disc <= 1e-12) return null

		const root = Math.sqrt(disc)
		const s0 = (u - root) / 2
		const s1 = (u + root) / 2
		const eps = 1e-9
		if (s0 < -eps || s1 > 1 + eps) return null
		return [scalar.clamp(s0, 0, 1), scalar.clamp(s1, 0, 1)]
	}

	/**
	 * The `t` values in (0, 1) where the speed vanishes, so that the curve turns back on itself. A cubic has at most one unless it is degenerate to a line.
	 */
	export function cuspTimes(bezier: BareSegmentC): number[] {
		const [a, b, c] = powerCoefficients(bezier)
		const size = Math.max(...[...a, ...b, ...c].map(Math.abs))
		if (size === 0) return []

		const speedAt = (t: number) =>
			Math.hypot(
				(3 * a[0] * t + 2 * b[0]) * t + c[0],
				(3 * a[1] * t + 2 * b[1]) * t + c[1]
			)

		// A root of the derivative is a root of each axis, so take the better conditioned one
		const axis = Math.abs(a[0]) >= Math.abs(a[1]) ? 0 : 1
		return solveQuadratic(3 * a[axis], 2 * b[axis], c[axis]).filter(
			t => t > 1e-9 && t < 1 - 1e-9 && speedAt(t) <= 1e-7 * size
		)
	}

	/**
	 * Finds the on-curve point closest to the specific off-curve point
	 */
	export function project(
		bezier: BareSegmentC,
		origin: vec2
	): {position: vec2; t?: number; distance?: number} {
		const steps = 100
		const lut: vec2[] = []
		for (let i = 0; i <= steps; i++) {
			lut.push(pointAt(bezier, i / steps))
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
		const t1 = (mpos - 1) / steps
		const t2 = (mpos + 1) / steps
		const fineStep = 0.1 / steps
		let ft = t1
		mdist += 1
		for (let t = t1; t < t2 + fineStep; t += fineStep) {
			const p = pointAt(bezier, t)
			const d = vec2.distance(origin, p)
			if (d < mdist) {
				mdist = d
				ft = t
			}
		}
		ft = scalar.clamp(ft, 0, 1)
		const position = pointAt(bezier, ft)
		return {
			position,
			t: ft,
			distance: vec2.distance(origin, position),
		}
	}

	export function trim(
		bezier: BareSegmentC,
		start: SegmentLocation,
		end: SegmentLocation
	): SegmentC {
		let startTime = toTime(bezier, start)
		let endTime = toTime(bezier, end)

		if (startTime === 0 && endTime === 1) {
			// Early return if the curve is not trimmed
			return (
				'command' in bezier ? bezier : {...bezier, command: 'C'}
			) as SegmentC
		}

		// Make sure that startTime < endTime
		const shouldFlip = startTime > endTime
		if (shouldFlip) {
			;[startTime, endTime] = [endTime, startTime]
		}

		let [newStart, newC1, newC2, newEnd] = trimBetweenTimes(
			bezier,
			startTime,
			endTime
		)

		// Flip back if necessary
		if (shouldFlip) {
			;[newStart, newC1, newC2, newEnd] = [newEnd, newC2, newC1, newStart]
		}

		return {
			command: 'C',
			start: newStart,
			args: [newC1, newC2],
			point: newEnd,
		}
	}

	export function divideAtTimes(
		segment: BareSegmentC,
		times: Iterable<number>
	): VertexC[] {
		times = [0, ...times, 1]

		const vertices: VertexC[] = []

		for (const [from, to] of Iter.pairwise(times)) {
			const [, c1, c2, point] = trimBetweenTimes(segment, from, to)

			vertices.push({command: 'C', args: [c1, c2], point})
		}

		return vertices
	}

	export function isZero(bezier: BareSegmentC) {
		const {
			start,
			args: [c1, c2],
			point,
		} = bezier
		return (
			vec2.approx(start, point) &&
			vec2.approx(start, c1) &&
			vec2.approx(start, c2)
		)
	}

	export function isStraight(bezier: BareSegmentC) {
		if (isZero(bezier)) {
			return true
		}

		const {
			start,
			point,
			args: [c1, c2],
		} = bezier

		if (vec2.approx(start, c1) && vec2.approx(point, c2)) {
			// Both handles are zero-length
			return true
		}

		if (vec2.approx(start, point)) {
			// Returning to its start, it is only straight if the handles lie on one line;
			// otherwise it is a closed loop
			const h1 = vec2.sub(c1, start)
			const h2 = vec2.sub(c2, start)
			return (
				Math.abs(h1[0] * h2[1] - h1[1] * h2[0]) <=
				1e-9 * Math.max(vec2.squaredLength(h1), vec2.squaredLength(h2))
			)
		}

		const sp = vec2.sub(point, start)
		const sc1 = vec2.sub(c1, start)
		const sc2 = vec2.sub(c2, start)

		const spLen = vec2.len(sp)

		// All of control points are on the line
		return (
			scalar.approx(vec2.angle(sp, sc1), 0) &&
			scalar.approx(vec2.angle(sp, sc2), 0) &&
			vec2.len(sc1) < spLen &&
			vec2.len(sc2) < spLen
		)
	}

	/**
	 * Returns the raw parallel curve of the Bézier at the given signed distance along its {@link normal}, as an open path of cubic Béziers fitted within `tolerance`. Where the distance exceeds the radius of curvature the result folds back on itself; use {@link Path.offset} for a trimmed result.
	 */
	export function offset(
		bezier: BareSegmentC,
		distance: number,
		tolerance = 0.05
	): Path {
		const seg: SegmentC =
			'command' in bezier ? (bezier as SegmentC) : {...bezier, command: 'C'}
		return {
			curves: [
				{
					vertices: [
						{command: 'L', point: parallelStart(seg, distance)},
						...rawParallelVertices(seg, distance, tolerance),
					],
					closed: false,
				},
			],
		}
	}
}

/** Vector coefficients `[a, b, c]` of `B(t) = at³ + bt² + ct + d`. */
function powerCoefficients(hull: BareSegmentC): [vec2, vec2, vec2] {
	const {
		start: [x0, y0],
		args: [[x1, y1], [x2, y2]],
		point: [x3, y3],
	} = hull
	return [
		[x3 - x0 + 3 * (x1 - x2), y3 - y0 + 3 * (y1 - y2)],
		[3 * (x0 + x2) - 6 * x1, 3 * (y0 + y2) - 6 * y1],
		[3 * (x1 - x0), 3 * (y1 - y0)],
	]
}

/**
 * Evaluates the cubic Bézier at parameter `t` in [0, 1] using the Bernstein basis.
 */
function pointAt(hull: BareSegmentC, t: number): vec2 {
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
const derivativeFn = memoize((hull: BareSegmentC) => {
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
 * Returns `t ↦ d²B/dt²` for the given hull (a linear function of `t`).
 */
const secondDerivativeFn = memoize((hull: BareSegmentC) => {
	const {
		start: [x0, y0],
		args: [[x1, y1], [x2, y2]],
		point: [x3, y3],
	} = hull

	const ax = 9 * (x1 - x2) + 3 * (x3 - x0),
		bx = 6 * (x0 + x2) - 12 * x1,
		ay = 9 * (y1 - y2) + 3 * (y3 - y0),
		by = 6 * (y0 + y2) - 12 * y1

	return (time: number): vec2 => [2 * ax * time + bx, 2 * ay * time + by]
})

/**
 * De Casteljau split at `time`: left/right control nets share the on-curve point at `time`.
 */
function splitAtTime(
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
 */
function trimBetweenTimes(
	hull: BareSegmentC,
	from: number,
	to: number
): [vec2, vec2, vec2, vec2] {
	let newStart: vec2, midC1: vec2, midC2: vec2

	if (from === 0) {
		newStart = hull.start
		;[midC1, midC2] = hull.args
	} else {
		;[, , newStart, midC1, midC2] = splitAtTime(hull, from)
	}

	let newC1: vec2, newC2: vec2, newEnd: vec2

	if (to === 1) {
		newEnd = hull.point
		;[newC1, newC2] = [midC1, midC2]
	} else {
		;[newC1, newC2, newEnd] = splitAtTime(
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
		// a(1-t)² + 2b·t(1-t) + c·t² = (a - 2b + c)t² + 2(b - a)t + a
		const [a, b, c] = p
		return solveQuadratic(a - 2 * b + c, 2 * (b - a), a)
	}
	if (p.length === 2) {
		const [a, b] = p
		return a !== b ? [a / (a - b)] : []
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
function extremaTimesAlongDim(hull: BareSegmentC, dim: 0 | 1): number[] {
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
		const v = pointAt(hull, t)[dim]
		minV = Math.min(minV, v)
		maxV = Math.max(maxV, v)
	}
	return [minV, maxV]
}

/**
 * Speed ‖B′(t)‖, the arc-length integrand, as an allocation-free closure over the hull's
 * derivative coefficients. Memoized per hull because the quadrature calls it in tight loops.
 */
const speedFn = memoize((hull: BareSegmentC): ((t: number) => number) => {
	const [p0, p3] = [hull.start, hull.point]
	const [p1, p2] = hull.args
	const ax = p1[0] - p0[0]
	const ay = p1[1] - p0[1]
	const bx = p2[0] - p1[0]
	const by = p2[1] - p1[1]
	const cx = p3[0] - p2[0]
	const cy = p3[1] - p2[1]

	return t => {
		const u = 1 - t
		const w0 = 3 * u * u
		const w1 = 6 * u * t
		const w2 = 3 * t * t
		return Math.hypot(w0 * ax + w1 * bx + w2 * cx, w0 * ay + w1 * by + w2 * cy)
	}
})

/**
 * Arc-length table of the cubic, built once per hull. It is the single precomputation behind
 * {@link CubicBezier.length} and every offset/unit query: summing 8 Gauss–Legendre pieces keeps
 * the length accurate across cusps, where one quadrature over the whole curve loses ~1e-4.
 */
const arcLengthTable = memoize((hull: BareSegmentC) => {
	const speed = speedFn(hull)
	return buildArcLengthTable(
		speed,
		(t0, t1) => (t0 === t1 ? 0 : gaussLegendre(speed, t0, t1)),
		1
	)
})

/**
 * Parameter t ∈ [0, 1] whose arc length from the curve start equals `s` (clamped to `total`,
 * the full length). The heavy part, sampling the cumulative length along the curve, is memoized
 * per hull in {@link arcLengthTable}; each query then only brackets, estimates and refines.
 */
function timeAtArcLength(hull: BareSegmentC, s: number, total: number): number {
	if (total <= 1e-15) return 0

	const target = scalar.clamp(s, 0, total)
	if (target <= 0) return 0
	if (target >= total) return 1

	return invertArcLength(arcLengthTable(hull), target)
}
