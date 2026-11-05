import {Rect} from 'geome'
import {mat2d, vec2} from 'linearly'

import {segmentToVertex} from '../attributes'
import {Curve, type Path, Segment, type Vertex} from '../index'
import {planarPathArea} from '../pathPlanar'
import {type BooleanOptions, unite} from './boolean'
import {fromSegment} from './compound'
import {transform} from './modifiers'

/**
 * A closed curve tracing an open one there and back, so that it can be swept like a region of no area.
 */
function doubled(curve: Curve): Curve {
	if (curve.closed) return curve

	const back = Curve.reverse(curve).vertices
	const first = back.at(-1)!
	return {
		vertices: [
			{
				...curve.vertices[0],
				command: first.command,
				args: first.args,
			} as Vertex,
			...curve.vertices.slice(1),
			...back.slice(1, -1),
		],
		closed: true,
	}
}

/**
 * The boundary of the region the curve sweeps under the motion: the pieces of the curve facing the motion are moved to its end, the others stay, and every switch between the two is joined by a straight line. This is the convolution of the curve with the motion, and the swept region is where its winding number is not zero. Each segment is first cut where its tangent is aligned with the motion, so that no piece faces both ways.
 */
function sweptBoundary(
	curve: Curve,
	matrix: mat2d,
	cutTimes: (seg: Segment) => number[],
	facing: (point: vec2, normal: vec2) => boolean
): Curve {
	const vertices: Vertex[] = []
	let prevMoved: boolean | null = null

	// The normal of a segment points inwards on curves of positive signed area; the pieces
	// facing the motion are those whose outward normal goes along it. A doubled open curve
	// has no area, and either sign moves exactly one of its two passes, which is what is needed.
	const outward = planarPathArea({curves: [curve]}) > 0 ? -1 : 1

	for (const whole of Curve.segments(doubled(curve))) {
		if (Segment.isZero(whole)) continue

		let start = whole.start
		for (const vertex of Segment.divideAtTimes(whole, cutTimes(whole))) {
			const piece = {...vertex, start} as Segment
			start = vertex.point
			if (Segment.isZero(piece)) continue

			const mid = Segment.point(piece, {time: 0.5})
			const moved = facing(
				mid,
				vec2.scale(Segment.normal(piece, {time: 0.5}), outward)
			)

			if (vertices.length === 0 || moved !== prevMoved) {
				const from = moved
					? vec2.transformMat2d(piece.start, matrix)
					: piece.start
				vertices.push({point: from, command: 'L'})
			}

			vertices.push(
				moved
					? transform(fromSegment(piece), matrix).curves[0].vertices[1]
					: segmentToVertex(piece)
			)
			prevMoved = moved
		}
	}

	// When the sweep ends on the side it started, the last vertex closes the curve itself
	const first = vertices[0]
	const last = vertices.at(-1)
	if (
		vertices.length > 1 &&
		first &&
		last &&
		vec2.approx(first.point, last.point)
	) {
		vertices.pop()
		vertices[0] = last
	}

	return {vertices, closed: true}
}

function sweep(
	path: Path,
	matrix: mat2d,
	cutTimes: (seg: Segment) => number[],
	facing: (point: vec2, normal: vec2) => boolean,
	options?: BooleanOptions
): Path {
	const regions = path.curves
		.filter(curve => curve.vertices.length > 1)
		.map(curve => ({
			curves: [sweptBoundary(curve, matrix, cutTimes, facing)],
		}))

	if (regions.length === 0) return {curves: []}

	// The boolean may leave a sliver of no extent where a connector runs along the path
	const {curves} = unite(regions, options)
	const extent = Math.max(
		1,
		...curves.map(curve => Math.max(...Rect.size(Curve.bounds(curve))))
	)
	return {
		curves: curves.filter(
			curve => Math.max(...Rect.size(Curve.bounds(curve))) > 1e-5 * extent
		),
	}
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
export function shadow(
	path: Path,
	direction: vec2,
	length: number,
	options?: BooleanOptions
): Path {
	const delta = vec2.scale(vec2.normalize(direction), length)
	return sweep(
		path,
		mat2d.fromTranslation(delta),
		seg => Segment.tangentTimes(seg, delta),
		(_, normal) => vec2.dot(normal, delta) > 0,
		options
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
export function shadowFrom(
	path: Path,
	origin: vec2,
	scale: number,
	options?: BooleanOptions
): Path {
	return sweep(
		path,
		mat2d.fromScaling(scale, origin),
		seg => Segment.tangentTimesFrom(seg, origin),
		(point, normal) => vec2.dot(normal, vec2.sub(point, origin)) > 0,
		options
	)
}
