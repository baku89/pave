import {describe, expect, it} from 'vitest'

import {Path} from './Path'
import {planarPathArea} from './pathPlanar'

const area = (p: Path) => Math.abs(Path.area(p))
const commands = (p: Path) =>
	p.curves.flatMap(c => c.vertices.map(v => v.command))
const finite = (p: Path) =>
	p.curves.every(c =>
		c.vertices.every(
			v =>
				v.point.every(Number.isFinite) &&
				(v.args ?? []).every(a =>
					typeof a === 'number'
						? Number.isFinite(a)
						: Array.isArray(a)
							? a.every(Number.isFinite)
							: true
				)
		)
	)

describe('boolean operations', () => {
	const a = Path.rect([0, 0], [10, 10])
	const b = Path.rect([5, 5], [15, 15])

	it('unites overlapping rectangles', () => {
		const u = Path.unite([a, b])
		expect(u.curves.length).toBe(1)
		expect(area(u)).toBeCloseTo(175, 6)
		expect(u.curves[0].vertices.length).toBe(8)
	})

	it('keeps disjoint shapes separate', () => {
		const u = Path.unite([a, Path.rect([20, 20], [30, 30])])
		expect(u.curves.length).toBe(2)
		expect(area(u)).toBeCloseTo(200, 6)
	})

	it('subtracts', () => {
		const s = Path.subtract(a, [b])
		expect(s.curves.length).toBe(1)
		expect(area(s)).toBeCloseTo(75, 6)
	})

	it('intersects', () => {
		const s = Path.intersect([a, b])
		expect(s.curves.length).toBe(1)
		expect(area(s)).toBeCloseTo(25, 6)
	})

	it('excludes', () => {
		const s = Path.exclude([a, b])
		expect(area(s)).toBeCloseTo(150, 6)
	})

	it('unites rectangles sharing an edge', () => {
		const u = Path.unite([a, Path.rect([10, 0], [20, 10])])
		expect(u.curves.length).toBe(1)
		expect(area(u)).toBeCloseTo(200, 6)
	})

	it('unites a circle with itself', () => {
		const c = Path.circle([0, 0], 10)
		const u = Path.unite([c, c])
		expect(u.curves.length).toBe(1)
		expect(area(u)).toBeCloseTo(Math.PI * 100, 4)
		expect(commands(u).every(c => c === 'A')).toBe(true)
	})

	it('cuts a hole with opposite orientation', () => {
		const hole = Path.circle([5, 5], 2)
		const s = Path.subtract(a, [hole])
		expect(s.curves.length).toBe(2)
		expect(area(s)).toBeCloseTo(100 - Math.PI * 4, 4)
		const signs = s.curves.map(c => Math.sign(planarPathArea({curves: [c]})))
		expect(signs[0]).toBe(-signs[1])
	})

	it('unites circle and rectangle', () => {
		const c = Path.circle([10, 5], 5)
		const u = Path.unite([a, c])
		expect(u.curves.length).toBe(1)
		expect(area(u)).toBeCloseTo(100 + (Math.PI * 25) / 2, 4)
		expect(commands(u)).toContain('A')
	})

	it('normalizes a self-intersecting curve', () => {
		const bow = Path.polygon([0, 0], [10, 10], [10, 0], [0, 10])
		const u = Path.unite([bow])
		expect(u.curves.length).toBe(2)
		expect(area(u)).toBeCloseTo(50, 6)
	})

	it('handles cubic shapes', () => {
		const blob = Path.close(
			Path.cubicBezierTo(
				Path.cubicBezierTo(
					Path.moveTo(Path.empty, [0, 0]),
					[10, -10],
					[20, 10],
					[30, 0]
				),
				[20, 10],
				[10, 20],
				[0, 0]
			)
		)
		const u = Path.unite([blob, Path.rect([10, -5], [20, 5])])
		expect(finite(u)).toBe(true)
		expect(area(u)).toBeGreaterThan(area(blob))
		expect(area(u)).toBeLessThan(area(blob) + 100)
	})
})

