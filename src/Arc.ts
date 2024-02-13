import {mat2d, scalar, vec2} from 'linearly'

import {CommandA, CommandC, Vertex} from './Path'
import {Rect} from './Rect'
import {Segment} from './Segment'

/**
 * The angle range to check. `startAngle` is always in the range of [-π, π], and the `endAngle` is relative angle considering the rotation direction, with start angle as a reference.
 */
type AngleRange = readonly [startAngle: number, endAngle: number]

/**
 * A collection of functions to handle arcs represented with {@link CommandA}.
 */
export namespace Arc {
	/**
	 * Converts the Arc command to a center parameterization that can be used in Context2D.ellipse().
	 * https://observablehq.com/@awhitty/svg-2-elliptical-arc-to-canvas-path2d
	 * @category Utilities
	 * */
	export function toCenterParameterization(arcSegment: Segment<CommandA>) {
		const {start, end, command} = arcSegment
		const [, radii, xAxisRotationDeg, largeArcFlag, sweepFlag] = command
		const xAxisRotation = scalar.rad(xAxisRotationDeg)

		const [x1p, y1p] = vec2.rotate(
			vec2.scale(vec2.sub(start, end), 0.5),
			xAxisRotation
		)

		const [rx, ry] = correctRadii(radii, [x1p, y1p])

		const sign = largeArcFlag !== sweepFlag ? 1 : -1
		const n = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2
		const d = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2

		const [cxp, cyp] = vec2.scale(
			[(rx * y1p) / ry, (-ry * x1p) / rx],
			sign * Math.sqrt(Math.abs(n / d))
		)

		const center = vec2.add(
			vec2.rotate([cxp, cyp], -xAxisRotation),
			vec2.lerp(start, end, 0.5)
		)

		const a = vec2.div(vec2.sub([x1p, y1p], [cxp, cyp]), [rx, ry])
		const b = vec2.div(vec2.sub(vec2.zero, [x1p, y1p], [cxp, cyp]), [rx, ry])
		const startAngle = vec2.angle(a)
		const deltaAngle0 = vec2.angle(a, b) % (2 * Math.PI)

		let deltaAngle: number
		if (!sweepFlag && deltaAngle0 > 0) {
			deltaAngle = deltaAngle0 - 2 * Math.PI
		} else if (sweepFlag && deltaAngle0 < 0) {
			deltaAngle = deltaAngle0 + 2 * Math.PI
		} else {
			deltaAngle = deltaAngle0
		}

		const endAngle = startAngle + deltaAngle

		return {
			center,
			radii: [rx, ry] as vec2,
			angles: [startAngle, endAngle] as AngleRange,
			xAxisRotation,
			counterclockwise: deltaAngle < 0,
		}

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
	}

