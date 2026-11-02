/**
 * Converters between pave paths and Paper.js items.
 *
 * pave does not depend on Paper.js at runtime: {@link toPaperPath} takes the `paper` module as an
 * argument and {@link fromPaperPath} only reads plain properties of the item, so the types below
 * describe just the parts of Paper.js that are touched. Install `paper` yourself when you use them.
 */
import type {vec2} from 'linearly'

import {Arc} from '../Arc'
import type {Path} from '../Path'
import {memoize} from '../utils'
import type {Vertex} from './types'

/**
 * The parts of a Paper.js point that the converters read and write.
 * @category Converters
 */
export interface PaperPointLike {
	x: number
	y: number
}

/**
 * The parts of a `paper.Path` that {@link toPaperPath} writes.
 * @category Converters
 */
export interface PaperPathLike {
	moveTo(point: PaperPointLike): void
	lineTo(point: PaperPointLike): void
	cubicCurveTo(
		handle1: PaperPointLike,
		handle2: PaperPointLike,
		to: PaperPointLike
	): void
	closePath(): void
}

/**
 * The parts of the `paper` module that {@link toPaperPath} needs. Pass the module itself (`import paper from 'paper'`).
 * @category Converters
 */
export interface PaperNamespace {
	Point: new (x: number, y: number) => PaperPointLike
	Path: new (props: {insert: boolean}) => PaperPathLike
	CompoundPath: new (props: {
		children: PaperPathLike[]
		insert: boolean
	}) => unknown
}

/**
 * The parts of a `paper.Curve` that {@link fromPaperPath} reads.
 * @category Converters
 */
export interface PaperCurveLike {
	point1: PaperPointLike
	point2: PaperPointLike
	handle1: PaperPointLike
	handle2: PaperPointLike
	isStraight(): boolean
}

/**
 * The parts of a `paper.Path` or `paper.CompoundPath` that {@link fromPaperPath} reads.
 * @category Converters
 */
export interface PaperPathItemLike {
	className: string
	closed?: boolean
	curves?: readonly PaperCurveLike[]
	children?: readonly unknown[]
}

/**
 * Converts the given path to a `paper.Path`, or a `paper.CompoundPath` when it has several curves.
 * The items are created with `insert: false`, so they are not added to the active project.
 * @see http://paperjs.org/reference/pathitem/
 * @param path The path to convert
 * @param paper The `paper` module
 * @returns The newly created Paper.js item
 * @category Converters
 *
 * @example
 * ```ts
 * import paper from 'paper'
 * const item = Path.toPaperPath(path, paper)
 * ```
 */
export function toPaperPath<P extends PaperNamespace>(
	path: Path,
	paper: P
): InstanceType<P['Path']> | InstanceType<P['CompoundPath']> {
	const paperPaths = path.curves.map(({vertices, closed}) => {
		const paperPath = new paper.Path({insert: false})
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
				const beziers = Arc.approximateByCubicBeziers({
					start: prev!,
					point,
					args,
				})

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

	return paperPaths.length > 1
		? (new paper.CompoundPath({
				children: paperPaths,
				insert: false,
			}) as InstanceType<P['CompoundPath']>)
		: (paperPaths[0] as InstanceType<P['Path']>)

	function toPoint(point: vec2): PaperPointLike {
		return new paper.Point(point[0], point[1])
	}
}

/**
 * Creates a path from the given `paper.Path` or `paper.CompoundPath`.
 * @param item The Paper.js item to convert
 * @returns The newly created path
 * @category Converters
 */
export const fromPaperPath = memoize((item: PaperPathItemLike): Path => {
	const paperPaths =
		item.className === 'CompoundPath'
			? ((item.children ?? []) as PaperPathItemLike[])
			: [item]

	const curves = paperPaths.map(({curves = [], closed = false}) => {
		const vertices: Vertex[] = curves.map(curve => {
			const {point1, point2, handle1, handle2} = curve
			if (curve.isStraight()) {
				return {point: toVec2(point2), command: 'L'}
			} else {
				return {
					point: toVec2(point2),
					command: 'C',
					args: [
						[point1.x + handle1.x, point1.y + handle1.y],
						[point2.x + handle2.x, point2.y + handle2.y],
					],
				}
			}
		})

		if (closed) {
			const lastVertex = vertices.at(-1)
			if (lastVertex) {
				vertices.pop()
				vertices.unshift(lastVertex)
			}
		} else if (curves.length > 0) {
			vertices.unshift({point: toVec2(curves[0].point1), command: 'L'})
		}

		return {vertices, closed}
	})

	return {curves}

	function toVec2(point: PaperPointLike): vec2 {
		return [point.x, point.y]
	}
})
