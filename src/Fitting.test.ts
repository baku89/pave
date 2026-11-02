import {vec2} from 'linearly'
import {describe, expect, it} from 'vitest'

import {CubicBezier, Path, Segment} from './index'
import {fit, simplify, smooth, spline} from './path/fitting'
import {vertexType} from './path/vertexEdit'

const commands = (p: Path) =>
	p.curves.flatMap(c => c.vertices.map(v => v.command))

const vertexCount = (p: Path) =>
	p.curves.reduce((n, c) => n + c.vertices.length, 0)

/** The largest distance from any of the points to the path. */
function maxDeviation(path: Path, points: readonly vec2[]): number {
	const segs = Path.segments(path)
	let max = 0
	for (const pt of points) {
		let best = Infinity
		for (const seg of segs) {
			if (seg.command === 'C') {
				best = Math.min(best, CubicBezier.project(seg, pt).distance!)
			} else {
				for (let i = 0; i <= 64; i++) {
					best = Math.min(
						best,
						vec2.distance(pt, Segment.point(seg, {time: i / 64}))
					)
				}
			}
		}
		max = Math.max(max, best)
	}
	return max
}

/** Points on a path at evenly spaced lengths. */
function sample(path: Path, count: number): vec2[] {
	return Array.from({length: count + 1}, (_, i) =>
		Path.point(path, {unit: i / count})
	)
}

describe('fit', () => {
	it('returns an empty path, a dot or a line for 0, 1, 2 points', () => {
		expect(fit([])).toEqual({curves: []})
		expect(fit([[3, 4]])).toEqual({
			curves: [{vertices: [{point: [3, 4], command: 'L'}], closed: false}],
		})
		expect(fit([[3, 4]], {closed: true}).curves[0].closed).toBe(true)
		expect(
			fit([
				[0, 0],
				[10, 0],
			])
		).toEqual(Path.line([0, 0], [10, 0]))
		expect(
			fit([
				[0, 0],
				[0, 0],
				[10, 0],
				[10, 0],
			])
		).toEqual(Path.line([0, 0], [10, 0]))
	})

	it('reproduces a cubic from points sampled on it', () => {
		const original = Path.cubicBezier([0, 0], [30, 80], [70, -40], [100, 20])
		const points = sample(original, 60)

		const fitted = fit(points, {tolerance: 0.5})

		expect(commands(fitted)).toEqual(['L', 'C'])
		expect(maxDeviation(fitted, points)).toBeLessThan(0.5)
		expect(maxDeviation(original, sample(fitted, 60))).toBeLessThan(0.5)

		const [c1, c2] = (
			fitted.curves[0].vertices[1] as {args: readonly [vec2, vec2]}
		).args
		expect(vec2.distance(c1, [30, 80])).toBeLessThan(1)
		expect(vec2.distance(c2, [70, -40])).toBeLessThan(1)
	})

	it('splits where a single cubic cannot follow and stays within tolerance', () => {
		const points: vec2[] = Array.from({length: 100}, (_, i) => {
			const t = i / 99
			return [100 * t, 30 * Math.sin(t * Math.PI * 4)]
		})
		const fitted = fit(points, {tolerance: 0.25})

		expect(fitted.curves[0].vertices.length).toBeGreaterThan(2)
		expect(fitted.curves[0].vertices.length).toBeLessThan(20)
		expect(maxDeviation(fitted, points)).toBeLessThan(0.25)
		expect(fitted.curves[0].vertices[0].point).toEqual(points[0])
		expect(fitted.curves[0].vertices.at(-1)!.point).toEqual(points.at(-1))
	})

	it('fits a loop into a closed curve that is smooth at the seam', () => {
		const points: vec2[] = Array.from({length: 48}, (_, i) =>
			vec2.scaleAndAdd([50, 50], vec2.dir((i / 48) * 360), 40)
		)
		const fitted = fit(points, {tolerance: 0.1, closed: true})
		const curve = fitted.curves[0]

		expect(curve.closed).toBe(true)
		expect(curve.vertices.every(v => v.command === 'C')).toBe(true)
		expect(curve.vertices.length).toBeLessThan(12)
		expect(maxDeviation(fitted, points)).toBeLessThan(0.1)
		expect(vertexType(fitted, {curveIndex: 0, vertexIndex: 0})).not.toBe(
			'corner'
		)
		expect(Path.length(fitted)).toBeCloseTo(2 * Math.PI * 40, 0)
	})
})

describe('simplify', () => {
	it('reduces a dense polyline of a circle within tolerance', () => {
		const dense = Path.flatten(Path.circle([50, 50], 40), 0.001)
		const points = dense.curves[0].vertices.map(v => v.point)
		expect(points.length).toBeGreaterThan(100)

		const simple = simplify(dense, {tolerance: 0.5})

		expect(simple.curves[0].closed).toBe(true)
		expect(vertexCount(simple)).toBeLessThan(16)
		expect(maxDeviation(simple, points)).toBeLessThan(0.5)
		expect(Path.length(simple)).toBeCloseTo(Path.length(dense), 0)
	})

	it('collapses collinear lines', () => {
		const stairs = Path.polyline(
			...Array.from({length: 11}, (_, i): vec2 => [i * 10, 0]),
			...Array.from({length: 10}, (_, i): vec2 => [100, (i + 1) * 10])
		)
		const simple = simplify(stairs, {tolerance: 0.1})
		expect(simple).toEqual(Path.polyline([0, 0], [100, 0], [100, 100]))
		expect(Path.point(simple, {unit: 0})).toEqual([0, 0])
		expect(Path.point(simple, {unit: 1})).toEqual([100, 100])
		expect(maxDeviation(simple, [[100, 0]])).toBeLessThan(0.1)
	})

	it('keeps the attributes of the path and the curves', () => {
		const p: Path = {
			attrs: {stroke: 'red'},
			attrDefs: {width: {default: 1}},
			curves: [
				{
					...Path.polyline([0, 0], [10, 10], [20, 20]).curves[0],
					attrs: {width: 3},
				},
			],
		}
		const simple = simplify(p)
		expect(simple.attrs).toEqual({stroke: 'red'})
		expect(simple.attrDefs).toEqual({width: {default: 1}})
		expect(simple.curves[0].attrs).toEqual({width: 3})
	})
})

