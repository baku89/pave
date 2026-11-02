import {vec2} from 'linearly'
import {describe, expect, it, test} from 'vitest'

import {Curve, Path, Segment} from './index'

const line = Path.line([0, 50], [100, 50])
const circle = Path.circle([50, 50], 30)
const shape = Path.close(
	Path.join([
		Path.polyline([20, 80], [20, 20], [80, 20]),
		Path.cubicBezier([80, 20], [95, 45], [65, 60], [80, 80]),
		Path.line([80, 80], [20, 80]),
	])
)

const count = (p: Path) => p.curves.reduce((n, c) => n + c.vertices.length, 0)

/** The largest distance between the result and the true displaced points. */
const deviation = (
	source: Path,
	result: Path,
	fn: (u: number) => readonly [number, number]
) => {
	const samples = Array.from({length: 1500}, (_, i): vec2 => {
		const u = i / 1500
		const unit = {unit: u}
		const p = Path.point(source, unit)
		const [along, across] = fn(u)
		return vec2.scaleAndAdd(
			vec2.scaleAndAdd(p, Path.tangent(source, unit), along),
			Path.normal(source, unit),
			across
		)
	})
	const pts = Path.segments(result).flatMap(s =>
		Array.from({length: 41}, (_, i) => Segment.point(s, {time: i / 40}))
	)
	const near = (q: vec2) => {
		let best = Infinity
		for (let i = 0; i + 1 < pts.length; i++) {
			const d = vec2.sub(pts[i + 1], pts[i])
			const l = vec2.dot(d, d)
			const t =
				l > 0
					? Math.max(0, Math.min(1, vec2.dot(vec2.sub(q, pts[i]), d) / l))
					: 0
			best = Math.min(best, vec2.distance(q, vec2.scaleAndAdd(pts[i], d, t)))
		}
		return best
	}
	return Math.max(...samples.filter((_, i) => i % 5 === 0).map(near))
}

