import {vec2} from 'linearly'
import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {
	align,
	blend,
	blendSeries,
	distribute,
	fitInto,
	repeatAlong,
	rotate,
	scale,
	translate,
} from './path/layout'

const pointsOf = (p: Path, i = 0) => p.curves[i].vertices.map(v => v.point)

describe('translate, rotate, scale', () => {
	const rect = Path.rect([0, 0], [10, 20])

	it('translate moves the bounds', () => {
		expect(Path.bounds(translate(rect, [5, -5]))).toEqual([
			[5, -5],
			[15, 15],
		])
	})

	it('rotate turns around the center of the bounds by default', () => {
		const r = rotate(rect, 90)
		expect(Path.bounds(r)).toEqual([
			[-5, 5],
			[15, 15],
		])
		// Clockwise on the screen: the top-left corner goes to the top-right
		expect(pointsOf(rotate(rect, 90, [0, 0]))[1]).toEqual([0, 10])
	})

	it('scale grows around the center of the bounds by default', () => {
		expect(Path.bounds(scale(rect, 2))).toEqual([
			[-5, -10],
			[15, 30],
		])
		expect(Path.bounds(scale(rect, [2, 1], [0, 0]))).toEqual([
			[0, 0],
			[20, 20],
		])
	})
})

describe('align', () => {
	const a = Path.rect([0, 0], [10, 10])
	const b = Path.rect([20, 30], [40, 40])

	it('aligns to the union of the bounds', () => {
		const [la, lb] = align([a, b], 'left')
		expect(Path.bounds(la)[0][0]).toBe(0)
		expect(Path.bounds(lb)[0][0]).toBe(0)
		expect(Path.bounds(lb)[0][1]).toBe(30)

		const [ra, rb] = align([a, b], 'right')
		expect(Path.bounds(ra)[1][0]).toBe(40)
		expect(Path.bounds(rb)[1][0]).toBe(40)

		const [ta, tb] = align([a, b], 'bottom')
		expect(Path.bounds(ta)[1][1]).toBe(40)
		expect(Path.bounds(tb)[1][1]).toBe(40)

		const [ca, cb] = align([a, b], 'center')
		expect(Path.bounds(ca)).toEqual([
			[15, 15],
			[25, 25],
		])
		expect(Path.bounds(cb)).toEqual([
			[10, 15],
			[30, 25],
		])
	})

	it('aligns to a given rect', () => {
		const [ca, cb] = align([a, b], 'centerX', {
			to: [
				[100, 100],
				[200, 200],
			],
		})
		expect(Path.bounds(ca)).toEqual([
			[145, 0],
			[155, 10],
		])
		expect(Path.bounds(cb)).toEqual([
			[140, 30],
			[160, 40],
		])

		const [tb] = align([b], 'top', {
			to: [
				[0, 0],
				[1, 1],
			],
		})
		expect(Path.bounds(tb)[0][1]).toBe(0)
	})

	it('leaves what is already aligned alone', () => {
		expect(align([a, b], 'left')[0]).toBe(a)
	})
})

describe('distribute', () => {
	const a = Path.rect([0, 0], [10, 10])
	const b = Path.rect([15, 0], [25, 10])
	const c = Path.rect([80, 0], [120, 10])

	it('spaces the centers evenly, keeping the extremes', () => {
		const [dc, da, db] = distribute([c, a, b], 'x')
		expect(da).toBe(a)
		expect(dc).toBe(c)
		// Centers 5 and 100: the middle one goes to 52.5
		expect(Path.bounds(db)).toEqual([
			[47.5, 0],
			[57.5, 10],
		])
	})

	it('makes the gaps equal', () => {
		const [, db] = distribute([a, b, c], 'x', {mode: 'gaps'})
		// Room from 10 to 80 minus the width 10 leaves two gaps of 30
		expect(Path.bounds(db)).toEqual([
			[40, 0],
			[50, 10],
		])
	})

	it('spreads within a given rect', () => {
		const within: [vec2, vec2] = [
			[0, 0],
			[200, 10],
		]
		const [da, db, dc] = distribute([a, b, c], 'x', {mode: 'gaps', within})
		expect(Path.bounds(da)[0][0]).toBe(0)
		expect(Path.bounds(dc)[1][0]).toBe(200)
		expect(Path.bounds(db)).toEqual([
			[80, 0],
			[90, 10],
		])

		const [, cb] = distribute([a, b, c], 'y', {
			within: [
				[0, 0],
				[0, 100],
			],
		})
		// Centers from 5 to 95: the middle one at 50
		expect(Path.bounds(cb)).toEqual([
			[15, 45],
			[25, 55],
		])
	})
})

