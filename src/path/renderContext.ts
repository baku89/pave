import type {vec2} from 'linearly'
import {scalar} from 'linearly'

import {Arc} from '../Arc'
import type {Path} from '../Path'
import type {CommandArgsA} from './types'

export function paperPointToVec2(point: {x: number; y: number}): vec2 {
	return [point.x, point.y]
}

function drawArcToRenderingContext(
	context:
		| Path2D
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D,
	start: vec2,
	point: vec2,
	args: CommandArgsA
) {
	const ret = Arc.toCenterParameterization({
		start,
		point,
		args,
	})

	context.ellipse(
		...ret.center,
		...ret.radii,
		scalar.rad(ret.xAxisRotation),
		scalar.rad(ret.angles[0]),
		scalar.rad(ret.angles[1]),
		!ret.sweep
	)
}

export function drawToRenderingContext(
	path: Path,
	context: Path2D | CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
) {
	for (const {vertices, closed} of path.curves) {
		vertices.forEach(({point, command, args}, i) => {
			if (i === 0) {
				context.moveTo(...point)
				return
			}

			if (command === 'L') {
				context.lineTo(...point)
			} else if (command === 'C') {
				context.bezierCurveTo(...args[0], ...args[1], ...point)
			} else if (command === 'A') {
				const start = vertices.at(i - 1)?.point

				if (!start) throw new Error('The start point is not found')

				drawArcToRenderingContext(context, start, point, args)
			}
		})

		if (closed) {
			const first = vertices.at(0)

			if (first) {
				const {point, command, args} = first
				if (command === 'C') {
					context.bezierCurveTo(...args[0], ...args[1], ...point)
				} else if (command === 'A') {
					const prev = vertices.at(-1)?.point

					if (!prev) throw new Error('The previous point is not found')

					drawArcToRenderingContext(context, prev, point, args)
				}

				if (command === 'L' && vertices.length === 1) {
					// If the path is closed and has only one vertex
					// draws a dot so that it behaves like SVG path.
					// Calling .moveTo followed by .lineTo with the same point does not draw anything,
					// so we used .quadraticCurveTo instead
					context.quadraticCurveTo(...point, ...point)
				}
			}

			context.closePath()
		}
	}
}
