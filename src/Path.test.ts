/**
 * @jest-environment jsdom
 */
import 'jest-canvas-mock'
import '../jest.setup'

import paper from 'paper'

import {Path} from './Path'

describe('fromSVG', () => {
	it('should convert a line', () => {
		const path = Path.fromSVG(['M', [0, 1], 'L', [2, 3]])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: ['L']},
						{point: [2, 3], command: ['L']},
					],
					closed: false,
				},
			],
		})
	})

	it('should convert a cubic bezier', () => {
		const path = Path.fromSVG(['M', [0, 1], 'C', [2, 3], [4, 5], [6, 7]])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: ['L']},
						{point: [6, 7], command: ['C', [2, 3], [4, 5]]},
					],
					closed: false,
				},
			],
		})
	})

	it('should convert a closed polygon', () => {
		const path = Path.fromSVG(['M', [0, 1], 'L', [2, 3], 'L', [4, 5], 'Z'])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: ['L']},
						{point: [2, 3], command: ['L']},
						{point: [4, 5], command: ['L']},
					],
					closed: true,
				},
			],
		})
	})

	it('should convert a closed path with a cubic bezier whose first and last point are identical', () => {
		const path = Path.fromSVG(['M', [0, 1], 'C', [2, 3], [4, 5], [0, 1], 'Z'])

		expect(path).toEqual({
			curves: [
				{
					vertices: [{point: [0, 1], command: ['C', [2, 3], [4, 5]]}],
					closed: true,
				},
			],
		})
	})

	it('should convert a closed path with a cubic bezier', () => {
		const path = Path.fromSVG(['M', [0, 1], 'C', [2, 3], [4, 5], [6, 7], 'Z'])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: ['L']},
						{point: [6, 7], command: ['C', [2, 3], [4, 5]]},
					],
					closed: true,
				},
			],
		})
	})

	it('should convert an arc', () => {
		const path = Path.fromSVG([
			'M',
			[0, 1],
			'A',
			[2, 3],
			4,
			false,
			true,
			[5, 6],
		])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: ['L']},
						{point: [5, 6], command: ['A', [2, 3], 4, false, true]},
					],
					closed: false,
				},
			],
		})
	})
})

test('toSVGString', () => {
	const path: Path = {
		curves: [
			{
				vertices: [
					{point: [0, 0], command: ['L']},
					{point: [1, 1], command: ['L']},
					{point: [2, 2], command: ['L']},
					{point: [3, 3], command: ['C', [4, 4], [5, 5]]},
					{point: [1, 1], command: ['A', [2, 2], 1, false, true]},
				],
				closed: true,
			},
		],
	}
	expect(Path.toSVGString(path)).toEqual(
		'M 0,0 L 1,1 L 2,2 C 4,4 5,5 3,3 A 2,2 1 0 1 1,1 Z'
	)
})

describe('toPaperPath', () => {
	it('should convert a line', () => {
		const testPath: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 1], command: ['L']},
						{point: [2, 3], command: ['L']},
					],
					closed: false,
				},
			],
		}
		const paperPath = Path.toPaperPath(testPath) as paper.Path

		expect(paperPath).toBeInstanceOf(paper.Path)
		expect(paperPath.closed).toBe(false)
		expect(paperPath.curves.length).toBe(1)
		expect(paperPath.curves[0].point1.equals(new paper.Point(0, 1))).toBe(true)
		expect(paperPath.curves[0].point2.equals(new paper.Point(2, 3))).toBe(true)
		expect(paperPath.curves[0].isStraight()).toBe(true)
	})

	it('should convert a cubic bezier', () => {
		const testPath: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 1], command: ['L']},
						{point: [2, 3], command: ['C', [4, 5], [6, 7]]},
					],
					closed: false,
				},
			],
		}
		const paperPath = Path.toPaperPath(testPath) as paper.Path

		expect(paperPath).toBeInstanceOf(paper.Path)
		expect(paperPath.closed).toBe(false)
		expect(paperPath.curves.length).toBe(1)
		expect(paperPath.curves[0].point1.equals(new paper.Point(0, 1))).toBe(true)
		expect(paperPath.curves[0].handle1.equals(new paper.Point(4, 4))).toBe(true)
		expect(paperPath.curves[0].handle1.equals(new paper.Point(4, 4))).toBe(true)
		expect(paperPath.curves[0].point2.equals(new paper.Point(2, 3))).toBe(true)
	})

	it('should convert a polygon', () => {
		const testPath: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 1], command: ['L']},
						{point: [2, 3], command: ['L']},
						{point: [4, 5], command: ['L']},
					],
					closed: true,
				},
			],
		}
		const paperPath = Path.toPaperPath(testPath) as paper.Path

		expect(paperPath).toBeInstanceOf(paper.Path)
		expect(paperPath.closed).toBe(true)
		expect(paperPath.curves.length).toBe(3)
		expect(paperPath.curves[0].point1.equals({x: 0, y: 1})).toBe(true)
		expect(paperPath.curves[1].point1.equals({x: 2, y: 3})).toBe(true)
		expect(paperPath.curves[2].point1.equals({x: 4, y: 5})).toBe(true)
	})
})

describe('fromPaperPath', () => {
	it('should convert a open polygon', () => {
		const paperPath = new paper.Path([
			new paper.Point(0, 1),
			new paper.Point(2, 3),
			new paper.Point(4, 5),
		])
		paperPath.closed = false
		const path = Path.fromPaperPath(paperPath)

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: ['L']},
						{point: [2, 3], command: ['L']},
						{point: [4, 5], command: ['L']},
					],
					closed: false,
				},
			],
		})
	})

	it('should convert a closed polygon', () => {
		const paperPath = new paper.Path([
			new paper.Point(0, 1),
			new paper.Point(2, 3),
			new paper.Point(4, 5),
		])
		paperPath.closed = true
		const path = Path.fromPaperPath(paperPath)

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: ['L']},
						{point: [2, 3], command: ['L']},
						{point: [4, 5], command: ['L']},
					],
					closed: true,
				},
			],
		})
	})
})