describe('fitInto', () => {
	const circle = Path.circle([0, 0], 1)
	const frame: [vec2, vec2] = [
		[10, 20],
		[90, 60],
	]

	it('contains, centered by default', () => {
		expect(Path.bounds(fitInto(circle, frame))).toEqual([
			[30, 20],
			[70, 60],
		])
		expect(Path.bounds(fitInto(circle, frame, {align: [0, 0]}))).toEqual([
			[10, 20],
			[50, 60],
		])
		expect(Path.bounds(fitInto(circle, frame, {align: [1, 1]}))).toEqual([
			[50, 20],
			[90, 60],
		])
	})

	it('covers and stretches', () => {
		expect(Path.bounds(fitInto(circle, frame, {mode: 'cover'}))).toEqual([
			[10, 0],
			[90, 80],
		])
		expect(Path.bounds(fitInto(circle, frame, {mode: 'stretch'}))).toEqual(
			frame
		)
	})

	it('fits a flat path by the other axis', () => {
		const line = Path.line([0, 0], [10, 0])
		expect(Path.bounds(fitInto(line, frame))).toEqual([
			[10, 40],
			[90, 40],
		])
	})
})

describe('blend', () => {
	const a = Path.circle([0, 0], 10)
	const b = Path.rect([100, 100], [120, 140])

	// Arcs are approximated by cubics, so the measures agree to a relative tolerance
	const expectSameShape = (p: Path, q: Path) => {
		expect(Path.bounds(p)).toEqual(Path.bounds(q))
		expect(Path.length(p) / Path.length(q)).toBeCloseTo(1, 3)
		expect((Path.area(p) + 1) / (Path.area(q) + 1)).toBeCloseTo(1, 3)
	}

	it('is a at 0 and b at 1', () => {
		expectSameShape(blend(a, b, 0), a)
		expectSameShape(blend(a, b, 1), b)

		const line = Path.polyline([0, 0], [10, 0], [10, 10])
		const cubic = Path.cubicBezier([50, 50], [60, 0], [70, 100], [80, 50])
		expectSameShape(blend(line, cubic, 0), line)
		expectSameShape(blend(line, cubic, 1), cubic)
		expect(blend(line, cubic, 0.5).curves[0].closed).toBe(false)
	})

	it('has the bounds midway between two circles at 0.5', () => {
		const c1 = Path.circle([0, 0], 10)
		const c2 = Path.circle([100, 0], 30)
		const mid = blend(c1, c2, 0.5)

		expect(mid.curves.length).toBe(1)
		expect(mid.curves[0].closed).toBe(true)
		expect(Path.bounds(mid)).toEqual([
			[30, -20],
			[70, 20],
		])
	})

	it('matches the segment counts without changing the shapes', () => {
		const poly = Path.polygon([0, 0], [10, 0], [10, 10], [5, 15], [0, 10])
		const tri = Path.polygon([0, 0], [10, 0], [5, 10])

		expectSameShape(blend(poly, tri, 0), poly)
		expectSameShape(blend(poly, tri, 1), tri)
		expect(blend(poly, tri, 0.5).curves[0].vertices.length).toBe(5)
	})

	it('blends a missing curve from a point', () => {
		const two = Path.merge([a, Path.circle([50, 50], 5)])
		const one = Path.rect([0, 0], [10, 10])

		const near = blend(two, one, 0.999)
		expect(near.curves.length).toBe(2)
		const [w, h] = vec2.sub(
			Path.bounds({curves: [near.curves[1]]})[1],
			Path.bounds({curves: [near.curves[1]]})[0]
		)
		expect(w).toBeLessThan(0.1)
		expect(h).toBeLessThan(0.1)
		expect(Path.bounds({curves: [blend(two, one, 1).curves[1]]})).toEqual([
			[50, 50],
			[50, 50],
		])
	})

	it('closes towards the closed one', () => {
		const line = Path.polyline([0, 0], [10, 0], [10, 10])
		const rect = Path.rect([0, 0], [10, 10])

		expect(blend(line, rect, 0.25).curves[0].closed).toBe(false)
		expect(blend(line, rect, 0.75).curves[0].closed).toBe(true)
		expectSameShape(blend(line, rect, 1), rect)
		expect(blend(line, rect, 1).curves[0].vertices.length).toBe(4)
	})

	it('interpolates attributes', () => {
		const p: Path = {...a, attrs: {w: 0}}
		const q: Path = {...b, attrs: {w: 10}}
		expect(blend(p, q, 0.3).attrs).toEqual({w: 3})
	})

	it('blendSeries gives the steps between', () => {
		const steps = blendSeries(a, b, 3)
		expect(steps.length).toBe(3)
		expect(Path.bounds(steps[1])).toEqual(Path.bounds(blend(a, b, 0.5)))
		expect(blendSeries(a, b, 0)).toEqual([])
	})
})

