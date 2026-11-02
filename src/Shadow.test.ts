import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {contains} from './path/queries'
import {shadow, shadowFrom} from './path/shadow'

describe('shadow', () => {
	it('sweeps a square into a hexagon-like region', () => {
		const square = Path.rect([0, 0], [100, 100])
		const s = shadow(square, [1, 0], 100)
		expect(Math.abs(Path.area(s))).toBeCloseTo(20000, 1)
		expect(contains(s, [150, 50])).toBe(true)
	})

	it('covers the whole sweep of a circle', () => {
		const circle = Path.circle([0, 0], 50)
		const s = shadow(circle, [1, 1], 100)
		expect(contains(s, [50, 50])).toBe(true)
		expect(contains(s, [0, 0])).toBe(true)
		expect(contains(s, [-40, 40])).toBe(false)
		expect(Math.abs(Path.area(s))).toBeCloseTo(Math.PI * 2500 + 100 * 100, -1)
	})

	it('casts from a point', () => {
		const circle = Path.circle([0, 100], 20)
		const s = shadowFrom(circle, [0, 0], 2)
		expect(contains(s, [0, 150])).toBe(true)
		expect(contains(s, [0, 60])).toBe(false)
		const b = Path.bounds(s)
		expect(b[1][1]).toBeCloseTo(240, 2)
	})
})
