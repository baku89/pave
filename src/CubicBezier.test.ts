import '../jest.setup'

import {CubicBezier} from './CubicBezier'
import {CommandC} from './Path'
import {Segment} from './Segment'

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

test('length', () => {
	expect(CubicBezier.length(a)).toEqual(2)
	expect(CubicBezier.length(b)).toEqual(2)
})

test('bound', () => {
	expect(CubicBezier.bounds(a)).toEqual([
		[0, 0],
		[1, 0.75],
	])
	expect(CubicBezier.bounds(b)).toEqual([
		[0, 0],
		[1.25, 0.444444],
	])
})

test('point', () => {
	expect(CubicBezier.point(a, {time: 0})).toEqual([0, 0])
	expect(CubicBezier.point(a, {time: 0.5})).toEqual([0.5, 0.75])
	expect(CubicBezier.point(a, {time: 1})).toEqual([1, 0])
})

test('normal', () => {
	expect(CubicBezier.normal(a, {time: 0.5})).toEqual([0, 1])
})