describe('repeatAlong', () => {
	const line = Path.line([0, 0], [100, 0])
	const stamp = Path.line([0, -1], [0, 1])

	it('places the given count of copies evenly, ends included', () => {
		const r = repeatAlong(line, stamp, {count: 5})
		expect(r.curves.length).toBe(5)
		expect(r.curves.map(c => c.vertices[0].point[0])).toEqual([
			0, 25, 50, 75, 100,
		])
	})

	it('aligns the copies in their cells', () => {
		const xs = (p: Path) => p.curves.map(c => c.vertices[0].point[0])
		expect(xs(repeatAlong(line, stamp, {count: 4, align: 'start'}))).toEqual([
			0, 25, 50, 75,
		])
		expect(xs(repeatAlong(line, stamp, {count: 4, align: 'center'}))).toEqual([
			12.5, 37.5, 62.5, 87.5,
		])
		expect(xs(repeatAlong(line, stamp, {count: 4, align: 'end'}))).toEqual([
			25, 50, 75, 100,
		])
		expect(xs(repeatAlong(line, stamp, {spacing: 30, align: 'end'}))).toEqual([
			10, 40, 70, 100,
		])
		expect(xs(repeatAlong(line, stamp, {spacing: 30}))).toEqual([
			0, 33.333333, 66.666667, 100,
		])
	})

	it('rotates the stamp to the tangent and offsets along the length', () => {
		const diagonal = Path.line([0, 0], [100, 100])
		const r = repeatAlong(diagonal, stamp, {count: 2, offset: 10})
		expect(Path.length(diagonal)).toBeCloseTo(141.42, 2)
		// The stamp's y axis is the normal, so the ends lie across the diagonal
		const s = Math.SQRT1_2
		expect(pointsOf(r, 0)).toEqual([
			[10 * s + s, 10 * s - s],
			[10 * s - s, 10 * s + s],
		])
		// Clamped to the end of an open path
		expect(pointsOf(r, 1)[0][0]).toBeCloseTo(100 + s)

		const flat = repeatAlong(diagonal, stamp, {count: 1, rotate: false})
		expect(pointsOf(flat, 0)).toEqual([
			[0, -1],
			[0, 1],
		])
	})

	it('wraps around a closed path', () => {
		const rect = Path.rect([0, 0], [10, 10])
		const r = repeatAlong(rect, stamp, {count: 2, align: 'start', offset: 45})
		expect(r.curves.length).toBe(2)
		// 45 wraps to 5 on the bottom edge, 65 to 25 on the top edge running back
		expect(pointsOf(r, 0)[0]).toEqual([5, -1])
		expect(pointsOf(r, 1)[0]).toEqual([5, 11])
	})

	it('places every curve of the stamp', () => {
		const dots = Path.merge([Path.circle([0, 0], 1), Path.circle([0, 3], 1)])
		expect(repeatAlong(line, dots, {count: 3}).curves.length).toBe(6)
	})
})
