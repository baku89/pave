import {vec2} from 'linearly'
import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {spline} from './path/fitting'
import {
	convertVertex,
	deleteVertex,
	insertVertex,
	moveVertex,
	setHandle,
	vertexType,
} from './path/vertexEdit'

const at = (curveIndex: number, vertexIndex: number) => ({
	curveIndex,
	vertexIndex,
})

const argsOf = (p: Path, i: number, c = 0) =>
	(p.curves[c].vertices[i] as {args: readonly [vec2, vec2]}).args

const commands = (p: Path, c = 0) => p.curves[c].vertices.map(v => v.command)

/** Points on the path at evenly spaced lengths. */
const sample = (path: Path, count: number): vec2[] =>
	Array.from({length: count + 1}, (_, i) => Path.point(path, {unit: i / count}))

/** The largest distance from the sampled points to the other path. */
function maxDeviation(from: Path, to: Path, count = 200): number {
	let max = 0
	for (const pt of sample(from, count)) {
		let best = Infinity
		for (const q of sample(to, 2000)) {
			best = Math.min(best, vec2.distance(pt, q))
		}
		max = Math.max(max, best)
	}
	return max
}

/** An open path: a line, then a cubic, then a line, with a smooth joint in the middle. */
const mixed: Path = {
	curves: [
		{
			closed: false,
			vertices: [
				{command: 'L', point: [0, 0]},
				{command: 'L', point: [30, 0]},
				{
					command: 'C',
					point: [60, 30],
					args: [
						[40, 0],
						[60, 20],
					],
				},
				{
					command: 'C',
					point: [60, 60],
					args: [
						[60, 40],
						[60, 50],
					],
				},
				{command: 'L', point: [120, 60]},
			],
		},
	],
}

describe('vertexType', () => {
	it('tells corners from smooth and symmetric joints', () => {
		// L -> C: in-handle a third of the line (10 long), out-handle [40, 0] (10 long), collinear
		expect(vertexType(mixed, at(0, 1))).toBe('symmetric')
		// C -> C: in [60, 20] (10 long), out [60, 40] (10 long), collinear
		expect(vertexType(mixed, at(0, 2))).toBe('symmetric')
		// C -> L: in [60, 50] vertical (10 long), out horizontal (20 long)
		expect(vertexType(mixed, at(0, 3))).toBe('corner')
		// Ends of an open curve
		expect(vertexType(mixed, at(0, 0))).toBe('corner')
		expect(vertexType(mixed, at(0, -1))).toBe('corner')
	})

	it('reports smooth for collinear handles of different lengths', () => {
		const p = setHandle(mixed, at(0, 2), 'out', [60, 45], {link: 'none'})
		expect(vertexType(p, at(0, 2))).toBe('smooth')
	})

	it('reports corners of polygons and wraps around closed curves', () => {
		const square = Path.rect([0, 0], [10, 10])
		for (let i = 0; i < 4; i++) {
			expect(vertexType(square, at(0, i))).toBe('corner')
		}
		const circle = Path.toCubicBezier(Path.circle([0, 0], 10))
		for (let i = 0; i < circle.curves[0].vertices.length; i++) {
			expect(vertexType(circle, at(0, i))).toBe('symmetric')
		}
	})
})

describe('convertVertex', () => {
	it('leaves corners and ends alone', () => {
		expect(convertVertex(mixed, at(0, 3), 'corner')).toBe(mixed)
		expect(convertVertex(mixed, at(0, 0), 'smooth')).toBe(mixed)
	})

	it('turns a corner smooth keeping each handle length', () => {
		const p = convertVertex(mixed, at(0, 3), 'smooth')
		expect(vertexType(p, at(0, 3))).toBe('smooth')
		expect(commands(p)).toEqual(['L', 'L', 'C', 'C', 'C'])

		const [, inHandle] = argsOf(p, 3)
		const [outHandle, far] = argsOf(p, 4)
		expect(vec2.distance(inHandle, [60, 60])).toBeCloseTo(10)
		expect(vec2.distance(outHandle, [60, 60])).toBeCloseTo(20)
		// The far handle of the converted line is a third of the way along it
		expect(far).toEqual([100, 60])
		// Both handles lie on the average direction, 45° between down and right
		expect(vec2.normalize(vec2.sub(outHandle, [60, 60]))).toEqual(
			vec2.normalize([1, 1])
		)
		expect(p.curves[0].vertices[3].point).toEqual([60, 60])
	})

	it('turns a corner symmetric with the mean or the given length', () => {
		const p = convertVertex(mixed, at(0, 3), 'symmetric')
		expect(vertexType(p, at(0, 3))).toBe('symmetric')
		expect(vec2.distance(argsOf(p, 3)[1], [60, 60])).toBeCloseTo(15)
		expect(vec2.distance(argsOf(p, 4)[0], [60, 60])).toBeCloseTo(15)

		const q = convertVertex(mixed, at(0, 3), 'symmetric', {handleLength: 4})
		expect(vec2.distance(argsOf(q, 3)[1], [60, 60])).toBeCloseTo(4)
		expect(vec2.distance(argsOf(q, 4)[0], [60, 60])).toBeCloseTo(4)
	})

	it('works on a polygon corner and keeps attributes', () => {
		const square: Path = {
			curves: [
				{
					...Path.rect([0, 0], [10, 10]).curves[0],
					vertices: Path.rect([0, 0], [10, 10]).curves[0].vertices.map(
						(v, i) => ({...v, attrs: {index: i}})
					),
				},
			],
		}
		const p = convertVertex(square, at(0, 0), 'smooth')
		expect(vertexType(p, at(0, 0))).toBe('symmetric')
		expect(commands(p)).toEqual(['C', 'C', 'L', 'L'])
		expect(p.curves[0].vertices.map(v => v.attrs)).toEqual(
			square.curves[0].vertices.map(v => v.attrs)
		)
	})
})

