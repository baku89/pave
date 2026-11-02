import {mat2d, vec2} from 'linearly'

import {type Path, Segment, type Vertex} from '../index'
import {unite} from './boolean'
import {fromSegment} from './compound'
import {segments} from './metrics'
import {reverse, transform} from './modifiers'

/**
 * The region swept by each segment when moved by `matrix`: the segment, its moved copy and the lines between their ends. A segment is first cut where it is tangent to its own motion, so that no piece overhangs its ends and the lines between the ends bound the sweep.
 */
function sweptPieces(
	path: Path,
	matrix: mat2d,
	cutTimes: (seg: Segment) => number[]
): Path[] {
	const pieces: Path[] = []

	for (const whole of segments(path)) {
		if (Segment.isZero(whole)) continue

		let start = whole.start
		const parts = Segment.divideAtTimes(whole, cutTimes(whole)).map(vertex => {
			const seg = {...vertex, start} as Segment
			start = vertex.point
			return seg
		})

		for (const seg of parts) {
			if (Segment.isZero(seg)) continue

			const moved = reverse(transform(fromSegment(seg), matrix))
			const [movedEnd, movedStart] = moved.curves[0].vertices

			const vertices: Vertex[] = [
				{point: seg.start, command: 'L'},
				{point: seg.point, command: seg.command, args: seg.args} as Vertex,
				{point: movedEnd.point, command: 'L'},
				movedStart,
			]

			pieces.push({curves: [{vertices, closed: true}]})
		}
	}

	return pieces
}

/**
 * The region the path sweeps when moved by `matrix`, as a closed path: the union of the path, its moved copy and everything in between.
 */
function sweep(
	path: Path,
	matrix: mat2d,
	cutTimes: (seg: Segment) => number[]
): Path {
	const moved = transform(path, matrix)
	return unite([path, moved, ...sweptPieces(path, matrix, cutTimes)])
}

/**
 * The shadow the path casts under a parallel light, as the region swept when the path is moved along `direction` by `length`. The result includes the path itself; subtract the path to get only the cast part. On an isometric drawing this is also the side face of an extruded shape.
 * @param path The path casting the shadow
 * @param direction The direction of the light. Its length does not matter.
 * @param length How far the shadow reaches
 * @returns The closed path of the shadow
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.circle([40, 40], 20)
 * fill(Path.shadow(p, [1, 1], 40), 'skyblue')
 * stroke(p, 'black')
 * ```
 */
export function shadow(path: Path, direction: vec2, length: number): Path {
	const delta = vec2.scale(vec2.normalize(direction), length)
	return sweep(path, mat2d.fromTranslation(delta), seg =>
		Segment.tangentTimes(seg, delta)
	)
}

/**
 * The shadow the path casts under a point light at `origin`, as the region swept when the path is scaled about `origin` by `scale`. The result includes the path itself; subtract the path to get only the cast part.
 * @param path The path casting the shadow
 * @param origin The position of the light
 * @param scale How many times farther from the light the shadow reaches than the path. Values above 1 cast the shadow away from the light.
 * @returns The closed path of the shadow
 * @category Modifiers
 */
export function shadowFrom(path: Path, origin: vec2, scale: number): Path {
	return sweep(path, mat2d.fromScaling(scale, origin), seg =>
		Segment.tangentTimesFrom(seg, origin)
	)
}
