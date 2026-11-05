import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {merge} from './path/compound'
import {contains} from './path/queries'
import {pixelate, type PixelateMode} from './path/pixelate'

const UNIT: [[number, number], [number, number]] = [
	[0, 0],
	[10, 10],
]
const MODES: PixelateMode[] = ['overlap', 'center', 'full']

/** How many cells of the grid of `UNIT` are inside of the path, by their centers. */
const cellCount = (path: Path) => Math.round(Math.abs(Path.area(path)) / 100)

const points = (path: Path) =>
	path.curves.map(({vertices}) => vertices.map(({point}) => [...point]))

describe('pixelate', () => {
	describe('which cells', () => {
		it('fills the same cells in every mode when a shape lies along the grid', () => {
			for (const mode of MODES) {
				const result = pixelate(Path.rect([10, 20], [40, 50]), UNIT, {mode})
				expect(points(result)).toEqual([
					[
						[10, 20],
						[40, 20],
						[40, 50],
						[10, 50],
					],
				])
			}
		})

		it('goes by how much of a cell the shape covers', () => {
			// Over a quarter of the left and top cells, and most of the right and bottom ones
			const rect = Path.rect([7, 7], [23, 23])
			const count = (mode: PixelateMode) =>
				cellCount(pixelate(rect, UNIT, {mode}))

			expect(count('overlap')).toBe(9)
			expect(count('center')).toBe(1)
			expect(count('full')).toBe(1)

			const smaller = Path.rect([2, 2], [18, 18])
			expect(cellCount(pixelate(smaller, UNIT, {mode: 'overlap'}))).toBe(4)
			expect(cellCount(pixelate(smaller, UNIT, {mode: 'center'}))).toBe(4)
			expect(cellCount(pixelate(smaller, UNIT, {mode: 'full'}))).toBe(0)
		})

		it('nests the modes in one another, for a curved shape', () => {
			const circle = Path.circle([53, 47], 31)
			const overlap = pixelate(circle, UNIT, {mode: 'overlap'})
			const center = pixelate(circle, UNIT, {mode: 'center'})
			const full = pixelate(circle, UNIT, {mode: 'full'})

			const area = (p: Path) => Math.abs(Path.area(p))
			expect(area(full)).toBeLessThan(area(center))
			expect(area(center)).toBeLessThan(area(overlap))
			expect(area(full)).toBeLessThan(area(circle))
			expect(area(overlap)).toBeGreaterThan(area(circle))
			for (let x = 0; x < 100; x += 10) {
				for (let y = 0; y < 100; y += 10) {
					const middle: [number, number] = [x + 5, y + 5]
					if (contains(full, middle)) expect(contains(center, middle)).toBe(true)
					if (contains(center, middle)) expect(contains(overlap, middle)).toBe(true)
					expect(contains(center, middle)).toBe(contains(circle, middle))
				}
			}
		})

		it('does not count a touch along a line of the grid or at a corner', () => {
			const circle = Path.circle([0, 0], 10)
			const overlap = pixelate(circle, UNIT, {mode: 'overlap'})
			expect(Path.bounds(overlap)).toEqual([
				[-10, -10],
				[10, 10],
			])
			const diamond = Path.polygon([10, 0], [20, 10], [10, 20], [0, 10])
			expect(cellCount(pixelate(diamond, UNIT, {mode: 'overlap'}))).toBe(4)
			expect(cellCount(pixelate(diamond, UNIT, {mode: 'full'}))).toBe(0)
		})

		it('leaves out a center on the outline on every side alike', () => {
			// The centers of the cells at the top and the bottom are where the circle only touches them
			const circle = pixelate(Path.circle([15, 20], 25), UNIT)
			const [[left, topY], [right, bottomY]] = Path.bounds(circle)
			expect([left + right, topY + bottomY]).toEqual([30, 40])
			expect(contains(circle, [15, 45 - 1])).toBe(false)
			expect(contains(circle, [15, -5 + 1])).toBe(false)

			const rect = pixelate(Path.rect([5, 5], [25, 25]), UNIT)
			expect(points(rect)).toEqual([
				[
					[10, 10],
					[20, 10],
					[20, 20],
					[10, 20],
				],
			])
		})

		it('does not leave out a center where two curves meet inside of a fill', () => {
			const side = merge([Path.rect([0, 0], [15, 10]), Path.rect([15, 0], [30, 10])])
			expect(cellCount(pixelate(side, UNIT))).toBe(3)
			const stacked = merge([Path.rect([0, 0], [10, 15]), Path.rect([0, 15], [10, 30])])
			expect(cellCount(pixelate(stacked, UNIT))).toBe(3)
		})

		it('has a hole where a shape has one, only as far as it reaches', () => {
			const ring = merge([
				Path.rect([0, 0], [50, 50]),
				Path.reverse(Path.rect([12, 12], [38, 38])),
			])
			const area = (mode: PixelateMode) =>
				cellCount(pixelate(ring, UNIT, {mode}))
			expect(area('overlap')).toBe(25 - 1)
			expect(area('center')).toBe(25 - 9)
			expect(area('full')).toBe(25 - 9)

			const holeInFull = pixelate(ring, UNIT, {mode: 'full'})
			expect(holeInFull.curves).toHaveLength(2)
			expect(contains(holeInFull, [25, 25])).toBe(false)
			expect(contains(holeInFull, [5, 5])).toBe(true)
		})

		it('sees through the curves running inside of a fill, when it has to be full', () => {
			const twoRects = merge([
				Path.rect([0, 0], [33, 30]),
				Path.rect([17, 0], [50, 30]),
			])
			const full = pixelate(twoRects, UNIT, {mode: 'full'})
			expect(cellCount(full)).toBe(15)
			expect(full.curves).toHaveLength(1)
		})

		it('goes by the fill rule', () => {
			const overlapping = merge([
				Path.rect([0, 0], [30, 30]),
				Path.rect([10, 10], [20, 20]),
			])
			const inTheMiddle = (options: {fillRule: 'nonzero' | 'evenodd'}) =>
				MODES.map(mode =>
					contains(pixelate(overlapping, UNIT, {mode, ...options}), [15, 15])
				)
			expect(inTheMiddle({fillRule: 'nonzero'})).toEqual([true, true, true])
			expect(inTheMiddle({fillRule: 'evenodd'})).toEqual([false, false, false])
		})

		it('takes what an open curve runs through only when anything overlapping will do', () => {
			const line = Path.line([1, 5], [39, 5])
			expect(cellCount(pixelate(line, UNIT, {mode: 'overlap'}))).toBe(4)
			expect(pixelate(line, UNIT, {mode: 'center'}).curves).toEqual([])
			expect(pixelate(line, UNIT, {mode: 'full'}).curves).toEqual([])

			const open = Path.polyline([0, 0], [40, 0], [40, 40])
			// Filled as closed by a line, across half of the diagonal cells' centers
			const center = pixelate(open, UNIT, {mode: 'center'})
			expect(contains(center, [35, 5])).toBe(true)
			expect(contains(center, [5, 35])).toBe(false)
		})
	})

	describe('the grid', () => {
		it('is laid out from wherever the cell is, on all sides of it', () => {
			const far = pixelate(Path.rect([-5, -5], [5, 5]), [
				[1000, 1000],
				[1010, 1010],
			], {mode: 'overlap'})
			expect(Path.bounds(far)).toEqual([
				[-10, -10],
				[10, 10],
			])

			const shifted = pixelate(Path.rect([-5, -5], [5, 5]), [
				[3, 3],
				[13, 13],
			], {mode: 'overlap'})
			expect(Path.bounds(shifted)).toEqual([
				[-7, -7],
				[13, 13],
			])
		})

		it('can have cells of any proportion, and given in any order', () => {
			const wide = pixelate(Path.rect([1, 1], [39, 9]), [
				[20, 10],
				[0, 0],
			], {mode: 'overlap', anchors: 'cells'})
			// Two cells of 20 by 10
			expect(points(wide)[0]).toHaveLength(6)
			expect(Path.bounds(wide)).toEqual([
				[0, 0],
				[40, 10],
			])
		})

		it('says so when there is no grid to be had', () => {
			const rect = Path.rect([0, 0], [10, 10])
			expect(() => pixelate(rect, [[0, 0], [0, 10]])).toThrow(RangeError)
			expect(() => pixelate(rect, [[0, 0], [NaN, 10]])).toThrow(RangeError)
			expect(() => pixelate(rect, [[0, 0], [1e-4, 1e-4]])).toThrow(RangeError)
		})
	})

	describe('the outline', () => {
		const rect = Path.rect([0, 0], [30, 20])

		it('has anchors only where it turns, by itself', () => {
			expect(points(pixelate(rect, UNIT))).toEqual([
				[
					[0, 0],
					[30, 0],
					[30, 20],
					[0, 20],
				],
			])
		})

		it('has an anchor at every corner of a cell along it, when asked', () => {
			const result = pixelate(rect, UNIT, {anchors: 'cells'})
			expect(points(result)[0]).toEqual([
				[0, 0],
				[10, 0],
				[20, 0],
				[30, 0],
				[30, 10],
				[30, 20],
				[20, 20],
				[10, 20],
				[0, 20],
				[0, 10],
			])
			expect(result.curves[0].closed).toBe(true)
			expect(result.curves[0].vertices.every(v => v.command === 'L')).toBe(true)
		})

		it('comes to the same shape either way', () => {
			const circle = Path.circle([53, 47], 31)
			const corners = pixelate(circle, UNIT)
			const cells = pixelate(circle, UNIT, {anchors: 'cells'})
			expect(Path.area(corners)).toBeCloseTo(Path.area(cells))
			expect(points(cells)[0].length).toBeGreaterThan(points(corners)[0].length)
		})

		it('goes the way a rectangle does, and around a hole the other way', () => {
			const ring = merge([
				Path.rect([0, 0], [30, 30]),
				Path.reverse(Path.rect([10, 10], [20, 20])),
			])
			const [outer, hole] = pixelate(ring, UNIT).curves
			const turn = ({vertices}: Path['curves'][number]) =>
				vertices.reduce((sum, {point: [x, y]}, i) => {
					const [nx, ny] = vertices[(i + 1) % vertices.length].point
					return sum + x * ny - nx * y
				}, 0)
			const [rectCurve] = Path.rect([0, 0], [1, 1]).curves
			expect(Math.sign(turn(outer))).toBe(Math.sign(turn(rectCurve)))
			expect(Math.sign(turn(hole))).toBe(-Math.sign(turn(rectCurve)))
		})

		it('keeps cells meeting at a corner apart', () => {
			const two = merge([
				Path.rect([0, 0], [10, 10]),
				Path.rect([10, 10], [20, 20]),
			])
			const result = pixelate(two, UNIT)
			expect(result.curves).toHaveLength(2)
			expect(result.curves.map(c => c.vertices.length)).toEqual([4, 4])

			// A hole meeting the outside at a corner of it
			const notch = Path.polygon(
				[0, 0],
				[30, 0],
				[30, 30],
				[10, 30],
				[10, 20],
				[20, 20],
				[20, 10],
				[0, 10]
			)
			const outline = pixelate(notch, UNIT)
			expect(Path.area(outline)).toBeCloseTo(Path.area(notch))
		})

		it('gives nothing for nothing, and keeps what the path says of itself', () => {
			expect(pixelate({curves: []}, UNIT).curves).toEqual([])
			const empty = pixelate(Path.rect([1, 1], [9, 9]), UNIT, {mode: 'full'})
			expect(empty.curves).toEqual([])

			const attrs = {name: 'a'}
			expect(pixelate({...Path.rect([0, 0], [10, 10]), attrs}, UNIT).attrs).toEqual(attrs)
		})
	})
})
