import {vec2} from 'linearly'
import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {
	convexHull,
	orientedBounds,
	supportPoint,
	tangentsAlong,
	tangentsFrom,
} from './path/hull'

const circle = Path.circle([0, 0], 100)
const square = Path.rect([0, 0], [100, 100])

describe('supportPoint', () => {
	it('finds the extreme point of a circle in a direction', () => {
		const hit = supportPoint(circle, [1, 0])!
		expect(hit.point).toEqual([100, 0])
		const diag = supportPoint(circle, [1, 1])!
		expect(vec2.len(diag.point)).toBeCloseTo(100, 6)
		expect(diag.point[0]).toBeCloseTo(diag.point[1], 6)
	})

	it('picks a corner of a square', () => {
		expect(supportPoint(square, [1, 1])!.point).toEqual([100, 100])
	})

	it('returns null for an empty path', () => {
		expect(supportPoint(Path.empty, [1, 0])).toBeNull()
	})
})

describe('tangentsAlong', () => {
	it('finds the two horizontal tangents of a circle', () => {
		const hits = tangentsAlong(circle, [1, 0])
		expect(hits).toHaveLength(2)
		const ys = hits.map(h => h.point[1]).sort((a, b) => a - b)
		expect(ys).toEqual([-100, 100])
		expect(new Set(hits.map(h => h.side))).toEqual(new Set(['left', 'right']))
	})

	it('reports the corners of a square for a diagonal direction', () => {
		const hits = tangentsAlong(square, [1, 1])
		const points = hits.map(h => h.point)
		expect(points).toContainEqual([100, 0])
		expect(points).toContainEqual([0, 100])
		expect(hits).toHaveLength(2)
	})

	it('extreme returns the silhouette', () => {
		const hits = tangentsAlong(square, [1, 0], {extreme: true})
		const ys = hits.map(h => h.point[1]).sort((a, b) => a - b)
		expect(ys).toEqual([0, 100])
	})
})

describe('tangentsFrom', () => {
	it('finds the tangents from an outside point to a circle', () => {
		const hits = tangentsFrom(circle, [0, 300])
		expect(hits).toHaveLength(2)
		for (const hit of hits) {
			expect(hit.point[1]).toBeCloseTo((100 * 100) / 300, 4)
			// The tangent is perpendicular to the radius
			expect(vec2.dot(hit.tangent, hit.point)).toBeCloseTo(0, 4)
		}
	})

	it('returns nothing from inside', () => {
		expect(tangentsFrom(circle, [10, 10])).toHaveLength(0)
		expect(tangentsFrom(circle, [10, 10], {extreme: true})).toHaveLength(0)
	})

	it('extreme picks the enclosing corners of a square', () => {
		const hits = tangentsFrom(square, [50, -100], {extreme: true})
		const points = hits.map(h => h.point)
		expect(points).toContainEqual([0, 0])
		expect(points).toContainEqual([100, 0])
	})
})

describe('convexHull', () => {
	it('keeps a circle as it is', () => {
		const hull = convexHull(circle)
		expect(hull.curves).toHaveLength(1)
		expect(hull.curves[0].closed).toBe(true)
		expect(Math.abs(Path.area(hull))).toBeCloseTo(
			Math.abs(Path.area(circle)),
			2
		)
		expect(hull.curves[0].vertices.every(v => v.command === 'A')).toBe(true)
	})

	it('wraps a concave polygon with lines', () => {
		const star = Path.polygon(
			[0, 0],
			[100, 0],
			[50, 30],
			[100, 100],
			[0, 100],
			[50, 70]
		)
		const hull = convexHull(star)
		expect(Math.abs(Path.area(hull))).toBeCloseTo(10000, 2)
		expect(hull.curves[0].vertices).toHaveLength(4)
	})

	it('joins two circles with common tangents', () => {
		const two = Path.merge([Path.circle([0, 0], 50), Path.circle([200, 0], 50)])
		const hull = convexHull(two)
		const commands = hull.curves[0].vertices.map(v => v.command)
		expect(commands.filter(c => c === 'A').length).toBeGreaterThanOrEqual(2)
		expect(commands.filter(c => c === 'L').length).toBeGreaterThanOrEqual(2)
		// Area is two half discs plus the rectangle between them
		expect(Math.abs(Path.area(hull))).toBeCloseTo(Math.PI * 2500 + 200 * 100, 0)
		const b = Path.bounds(hull)
		expect(b[0]).toEqual([-50, -50])
		expect(b[1]).toEqual([250, 50])
	})

	it('wraps open curves and keeps the bulge of a cubic', () => {
		const arch = Path.cubicBezier([0, 0], [0, 100], [100, 100], [100, 0])
		const hull = convexHull(arch)
		expect(hull.curves[0].closed).toBe(true)
		// The top of the hull is the top of the curve, not of the control points
		expect(Path.bounds(hull)[1][1]).toBeCloseTo(75, 4)
		expect(hull.curves[0].vertices.some(v => v.command === 'C')).toBe(true)
	})
})

describe('orientedBounds', () => {
	it('fits a rotated rectangle', () => {
		const rect = Path.transform(Path.rect([0, 0], [100, 40]), [
			...vec2.dir(30),
			...vec2.dir(120),
			0,
			0,
		] as any)
		const ob = orientedBounds(rect)!
		expect(ob.size[0] * ob.size[1]).toBeCloseTo(4000, 2)
		expect(Math.min(...ob.size)).toBeCloseTo(40, 2)
	})
})
