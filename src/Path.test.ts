import '../jest.setup'

import {Path} from './Path'

describe('Path', () => {
	it('should compute `toSVG` correctly', () => {
		const path: Path = [
			['M', [0, 0]],
			['L', [1, 1]],
			['L', [2, 2]],
			['Q', [3, 3], [4, 4]],
			['A', [1, 1], 1, false, true, [5, 5]],
			['Z'],
		]

		expect(Path.toSVG(path)).toEqual(
			'M 0,0 L 1,1 L 2,2 Q 3,3 4,4 A 1,1 1 0 1 5,5 Z'
		)
	})
})
