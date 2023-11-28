import {vec2} from 'linearly'

/**
 * A bounding box represented as a tuple of two diagonal points.
 */
export type BBox = readonly [min: vec2, max: vec2]

/**
 * Functions for manipulating bounding boxes represented as {@link BBox}.
 */
export namespace BBox {
	/**
	 * Unites the given bounding boxes into a single bounding box.
	 * @param bboxes The bounding boxes to unite
	 * @returns The united bounding box
	 */
	export function unite(...bboxes: BBox[]): BBox {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity

		for (const [min, max] of bboxes) {
			minX = Math.min(minX, min[0])
			minY = Math.min(minY, min[1])
			maxX = Math.max(maxX, max[0])
			maxY = Math.max(maxY, max[1])
		}

		return [
			[minX, minY],
			[maxX, maxY],
		]
	}
}
