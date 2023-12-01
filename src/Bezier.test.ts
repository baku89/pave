import '../jest.setup'

import {Bezier} from './Bezier'

describe('Bezier', () => {
	const a: Bezier = [
		[0, 0],
		[0, 1],
		[1, 1],
		[1, 0],
	]
	const b: Bezier = [
		[0, 0],
		[2, 0],
		[1, 1],
		[1, 0],
	]

	it('should compute the `length` correctly', () => {
		expect(Bezier.length(a)).toEqual(2)
		expect(Bezier.length(b)).toEqual(2)
	})

	it('should compute the `bound` correctly', () => {
		expect(Bezier.bounds(a)).toEqual([
			[0, 0],
			[1, 0.75],
		])
		expect(Bezier.bounds(b)).toEqual([
			[0, 0],
			[1.25, 0.444444],
		])
	})

	it('should compute the `atT` correctly', () => {
		expect(Bezier.atT(a, 0)).toEqual([0, 0])
		expect(Bezier.atT(a, 0.5)).toEqual([0.5, 0.75])
		expect(Bezier.atT(a, 1)).toEqual([1, 0])
	})

	it('should compute the `normal` correctly', () => {
		expect(Bezier.normal(a, 0.5)).toEqual([0, 1])
	})
})
