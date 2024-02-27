import {vec2} from 'linearly'
import {Vertex} from './Path'

/**
 * Represents a part of curve that spans multiple vertices.
 */
export type MultiSegment<V extends Vertex = Vertex> = {
	start: vec2
	vertices: V[]
}

/**
 * A collection of functions to handle {@link MultiSegment}.
 */
export namespace MultiSegment {
	export function reverse<V extends Vertex = Vertex>(
		ms: MultiSegment<V>
	): MultiSegment<V> {
		const vertices: Vertex[] = []

		for (let i = ms.vertices.length - 1; i >= 0; i--) {
			const point = i >= 1 ? ms.vertices[i - 1].point : ms.start

			const {command, args} = ms.vertices[i]

			if (command === 'L') {
				vertices.push({command: 'L', point})
			} else if (command === 'C') {
				vertices.push({
					command: 'C',
					point,
					args: [args[1], args[0]],
				})
			} else {
				const [radii, xAxisRotation, largeArc, sweep] = args
				vertices.push({
					command: 'A',
					point,
					args: [radii, xAxisRotation, largeArc, !sweep],
				})
			}
		}

		const start = ms.vertices.length > 0 ? ms.vertices[0].point : ms.start

		return {
			start,
			vertices: vertices as V[],
		}
	}
}
