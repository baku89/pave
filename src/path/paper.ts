import {vec2} from 'linearly'
import paper from 'paper'

import {Arc} from '../Arc'
import {ensurePaperScope} from '../paperScope'
import type {Path} from '../Path'
import {memoize} from '../utils'
import {paperPointToVec2} from './renderContext'
import type {Vertex} from './types'

/**
 * Converts the given path to paper.Path
 * @see http://paperjs.org/reference/pathitem/
 * @param path The path to convert
 * @returns The newly created paper.Path instance
 * @category Converters
 */
export function toPaperPath(path: Path): paper.Path | paper.CompoundPath {
	ensurePaperScope()
	const paperPaths = path.curves.map(({vertices, closed}) => {
		const paperPath = new paper.Path()
		let prev: vec2 | undefined

		const firstVertex = vertices.at(0)

		if (firstVertex) {
			paperPath.moveTo(toPoint(firstVertex.point))
			prev = firstVertex.point

			vertices = vertices.slice(1)

			if (closed) {
				vertices.push(firstVertex)
			}
		}

		for (const {point, command, args} of vertices) {
			if (command === 'L') {
				paperPath.lineTo(toPoint(point))
			} else if (command === 'C') {
				paperPath.cubicCurveTo(
					toPoint(args[0]),
					toPoint(args[1]),
					toPoint(point)
				)
			} else {
				const beziers = Arc.approximateByCubicBeziers(
					{start: prev!, point, args},
					90
				)

				for (const {point, args} of beziers) {
					paperPath.cubicCurveTo(
						toPoint(args[0]),
						toPoint(args[1]),
						toPoint(point)
					)
				}
			}

			prev = point
		}

		if (closed) {
			paperPath.closePath()
		}

		return paperPath
	})

	// Prevents the memory leak by clearing the project after the conversion
	setTimeout(() => paper.project.clear(), 0)

	return paperPaths.length > 1
		? new paper.CompoundPath({children: paperPaths})
		: paperPaths[0]

	function toPoint(point: vec2): paper.Point {
		return new paper.Point(point[0], point[1])
	}
}

/**
 * Creates a path from the given paper.Path instance.
 * @param arg The paper.Path instance to convert
 * @returns The newly created path
 * @category Converters
 */
export const fromPaperPath = memoize((paperPath: paper.PathItem): Path => {
	const paperPaths =
		paperPath instanceof paper.CompoundPath
			? (paperPath.children as paper.Path[])
			: ([paperPath] as paper.Path[])

	const paths = paperPaths.map(({curves, closed}) => {
		const vertices: Vertex[] = curves.map(curve => {
			const {point1, point2, handle1, handle2} = curve
			if (curve.isStraight()) {
				return {point: paperPointToVec2(point2), command: 'L'}
			} else {
				return {
					point: paperPointToVec2(point2),
					command: 'C',
					args: [
						paperPointToVec2(point1.add(handle1)),
						paperPointToVec2(point2.add(handle2)),
					],
				}
			}
		})

		if (closed) {
			const lastVertex = vertices.at(-1)!
			vertices.pop()
			vertices.unshift(lastVertex)
		} else {
			vertices.unshift({
				point: paperPointToVec2(curves[0].point1),
				command: 'L',
			})
		}

		return {vertices, closed}
	})

	return {curves: paths}
})
