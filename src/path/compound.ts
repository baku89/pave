import type {Curve} from '../Curve'
import type {Path} from '../Path'
import type {Segment} from '../Segment'
import type {Vertex} from './types'

/**
 * Creates an open path consist of only a single command.
 * @param segment The segment to create
 * @returns The newly created path
 * @category Primitives
 */
export function fromSegment(segment: Segment): Path {
	return {
		curves: [
			{
				vertices: [
					{point: segment.start, command: 'L'},
					{
						point: segment.point,
						command: segment.command,
						args: segment.args,
					} as Vertex,
				],
				closed: false,
			},
		],
	}
}

/**
 * Merges the given paths into a single path. Unlike {@link join} or {@link unite}, the vertices are not connected, and it simply returns compound path.
 * @category Modifiers
 */
export function merge(pathOrCurves: (Path | Curve)[]): Path {
	return {
		curves: pathOrCurves.flatMap(pc => ('curves' in pc ? pc.curves : [pc])),
	}
}