describe('setHandle', () => {
	it('mirrors the opposite handle when symmetric', () => {
		const p = setHandle(mixed, at(0, 2), 'out', [70, 40])
		expect(argsOf(p, 3)[0]).toEqual([70, 40])
		expect(argsOf(p, 2)[1]).toEqual([50, 20])
		expect(vertexType(p, at(0, 2))).toBe('symmetric')
	})

	it('only turns the opposite handle when smooth', () => {
		const p = setHandle(mixed, at(0, 2), 'in', [40, 30], {link: 'smooth'})
		expect(argsOf(p, 2)[1]).toEqual([40, 30])
		// The out-handle keeps its length of 10 but points away from the in-handle
		const out = argsOf(p, 3)[0]
		expect(vec2.distance(out, [60, 30])).toBeCloseTo(10)
		expect(out).toEqual([70, 30])
		expect(vertexType(p, at(0, 2))).toBe('smooth')
	})

	it('leaves the opposite handle when unlinked and converts lines', () => {
		const p = setHandle(mixed, at(0, 1), 'in', [20, -10], {link: 'none'})
		expect(commands(p)).toEqual(['L', 'C', 'C', 'C', 'L'])
		expect(argsOf(p, 1)).toEqual([
			[10, 0],
			[20, -10],
		])
		expect(argsOf(p, 2)[0]).toEqual([40, 0])
		expect(vertexType(p, at(0, 1))).toBe('corner')
	})

	it('does nothing where there is no segment on that side', () => {
		expect(setHandle(mixed, at(0, 0), 'in', [5, 5])).toBe(mixed)
	})
})

describe('moveVertex', () => {
	it('moves the handles along by default', () => {
		const p = moveVertex(mixed, at(0, 2), [65, 35])
		expect(p.curves[0].vertices[2].point).toEqual([65, 35])
		expect(argsOf(p, 2)).toEqual([
			[40, 0],
			[65, 25],
		])
		expect(argsOf(p, 3)).toEqual([
			[65, 45],
			[60, 50],
		])
	})

	it('can leave the handles in place', () => {
		const p = moveVertex(mixed, at(0, 2), [65, 35], {handles: false})
		expect(p.curves[0].vertices[2].point).toEqual([65, 35])
		expect(argsOf(p, 2)[1]).toEqual([60, 20])
		expect(argsOf(p, 3)[0]).toEqual([60, 40])
	})

	it('moves the move-to of an open curve and wraps on closed ones', () => {
		const p = moveVertex(mixed, at(0, 0), [-5, 5])
		expect(p.curves[0].vertices[0]).toEqual({command: 'L', point: [-5, 5]})

		const circle = Path.toCubicBezier(Path.circle([0, 0], 10))
		const q = moveVertex(circle, at(0, 0), [12, 0])
		const n = circle.curves[0].vertices.length
		// The out-handle of the first vertex lives on the second, the in-handle on itself
		const delta = vec2.sub([12, 0], circle.curves[0].vertices[0].point)
		expect(argsOf(q, 1)[0]).toEqual(vec2.add(argsOf(circle, 1)[0], delta))
		expect(argsOf(q, 0)[1]).toEqual(vec2.add(argsOf(circle, 0)[1], delta))
		expect(argsOf(q, n - 1)).toEqual(argsOf(circle, n - 1))
	})
})