describe('Path.displace', () => {
	it('keeps the geometry with no displacement', () => {
		for (const p of [line, circle]) {
			const q = Path.displace(p, () => [0, 0])
			// Within the tolerance of 0.05, all around
			const perimeter = Path.length(p)
			expect(Math.abs(Path.area(q) - Path.area(p))).toBeLessThan(
				0.05 * perimeter
			)
			expect(Math.abs(Path.length(q) - perimeter)).toBeLessThan(0.1)
		}
	})

	it('offsets by a constant across', () => {
		const q = Path.displace(line, () => [0, 5])
		const [lo, hi] = Path.bounds(q)
		expect(lo[1]).toBeCloseTo(55, 6)
		expect(hi[1]).toBeCloseTo(55, 6)

		const r = Path.displace(circle, () => [0, 5])
		for (const v of r.curves[0].vertices) {
			expect(vec2.distance(v.point, [50, 50])).toBeCloseTo(25, 6)
		}
		expect(r.curves[0].closed).toBe(true)
	})

	it('moves along the tangent', () => {
		const q = Path.displace(line, () => [7, 0])
		expect(Path.bounds(q)[0][0]).toBeCloseTo(7, 6)
		expect(Path.bounds(q)[1][0]).toBeCloseTo(107, 6)
	})

	const wave = (n: number, a: number) => (u: number) =>
		[0, a * Math.sin(u * n * 2 * Math.PI)] as const

	test.each([
		['a line', line, wave(3, 8)],
		['a line, fast', line, wave(20, 4)],
		['a circle', circle, wave(8, 4)],
		['a circle, fast', circle, wave(30, 2)],
	])('follows a wave on %s', (_, p, fn) => {
		const q = Path.displace(p, fn)
		expect(deviation(p, q, fn)).toBeLessThan(0.1)
	})

	it('makes a coil with loops', () => {
		const coil = (u: number) => {
			const a = u * 12 * 2 * Math.PI
			return [6 * Math.cos(a), 6 * Math.sin(a)] as const
		}
		const q = Path.displace(line, coil)
		expect(deviation(line, q, coil)).toBeLessThan(0.1)
		expect(Path.length(q)).toBeGreaterThan(300)
	})

	it('respects the tolerance, taking more pieces for less', () => {
		const fn = wave(6, 8)
		const coarse = Path.displace(line, fn, {tolerance: 1})
		const fine = Path.displace(line, fn, {tolerance: 0.001})
		expect(count(fine)).toBeGreaterThan(count(coarse))
		expect(deviation(line, fine, fn)).toBeLessThan(0.02)
	})

	it('uses few cubics for what is smooth', () => {
		expect(count(Path.displace(line, () => [0, 3]))).toBeLessThan(10)
	})

	it('connects across a corner of the source by a line', () => {
		const square = Path.rect([0, 0], [20, 20])
		const q = Path.displace(square, () => [0, 2])
		expect(q.curves[0].closed).toBe(true)
		const lines = q.curves[0].vertices.filter(v => v.command === 'L')
		expect(lines.length).toBe(4)
		expect(count(q)).toBeLessThan(16)
	})

	it('has corners at breaks', () => {
		const n = 4
		const tri = (u: number) => {
			const x = (u * n) % 1
			return [0, 10 * (x < 0.5 ? 2 * x : 2 - 2 * x)] as const
		}
		const breaks = Array.from({length: 2 * n}, (_, i) => i / (2 * n))
		const q = Path.displace(line, tri, {breaks})
		const pts = Path.segments(q)
		const kinks = pts.slice(1).filter((s, i) => {
			const a = vec2.angle(Segment.tangent(pts[i], 1), Segment.tangent(s, 0))
			return Math.abs(a) > 10
		})
		expect(kinks.length).toBe(2 * n - 1)
		expect(deviation(line, q, tri)).toBeLessThan(0.1)
	})

	it('closes a curve whose displacement does not return by a line', () => {
		const q = Path.displace(circle, u => [0, u * 10])
		expect(q.curves[0].closed).toBe(true)
		const c = Curve.segments(q.curves[0])
		const longest = c.filter(s => s.command === 'L')
		expect(longest.length).toBe(1)
		expect(Segment.length(longest[0])).toBeCloseTo(10, 3)
	})

	it('closes a periodic displacement without a line', () => {
		const q = Path.displace(circle, wave(8, 4))
		const c = q.curves[0]
		expect(c.closed).toBe(true)
		expect(c.vertices.every(v => v.command === 'C')).toBe(true)
	})

	it('passes where the point is', () => {
		const seen: unknown[] = []
		Path.displace(Path.merge([line, circle]), (u, ctx) => {
			seen.push(ctx.curveIndex)
			expect(ctx.length).toBeCloseTo(Curve.length(ctx.curve), 6)
			expect(vec2.len(ctx.tangent)).toBeCloseTo(1, 6)
			expect(vec2.dot(ctx.tangent, ctx.normal)).toBeCloseTo(0, 6)
			if (ctx.curveIndex === 0) {
				expect(ctx.point[0]).toBeCloseTo(u * 100, 6)
			}
			return [0, 0]
		})
		expect(seen).toContain(0)
		expect(seen).toContain(1)
	})

	it('reads attributes in the function, and carries them', () => {
		const p = Path.setAttribute(line, 'a', v => v.point[0] / 10)
		const q = Path.displace(p, (_, {attrs}) => [0, attrs?.a as number])
		for (const v of q.curves[0].vertices) {
			expect(v.attrs?.a).toBeCloseTo(v.point[0] / 10, 3)
			expect(v.point[1]).toBeCloseTo(50 + v.point[0] / 10, 3)
		}
	})

	it('keeps attributes of curves and paths', () => {
		const p = Path.setAttribute(
			Path.setAttribute(line, 'c', 1, {level: 'curve'}),
			'd',
			2,
			{level: 'path'}
		)
		const q = Path.displace(p, () => [0, 1])
		expect(q.attrs).toEqual({d: 2})
		expect(q.curves[0].attrs).toEqual({c: 1})
	})

	it('leaves a curve without length, and adds no attributes', () => {
		const dot = Path.dot([1, 1])
		expect(Path.displace(dot, () => [0, 1]).curves[0]).toBe(dot.curves[0])
		expect(JSON.stringify(Path.displace(shape, () => [0, 1]))).not.toContain(
			'attrs'
		)
	})
})
