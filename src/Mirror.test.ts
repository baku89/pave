import {Line} from 'geome'
import {type vec2} from 'linearly'
import {describe, expect, it, test} from 'vitest'

import {Path} from './index'
import {windingNumber} from './path/planar'
import {planarPathArea} from './pathPlanar'

const X0 = Line.yAxis // x = 0, keeps x > 0

const commands = (p: Path) =>
	p.curves.flatMap(c => c.vertices.map(v => v.command))

const signedAreas = (p: Path) =>
	p.curves.map(c => planarPathArea({curves: [c]}))

function rect(x0: number, y0: number, x1: number, y1: number) {
	return Path.rect([x0, y0], [x1, y1])
}

/**
 * The defining property of the symmetrization: the winding number equals that of the source
 * on the kept side, and is symmetric across the axis.
 */
function expectSymmetricWinding(source: Path, axis: Line, result: Path) {
	const matrix = Line.reflectionMatrix(axis)
	const [nx, ny] = [
		Math.cos((axis.theta * Math.PI) / 180),
		Math.sin((axis.theta * Math.PI) / 180),
	]
	const n = 41
	let checked = 0
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			const q: vec2 = [
				-120 + (240 * (i + 0.137)) / n,
				-120 + (240 * (j + 0.271)) / n,
			]
			if (nx * q[0] + ny * q[1] - axis.offset <= 1e-6) continue

			const mirrored: vec2 = [
				matrix[0] * q[0] + matrix[2] * q[1] + matrix[4],
				matrix[1] * q[0] + matrix[3] * q[1] + matrix[5],
			]
			const w = windingNumber(source.curves, q) + 0
			expect(windingNumber(result.curves, q) + 0).toBe(w)
			expect(windingNumber(result.curves, mirrored) + 0).toBe(w)
			checked++
		}
	}
	expect(checked).toBeGreaterThan(100)
}

describe('Path.reflect', () => {
	it('reflects a path and accepts two points', () => {
		const p = Path.reflect(rect(10, 0, 20, 10), [
			[0, 0],
			[0, 10],
		])
		expect(Path.bounds(p)).toEqual([
			[-20, 0],
			[-10, 10],
		])
	})

	it('keeps arcs on the reflected circle', () => {
		const p = Path.reflect(Path.circle([30, 5], 10), X0)
		expect(Path.bounds(p)).toEqual([
			[-40, -5],
			[-20, 15],
		])
		expect(Math.abs(Path.area(p))).toBeCloseTo(Math.PI * 100, 6)
	})

	it('throws on an axis of coincident points', () => {
		expect(() =>
			Path.mirror(rect(0, 0, 1, 1), [
				[1, 1],
				[1, 1],
			])
		).toThrow()
	})
})

describe('Path.mirror on closed curves', () => {
	it('symmetrizes a rect crossing the axis, adding vertices on it', () => {
		const p = Path.mirror(rect(-5, 0, 20, 10), X0)
		expect(p.curves.length).toBe(1)
		expect(p.curves[0].closed).toBe(true)
		expect(Path.bounds(p)).toEqual([
			[-20, 0],
			[20, 10],
		])
		expect(Math.abs(Path.area(p))).toBeCloseTo(400, 8)
	})

	it('keeps the other side with an inverted axis', () => {
		const p = Path.mirror(rect(-5, 0, 20, 10), Line.invert(X0))
		expect(Path.bounds(p)).toEqual([
			[-5, 0],
			[5, 10],
		])
	})

	it('merges an edge lying on the axis away', () => {
		const p = Path.mirror(rect(0, 0, 10, 10), X0)
		expect(p.curves.length).toBe(1)
		expect(Math.abs(Path.area(p))).toBeCloseTo(200, 8)
		expect(p.curves[0].vertices.filter(v => v.point[0] === 0).length).toBe(2)
	})

	it('returns an empty path when nothing is on the kept side', () => {
		expect(Path.mirror(rect(-10, 0, -5, 10), X0).curves).toEqual([])
		expect(Path.mirror(rect(-10, 0, 0, 10), X0).curves).toEqual([])
	})

	it('duplicates a curve entirely on the kept side with its orientation', () => {
		const source = rect(5, 0, 15, 10)
		const p = Path.mirror(source, X0)
		expect(p.curves.length).toBe(2)
		const [a, b] = signedAreas(p)
		expect(a).toBeCloseTo(b, 8)
	})

	it('does not cut a circle tangent to the axis', () => {
		const source = Path.circle([10, 0], 10)
		const p = Path.mirror(source, X0)
		expect(p.curves.length).toBe(2)
		expect(p.curves[0].vertices.length).toBe(source.curves[0].vertices.length)
	})

	it('keeps arcs as arcs when a circle crosses the axis', () => {
		const p = Path.mirror(Path.circle([5, 0], 10), X0)
		expect(p.curves.length).toBe(1)
		expect(commands(p).every(c => c === 'A')).toBe(true)
		// Two circle caps of radius 10 with the chord at distance 5 from the center
		const h = 5
		const r = 10
		const minor = r * r * Math.acos(h / r) - h * Math.sqrt(r * r - h * h)
		expect(Math.abs(Path.area(p))).toBeCloseTo(2 * (Math.PI * r * r - minor), 6)
	})

	it('keeps a hole crossing the axis as a hole', () => {
		const source = Path.subtract(Path.circle([5, 0], 40), [
			Path.circle([0, 0], 10),
		])
		const p = Path.mirror(source, X0)
		expect(p.curves.length).toBe(2)
		const [a, b] = signedAreas(p)
		expect(Math.sign(a)).toBe(-Math.sign(b))
		expectSymmetricWinding(source, X0, p)
	})

	it('duplicates a hole on the kept side and drops one on the other', () => {
		const outer = Path.circle([0, 0], 60)
		const kept = Path.mirror(
			Path.subtract(outer, [Path.circle([30, 0], 10)]),
			X0
		)
		expect(kept.curves.length).toBe(3)
		expect(Math.abs(Path.area(kept))).toBeCloseTo(Math.PI * (3600 - 2 * 100), 5)

		const dropped = Path.mirror(
			Path.subtract(outer, [Path.circle([-30, 0], 10)]),
			X0
		)
		expect(dropped.curves.length).toBe(1)
		expect(Math.abs(Path.area(dropped))).toBeCloseTo(Math.PI * 3600, 5)
	})

	test.each<[string, Path, Line]>([
		[
			'a C-shape',
			Path.subtract(rect(-30, -40, 60, 40), [rect(-50, -20, 40, 20)]),
			X0,
		],
		[
			'a tilted axis on a rounded shape',
			Path.unite([Path.circle([10, 10], 30), rect(-40, -10, 20, 50)]),
			Line.fromPoints([-20, -50], [30, 60])!,
		],
		[
			'a cubic crossing three times',
			{
				curves: [
					{
						vertices: [
							{command: 'L', point: [-30, -60]},
							{
								command: 'C',
								args: [
									[120, -30],
									[-120, 30],
								],
								point: [30, 60],
							},
							{command: 'L', point: [70, 60]},
							{command: 'L', point: [70, -60]},
						],
						closed: true,
					},
				],
			},
			X0,
		],
		[
			'a rotated elliptic arc',
			{
				curves: [
					{
						vertices: [
							{command: 'L', point: [-40, -20]},
							{command: 'A', args: [[60, 25], 30, true, true], point: [30, 40]},
						],
						closed: true,
					},
				],
			},
			Line.of(20, 3),
		],
		[
			'a reversed-sweep arc',
			{
				curves: [
					{
						vertices: [
							{command: 'L', point: [-40, -20]},
							{
								command: 'A',
								args: [[45, 30], -40, true, false],
								point: [30, 40],
							},
						],
						closed: true,
					},
				],
			},
			Line.of(200, -4),
		],
		[
			'a self-intersecting star',
			{
				curves: [
					{
						vertices: (
							[
								[0, -70],
								[40, 60],
								[-65, -20],
								[65, -20],
								[-40, 60],
							] as vec2[]
						).map(point => ({command: 'L' as const, point})),
						closed: true,
					},
				],
			},
			Line.of(0, 7),
		],
	])('preserves the winding numbers of %s', (_, source, axis) => {
		expectSymmetricWinding(source, axis, Path.mirror(source, axis))
	})
})

