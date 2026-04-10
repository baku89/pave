import {Rect} from 'geome'
import {mat2, mat2d, scalar, vec2} from 'linearly'

import {CubicBezier} from './CubicBezier'
import {Iter} from './Iter'
import {SegmentLocation, UnitSegmentLocation} from './Location'
import {Path, VertexA, VertexC} from './Path'
import {SegmentA} from './Segment'
import {memoize, normalizeOffset} from './utils'

/**
 * The angle range to check. `startAngle` is always in the range of [-π, π], and the `endAngle` is relative angle considering the rotation direction, with start angle as a reference.
 * @category Types
 */
export type AngleRange = readonly [startAngle: number, endAngle: number]

/**
 * Almost equivalent to {@link SegmentA}, but the redundant `command` field can be omitted. Used for the argument of Arc functions.
 * @category Types
 */
export type BareSegmentA = Omit<SegmentA, 'command'>

/**
 * A collection of functions to handle arcs represented with {@link SegmentA}.
 * @category Modules
 */
export namespace Arc {
	export function of(
		start: vec2,
		radii: vec2,
		xAxisRotation: number,
		largeArcFlag: boolean,
		sweepFlag: boolean,
		point: vec2
	): SegmentA {
		return {
			command: 'A',
			start,
			args: [radii, xAxisRotation, largeArcFlag, sweepFlag],
			point,
		}
	}

	/**
	 * Converts the Arc command to a center parameterization that can be used in Context2D.ellipse().
	 * https://observablehq.com/@awhitty/svg-2-elliptical-arc-to-canvas-path2d
	 * @category Utilities
	 * */
	export const toCenterParameterization = memoize((arc: BareSegmentA) => {
		const {
			start,
			point,
			args: [radii, xAxisRotation, largeArcFlag, sweepFlag],
		} = arc

		if (scalar.approx(radii[0], 0) || scalar.approx(radii[1], 0)) {
			// Treat as a straight line (B 2.5. Step 1)
			const v = vec2.sub(start, point)
			const xAxisRotation = vec2.angle(v)
			const rx = vec2.len(v) / 2

			return {
				center: vec2.lerp(start, point, 0.5),
				radii: [rx, 0] as vec2,
				angles: [0, 180] as AngleRange,
				xAxisRotation,
				sweep: true,
			}
		}

		// Convert xAxisRotation from degrees to radians
		const xAxisRotationRad = scalar.rad(xAxisRotation)
		const cosphi = Math.cos(xAxisRotationRad)
		const sinphi = Math.sin(xAxisRotationRad)

		// Step 1: Compute (x1', y1')
		const [x1p, y1p] = [
			(cosphi * (start[0] - point[0])) / 2 +
				(sinphi * (start[1] - point[1])) / 2,
			(-sinphi * (start[0] - point[0])) / 2 +
				(cosphi * (start[1] - point[1])) / 2,
		]

		const [rx, ry] = correctRadii(radii, [x1p, y1p])
		const rx2 = rx ** 2
		const ry2 = ry ** 2

		// Step 2: Compute (cx', cy')
		const n = rx2 * ry2 - rx2 * y1p ** 2 - ry2 * x1p ** 2
		const d = rx2 * y1p ** 2 + ry2 * x1p ** 2

		const sign = largeArcFlag !== sweepFlag ? 1 : -1
		const cxp = (sign * Math.sqrt(Math.abs(n / d)) * (rx * y1p)) / ry
		const cyp = (sign * Math.sqrt(Math.abs(n / d)) * (-ry * x1p)) / rx

		// Step 3: Compute (cx, cy) from (cx', cy')
		const center: vec2 = [
			cosphi * cxp - sinphi * cyp + (start[0] + point[0]) / 2,
			sinphi * cxp + cosphi * cyp + (start[1] + point[1]) / 2,
		]

		// Step 4: Compute start and end angles
		const a = [(x1p - cxp) / rx, (y1p - cyp) / ry]
		const b = [(-x1p - cxp) / rx, (-y1p - cyp) / ry]

		// Calculate start angle relative to [1, 0]
		const startAngle = scalar.deg(Math.atan2(a[1], a[0]))

		// Calculate delta angle
		let deltaAngle = scalar.deg(Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]))

		if (!sweepFlag && deltaAngle > 0) {
			deltaAngle = deltaAngle - 360
		} else if (sweepFlag && deltaAngle < 0) {
			deltaAngle = deltaAngle + 360
		}

		const endAngle = startAngle + deltaAngle

