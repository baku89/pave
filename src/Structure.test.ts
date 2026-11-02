import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {windingNumber} from './path/planar'
import {
	breakApart,
	cleanup,
	connect,
	normalizeWinding,
	orient,
	setStart,
} from './path/structure'
import {planarPathArea} from './pathPlanar'

const pointsOf = (p: Path, i = 0) => p.curves[i].vertices.map(v => v.point)
const commandsOf = (p: Path, i = 0) => p.curves[i].vertices.map(v => v.command)

describe('setStart', () => {
	const rect = Path.rect([0, 0], [10, 10])

	it('makes the given vertex the first one, keeping the shape', () => {
		const r = setStart(rect, 0, 2)

		expect(pointsOf(r)).toEqual([
			[10, 10],
			[0, 10],
			[0, 0],
			[10, 0],
		])
		expect(r.curves[0].closed).toBe(true)
		expect(Path.area(r)).toBe(100)
		expect(Path.length(r)).toBe(40)
	})

	it('keeps the commands attached to their segments', () => {
		const rounded = Path.roundRect([0, 0], [20, 20], 5)
		const r = setStart(rounded, 0, 3)

		expect(Path.length(r)).toBeCloseTo(Path.length(rounded))
		expect(Path.area(r)).toBeCloseTo(Path.area(rounded))
		expect(pointsOf(r)[0]).toEqual(pointsOf(rounded)[3])
		expect(commandsOf(r)[0]).toBe(commandsOf(rounded)[3])
		expect(Path.unite([rounded, r]).curves.length).toBe(1)
		expect(Path.area(Path.unite([rounded, r]))).toBeCloseTo(Path.area(rounded))
	})

	it('accepts negative indices and returns open curves unchanged', () => {
		expect(pointsOf(setStart(rect, -1, -1))[0]).toEqual([0, 10])

		const line = Path.polyline([0, 0], [10, 0], [10, 10])
		expect(setStart(line, 0, 1)).toBe(line)
	})

	it('keeps attributes', () => {
		const p: Path = {
			curves: [
				{
					vertices: [
						{command: 'L', point: [0, 0], attrs: {i: 0}},
						{command: 'L', point: [10, 0], attrs: {i: 1}},
						{command: 'L', point: [10, 10], attrs: {i: 2}},
					],
					closed: true,
					attrs: {tag: 'c'},
				},
			],
			attrs: {name: 'p'},
		}
		const r = setStart(p, 0, 1)
		expect(r.attrs).toEqual({name: 'p'})
		expect(r.curves[0].attrs).toEqual({tag: 'c'})
		expect(r.curves[0].vertices.map(v => v.attrs?.i)).toEqual([1, 2, 0])
	})
})

describe('breakApart', () => {
	it('gives one path per curve keeping the path attributes', () => {
		const p: Path = {
			...Path.merge([Path.rect([0, 0], [1, 1]), Path.circle([5, 5], 1)]),
			attrs: {name: 'p'},
			attrDefs: {name: {default: 'x'}},
		}
		const parts = breakApart(p)
		expect(parts.length).toBe(2)
		expect(parts[0].curves).toEqual([p.curves[0]])
		expect(parts[1].curves).toEqual([p.curves[1]])
		expect(parts[1].attrs).toEqual({name: 'p'})
		expect(parts[1].attrDefs).toEqual({name: {default: 'x'}})
	})
})