describe('Path.mirror on open curves', () => {
	const open = (...points: vec2[]): Path => ({
		curves: [
			{
				vertices: points.map(point => ({command: 'L' as const, point})),
				closed: false,
			},
		],
	})

	it('joins a crossing line into a symmetric open curve', () => {
		const p = Path.mirror(open([-5, 3], [10, 3]), X0)
		expect(p.curves.length).toBe(1)
		expect(p.curves[0].closed).toBe(false)
		expect(p.curves[0].vertices.map(v => v.point)).toEqual([
			[-10, 3],
			[0, 3],
			[10, 3],
		])
	})

	it('closes a curve with both ends on the axis', () => {
		const p = Path.mirror(open([0, 0], [10, 5], [0, 10]), X0)
		expect(p.curves.length).toBe(1)
		expect(p.curves[0].closed).toBe(true)
		expect(Math.abs(Path.area(p))).toBeCloseTo(100, 8)
	})

	it('joins at whichever end is on the axis', () => {
		const fromAxis = Path.mirror(open([0, 0], [10, 5]), X0)
		expect(fromAxis.curves[0].vertices.map(v => v.point)).toEqual([
			[-10, 5],
			[0, 0],
			[10, 5],
		])
		const toAxis = Path.mirror(open([10, 5], [0, 0]), X0)
		expect(toAxis.curves[0].vertices.map(v => v.point)).toEqual([
			[10, 5],
			[0, 0],
			[-10, 5],
		])
	})

	it('leaves two curves when no end reaches the axis', () => {
		const p = Path.mirror(open([5, 0], [10, 5]), X0)
		expect(p.curves.length).toBe(2)
		expect(p.curves[1].vertices.map(v => v.point)).toEqual([
			[-10, 5],
			[-5, 0],
		])
	})

	it('splits into one curve per excursion to the kept side', () => {
		const p = Path.mirror(
			open([-5, 0], [5, 5], [-5, 10], [5, 15], [-5, 20]),
			X0
		)
		expect(p.curves.length).toBe(2)
		expect(p.curves.every(c => c.closed)).toBe(true)
	})

	it('handles cubics and arcs', () => {
		const p = Path.mirror(
			{
				curves: [
					{
						vertices: [
							{command: 'L', point: [-10, 0]},
							{
								command: 'C',
								args: [
									[0, 20],
									[10, 20],
								],
								point: [20, 0],
							},
							{command: 'A', args: [[10, 10], 0, false, true], point: [40, 0]},
						],
						closed: false,
					},
				],
			},
			X0
		)
		expect(p.curves.length).toBe(1)
		expect(p.curves[0].closed).toBe(false)
		expect(commands(p).slice(1)).toEqual(['A', 'C', 'C', 'A'])
		expect(Path.bounds(p)[0][0]).toBeCloseTo(-40, 8)
		expect(Path.bounds(p)[1][0]).toBeCloseTo(40, 8)
	})
})
