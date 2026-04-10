import {Bezier as BezierJS, Point} from 'bezier-js'
import {scalar, vec2} from 'linearly'
import paper from 'paper'

import {Iter} from './Iter'
import {SegmentLocation} from './Location'
import {ensurePaperScope} from './paperScope'
import {Path, VertexC} from './Path'
import {SegmentC} from './Segment'
import {memoize, normalizeOffset} from './utils'

/**
 * Same shape as {@link SegmentC} but without the path `command` field. Used for CubicBezier function arguments.
 * @category Types
 */
export type BareSegmentC = Omit<SegmentC, 'command'>

/**
 * A collection of functions to handle a cubic bezier represented with {@link BareSegmentC}.
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

	export const toPaperBezier = memoize((beizer: BareSegmentC) => {
		ensurePaperScope()
		const {
			start: [x0, y0],
			args: [[x1, y1], [x2, y2]],
			point: [x3, y3],
		} = beizer

		return new paper.Curve(
			new paper.Point(x0, y0),
			new paper.Point(x1 - x0, y1 - y0),
			new paper.Point(x2 - x3, y2 - y3),
			new paper.Point(x3, y3)
		)
	})

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
	 * Fits a cubic Bézier through three points (start, on-curve target at `t`, end).
	 * Matches {@link https://github.com/Pomax/bezierjs/blob/master/src/bezier.js Bezier.cubicFromPoints}.
	 */
	export function cubicFromPoints(
		start: vec2,
		mid: vec2,
		end: vec2,
		t = 0.5,
		d1?: number
	): SegmentC {
		const abc = getABCCubic(start, mid, end, t)
		if (d1 === undefined) {
			d1 = vec2.distance(mid, abc.c)
		}
		const d2 = (d1 * (1 - t)) / t

		const selen = vec2.distance(start, end)
		const lx = (end[0] - start[0]) / selen
		const ly = (end[1] - start[1]) / selen
		const bx1 = d1 * lx
		const by1 = d1 * ly
		const bx2 = d2 * lx
		const by2 = d2 * ly

		const e1: vec2 = [mid[0] - bx1, mid[1] - by1]
		const e2: vec2 = [mid[0] + bx2, mid[1] + by2]
		const A = abc.a
		const v1: vec2 = [
			A[0] + (e1[0] - A[0]) / (1 - t),
			A[1] + (e1[1] - A[1]) / (1 - t),
		]
		const v2: vec2 = [
			A[0] + (e2[0] - A[0]) / t,
			A[1] + (e2[1] - A[1]) / t,
		]
		const nc1: vec2 = [
			start[0] + (v1[0] - start[0]) / t,
			start[1] + (v1[1] - start[1]) / t,
		]
		const nc2: vec2 = [
			end[0] + (v2[0] - end[0]) / (1 - t),
			end[1] + (v2[1] - end[1]) / (1 - t),
		]

		return {command: 'C', start, args: [nc1, nc2], point: end}
	}

	/**
	 * Parameter values in [0, 1] where the planar cubic has a curvature inflection.
	 * Matches {@link https://github.com/Pomax/bezierjs/blob/master/src/utils.js utils.inflections} for cubics.
	 */
	export function inflections(bezier: BareSegmentC): number[] {
		const {
			start: p0,
			args: [p1, p2],
			point: p3,
		} = bezier
		const aligned = alignToChord([p0, p1, p2, p3], p0, p3)

		const ax = aligned[2][0] * aligned[1][1]
		const bx = aligned[3][0] * aligned[1][1]
		const cx = aligned[1][0] * aligned[2][1]
		const dx = aligned[3][0] * aligned[2][1]
		const v1 = 18 * (-3 * ax + 2 * bx + 3 * cx - dx)
		const v2 = 18 * (3 * ax - bx - 3 * cx)
		const v3 = 18 * (cx - ax)

		const bezierEps = 1e-6

		const near0 = (x: number) => Math.abs(x) <= bezierEps

		if (near0(v1)) {
			if (!near0(v2)) {
				const t = -v3 / v2
				return t >= 0 && t <= 1 ? [t] : []
			}
			return []
		}

		const d2 = 2 * v1
		if (near0(d2)) {
			return []
		}

		const trm = v2 * v2 - 4 * v1 * v3
		if (trm < 0) {
			return []
		}

		const sq = Math.sqrt(trm)
		return [(sq - v2) / d2, -(v2 + sq) / d2].filter(r => r >= 0 && r <= 1)
	}

	/**
	 * Calculates the length of the Bezier curve. Length is calculated using numerical approximation, specifically the Legendre-Gauss quadrature algorithm.
	 */
	export const length = memoize((bezier: BareSegmentC): number => {
		const bezierJS = toBezierJS(bezier)
		return bezierJS.length()
	})

	/**
	 * Calculates the rect of this Bezier curve.
	 */
	export const bounds = memoize((bezier: BareSegmentC): [vec2, vec2] => {
		const bezierJS = toBezierJS(bezier)
		const {x, y} = bezierJS.bbox()

		return [
			[x.min, y.min],
			[x.max, y.max],
		]
	})

	export function toTime(bezier: BareSegmentC, loc: SegmentLocation): number {
		if (typeof loc === 'number') {
			loc = {unit: loc}
		}

		if ('time' in loc) {
			return normalizeOffset(loc.time, 1)
		}

		const paperBezier = toPaperBezier(bezier)

		const offset = normalizeOffset(
			'unit' in loc ? loc.unit * paperBezier.length : loc.offset,
			paperBezier.length
		)

		return paperBezier.getTimeAt(offset)
	}

	/**
	 * Calculates the point on the curve at the specified `t` value.
	 */
	export function point(bezier: BareSegmentC, loc: SegmentLocation): vec2 {
		const t = toTime(bezier, loc)

		const {
			start,
			args: [control1, control2],
			point,
		} = bezier
		const x =
			(1 - t) ** 3 * start[0] +
			3 * (1 - t) ** 2 * t * control1[0] +
			3 * (1 - t) * t ** 2 * control2[0] +
			t ** 3 * point[0]
		const y =
			(1 - t) ** 3 * start[1] +
			3 * (1 - t) ** 2 * t * control1[1] +
			3 * (1 - t) * t ** 2 * control2[1] +
			t ** 3 * point[1]

		return [x, y]
	}

	/**
	 * Calculates the curve tangent at the specified `t` value. Note that this yields a not-normalized vector.
	 */
	export function derivative(
		bezier: BareSegmentC,
		loc: SegmentLocation
	): vec2 {
		const time = toTime(bezier, loc)

		const derivativeFn = getDerivativeFn(bezier)

		return derivativeFn(time)
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
	 * Finds the on-curve point closest to the specific off-curve point
	 */
	export function project(
		bezier: BareSegmentC,
		origin: vec2
	): {position: vec2; t?: number; distance?: number} {
		const bezierJS = toBezierJS(bezier)
		const {x, y, t, d} = bezierJS.project(toPoint(origin))
		return {position: [x, y], t, distance: d}
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
			// Zero-length line, with some handles defined
			return true
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

	export function offset(bezier: BareSegmentC, distance: number): Path {
		const bezierJS = toBezierJS(bezier)
		const offsetBeziers = bezierJS.offset(distance) as BezierJS[]

		const pen = Path.pen()

		if (offsetBeziers.length === 0) {
			throw new Error('Offsetting a bezier curve failed')
		}

		const {x: x0, y: y0} = offsetBeziers[0].points[0]
		pen.M([x0, y0])

		for (const ob of offsetBeziers) {
			pen.C(
				[ob.points[1].x, ob.points[1].y],
				[ob.points[2].x, ob.points[2].y],
				[ob.points[3].x, ob.points[3].y]
			)
		}

		return pen.get()
	}
}

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

/** u(t) from https://pomax.github.io/bezierinfo/#abc */
function projectionRatio3(t: number): number {
	if (t === 0 || t === 1) {
		return t
	}
	const top = (1 - t) ** 3
	return top / (t ** 3 + top)
}

/** ratio(t) from https://pomax.github.io/bezierinfo/#abc */
function abcRatio3(t: number): number {
	if (t === 0 || t === 1) {
		return t
	}
	const bottom = t ** 3 + (1 - t) ** 3
	return Math.abs((bottom - 1) / bottom)
}

function getABCCubic(S: vec2, B: vec2, E: vec2, t: number) {
	const u = projectionRatio3(t)
	const um = 1 - u
	const c: vec2 = [u * S[0] + um * E[0], u * S[1] + um * E[1]]
	const s = abcRatio3(t)
	const a: vec2 = [
		B[0] + (B[0] - c[0]) / s,
		B[1] + (B[1] - c[1]) / s,
	]
	return {a, c}
}

function toPoint([x, y]: vec2): Point {
	return {x, y}
}

const getDerivativeFn = memoize((bezier: BareSegmentC) => {
	// https://github.com/paperjs/paper.js/blob/develop/src/path/Curve.js#L1403-L1424

	// Calculate the coefficients of a Bezier derivative.
	const {
		start: [x0, y0],
		args: [[x1, y1], [x2, y2]],
		point: [x3, y3],
	} = bezier

	const ax = 9 * (x1 - x2) + 3 * (x3 - x0),
		bx = 6 * (x0 + x2) - 12 * x1,
		cx = 3 * (x1 - x0),
		ay = 9 * (y1 - y2) + 3 * (y3 - y0),
		by = 6 * (y0 + y2) - 12 * y1,
		cy = 3 * (y1 - y0)

	return (time: number): vec2 => {
		// Calculate quadratic equations of derivatives for x and y
		const dx = (ax * time + bx) * time + cx,
			dy = (ay * time + by) * time + cy
		return [dx, dy]
	}
})

function splitCubicBezierAtTime(
	bezier: BareSegmentC,
	time: number
): [
	newControl1: vec2,
	inControl: vec2,
	midPoint: vec2,
	outControl: vec2,
	newControl2: vec2,
] {
	// Use de Casteljau's algorithm
	// https://pomax.github.io/bezierinfo/#splitting

	const [c1, c2] = bezier.args

	// Find the start point and c1
	const newControl1 = vec2.lerp(bezier.start, c1, time)
	const p12 = vec2.lerp(c1, c2, time)
	const newControl2 = vec2.lerp(c2, bezier.point, time)

	const inControl = vec2.lerp(newControl1, p12, time)
	const outControl = vec2.lerp(p12, newControl2, time)

	const midPoint = vec2.lerp(inControl, outControl, time)

	return [newControl1, inControl, midPoint, outControl, newControl2]
}

const toBezierJS = memoize((bezier: BareSegmentC): BezierJS => {
	const {
		start,
		args: [control1, control2],
		point,
	} = bezier
	return new BezierJS(
		start[0],
		start[1],
		control1[0],
		control1[1],
		control2[0],
		control2[1],
		point[0],
		point[1]
	)
})

/**
 * Internal function to trim a bezier curve between given times range. It must be guaranteed that `0 <= from <= to <= 1`.
 */
function trimBetweenTimes(
	bezier: BareSegmentC,
	from: number,
	to: number
): [start: vec2, c1: vec2, c2: vec2, point: vec2] {
	// Trim to [0, 1] -> [startTime, 1]
	let newStart: vec2, midC1: vec2, midC2: vec2

	if (from === 0) {
		newStart = bezier.start
		;[midC1, midC2] = bezier.args
	} else {
		;[, , newStart, midC1, midC2] = splitCubicBezierAtTime(bezier, from)
	}

	// Trim to [startTime, 1] -> [startTime, endTime]
	let newC1: vec2, newC2: vec2, newEnd: vec2

	if (to === 1) {
		newEnd = bezier.point
		;[newC1, newC2] = [midC1, midC2]
	} else {
		;[newC1, newC2, newEnd] = splitCubicBezierAtTime(
			{start: newStart, args: [midC1, midC2], point: bezier.point},
			scalar.invlerp(from, 1, to)
		)
	}

	return [newStart, newC1, newC2, newEnd]
}
