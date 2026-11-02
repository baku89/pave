import {describe, expect, it} from 'vitest'

import {solveCubic} from './numeric'

describe('solveCubic', () => {
	it('finds three simple roots in ascending order', () => {
		// (x - 0.2)(x - 0.5)(x - 0.9)
		const roots = solveCubic(1, -1.6, 0.73, -0.09, 0, 1)
		expect(roots.length).toBe(3)
		;[0.2, 0.5, 0.9].forEach((r, i) => expect(roots[i]).toBeCloseTo(r, 12))
	})

	it('only reports roots inside the range', () => {
		expect(solveCubic(1, -1.6, 0.73, -0.09, 0.3, 0.8).length).toBe(1)
	})

	it('reports a double root only within the tolerance', () => {
		// (x - 0.5)² (x - 2)
		const [a, b, c, d] = [1, -3, 2.25, -0.5]
		expect(solveCubic(a, b, c, d, 0, 1)[0]).toBeCloseTo(0.5, 12)
		expect(solveCubic(a, b, c, d - 1e-3, 0, 1)).toEqual([])
		expect(solveCubic(a, b, c, d - 1e-3, 0, 1, 1e-2).length).toBe(1)
	})

	it('falls back to lower degrees', () => {
		expect(solveCubic(0, 1, 0, -0.25, 0, 1)[0]).toBeCloseTo(0.5, 12)
		expect(solveCubic(0, 0, 2, -1, 0, 1)[0]).toBeCloseTo(0.5, 12)
		expect(solveCubic(0, 0, 0, 1, 0, 1)).toEqual([])
	})
})
