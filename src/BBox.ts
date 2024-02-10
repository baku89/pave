import {vec2} from 'linearly'

/**
 * A bounding box represented as a tuple of two diagonal points. The first point always must be always the minimum coordinates and the second point must be the maximum coordinates.
 * @category Type Aliases
 */
export type BBox = readonly [min: vec2, max: vec2]

/**
 * Functions for manipulating bounding boxes represented as {@link BBox}.
 */
export namespace BBox {
	/**
	 * Creates a bounding box from the given DOMRect.
	 * @param domRect The DOMRect to create a bounding box from
	 * @returns The created bounding box
	 */
	export function fromDOMRect(domRect: DOMRect): BBox {
		return [
			[domRect.left, domRect.top],
			[domRect.right, domRect.bottom],
		]
	}

	/**
	 * Creates a bounding box that contains all the given points.
	 * @param points The points to create a bounding box from
	 * @returns The created bounding box
	 */
	export function fromPoints(...points: vec2[]): BBox {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity

		for (const [x, y] of points) {
			minX = Math.min(minX, x)
			minY = Math.min(minY, y)
			maxX = Math.max(maxX, x)
			maxY = Math.max(maxY, y)
		}

		return [
			[minX, minY],
			[maxX, maxY],
		]
	}

	/**
	 * Calculates the size of the given bounding box.
	 * @param bbox The bounding box to calculate the size of
	 * @returns The size of the bounding box
	 */
	export function size(bbox: BBox): vec2 {
		const [min, max] = bbox
		return vec2.sub(max, min)
	}

	/**
	 * Calculates the center of the given bounding box.
	 * @param bbox The bounding box to calculate the center of
	 * @returns The center of the bounding box
	 */
	export function center(bbox: BBox): vec2 {
		const [min, max] = bbox
		return vec2.lerp(min, max, 0.5)
	}

	/**
	 * Returns the left coordinate of the given bounding box.
	 * @param bbox The bounding box to get the left of
	 * @returns The left coordinate of the bounding box
	 */
	export function left(bbox: BBox): number {
		return bbox[0][0]
	}

	/**
	 * Returns the top coordinate of the given bounding box.
	 * @param bbox The bounding box to get the top of
	 * @returns The top coordinate of the bounding box
	 */
	export function top(bbox: BBox): number {
		return bbox[0][1]
	}

	/**
	 * Returns the right coordinate of the given bounding box.
	 * @param bbox The bounding box to get the right of
	 * @returns The right coordinate of the bounding box
	 */
	export function right(bbox: BBox): number {
		return bbox[1][0]
	}

	/**
	 * Returns the bottom coordinate of the given bounding box.
	 * @param bbox The bounding box to get the bottom of
	 * @returns The bottom coordinate of the bounding box
	 */
	export function bottom(bbox: BBox): number {
		return bbox[1][1]
	}

	/**
	 * Scales the given bounding box by the given ratio.
	 * @param bbox The bounding box to scale
	 * @param scale The ratio to scale the bounding box by
	 * @returns The scaled bounding box
	 */
	export function scale(bbox: BBox, scale: vec2 | number): BBox {
		if (typeof scale === 'number') {
			scale = [scale, scale]
		}

		const [min, max] = bbox

		return [vec2.mul(min, scale), vec2.mul(max, scale)]
	}

	/**
	 * Translates the given bounding box by the given offset.
	 * @param bbox The bounding box to translate
	 * @param offset The offset to translate the bounding box by
	 * @returns The translated bounding box
	 */
	export function translate(bbox: BBox, offset: vec2): BBox {
		const [min, max] = bbox
		return [vec2.add(min, offset), vec2.add(max, offset)]
	}

	/**
	 * Checks if the given bounding box contains the other bounding box.
	 * @param source The source bounding box
	 * @param target The target bounding box to check if it's contained in the source bounding box
	 * @returns True if the source bounding box contains the target bounding box, false otherwise
	 */
	export function contains(source: BBox, target: BBox): boolean {
		const [min, max] = source
		const [targetMin, targetMax] = target
		return (
			targetMin[0] >= min[0] &&
			targetMin[1] >= min[1] &&
			targetMax[0] <= max[0] &&
			targetMax[1] <= max[1]
		)
	}

	/**
	 * Checks if the given bounding box contains the given point.
	 * @param bbox The source bounding box
	 * @param point The point to check if it's contained in the source bounding box
	 * @returns True if the bounding box contains the point, false otherwise
	 */
	export function containsPoint(bbox: BBox, point: vec2): boolean {
		const [min, max] = bbox
		return (
			point[0] >= min[0] &&
			point[0] <= max[0] &&
			point[1] >= min[1] &&
			point[1] <= max[1]
		)
	}

	/**
	 * Checks if the given bounding boxes intersect.
	 * @param a The first bounding box
	 * @param b The second bounding box
	 * @returns True if the bounding boxes intersect, false otherwise
	 */
	export function intersects(a: BBox, b: BBox): boolean {
		const [amin, amax] = a
		const [bmin, bmax] = b
		return (
			amin[0] <= bmax[0] &&
			amax[0] >= bmin[0] &&
			amin[1] <= bmax[1] &&
			amax[1] >= bmin[1]
		)
	}

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

	/**
	 * Calculates the intersection of the given bounding boxes.
	 * @param bboxes The bounding boxes to intersect
	 * @returns The intersected bounding box
	 */
	export function intersect(...bboxes: BBox[]): BBox {
		let minX = -Infinity,
			minY = -Infinity,
			maxX = Infinity,
			maxY = Infinity

		for (const [min, max] of bboxes) {
			minX = Math.max(minX, min[0])
			minY = Math.max(minY, min[1])
			maxX = Math.min(maxX, max[0])
			maxY = Math.min(maxY, max[1])
		}

		return [
			[minX, minY],
			[maxX, maxY],
		]
	}
}
