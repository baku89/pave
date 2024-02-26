import {describe, expect, it, test} from 'vitest'

import {CubicBezier} from './CubicBezier'
import {SegmentC} from './Segment'

const a: SegmentC = {
	start: [0, 0],
	command: 'C',
	args: [
		[0, 1],
		[1, 1],
	],
	point: [1, 0],
}
const b: SegmentC = {
	start: [0, 0],
	command: 'C',
	args: [
		[2, 0],
		[1, 1],
	],
	point: [1, 0],
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

describe('trim', () => {
	const a: SegmentC = {
		start: [0, 0],
		command: 'C',
		args: [
			[1, 0],
			[1, 1],
		],
		point: [0, 1],
	}
	it('should leave the curve unchanged if the trim range is [0, 1]', () => {
		expect(CubicBezier.trim(a, {time: 0}, {time: 1})).toEqual(a)
	})

	it('should trim the curve if the trim range is [0, 0.5]', () => {
		expect(CubicBezier.trim(a, {time: 0}, {time: 0.5})).toEqual(
			CubicBezier.of([0, 0], [0.5, 0.0], [0.75, 0.25], [0.75, 0.5])
		)
	})

	it('shoud trim the curve if the trim range is [0.5, 1]', () => {
		expect(CubicBezier.trim(a, {time: 0.5}, {time: 1})).toEqual(
			CubicBezier.of([0.75, 0.5], [0.75, 0.75], [0.5, 1.0], [0, 1])
		)
	})
})
