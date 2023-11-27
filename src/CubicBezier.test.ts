import '../jest.config'

import {atT, bound, CubicBezier, length, normal} from './CubicBezier'

describe('CubicBezier', () => {
	const a: CubicBezier = [
		[0, 0],
		[0, 1],
		[1, 1],
		[1, 0],
	]
	const b: CubicBezier = [
		[0, 0],
		[2, 0],
		[1, 1],
		[1, 0],
	]

	it('should compute the `length` correctly', () => {
		expect(length(a)).toBeCloseTo(2, 10)
		expect(length(b)).toBeCloseTo(2, 10)
	})

	it('should compute the `bound` correctly', () => {
		expect(bound(a)).toEqual([
			[0, 0],
			[1, 0.75],
		])
		expect(bound(b)).toEqual([
			[0, 0],
			[1.25, 0.444444],
		])
	})

	it('should compute the `atT` correctly', () => {
		expect(atT(a, 0)).toEqual([0, 0])
		expect(atT(a, 0.5)).toEqual([0.5, 0.75])
		expect(atT(a, 1)).toEqual([1, 0])
	})

	it('should compute the `normal` correctly', () => {
		expect(normal(a, 0.5)).toEqual([0, 1])
	})
})
