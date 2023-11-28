import '../jest.setup'

import {BBox} from './BBox'

describe('unite', () => {
	it('should unite multiple bounding boxes correctly', () => {
		const bbox1: BBox = [
			[0, 0],
			[2, 2],
		]
		const bbox2: BBox = [
			[1, 1],
			[3, 3],
		]
		const bbox3: BBox = [
			[-1, -1],
			[1, 1],
		]
		const result = BBox.unite(bbox1, bbox2, bbox3)
		expect(result).toEqual([
			[-1, -1],
			[3, 3],
		])
	})
})
