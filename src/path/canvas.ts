import type p5 from 'p5'

import type {Path} from '../Path'
import {memoize} from '../utils'
import {unarc} from './modifiers'
import {drawToRenderingContext} from './renderContext'

/**
 * Creates a Path2D instance with the given path data.
 * @param arg The path to convert
 * @returns The newly created Path2D
 * @category Converters
 */
export const toPath2D = memoize((path: Path): Path2D => {
	const path2d = new Path2D()

	drawToRenderingContext(path, path2d)

	return path2d
})

/**
 * Draws the given path to the context. It calls `context.beginPath` at the beginning, so please note that the sub-paths already stacked on the context are also cleared. Note that you also need to call `context.stroke` or `context.fill` to actually draw the path.
 * @param path The path to draw
 * @param context The Canvas context
 * @category Converters
 */
export function drawToCanvas(
	path: Path,
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
) {
	context.beginPath()
	drawToRenderingContext(path, context)
}

/**
 * Draws the given path to the context. It calls [`beginShape`](https://p5js.org/reference/p5/beginShape) at the beginning, drawing the path with `vertex` and `bezierVertex` commands, then calls [`endShape`](https://p5js.org/reference/p5/endShape) at the end if the curve is closed.
 * @param path The path to draw
 * @param p5Instance The p5.js instance. Pass the instance only if you are using p5.js in instance mode.
 * @category Converters
 */

export function drawToP5(path: Path, p5Instance: p5 | Window = window): void {
	const unarced = unarc(path)

	const p5 = p5Instance as p5

	// For compound paths, call beginShape() only once
	p5.beginShape()

	for (const [i, {vertices, closed}] of unarced.curves.entries()) {
		// For curves after the first one, call beginContour()
		if (i > 0) {
			p5.beginContour()
		}

		const first = vertices.at(0)

		if (first) {
			p5.vertex(...first.point)
		}

		for (const {point, command, args} of vertices.slice(1)) {
			if (command === 'L') {
				p5.vertex(...point)
			} else if (command === 'C') {
				p5.bezierVertex(...args[0], ...args[1], ...point)
			}
		}

		if (closed) {
			if (first) {
				const {point, command, args} = first
				if (command === 'L') {
					p5.vertex(...point)
				} else if (command === 'C') {
					p5.bezierVertex(...args[0], ...args[1], ...point)
				}
			}
		}

		// For curves after the first one, call endContour()
		if (i > 0) {
			p5.endContour()
		}
	}

	// Call endShape() after drawing all curves
	// Specify CLOSE if the first curve is closed
	if (unarced.curves.length > 0 && unarced.curves[0].closed) {
		p5.endShape(p5.CLOSE)
	} else {
		p5.endShape()
	}
}