describe('connect', () => {
	it('joins two lines into one curve', () => {
		const a = Path.line([0, 0], [10, 0])
		const b = Path.line([10, 0], [10, 10])
		const c = connect([a, b])

		expect(c.curves.length).toBe(1)
		expect(c.curves[0].closed).toBe(false)
		expect(pointsOf(c)).toEqual([
			[0, 0],
			[10, 0],
			[10, 10],
		])
	})

	it('bridges distant endpoints with a line, reversing when the end is nearer', () => {
		const a = Path.line([0, 0], [10, 0])
		const b = Path.line([30, 0], [12, 0])
		const c = connect([a, b])

		expect(pointsOf(c)).toEqual([
			[0, 0],
			[10, 0],
			[12, 0],
			[30, 0],
		])
		expect(commandsOf(c)).toEqual(['L', 'L', 'L', 'L'])
	})

	it('picks the nearest curve next', () => {
		const a = Path.line([0, 0], [10, 0])
		const far = Path.line([50, 0], [60, 0])
		const near = Path.line([20, 0], [12, 0])
		const c = connect([a, far, near])

		expect(pointsOf(c)).toEqual([
			[0, 0],
			[10, 0],
			[12, 0],
			[20, 0],
			[50, 0],
			[60, 0],
		])
	})

	it('closes the chain and passes closed curves through', () => {
		const a = Path.polyline([0, 0], [10, 0], [10, 10])
		const b = Path.line([0, 10], [0, 0])
		const circle = Path.circle([50, 50], 5)
		const c = connect([a, circle, b], {close: true})

		expect(c.curves.length).toBe(2)
		expect(c.curves[0].closed).toBe(true)
		expect(pointsOf(c)).toEqual([
			[0, 0],
			[10, 0],
			[10, 10],
			[0, 10],
		])
		expect(Path.area({curves: [c.curves[0]]})).toBe(100)
		expect(c.curves[1]).toEqual(circle.curves[0])
	})
})

describe('cleanup', () => {
	it('removes a zero-length segment and a collinear vertex', () => {
		const p = Path.polyline([0, 0], [5, 0], [5, 0], [10, 0], [10, 10])
		const c = cleanup(p)

		expect(pointsOf(c)).toEqual([
			[0, 0],
			[10, 0],
			[10, 10],
		])
	})

	it('removes collinear vertices of a closed curve, including the first', () => {
		const p = Path.polygon(
			[5, 0],
			[10, 0],
			[10, 10],
			[0, 10],
			[0, 0],
			[0, 0.0000001]
		)
		const c = cleanup(p)

		expect(c.curves[0].vertices.length).toBe(4)
		expect(Path.area(c)).toBe(100)
	})

	it('keeps a corner that merely touches the line through its neighbours', () => {
		const spike = Path.polyline([0, 0], [10, 0], [5, 0], [5, 10])
		expect(cleanup(spike).curves[0].vertices.length).toBe(4)
	})

	it('converts a straight cubic to a line', () => {
		const p = Path.cubicBezier([0, 0], [3, 0], [7, 0], [10, 0])
		expect(commandsOf(cleanup(p))).toEqual(['L', 'L'])
		expect(pointsOf(cleanup(p))).toEqual([
			[0, 0],
			[10, 0],
		])

		const curved = Path.cubicBezier([0, 0], [3, 5], [7, 5], [10, 0])
		expect(commandsOf(cleanup(curved))).toEqual(['L', 'C'])
	})

	it('drops empty curves and, on request, dots', () => {
		const p: Path = {
			curves: [
				{vertices: [], closed: false},
				{vertices: [{command: 'L', point: [1, 1]}], closed: true},
				...Path.polygon([0, 0], [0, 0], [0, 0]).curves,
			],
		}
		expect(cleanup(p).curves.length).toBe(2)
		expect(cleanup(p).curves[1].vertices.length).toBe(1)
		expect(cleanup(p, {removeDots: true}).curves.length).toBe(0)
	})

	it('keeps attributes', () => {
		const p: Path = {
			curves: [
				{
					vertices: [
						{command: 'L', point: [0, 0], attrs: {i: 0}},
						{command: 'L', point: [5, 0], attrs: {i: 1}},
						{command: 'L', point: [10, 0], attrs: {i: 2}},
					],
					closed: false,
					attrs: {tag: 'c'},
				},
			],
			attrs: {name: 'p'},
		}
		const c = cleanup(p)
		expect(c.attrs).toEqual({name: 'p'})
		expect(c.curves[0].attrs).toEqual({tag: 'c'})
		expect(c.curves[0].vertices.map(v => v.attrs?.i)).toEqual([0, 2])
	})
})

