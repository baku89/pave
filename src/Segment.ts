import {scalar, vec2} from 'linearly'

import {Command, CommandA} from './Command'

/**
 * A segment of a path, which consists of a pair of starting point and a command.
 * @category Type Aliases
 */
export type Segment = readonly [start: vec2, command: Command]

/**
 * A collection of functions to handle {@link Segment}.
 */
export namespace Segment {
	/**
	 * Converts the Arc command to a center parameterization that can be used in Context2D.ellipse().
	 * https://observablehq.com/@awhitty/svg-2-elliptical-arc-to-canvas-path2d
	 * @category Utilities
	 * */
	export function arcCommandToCenterParameterization([start, command]: [
		vec2,
		CommandA,
	]) {
		const [, radii, xAxisRotationDeg, largeArcFlag, sweepFlag, end] = command
		const xAxisRotation = scalar.rad(xAxisRotationDeg)

		const [x1p, y1p] = vec2.rotate(
			vec2.scale(vec2.sub(start, end), 0.5),
			xAxisRotation
		)

		const [rx, ry] = correctRadii(radii, [x1p, y1p])

		const sign = largeArcFlag !== sweepFlag ? 1 : -1
		const n = pow(rx) * pow(ry) - pow(rx) * pow(y1p) - pow(ry) * pow(x1p)
		const d = pow(rx) * pow(y1p) + pow(ry) * pow(x1p)

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
		const startAngle = vec2Angle(vec2.unitX, a)
		const deltaAngle0 = vec2Angle(a, b) % (2 * Math.PI)

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
			angles: [startAngle, endAngle] as vec2,
			xAxisRotation,
			counterclockwise: deltaAngle < 0,
		}

		function pow(n: number) {
			return n * n
		}

		function vec2Angle(u: vec2, v: vec2) {
			const [ux, uy] = u
			const [vx, vy] = v
			const sign = ux * vy - uy * vx >= 0 ? 1 : -1
			
			const a = Math.acos(vec2.dot(u, v) / (vec2.sqrLen(u) * vec2.sqrLen(v)));
			// Handle invalid angle by returning a default value
			if (isNaN(a) || a < 0 || a > Math.PI) {
				return Math.PI;
			}
			
			return (
				sign * a
			)
		}

		function correctRadii(signedRadii: vec2, p: vec2): vec2 {
			const [signedRx, signedRy] = signedRadii
			const [x1p, y1p] = p
			const prx = Math.abs(signedRx)
			const pry = Math.abs(signedRy)

			const A = pow(x1p) / pow(prx) + pow(y1p) / pow(pry)

			const rx = A > 1 ? Math.sqrt(A) * prx : prx
			const ry = A > 1 ? Math.sqrt(A) * pry : pry

			return [rx, ry]
		}
	}
}