describe('spline', () => {
	const points: vec2[] = [
		[10, 50],
		[30, 20],
		[60, 80],
		[90, 40],
	]

	it('passes through the points', () => {
		const p = spline(points)
		expect(commands(p)).toEqual(['L', 'C', 'C', 'C'])
		expect(p.curves[0].vertices.map(v => v.point)).toEqual(points)
		for (const [i, pt] of points.entries()) {
			expect(
				Path.point(p, {curveIndex: 0, segmentIndex: Math.min(i, 2), time: 0})
			).toEqual(i < 3 ? pt : points[2])
		}
		expect(Path.point(p, {unit: 1})).toEqual([90, 40])
	})

	it('is smooth at interior points and closes when asked', () => {
		// Cardinal splines give both handles of a point the same vector
		const open = spline(points)
		expect(vertexType(open, {curveIndex: 0, vertexIndex: 1})).toBe('symmetric')
		expect(vertexType(open, {curveIndex: 0, vertexIndex: 2})).toBe('symmetric')

		const closed = spline(points, {closed: true})
		expect(closed.curves[0].closed).toBe(true)
		expect(closed.curves[0].vertices.length).toBe(4)
		expect(closed.curves[0].vertices.every(v => v.command === 'C')).toBe(true)
		for (let i = 0; i < 4; i++) {
			expect(vertexType(closed, {curveIndex: 0, vertexIndex: i})).toBe(
				'symmetric'
			)
		}
	})

	it('is straight with zero tension and looser with more', () => {
		const straight = spline(points, {tension: 0})
		expect(Path.length(straight)).toBeCloseTo(
			Path.length(Path.polyline(...points)),
			6
		)
		expect(Path.length(spline(points, {tension: 1}))).toBeGreaterThan(
			Path.length(spline(points, {tension: 0.5}))
		)
	})

	it('handles few points', () => {
		expect(spline([])).toEqual({curves: []})
		expect(spline([[1, 2]]).curves[0].vertices).toEqual([
			{point: [1, 2], command: 'L'},
		])
		const two = spline([
			[0, 0],
			[10, 0],
		])
		expect(Path.length(two)).toBeCloseTo(10, 6)
	})
})

describe('smooth', () => {
	it('makes interior vertices smooth while keeping anchors', () => {
		const zigzag = Path.polyline([10, 50], [30, 20], [60, 80], [90, 40])
		const p = smooth(zigzag)

		expect(commands(p)).toEqual(['L', 'C', 'C', 'C'])
		expect(p.curves[0].vertices.map(v => v.point)).toEqual(
			zigzag.curves[0].vertices.map(v => v.point)
		)
		expect(vertexType(p, {curveIndex: 0, vertexIndex: 1})).toBe('smooth')
		expect(vertexType(p, {curveIndex: 0, vertexIndex: 2})).toBe('smooth')
		expect(vertexType(p, {curveIndex: 0, vertexIndex: 0})).toBe('corner')
	})

	it('wraps around closed curves', () => {
		const square = Path.rect([0, 0], [100, 100])
		const p = smooth(square)
		expect(p.curves[0].closed).toBe(true)
		for (let i = 0; i < 4; i++) {
			// Equal distances to both neighbours make the handles symmetric
			expect(vertexType(p, {curveIndex: 0, vertexIndex: i})).toBe('symmetric')
		}
		expect(Path.length(p)).toBeGreaterThan(400)
	})

	it('uses the alpha to weigh unequal neighbours', () => {
		const uneven = Path.polyline([0, 0], [10, 0], [100, 50], [110, 50])
		const uniform = smooth(uneven, {factor: 0})
		const chordal = smooth(uneven, {factor: 1})
		const handleRatio = (p: Path) => {
			const v1 = p.curves[0].vertices[1] as {args: readonly [vec2, vec2]}
			const v2 = p.curves[0].vertices[2] as {args: readonly [vec2, vec2]}
			const inn = vec2.distance(v1.args[1], [10, 0])
			const out = vec2.distance(v2.args[0], [10, 0])
			return out / inn
		}
		expect(handleRatio(uniform)).toBeCloseTo(1, 6)
		expect(handleRatio(chordal)).toBeGreaterThan(5)
	})

	it('converts arcs and keeps attributes', () => {
		const arc: Path = {
			attrs: {kind: 'arc'},
			curves: [
				{
					...Path.arc([50, 50], 40, 0, 180).curves[0],
					attrs: {name: 'a'},
				},
			],
		}
		const p = smooth(arc)
		expect(p.attrs).toEqual({kind: 'arc'})
		expect(p.curves[0].attrs).toEqual({name: 'a'})
		expect(commands(p).every(c => c !== 'A')).toBe(true)
	})
})