describe('orient', () => {
	const rect = Path.rect([0, 0], [10, 10])
	const reversed = Path.reverse(rect)

	it('defines cw as the positive signed area of Path.rect', () => {
		expect(planarPathArea(rect)).toBeGreaterThan(0)
		expect(planarPathArea(reversed)).toBeLessThan(0)
	})

	it('makes every closed curve wind the same way', () => {
		const mixed = Path.merge([rect, reversed, Path.circle([30, 30], 5)])

		const cw = orient(mixed, 'cw')
		for (const curve of cw.curves) {
			expect(planarPathArea({curves: [curve]})).toBeGreaterThan(0)
		}
		expect(cw.curves[0]).toBe(rect.curves[0])
		expect(pointsOf(cw, 1)).toEqual(pointsOf(rect))

		const ccw = orient(mixed, 'ccw')
		for (const curve of ccw.curves) {
			expect(planarPathArea({curves: [curve]})).toBeLessThan(0)
		}
		expect(Path.area(ccw)).toBe(Path.area(cw))
		expect(Path.area(cw)).toBeCloseTo(200 + Path.area(Path.circle([0, 0], 5)))
	})

	it('leaves open curves alone', () => {
		const line = Path.polyline([0, 0], [10, 0], [10, 10])
		expect(orient(line, 'ccw').curves[0]).toBe(line.curves[0])
	})
})

describe('normalizeWinding', () => {
	// A bow tie: the two lobes wind in opposite directions, so its signed area is zero
	const bowTie = Path.polygon([0, 0], [10, 10], [10, 0], [0, 10])

	it('splits a self-intersecting polygon into simple curves of the same region', () => {
		expect(planarPathArea(bowTie)).toBeCloseTo(0)

		const n = normalizeWinding(bowTie)

		expect(n.curves.length).toBe(2)
		expect(n.curves.every(c => c.closed)).toBe(true)
		// Two triangles with the base 10 and the height 5
		expect(Path.area(n)).toBe(50)
		for (const curve of n.curves) {
			expect(planarPathArea({curves: [curve]})).toBeCloseTo(25)
		}
		expect(windingNumber(n.curves, [2, 5])).toBe(1)
		expect(windingNumber(n.curves, [8, 5])).toBe(1)
		expect(windingNumber(n.curves, [5, 2])).toEqual(0)
	})

	it('removes an overlap under nonzero and keeps it as a hole under evenodd', () => {
		const outer = Path.rect([0, 0], [10, 10])
		const inner = Path.rect([2, 2], [8, 8])
		const both = Path.merge([outer, inner])

		const nonzero = normalizeWinding(both)
		expect(nonzero.curves.length).toBe(1)
		expect(Path.area(nonzero)).toBe(100)

		const evenodd = normalizeWinding(both, {fillRule: 'evenodd'})
		expect(evenodd.curves.length).toBe(2)
		expect(Path.area(evenodd)).toBe(100 - 36)
		const areas = evenodd.curves.map(c => planarPathArea({curves: [c]}))
		expect(areas.filter(a => a > 0).length).toBe(1)
		expect(areas.filter(a => a < 0).length).toBe(1)
		expect(windingNumber(evenodd.curves, [5, 5])).toBe(0)
		expect(windingNumber(evenodd.curves, [1, 1])).toBe(1)
	})

	it('keeps open curves and the path attributes', () => {
		const line = Path.line([20, 20], [30, 30])
		const p: Path = {
			...Path.merge([bowTie, line]),
			attrs: {name: 'p'},
		}
		const n = normalizeWinding(p)
		expect(n.attrs).toEqual({name: 'p'})
		expect(n.curves.length).toBe(3)
		expect(n.curves[2]).toEqual(line.curves[0])
	})
})