		return {
			center,
			radii: [rx, ry] as vec2,
			angles: [startAngle, endAngle] as AngleRange,
			xAxisRotation,
			sweep: deltaAngle > 0,
		}

		/**
		 * Ensures the radii are large enough
		 * https://svgwg.org/svg2-draft/implnote.html#ArcCorrectionOutOfRangeRadii
		 **/
		function correctRadii(signedRadii: vec2, p: vec2): vec2 {
			const [signedRx, signedRy] = signedRadii
			const [x1p, y1p] = p
			const prx = Math.abs(signedRx)
			const pry = Math.abs(signedRy)

			const A = x1p ** 2 / prx ** 2 + y1p ** 2 / pry ** 2

			const rx = A > 1 ? Math.sqrt(A) * prx : prx
			const ry = A > 1 ? Math.sqrt(A) * pry : pry

			return [rx, ry]
		}
	})

	export function approximateByCubicBeziers(
		arc: BareSegmentA,
		angle: number
	): VertexC[] {
		angle = angle === 0 ? 90 : Math.abs(angle)

		const {center, radii, angles, xAxisRotation, sweep} =
			toCenterParameterization(arc)

		const [startAngle, endAngle] = angles

		const n = Math.ceil(Math.abs(endAngle - startAngle) / angle)
		const dir = Math.sign(endAngle - startAngle)
		const delta = (endAngle - startAngle) / n

		const xform = mat2d.trs(center, xAxisRotation, radii)

		const beziers: VertexC[] = []

		for (let i = 0; i < n; i++) {
			const a0 = startAngle + i * delta
			const a1 = startAngle + (i + 1) * delta

			// Calculate the arc for unit circle
			// without considering the radii and rotation
			const start = vec2.direction(a0)
			const point = vec2.direction(a1)

			const handleLength = (4 / 3) * scalar.tan((a1 - a0) / 4)

			const control1 = vec2.scaleAndAdd(
				start,
				vec2.direction(a0 + 90 * dir),
				handleLength * (sweep ? 1 : -1)
			)

			const control2 = vec2.scaleAndAdd(
				point,
				vec2.direction(a1 - 90 * dir),
				handleLength * (sweep ? 1 : -1)
			)

			// Apply the transformation to the unit circle
			const vertex: VertexC = {
				point: vec2.transformMat2d(point, xform),
				command: 'C',
				args: [
					vec2.transformMat2d(control1, xform),
					vec2.transformMat2d(control2, xform),
				],
			}

			beziers.push(vertex)
		}

		return beziers
	}

	/**
	 * Calculates the bound of given arc.
	 * @param arg The arc segment to calculate
	 * @returns The bound of the arc
	 * @example
	 * ```js:pave
	 * const center = [50, 50]
	 * const startAngle = -120
	 * const endAngle = 30
	 * const radius = 40
	 * const start = vec2.add(center, vec2.direction(startAngle, 40))
	 * const point = vec2.add(center, vec2.direction(endAngle, 40))
	 *
	 * const arc = Path.arc([50, 50], 40, startAngle, endAngle)
	 * stroke(arc, 'skyblue')
	 *
	 * const bound = Arc.bounds({
	 * 	start,
	 * 	point,
	 * 	command: [[radius, radius], 0, false, true]
	 * })
	 *
	 * stroke(Path.rect(...bound), 'tomato')
	 * ```
	 */
	export const bounds = memoize((arc: BareSegmentA): Rect => {
		const {start, point} = arc
		const {center, radii, angles, xAxisRotation} = toCenterParameterization(arc)

		const sy = radii[1] / radii[0]

		const angleAtXmax = -scalar.atan(
			sy * scalar.sin(xAxisRotation),
			scalar.cos(xAxisRotation)
		)
		const angleAtXmin = normalizeAngle(angleAtXmax + 180)

		const angleAtYmax = -scalar.atan(
			-sy * scalar.cos(xAxisRotation),
			scalar.sin(xAxisRotation)
		)

		const angleAtYmin = normalizeAngle(angleAtYmax + 180)

		const xform = mat2d.scale(
			mat2d.rotate(mat2d.fromTranslation(center), xAxisRotation),
			radii
		)

		let xMax = Math.max(start[0], point[0])
		let xMin = Math.min(start[0], point[0])
		let yMax = Math.max(start[1], point[1])
		let yMin = Math.min(start[1], point[1])

		if (crossAtAngle(angleAtXmax, angles)) {
			const p = vec2.transformMat2d(vec2.direction(angleAtXmax), xform)
			xMax = p[0]
		}
		if (crossAtAngle(angleAtXmin, angles)) {
			const p = vec2.transformMat2d(vec2.direction(angleAtXmin), xform)
			xMin = p[0]
		}
		if (crossAtAngle(angleAtYmax, angles)) {
			const p = vec2.transformMat2d(vec2.direction(angleAtYmax), xform)
			yMax = p[1]
		}
		if (crossAtAngle(angleAtYmin, angles)) {
			const p = vec2.transformMat2d(vec2.direction(angleAtYmin), xform)
			yMin = p[1]
		}

		return [
			[xMin, yMin],
			[xMax, yMax],
		]
	})

	/**
	 * Transforms the given arc segment with the given matrix.
	 * @see https://gist.github.com/timo22345/9413158#file-flatten-js-L443-L547
	 */
	export function transform(arc: BareSegmentA, matrix: mat2d): SegmentA {
		// eslint-disable-next-line prefer-const
		let [[rx, ry], offsetRot, largeArc, sweep] = arc.args

		const s = scalar.sin(offsetRot)
		const c = scalar.cos(offsetRot)

		// build ellipse representation matrix (unit circle transformation).
		// the 2x2 matrix multiplication with the upper 2x2 of a_mat is inlined.
		const mt = matrix //mat2.transpose([matrix[0], matrix[1], matrix[2], matrix[3]])

		const m: mat2 = [
			mt[0] * +rx * c + mt[2] * rx * s,
			mt[1] * +rx * c + mt[3] * rx * s,
			mt[0] * -ry * s + mt[2] * ry * c,
			mt[1] * -ry * s + mt[3] * ry * c,
		]

		// to implict equation (centered)
		const A = m[0] ** 2 + m[2] ** 2
		const C = m[1] ** 2 + m[3] ** 2
		const B = (m[0] * m[1] + m[2] * m[3]) * 2.0

		// precalculate distance A to C
		const ac = A - C

		// helpers for angle and halfaxis-extraction.
		let A2: number, C2: number

		// convert implicit equation to angle and halfaxis:
		if (nearZero(B)) {
			offsetRot = 0
			A2 = A
			C2 = C
		} else {
			if (nearZero(ac)) {
				A2 = A + B * 0.5
				C2 = A - B * 0.5
				offsetRot = 45
			} else {
				// Precalculate radical:
				let K = 1 + (B * B) / (ac * ac)

				// Clamp (precision issues might need this.. not likely, but better save than sorry)
				K = K < 0 ? 0 : Math.sqrt(K)

				A2 = 0.5 * (A + C + K * ac)
				C2 = 0.5 * (A + C - K * ac)
				offsetRot = scalar.deg(0.5 * Math.atan2(B, ac))
			}
		}

		// This can get slightly below zero due to rounding issues.
		// it's save to clamp to zero in this case (this yields a zero length halfaxis)
		A2 = A2 < 0 ? 0 : Math.sqrt(A2)
		C2 = C2 < 0 ? 0 : Math.sqrt(C2)

		// now A2 and C2 are half-axis:
		if (Math.abs(offsetRot) % 180 === 0) {
			rx = A2
			ry = C2
		} else if (Math.abs(offsetRot) % 180 === 90) {
			rx = C2
			ry = A2
		} else if (ac <= 0) {
			rx = C2
			ry = A2
		} else {
			rx = A2
			ry = C2
		}

		// If the transformation matrix contain a mirror-component
		// winding order of the ellise needs to be changed.
		if (mat2d.det(matrix) < 0) {
			sweep = !sweep
		}

		return {
			start: vec2.transformMat2d(arc.start, matrix),
			point: vec2.transformMat2d(arc.point, matrix),
			command: 'A',
			args: [[rx, ry], offsetRot, largeArc, sweep],
		}

		function nearZero(B: number) {
			if (Math.abs(B) < 0.0000000000000001) return true
			else return false
		}
	}

	export const length = memoize((arc: BareSegmentA): number => {
		const {radii, angles} = toCenterParameterization(arc)
		return ellipticArcLength(radii, angles)
	})

	export function toTime(arc: BareSegmentA, loc: SegmentLocation): number {
		if (typeof loc === 'number') {
			loc = {unit: loc}
		}

		if ('time' in loc) {
			return normalizeOffset(loc.time, 1)
		} else if ('unit' in loc) {
			return unitToTime(arc, loc.unit)
		} else {
			const unit = loc.offset / Arc.length(arc)
			return unitToTime(arc, unit)
		}
	}

	export function point(arc: BareSegmentA, loc: SegmentLocation): vec2 {
		const time = toTime(arc, loc)
		const {center, radii, angles, xAxisRotation} = toCenterParameterization(arc)
		const angle = scalar.lerp(...angles, time)
		const xform = mat2d.trs(center, xAxisRotation, radii)

		return vec2.transformMat2d(vec2.dir(angle), xform)
	}

	export function derivative(arc: BareSegmentA, loc: SegmentLocation): vec2 {
		const time = toTime(arc, loc)
		const {radii, angles, xAxisRotation, sweep} = toCenterParameterization(arc)

		const angle = scalar.lerp(...angles, time)
		const derivativeAtUnit = vec2.dir(angle + 90 * (sweep ? 1 : -1))
		const xform = mat2d.trs(null, xAxisRotation, radii)

		const dir = vec2.transformMat2d(derivativeAtUnit, xform)
		// `time` is linear in angle (degrees); scale from d/d(angle°) to d/dt for t ∈ [0, 1].
		const dThetaDt = scalar.rad(angles[1] - angles[0])
		return vec2.scale(dir, dThetaDt)
	}

	export function tangent(arc: BareSegmentA, loc: SegmentLocation): vec2 {
		return vec2.normalize(derivative(arc, loc))
	}

	export function normal(arc: BareSegmentA, loc: SegmentLocation): vec2 {
		return vec2.rotate(tangent(arc, loc), 90)
	}

	export function trim(
		arc: BareSegmentA,
		start: SegmentLocation,
		end: SegmentLocation
	): SegmentA {
		const startTime = toTime(arc, start)
		const endTime = toTime(arc, end)

		const {radii, center, angles, xAxisRotation} = toCenterParameterization(arc)
		let {sweep} = toCenterParameterization(arc)

		const xform = mat2d.trs(center, xAxisRotation, radii)

		const startAngle = scalar.lerp(...angles, startTime)
		const endAngle = scalar.lerp(...angles, endTime)

		const largeArc = Math.abs(endAngle - startAngle) > 180

		if (startTime > endTime) {
			sweep = !sweep
		}

		return {
			command: 'A',
			start: vec2.transformMat2d(vec2.dir(startAngle), xform),
			args: [radii, xAxisRotation, largeArc, sweep],
			point: vec2.transformMat2d(vec2.dir(endAngle), xform),
		}
	}

	export function divideAtTimes(
		arc: BareSegmentA,
		times: Iterable<number>
	): VertexA[] {
		const [, xAxisRotation, , sweep] = arc.args
		const {radii, center, angles} = toCenterParameterization(arc)

		const vertices: VertexA[] = []

		const xform = mat2d.trs(center, xAxisRotation, radii)

		times = [0, ...times, 1]

		for (const [from, to] of Iter.pairwise(times)) {
			const startAngle = scalar.lerp(...angles, from)
			const endAngle = scalar.lerp(...angles, to)

			const largeArc = Math.abs(endAngle - startAngle) > 180

			const point = vec2.transformMat2d(vec2.dir(endAngle), xform)

			vertices.push({
				command: 'A',
				args: [radii, xAxisRotation, largeArc, sweep],
				point,
			})
		}

		return vertices
	}

	/**
	 * Returns true if the length of arc segment is zero.
	 */
	export const isZero = memoize((arc: BareSegmentA): boolean => {
		const {start, point} = arc
		return vec2.approx(start, point)
	})

	export function isStraight(arc: BareSegmentA): boolean {
		if (isZero(arc)) {
			return true
		}

		const [rx, ry] = arc.args[0]

		return scalar.approx(rx, 0) || scalar.approx(ry, 0)
	}

	export function ellipticArcLength(radii: vec2, angles: AngleRange): number {
		const [rx, ry] = radii
		const [startAngle, endAngle] = angles

		if (scalar.approx(rx, ry)) {
			return scalar.rad(Math.abs(endAngle - startAngle)) * rx
		}

		const angleBetween = Math.abs(endAngle - startAngle)
		if (scalar.approx(angleBetween, 0)) {
			return 0
		}

		// Arc length = ∫ sqrt((rx sin t)² + (ry cos t)²) dt over the centric angle range.
		// Use Gauss–Legendre quadrature (fixed order) instead of many Riemann steps.
		const t0 = scalar.rad(startAngle)
		const t1 = scalar.rad(endAngle)
		const a = Math.min(t0, t1)
		const b = Math.max(t0, t1)

		return gaussLegendre16(a, b, t =>
			Math.hypot(rx * Math.sin(t), ry * Math.cos(t))
		)
	}

	export function offset(
		arc: BareSegmentA,
		distance: number,
		unarcAngle = 90
	): Path {
		const {
			center,
			radii: [rx, ry],
			angles: [fromAngle, toAngle],
		} = toCenterParameterization(arc)

		if (!scalar.approx(rx, ry)) {
			const vertices: VertexC[] = [
				{point: arc.start, command: 'C', args: [vec2.zero, vec2.zero]},
				...approximateByCubicBeziers(arc, unarcAngle),
			]

			const paths = Array.from(Iter.pairwise(vertices)).map(([v0, v1]) =>
				CubicBezier.offset({start: v0.point, ...v1}, distance)
			)
			return Path.join(paths)
		}

		const sweep = fromAngle < toAngle

		return Path.arc(
			center,
			rx + distance * (sweep ? -1 : 1),
			fromAngle,
			toAngle
		)
	}
}

