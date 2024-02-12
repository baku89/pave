import '../jest.setup'

import {CubicBezier} from './CubicBezier'
import {CommandC} from './Path'
import {Segment} from './Segment'

describe('Bezier', () => {
	const a: Segment<CommandC> = {
		start: [0, 0],
		command: ['C', [0, 1], [1, 1]],
		end: [1, 0],
	}
	const b: Segment<CommandC> = {
		start: [0, 0],
		command: ['C', [2, 0], [1, 1]],
		end: [1, 0],
	}

	it('should compute the `length` correctly', () => {
		expect(CubicBezier.length(a)).toEqual(2)
		expect(CubicBezier.length(b)).toEqual(2)
	})

	it('should compute the `bound` correctly', () => {
		expect(CubicBezier.bounds(a)).toEqual([
			[0, 0],
			[1, 0.75],
		])
		expect(CubicBezier.bounds(b)).toEqual([
			[0, 0],
			[1.25, 0.444444],
		])
	})

	it('should compute the `pointAtTime` correctly', () => {
		expect(CubicBezier.pointAtTime(a, 0)).toEqual([0, 0])
		expect(CubicBezier.pointAtTime(a, 0.5)).toEqual([0.5, 0.75])
		expect(CubicBezier.pointAtTime(a, 1)).toEqual([1, 0])
	})

	it('should compute the `normalAtTime` correctly', () => {
		expect(CubicBezier.normalAtTime(a, 0.5)).toEqual([0, 1])
	})
})
