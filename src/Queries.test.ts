import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {
	centroid,
	contains,
	hitTest,
	intersections,
	nearest,
	selfIntersections,
} from './path/queries'

const square = Path.rect([0, 0], [100, 100])
const circle = Path.circle([0, 0], 100)

describe('contains', () => {
	it('tells inside from outside', () => {
		expect(contains(square, [50, 50])).toBe(true)
		expect(contains(square, [150, 50])).toBe(false)
	})

	it('follows the fill rule', () => {
		const doubled = Path.merge([square, square])
		expect(contains(doubled, [50, 50])).toBe(true)
		expect(contains(doubled, [50, 50], {fillRule: 'evenodd'})).toBe(false)
	})
})

describe('nearest', () => {
	it('projects onto a circle', () => {
		const n = nearest(circle, [300, 0])!
		expect(n.point).toEqual([100, 0])
		expect(n.distance).toBeCloseTo(200, 4)
	})
})

describe('hitTest', () => {
	it('prefers vertices, then handles, then the stroke, then the fill', () => {
		const c = Path.cubicBezier([0, 0], [0, 50], [100, 50], [100, 0])
		expect(hitTest(c, [1, 1])).toMatchObject({type: 'vertex', vertexIndex: 0})
		expect(hitTest(c, [99, 49])).toMatchObject({
			type: 'handle',
			vertexIndex: 1,
			side: 'in',
		})
		expect(hitTest(c, [1, 49])).toMatchObject({
			type: 'handle',
			vertexIndex: 0,
			side: 'out',
		})
		expect(hitTest(c, [50, 36])).toMatchObject({type: 'stroke'})
		expect(hitTest(square, [50, 50])).toEqual({type: 'fill'})
		expect(hitTest(square, [50, 50], {fillRule: null})).toBeNull()
		expect(hitTest(c, [50, 100])).toBeNull()
	})
})

describe('intersections', () => {
	it('finds where a line crosses a circle', () => {
		const line = Path.line([-200, 0], [200, 0])
		const hits = intersections(line, circle)
		expect(hits).toHaveLength(2)
		expect(hits.map(h => h.point[0]).sort((a, b) => a - b)).toEqual([-100, 100])
		expect(hits[0].a.curveIndex).toBe(0)
		expect(hits[0].b.time).toBeGreaterThanOrEqual(0)
	})

	it('finds the crossings of two squares', () => {
		const other = Path.rect([50, 50], [150, 150])
		expect(intersections(square, other)).toHaveLength(2)
	})
})

describe('selfIntersections', () => {
	it('finds the crossing of a figure eight', () => {
		const eight = Path.polygon([0, 0], [100, 100], [100, 0], [0, 100])
		const hits = selfIntersections(eight)
		expect(hits).toHaveLength(1)
		expect(hits[0].point).toEqual([50, 50])
	})

	it('finds the loop of a cubic', () => {
		const loop = Path.cubicBezier([0, 0], [150, 100], [-50, 100], [100, 0])
		expect(selfIntersections(loop)).toHaveLength(1)
	})

	it('ignores shared vertices', () => {
		expect(selfIntersections(square)).toHaveLength(0)
		expect(selfIntersections(circle)).toHaveLength(0)
	})
})

describe('centroid', () => {
	it('is the center of a square and a circle', () => {
		expect(centroid(square)).toEqual([50, 50])
		const c = centroid(circle)!
		expect(c[0]).toBeCloseTo(0, 2)
		expect(c[1]).toBeCloseTo(0, 2)
	})

	it('falls back to the mean of the vertices for a line', () => {
		expect(centroid(Path.line([0, 0], [10, 0]))).toEqual([5, 0])
	})
})

describe('ray', () => {
	it('starts at the point and goes along the tangent', () => {
		const ray = Path.ray(Path.line([0, 0], [0, 10]), {time: 0.5})
		expect(ray.origin[0]).toBeCloseTo(0)
		expect(ray.origin[1]).toBeCloseTo(5)
		expect(ray.angle).toBeCloseTo(90)
	})

	it('is the orientation, as a matrix', () => {
		const loc = {offset: 30}
		const m = Path.orientation(circle, loc)
		const ray = Path.ray(circle, loc)
		const tangent = Path.tangent(circle, loc)
		const point = Path.point(circle, loc)
		expect([m[0], m[1]].map(x => x.toFixed(9))).toEqual(tangent.map(x => x.toFixed(9)))
		expect([m[4], m[5]].map(x => x.toFixed(9))).toEqual(point.map(x => x.toFixed(9)))
		expect(ray.origin.map(x => x.toFixed(9))).toEqual(point.map(x => x.toFixed(9)))
	})
})
