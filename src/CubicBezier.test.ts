import '../jest.setup'

import {CubicBezier} from './CubicBezier'

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
		expect(CubicBezier.length(a)).toEqual(2)
		expect(CubicBezier.length(b)).toEqual(2)
	})

	it('should compute the `bound` correctly', () => {
		expect(CubicBezier.bound(a)).toEqual([
			[0, 0],
			[1, 0.75],
		])
		expect(CubicBezier.bound(b)).toEqual([
			[0, 0],
			[1.25, 0.444444],
		])
	})

	it('should compute the `atT` correctly', () => {
		expect(CubicBezier.atT(a, 0)).toEqual([0, 0])
		expect(CubicBezier.atT(a, 0.5)).toEqual([0.5, 0.75])
		expect(CubicBezier.atT(a, 1)).toEqual([1, 0])
	})

	it('should compute the `normal` correctly', () => {
		expect(CubicBezier.normal(a, 0.5)).toEqual([0, 1])
	})
})
