import {describe, expect, it} from 'vitest'

import {Path} from './index'

const boundsOf = (d: string) => Path.bounds(Path.fromD(d))

describe('path data', () => {
	it('has horizontal and vertical lines, absolute and relative', () => {
		expect(Path.toD(Path.fromD('M1,2 H5 V7'))).toBe('M 1,2 L 5,2 L 5,7')
		expect(Path.toD(Path.fromD('M1,2 h4 v5'))).toBe('M 1,2 L 5,2 L 5,7')
	})

	it('goes on from where it is after a curve', () => {
		expect(boundsOf('M0,0 Q5,10 10,0 V5 H0')).toEqual([
			[0, 0],
			[10, 5],
		])
	})

	it('reads what is written as compactly as it can be, as icons are', () => {
		const path = Path.fromD('M5,20q-0.83,0-1.41-0.59T3,18V4Q3,3.17 3.59,2.59T5,2H19ZM7,16H8.1V10H7v4Z')
		expect(path.curves).toHaveLength(2)
		const [[left, top], [right, bottom]] = Path.bounds(path)
		expect(left).toBeCloseTo(3)
		expect(top).toBeCloseTo(2)
		expect(right).toBeCloseTo(19)
		expect(bottom).toBeCloseTo(20)
	})
})
