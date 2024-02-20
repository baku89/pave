import {vec2} from 'linearly'

/**
 * A 2D rect represented as a tuple of two diagonal points. It must be guaranteed that the first point is the minimum and the second one is the maximum in the x and y axes.
 * @category Types
 */
export type Rect = readonly [min: vec2, max: vec2]

/**
 * Functions for manipulating rects represented as {@link Rect}.
 */
export namespace Rect {
	/**
	 * Creates a rect from the given DOMRect.
	 * @param domRect The DOMRect to create a rect from
	 * @returns The created rect
	 * @category Generators
	 */
	export function fromDOMRect(domRect: DOMRect): Rect {
		return [
			[domRect.left, domRect.top],
			[domRect.right, domRect.bottom],
		]
	}

	/**
	 * Creates a rect that contains all the given points.
	 * @param points The points to create a rect from
	 * @returns The created rect
	 * @category Generators
	 */
	export function fromPoints(...points: vec2[]): Rect {
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
	 * Creates a rect from the minimum point and the size.
	 * @param min Top-left point of the rect, in Y-down coordinates such as SVG
	 * @param size The size of the rect.
	 * @returns The created rect
	 * @category Generators
	 */
	export function bySize(min: vec2, size: vec2): Rect {
		return fromPoints(min, vec2.add(min, size))
	}

	/**
	 * Creates a rect from the center and the size.
	 * @param center The center of the rect
	 * @param size The size of the rect
	 * @returns The created rect
	 * @category Generators
	 */
	export function fromCenter(center: vec2, size: vec2): Rect {
		const halfSize = vec2.scale(size, 0.5)
		return fromPoints(vec2.sub(center, halfSize), vec2.scale(size, 2))
	}

	/**
	 * Calculates the size of the given rect.
	 * @param bbox The rect to calculate the size of
	 * @returns The size of the rect
	 * @category Properties
	 */
	export function size(bbox: Rect): vec2 {
		const [min, max] = bbox
		return vec2.sub(max, min)
	}

	/**
	 * Calculates the center of the given rect.
	 * @param bbox The rect to calculate the center of
	 * @returns The center of the rect
	 * @category Properties
	 */
	export function center(bbox: Rect): vec2 {
		const [min, max] = bbox
		return vec2.lerp(min, max, 0.5)
	}

	/**
	 * Returns the left coordinate of the given rect in Y-down coordinates such as SVG.
	 * @param bbox The rect to get the left of
	 * @returns The left coordinate of the rect
	 * @category Properties
	 */
	export function left(bbox: Rect): number {
		return bbox[0][0]
	}

	/**
	 * Returns the top coordinate of the given rect in Y-down coordinates such as SVG.
	 * @param bbox The rect to get the top of
	 * @returns The top coordinate of the rect
	 * @category Properties
	 */
	export function top(bbox: Rect): number {
		return bbox[0][1]
	}

	/**
	 * Returns the right coordinate of the given rect in Y-down coordinates such as SVG.
	 * @param bbox The rect to get the right of
	 * @returns The right coordinate of the rect
	 * @category Properties
	 */
	export function right(bbox: Rect): number {
		return bbox[1][0]
	}

	/**
	 * Returns the bottom coordinate of the given rect in Y-down coordinates such as SVG.
	 * @param bbox The rect to get the bottom of
	 * @returns The bottom coordinate of the rect
	 * @category Properties
	 */
	export function bottom(bbox: Rect): number {
		return bbox[1][1]
	}

	/**
	 * Scales the given rect by the given ratio.
	 * @param bbox The rect to scale
	 * @param scale The ratio to scale the rect by
	 * @returns The scaled rect
	 */
	export function scale(bbox: Rect, scale: vec2 | number): Rect {
		if (typeof scale === 'number') {
			scale = [scale, scale]
		}

		const [min, max] = bbox

		return [vec2.mul(min, scale), vec2.mul(max, scale)]
	}

	/**
	 * Translates the given rect by the given offset.
	 * @param bbox The rect to translate
	 * @param offset The offset to translate the rect by
	 * @returns The translated rect
	 */
	export function translate(bbox: Rect, offset: vec2): Rect {
		const [min, max] = bbox
		return [vec2.add(min, offset), vec2.add(max, offset)]
	}

	/**
	 * Checks if the given rect contains the other rect.
	 * @param source The source rect
	 * @param target The target rect to check if it's contained in the source rect
	 * @returns True if the source rect contains the target rect, false otherwise
	 */
	export function contains(source: Rect, target: Rect): boolean {
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
	 * Checks if the given rect contains the given point.
	 * @param bbox The source rect
	 * @param point The point to check if it's contained in the source rect
	 * @returns True if the rect contains the point, false otherwise
	 */
	export function containsPoint(bbox: Rect, point: vec2): boolean {
		const [min, max] = bbox
		return (
			point[0] >= min[0] &&
			point[0] <= max[0] &&
			point[1] >= min[1] &&
			point[1] <= max[1]
		)
	}

	/**
	 * Checks if the given rects intersect.
	 * @param a The first rect
	 * @param b The second rect
	 * @returns True if the rects intersect, false otherwise
	 */
	export function intersects(a: Rect, b: Rect): boolean {
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
	 * Unites the given rects into a single rect.
	 * @param rects The rects to unite
	 * @returns The united rect
	 */
	export function unite(...rects: Rect[]): Rect {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity

		for (const [min, max] of rects) {
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
	 * Calculates the intersection of the given rects.
	 * @param rects The rects to intersect
	 * @returns The intersected rect
	 */
	export function intersect(...rects: Rect[]): Rect {
		let minX = -Infinity,
			minY = -Infinity,
			maxX = Infinity,
			maxY = Infinity

		for (const [min, max] of rects) {
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