describe('insertVertex', () => {
	it('adds a vertex without changing the shape', () => {
		const before = Path.length(mixed)
		const p = insertVertex(mixed, {unit: 0.5})
		expect(p.curves[0].vertices.length).toBe(6)
		expect(Path.length(p)).toBeCloseTo(before, 6)
		expect(maxDeviation(p, mixed)).toBeLessThan(0.05)
		expect(Path.bounds(p)).toEqual(Path.bounds(mixed))
	})

	it('inserts on the closing segment of a closed curve', () => {
		const square = Path.rect([0, 0], [10, 10])
		const p = insertVertex(square, {curveIndex: 0, segmentIndex: 3, time: 0.5})
		expect(p.curves[0].vertices.length).toBe(5)
		expect(p.curves[0].vertices.at(-1)!.point).toEqual([0, 5])
		expect(p.curves[0].vertices[0].point).toEqual([0, 0])
		expect(Path.length(p)).toBeCloseTo(40, 6)
		expect(Path.area(p)).toBeCloseTo(Path.area(square), 6)
	})

	it('keeps the path when the location is an anchor', () => {
		expect(insertVertex(mixed, {curveIndex: 0, segmentIndex: 1, time: 0})).toBe(
			mixed
		)
	})

	it('interpolates attributes', () => {
		const p: Path = {
			curves: [
				{
					closed: false,
					vertices: [
						{command: 'L', point: [0, 0], attrs: {w: 0}},
						{command: 'L', point: [10, 0], attrs: {w: 10}},
					],
				},
			],
		}
		const q = insertVertex(p, {unit: 0.3})
		expect(q.curves[0].vertices.map(v => v.attrs?.w)).toEqual([0, 3, 10])
	})
})

describe('deleteVertex', () => {
	it('preserves the shape of a gently curved path', () => {
		const original = Path.toCubicBezier(Path.arc([50, 50], 40, 0, 120))
		expect(original.curves[0].vertices.length).toBe(3)
		const p = deleteVertex(original, at(0, 1))
		expect(p.curves[0].vertices.length).toBe(2)
		expect(commands(p)[1]).toBe('C')
		expect(p.curves[0].vertices[1].point).toEqual(
			original.curves[0].vertices[2].point
		)
		expect(maxDeviation(original, p)).toBeLessThan(0.2)
		expect(Path.length(p)).toBeCloseTo(Path.length(original), 0)
	})

	it('preserves the shape of a wave', () => {
		const wave = spline(
			Array.from(
				{length: 7},
				(_, i): vec2 => [i * 20, 20 * Math.sin((i / 6) * Math.PI * 2)]
			)
		)
		const p = deleteVertex(wave, at(0, 3))
		expect(p.curves[0].vertices.length).toBe(6)
		expect(maxDeviation(wave, p)).toBeLessThan(1)
	})

	it('joins two lines into a line', () => {
		const p = deleteVertex(Path.polyline([0, 0], [10, 2], [20, 0]), at(0, 1))
		expect(p).toEqual(Path.line([0, 0], [20, 0]))
	})

	it('just drops the vertex when not preserving the shape', () => {
		const p = deleteVertex(mixed, at(0, 2), {preserveShape: false})
		expect(p.curves[0].vertices.length).toBe(4)
		expect(p.curves[0].vertices[2]).toEqual(mixed.curves[0].vertices[3])
	})

	it('drops the ends of an open curve', () => {
		const p = deleteVertex(mixed, at(0, 0))
		expect(p.curves[0].vertices[0]).toEqual({command: 'L', point: [30, 0]})
		expect(p.curves[0].vertices.length).toBe(4)

		const q = deleteVertex(mixed, at(0, -1))
		expect(q.curves[0].vertices.length).toBe(4)
		expect(q.curves[0].vertices.at(-1)).toEqual(mixed.curves[0].vertices[3])
	})

	it('shrinks small curves naturally', () => {
		const dot = deleteVertex(Path.line([0, 0], [10, 0]), at(0, 1))
		expect(dot.curves[0].vertices).toEqual([{command: 'L', point: [0, 0]}])

		const gone = deleteVertex(dot, at(0, 0))
		expect(gone.curves).toEqual([])

		const triangle = Path.polygon([0, 0], [10, 0], [0, 10])
		const two = deleteVertex(triangle, at(0, 1))
		expect(two.curves[0].closed).toBe(true)
		expect(two.curves[0].vertices.map(v => v.point)).toEqual([
			[0, 0],
			[0, 10],
		])
	})

	it('wraps around closed curves and keeps attributes', () => {
		const circle: Path = {
			attrs: {stroke: 'blue'},
			curves: Path.toCubicBezier(Path.circle([0, 0], 10)).curves.map(c => ({
				...c,
				vertices: c.vertices.map((v, i) => ({...v, attrs: {index: i}})),
			})),
		}
		const n = circle.curves[0].vertices.length
		const p = deleteVertex(circle, at(0, 0))
		expect(p.attrs).toEqual({stroke: 'blue'})
		expect(p.curves[0].vertices.length).toBe(n - 1)
		expect(p.curves[0].vertices.map(v => v.attrs?.index)).toEqual(
			Array.from({length: n - 1}, (_, i) => i + 1)
		)
		expect(maxDeviation(circle, p)).toBeLessThan(0.3)
	})
})
