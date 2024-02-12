import {mat2d, scalar, vec2} from 'linearly'

import {Command, CommandA, CommandC, Vertex} from './Path'

/**
 * A segment of a path, which consists of a starting point, end point, and an interpolation command.
 * @category Type Aliases
 */
export interface Segment<C extends Command = Command> {
	start: vec2
	end: vec2
	command: C
}

/**
 * A collection of functions to handle {@link Segment}.
 */
export namespace Segment {
	/**
	 * Converts the Arc command to a center parameterization that can be used in Context2D.ellipse().
	 * https://observablehq.com/@awhitty/svg-2-elliptical-arc-to-canvas-path2d
	 * @category Utilities
	 * */
	export function arcCommandToCenterParameterization(
		arcSegment: Segment<CommandA>
	) {
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
			angles: [startAngle, endAngle] as vec2,
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

	export function approximateArcWithCubicBeziers(
		arc: Segment<CommandA>,
		angle: number
	): Vertex<CommandC>[] {
		const {center, radii, angles, xAxisRotation} =
			arcCommandToCenterParameterization(arc)

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
}