/* eslint-disable no-loss-of-precision --
   Tabulated Gauss–Legendre quadrature coefficients. */
/** Abscissae for 16-point Gauss–Legendre quadrature on [-1, 1]. */
const GL16_X: readonly number[] = [
	-0.9894009349916499, -0.9445750230732326, -0.8656312023878317,
	-0.755404408355003, -0.6178762444026437, -0.4580167776572274,
	-0.2816035507792589, -0.09501250983763744, 0.09501250983763744,
	0.2816035507792589, 0.4580167776572274, 0.6178762444026437, 0.755404408355003,
	0.8656312023878317, 0.9445750230732326, 0.9894009349916499,
]

/** Weights for {@link GL16_X}. */
const GL16_W: readonly number[] = [
	0.027152459411754095, 0.06225352393864789, 0.09515851168249247,
	0.12462897125553387, 0.14959598881657673, 0.16915651939500254,
	0.18260341504492359, 0.18945061045506845, 0.18945061045506845,
	0.18260341504492359, 0.16915651939500254, 0.14959598881657673,
	0.12462897125553387, 0.09515851168249247, 0.06225352393864789,
	0.027152459411754095,
]
/* eslint-enable no-loss-of-precision */

function gaussLegendre16(
	a: number,
	b: number,
	f: (t: number) => number
): number {
	const mid = (a + b) * 0.5
	const half = (b - a) * 0.5
	let sum = 0
	for (let i = 0; i < 16; i++) {
		sum += GL16_W[i]! * f(mid + half * GL16_X[i]!)
	}
	return half * sum
}

