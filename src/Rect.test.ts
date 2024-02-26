import {describe, expect, it} from 'vitest'

import {Rect} from './Rect'

describe('unite', () => {
	it('should unite multiple rects correctly', () => {
		const bbox1: Rect = [
			[0, 0],
			[2, 2],
		]
		const bbox2: Rect = [
			[1, 1],
			[3, 3],
		]
		const bbox3: Rect = [
			[-1, -1],
			[1, 1],
		]
		const result = Rect.unite(bbox1, bbox2, bbox3)
		expect(result).toEqual([
			[-1, -1],
			[3, 3],
		])
	})
})