	export function approximateByCubicBeziers(
		arc: Segment<CommandA>,
		angle: number
	): Vertex<CommandC>[] {
		const {center, radii, angles, xAxisRotation} = toCenterParameterization(arc)

		const [startAngle, endAngle] = angles

		const n = Math.ceil(Math.abs(endAngle - startAngle) / angle)
		const dir = Math.sign(endAngle - startAngle)
		const delta = (endAngle - startAngle) / n

		const xform = mat2d.scale(
			mat2d.rotate(mat2d.fromTranslation(center), xAxisRotation),
			radii
		)

		const beziers: Vertex<CommandC>[] = []

		for (let i = 0; i < n; i++) {
			const a0 = startAngle + i * delta
			const a1 = startAngle + (i + 1) * delta

			// Calculate the arc for unit circle
			// without considering the radii and rotation
			const start = vec2.direction(a0)
			const end = vec2.direction(a1)

			const handleLength = (4 / 3) * Math.tan((a1 - a0) / 4)

			const control1 = vec2.scaleAndAdd(
				start,
				vec2.direction(a0 + (Math.PI / 2) * dir),
				handleLength
			)

			const control2 = vec2.scaleAndAdd(
				end,
				vec2.direction(a1 - (Math.PI / 2) * dir),
				handleLength
			)

			// Apply the transformation to the unit circle
			const vertex: Vertex<CommandC> = {
				point: vec2.transformMat2d(end, xform),
				command: [
					'C',
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
	 * @param arc The arc segment to calculate
	 * @returns The bound of the arc
	 * @example
	 * ```js:pave
	 * const center = [50, 50]
	 * const startAngle = scalar.rad(-120)
	 * const endAngle = scalar.rad(30)
	 * const radius = 40
	 * const start = vec2.add(center, vec2.direction(startAngle, 40))
	 * const end = vec2.add(center, vec2.direction(endAngle, 40))
	 *
	 * const arc = Path.arc([50, 50], 40, startAngle, endAngle)
	 * stroke(arc, 'skyblue')
	 *
	 * const bound = Arc.bounds({
	 * 	start,
	 * 	end,
	 * 	command: ['A', [radius, radius], 0, false, true]
	 * })
	 *
	 * stroke(Path.rect(...bound), 'tomato')
	 * ```
	 */
	export function bounds(arc: Segment<CommandA>): Rect {
		const {start, end} = arc
		const {center, radii, angles, xAxisRotation} = toCenterParameterization(arc)

		const sy = radii[1] / radii[0]

		const angleAtXmax = -Math.atan2(
			sy * Math.sin(xAxisRotation),
			Math.cos(xAxisRotation)
		)
		const angleAtXmin = normalizeAngle(angleAtXmax + Math.PI)

		const angleAtYmax = -Math.atan2(
			-sy * Math.cos(xAxisRotation),
			Math.sin(xAxisRotation)
		)

		const angleAtYmin = normalizeAngle(angleAtYmax + Math.PI)

		const xform = mat2d.scale(
			mat2d.rotate(mat2d.fromTranslation(center), xAxisRotation),
			radii
		)

		let xMax = Math.max(start[0], end[0])
		let xMin = Math.min(start[0], end[0])
		let yMax = Math.max(start[1], end[1])
		let yMin = Math.min(start[1], end[1])

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
	}

	/**
	 * https://gist.github.com/timo22345/9413158#file-flatten-js-L443
	 */
	export function transform(
		arc: Segment<CommandA>,
		matrix: mat2d
	): Segment<CommandA> {
		const epsilon = 0.0000000001

		let {
			start,
			end,
			// eslint-disable-next-line prefer-const
			command: [, [rx, ry], ax, largeArc, sweep],
		} = arc

		// We consider the current ellipse as image of the unit circle
		// by first scale(rx,ry) and then rotate(ax) ...
		// So we apply ma =  m x rotate(ax) x scale(rx,ry) to the unit circle.

		const c = Math.cos(scalar.rad(ax)),
			s = Math.sin(scalar.rad(ax))
		const ma = [
			rx * (matrix[0] * c + matrix[2] * s),
			rx * (matrix[1] * c + matrix[3] * s),
			ry * (-matrix[0] * s + matrix[2] * c),
			ry * (-matrix[1] * s + matrix[3] * c),
		]

		// ma * transpose(ma) = [ J L ]
		//                      [ L K ]
		// L is calculated later (if the image is not a circle)
		const J = ma[0] * ma[0] + ma[2] * ma[2],
			K = ma[1] * ma[1] + ma[3] * ma[3]

		// the discriminant of the characteristic polynomial of ma * transpose(ma)
		let D =
			((ma[0] - ma[3]) * (ma[0] - ma[3]) + (ma[2] + ma[1]) * (ma[2] + ma[1])) *
			((ma[0] + ma[3]) * (ma[0] + ma[3]) + (ma[2] - ma[1]) * (ma[2] - ma[1]))

		// the "mean eigenvalue"
		const JK = (J + K) / 2

		// check if the image is (almost) a circle
		if (D < epsilon * JK) {
			// if it is
			rx = ry = Math.sqrt(JK)
			ax = 0
		} else {
			// if it is not a circle
			const L = ma[0] * ma[1] + ma[2] * ma[3]

			D = Math.sqrt(D)

			// {l1,l2} = the two eigen values of ma * transpose(ma)
			const l1 = JK + D / 2,
				l2 = JK - D / 2
			// the x - axis - rotation angle is the argument of the l1 - eigenvector
			ax =
				Math.abs(L) < epsilon && Math.abs(l1 - K) < epsilon
					? 90
					: (Math.atan(
							Math.abs(L) > Math.abs(l1 - K) ? (l1 - J) / L : L / (l1 - K)
					  ) *
							180) /
					  Math.PI

			// if ax > 0 => rx = sqrt(l1), ry = sqrt(l2), else exchange axes and ax += 90
			if (ax >= 0) {
				// if ax in [0,90]
				rx = Math.sqrt(l1)
				ry = Math.sqrt(l2)
			} else {
				// if ax in ]-90,0[ => exchange axes
				ax += 90
				rx = Math.sqrt(l2)
				ry = Math.sqrt(l1)
			}
		}

		// flip sweep-flag if matrix is not orientation-preserving
		if (mat2d.det(matrix) < 0) {
			sweep = !sweep
		}

		// Transform end point as usual (without translation for relative notation)
		start = vec2.transformMat2d(start, matrix)
		end = vec2.transformMat2d(end, matrix)

		return {
			start,
			end,
			command: ['A', [rx, ry], ax, largeArc, sweep],
		}
	}
}

/**
 * Normalizes the angle to the range of [-π, π].
 * @param angle The angle to normalize.
 * @returns The normalized angle.
 */
function normalizeAngle(angle: number) {
	return ((angle + Math.PI) % (2 * Math.PI)) - Math.PI
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
			return angle < endAngle - 2 * Math.PI
		}
	} else {
		// Counterclockwise
		if (angle < startAngle) {
			return endAngle < angle
		} else {
			// Consider the case when the angle range crosses [0, 1]
			return angle < endAngle + 2 * Math.PI
		}
	}
}