/**
 * Normalizes the angle to the range of [-180, 180].
 * @param angle The angle to normalize.
 * @returns The normalized angle.
 */
function normalizeAngle(angle: number) {
	return ((angle + 180) % 360) - 180
}

/**
 * Checks if the angle range crosses the given angle.
 * @param angle The angle to check. Always in the range of [-π, π].
 * @param angleRange The angle range to check.
 */
function crossAtAngle(angle: number, [startAngle, endAngle]: AngleRange) {
	if (startAngle === endAngle) {
		return false
	} else if (startAngle < endAngle) {
		// Clockwise
		if (startAngle < angle) {
			return angle < endAngle
		} else {
			// Consider the case when the angle range crosses [-1, 0]
			return angle < endAngle - 360
		}
	} else {
		// Counterclockwise
		if (angle < startAngle) {
			return endAngle < angle
		} else {
			// Consider the case when the angle range crosses [0, 1]
			return angle < endAngle + 360
		}
	}
}

function unitToTime(
	arc: BareSegmentA,
	unitLocation: UnitSegmentLocation
): number {
	const targetUnit = normalizeOffset(
		typeof unitLocation === 'number' ? unitLocation : unitLocation.unit,
		1
	)

	// For a circle
	const [rx, ry] = arc.args[0]
	if (scalar.approx(rx, ry)) {
		return targetUnit
	}

	// For an elliptic arc
	const {
		radii,
		angles: [startAngle, endAngle],
	} = Arc.toCenterParameterization(arc)

	let lowerTime = 0
	let upperTime = 1

	let time: number

	for (let i = 0; i < 16; i++) {
		time = scalar.lerp(lowerTime, upperTime, 0.5)
		const midAngle = scalar.lerp(startAngle, endAngle, time)

		const unitAtTime =
			Arc.ellipticArcLength(radii, [startAngle, midAngle]) / Arc.length(arc)

		if (unitAtTime < targetUnit) {
			lowerTime = time
		} else {
			upperTime = time
		}

		if (scalar.approx(unitAtTime, targetUnit)) {
			break
		}
	}

	return time!
}
