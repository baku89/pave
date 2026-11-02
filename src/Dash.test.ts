import {describe, expect, it} from 'vitest'

import {Curve, Path} from './index'
import {dash} from './path/dash'

const lengthsOf = (p: Path) => p.curves.map(Curve.length)
const startOf = (p: Path, i = 0) => p.curves[i].vertices[0].point
const endOf = (p: Path, i = 0) => p.curves[i].vertices.at(-1)!.point

describe('dash', () => {
	const line = Path.line([0, 0], [100, 0])

	it('cuts a line into dashes of the pattern', () => {
		const d = dash(line, [10, 10])

		expect(d.curves.length).toBe(5)
		expect(lengthsOf(d)).toEqual([10, 10, 10, 10, 10])
		expect(startOf(d, 0)).toEqual([0, 0])
		expect(endOf(d, 0)).toEqual([10, 0])
		expect(startOf(d, 4)).toEqual([80, 0])
		expect(endOf(d, 4)).toEqual([90, 0])
		expect(d.curves.every(c => !c.closed)).toBe(true)
	})

	it('repeats an odd pattern to make it even', () => {
		const d = dash(line, [10])
		expect(lengthsOf(d)).toEqual([10, 10, 10, 10, 10])
	})

	it('shifts the first dash by the offset', () => {
		const d = dash(line, [10, 10], {offset: 5})

		// Starts 5 into the first dash, so it is 5 long
		expect(lengthsOf(d)).toEqual([5, 10, 10, 10, 10, 5])
		expect(startOf(d, 1)).toEqual([15, 0])

		const neg = dash(line, [10, 10], {offset: -5})
		expect(startOf(neg, 0)).toEqual([5, 0])
		expect(endOf(neg, 0)).toEqual([15, 0])
	})

	it('cuts the dash at the end of an open curve', () => {
		const d = dash(line, [30, 10])
		expect(lengthsOf(d)).toEqual([30, 30, 20])
	})

	it('returns the path as it is for an empty or all-zero pattern', () => {
		expect(dash(line, [])).toBe(line)
		expect(dash(line, [0, 0])).toBe(line)
	})

	it('throws on a negative length', () => {
		expect(() => dash(line, [10, -1])).toThrow()
	})

	it('joins the dash over the seam of a closed curve', () => {
		const rect = Path.rect([0, 0], [10, 10])
		const d = dash(rect, [15, 5])

		// 40 long: on 0-15, off 15-20, on 20-35, off 35-40 → two dashes, no seam
		expect(lengthsOf(d)).toEqual([15, 15])

		// 40 long with [12, 4]: on 0-12, 16-28, 32-40 → the last reaches the seam and
		// joins the first into one dash of 20
		const seam = dash(rect, [12, 4])
		expect(seam.curves.length).toBe(2)
		expect(lengthsOf(seam)).toEqual([12, 20])
		expect(startOf(seam, 1)).toEqual([0, 8])
		expect(endOf(seam, 1)).toEqual([10, 2])
		expect(seam.curves.every(c => !c.closed)).toBe(true)
	})

	it('keeps a closed curve shorter than its first dash closed', () => {
		const rect = Path.rect([0, 0], [10, 10])
		const d = dash(rect, [100, 10])
		expect(d.curves.length).toBe(1)
		expect(d.curves[0].closed).toBe(true)
	})

	it('dashes every curve from its own start', () => {
		const two = Path.merge([line, Path.line([0, 10], [50, 10])])
		const d = dash(two, [10, 10])
		expect(lengthsOf(d)).toEqual([10, 10, 10, 10, 10, 10, 10, 10])
		expect(startOf(d, 5)).toEqual([0, 10])
	})

	it('keeps attributes of the ranges', () => {
		const p: Path = {
			curves: [
				{
					vertices: [
						{command: 'L', point: [0, 0], attrs: {w: 0}},
						{command: 'L', point: [100, 0], attrs: {w: 100}},
					],
					closed: false,
					attrs: {tag: 'a'},
				},
			],
			attrs: {name: 'p'},
		}
		const d = dash(p, [10, 10], {offset: 0})
		expect(d.attrs).toEqual({name: 'p'})
		expect(d.curves[1].attrs).toEqual({tag: 'a'})
		expect(d.curves[1].vertices[0].attrs).toEqual({w: 20})
		expect(d.curves[1].vertices[1].attrs).toEqual({w: 30})
	})
})