describe('offset', () => {
	const sq = Path.rect([0, 0], [10, 10])

	it('dilates a square with miter joins', () => {
		const o = Path.offset(sq, 5)
		expect(o.curves.length).toBe(1)
		expect(area(o)).toBeCloseTo(400, 6)
		expect(o.curves[0].vertices.length).toBe(4)
	})

	it('dilates a square with round joins', () => {
		const o = Path.offset(sq, 5, {lineJoin: 'round'})
		expect(area(o)).toBeCloseTo(100 + 200 + Math.PI * 25, 4)
		expect(commands(o).filter(c => c === 'A').length).toBe(4)
	})

	it('dilates a square with bevel joins', () => {
		const o = Path.offset(sq, 5, {lineJoin: 'bevel'})
		expect(area(o)).toBeCloseTo(100 + 200 + 50, 6)
	})

	it('erodes a square', () => {
		const o = Path.offset(sq, -2)
		expect(area(o)).toBeCloseTo(36, 6)
	})

	it('is orientation independent', () => {
		const o = Path.offset(Path.reverse(sq), 5)
		expect(area(o)).toBeCloseTo(400, 6)
	})

	it('erodes to nothing', () => {
		expect(Path.offset(sq, -6).curves.length).toBe(0)
	})

	it('keeps circles as arcs', () => {
		const c = Path.circle([0, 0], 20)
		const o = Path.offset(c, 5)
		expect(commands(o).every(c => c === 'A')).toBe(true)
		expect(area(o)).toBeCloseTo(Math.PI * 625, 3)
		const i = Path.offset(c, -15)
		expect(area(i)).toBeCloseTo(Math.PI * 25, 3)
		expect(Path.offset(c, -25).curves.length).toBe(0)
	})

	it('offsets a ring consistently', () => {
		const ring = Path.merge([
			Path.circle([0, 0], 20),
			Path.reverse(Path.circle([0, 0], 10)),
		])
		const o = Path.offset(ring, 2)
		expect(o.curves.length).toBe(2)
		expect(area(o)).toBeCloseTo(Math.PI * (22 * 22 - 8 * 8), 3)
	})

	it('offsets an open polyline', () => {
		const p = Path.polyline([0, 0], [10, 0], [10, 10])
		const o = Path.offset(p, 2)
		expect(o.curves.length).toBe(1)
		expect(o.curves[0].closed).toBe(false)
		expect(Path.length(o)).toBeCloseTo(16, 6)
		const o2 = Path.offset(p, -2)
		expect(Path.length(o2)).toBeCloseTo(24, 6)
	})

	it('offsets an open cubic', () => {
		const p = Path.cubicBezier([0, 0], [10, 20], [20, -20], [30, 0])
		const o = Path.offset(p, 2)
		expect(finite(o)).toBe(true)
		expect(o.curves.length).toBe(1)
		expect(Math.abs(Path.length(o) - Path.length(p))).toBeLessThan(5)
	})

	it('trims folds when the offset exceeds the radius of curvature', () => {
		const p = Path.cubicBezier([0, 0], [10, 30], [20, 30], [30, 0])
		const o = Path.offset(p, 20)
		expect(finite(o)).toBe(true)
		expect(o.curves.length).toBeGreaterThan(0)
		for (const c of o.curves) expect(c.closed).toBe(false)
		const o2 = Path.offset(p, -20)
		expect(finite(o2)).toBe(true)
	})

	it('dilates a star with heavy offset', () => {
		const star = Path.polygon(
			...Array.from({length: 10}, (_, i): [number, number] => {
				const r = i % 2 === 0 ? 30 : 12
				const a = (i / 10) * Math.PI * 2
				return [Math.cos(a) * r, Math.sin(a) * r]
			})
		)
		for (const join of ['miter', 'round', 'bevel'] as const) {
			const o = Path.offset(star, 8, {lineJoin: join})
			expect(finite(o)).toBe(true)
			expect(o.curves.length).toBe(1)
			expect(area(o)).toBeGreaterThan(area(star))
			const i = Path.offset(star, -4, {lineJoin: join})
			expect(finite(i)).toBe(true)
			expect(area(i)).toBeLessThan(area(star))
		}
	})
})

describe('offsetStroke', () => {
	it('strokes a line with butt caps', () => {
		const s = Path.offsetStroke(Path.line([0, 0], [10, 0]), 4)
		expect(s.curves.length).toBe(1)
		expect(area(s)).toBeCloseTo(40, 6)
	})

	it('strokes a line with round and square caps', () => {
		const r = Path.offsetStroke(Path.line([0, 0], [10, 0]), 4, {
			lineCap: 'round',
		})
		expect(area(r)).toBeCloseTo(40 + Math.PI * 4, 4)
		const q = Path.offsetStroke(Path.line([0, 0], [10, 0]), 4, {
			lineCap: 'square',
		})
		expect(area(q)).toBeCloseTo(56, 6)
	})

	it('strokes a circle into a ring of arcs', () => {
		const s = Path.offsetStroke(Path.circle([0, 0], 20), 10)
		expect(s.curves.length).toBe(2)
		expect(area(s)).toBeCloseTo(Math.PI * (625 - 225), 3)
		expect(commands(s).every(c => c === 'A')).toBe(true)
	})

	it('strokes a polyline with joins', () => {
		const p = Path.polyline([0, 0], [10, 0], [10, 10])
		// Two 10×4 rectangles overlapping in a 2×2 square, plus the outer corner
		const m = Path.offsetStroke(p, 4, {lineJoin: 'miter'})
		expect(area(m)).toBeCloseTo(76 + 4, 6)
		const r = Path.offsetStroke(p, 4, {lineJoin: 'round'})
		expect(area(r)).toBeCloseTo(76 + Math.PI, 4)
		const b = Path.offsetStroke(p, 4, {lineJoin: 'bevel'})
		expect(area(b)).toBeCloseTo(76 + 2, 6)
	})

	it('strokes a tight cubic without holes', () => {
		const p = Path.cubicBezier([0, 0], [10, 30], [20, 30], [30, 0])
		const s = Path.offsetStroke(p, 40)
		expect(finite(s)).toBe(true)
		expect(s.curves.length).toBe(1)
	})
})
