import {vec2} from 'linearly'

export type BBox = readonly [min: vec2, max: vec2]

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
