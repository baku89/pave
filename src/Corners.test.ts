import {vec2} from 'linearly'
import {describe, expect, it, test} from 'vitest'

import {CubicBezier, Curve, Path, Segment} from './index'

const square = Path.rect([0, 0], [20, 20])
const segmentsOf = (p: Path) => Path.segments(p)
const commands = (p: Path) =>
	p.curves.flatMap(c => c.vertices.map(v => v.command))

/** A corner of a given interior shape, with the joint at [50, 50]. */
const corner = (a: vec2, b: vec2): Path => ({
	curves: [
		{
			closed: false,
			vertices: [
				{command: 'L', point: a},
				{command: 'L', point: [50, 50]},
				{command: 'L', point: b},
			],
		},
	],
})

describe('CubicBezier.length across cusps', () => {
	const cornerCubicSeg = (k: number) =>
		CubicBezier.of(
			[20, 50],
			vec2.lerp([20, 50], [50, 50], k),
			vec2.lerp([50, 20], [50, 50], k),
			[50, 20]
		)

	const reference = (seg: ReturnType<typeof cornerCubicSeg>) => {
		const n = 2000000
		let sum = 0
		for (let i = 0; i < n; i++) {
			const d = CubicBezier.derivative(seg, {time: (i + 0.5) / n})
			sum += Math.hypot(d[0], d[1]) / n
		}
		return sum
	}

	test.each([2, 2.001, 2.01, 2.1, 1.99, 3])('is accurate when k = %d', k => {
		const seg = cornerCubicSeg(k)
		const expected = reference(seg)
		expect(
			Math.abs(CubicBezier.length(seg) - expected) / expected
		).toBeLessThan(1e-6)
	})

	it('inverts by arc length through a cusp', () => {
		const seg = cornerCubicSeg(2)
		const half = CubicBezier.toTime(seg, {unit: 0.5})
		expect(half).toBeCloseTo(0.5, 6)
		const t = CubicBezier.toTime(seg, {unit: 0.25})
		const head = CubicBezier.trim(seg, {time: 0}, {time: t})
		expect(CubicBezier.length(head) / CubicBezier.length(seg)).toBeCloseTo(
			0.25,
			6
		)
	})
})

describe('Path.cutCorners', () => {
	it('draws a straight line without any vertices, as chamfer does', () => {
		const q = Path.cutCorners(square, 5, () => [])
		expect(Path.area(q)).toBeCloseTo(Path.area(Path.chamfer(square, 5)), 9)
		expect(commands(q).every(c => c === 'L')).toBe(true)
		expect(q.curves[0].vertices.length).toBe(8)
	})

	it('passes what a filler needs', () => {
		const corners: Path.Corner[] = []
		Path.cutCorners(corner([0, 50], [50, 0]), 10, c => {
			corners.push(c)
			return []
		})
		const c = corners.at(-1)!
		expect(c.start).toEqual([40, 50])
		expect(c.end).toEqual([50, 40])
		expect(c.joint).toEqual([50, 50])
		expect(c.apex).toEqual([50, 50])
		expect(c.startTangent).toEqual([1, 0])
		expect(c.endTangent).toEqual([0, -1])
		expect(Math.abs(c.turn)).toBeCloseTo(90, 9)
		expect(c.context.index).toBe(1)
	})

	it('finds where the tangents meet on curved segments', () => {
		const p: Path = {
			curves: [
				{
					closed: false,
					vertices: [
						{command: 'L', point: [0, 50]},
						{
							command: 'C',
							args: [
								[20, 30],
								[30, 60],
							],
							point: [50, 50],
						},
						{command: 'L', point: [50, 0]},
					],
				},
			],
		}
		let apex: vec2 | null = null
		let start: vec2 = [0, 0]
		let tangent: vec2 = [0, 0]
		Path.cutCorners(p, 8, c => {
			apex = c.apex
			start = c.start
			tangent = c.startTangent
			return []
		})
		expect(apex).not.toEqual([50, 50])
		const toApex = vec2.normalize(vec2.sub(apex!, start))
		expect(toApex[0]).toBeCloseTo(tangent[0], 6)
		expect(toApex[1]).toBeCloseTo(tangent[1], 6)
		expect(apex![0]).toBeCloseTo(50, 6)
	})

	it('moves the last vertex exactly onto the end', () => {
		const q = Path.cutCorners(corner([0, 50], [50, 0]), 10, () => [
			{command: 'L', point: [99, 99]},
			{command: 'L', point: [1, 1]},
		])
		expect(q.curves[0].vertices.map(v => v.point)).toEqual([
			[0, 50],
			[40, 50],
			[99, 99],
			[50, 40],
			[50, 0],
		])
	})

	it('respects groups and amounts per corner', () => {
		const q = Path.cutCorners(square, 5, () => [], {
			group: v => v.point[0] === 0,
		})
		expect(q.curves[0].vertices.length).toBe(6)
		const r = Path.cutCorners(
			square,
			v => (v.point[1] === 0 ? 5 : 0),
			() => []
		)
		expect(r.curves[0].vertices.length).toBe(6)
	})

	it('spreads attributes over the vertices it inserts', () => {
		const p = Path.setAttribute(corner([0, 50], [50, 0]), 'w', v =>
			Math.abs(v.point[0] - v.point[1])
		)
		const q = Path.cutCorners(p, 10, ({joint}) => [
			{command: 'L', point: joint},
			{command: 'L', point: [0, 0]},
		])
		const w = q.curves[0].vertices.map(v => v.attrs?.w as number)
		expect(w[1]).toBeCloseTo(10, 6)
		expect(w[3]).toBeCloseTo(10, 6)
		expect(w[2]).toBeCloseTo(10, 6)
	})

	it('lets a filler set its own attributes', () => {
		const p = Path.setAttribute(corner([0, 50], [50, 0]), 'w', 1)
		const q = Path.cutCorners(p, 10, ({joint}) => [
			{command: 'L', point: joint, attrs: {w: 5}},
			{command: 'L', point: [0, 0]},
		])
		expect(q.curves[0].vertices[2].attrs?.w).toBe(5)
	})
})

describe('Path.cornerCubic', () => {
	const r = 10

	it('stays close to a circular arc by default, at any angle', () => {
		for (const b of [
			[50, 0],
			[0, 0],
			[100, 0],
		] as vec2[]) {
			const p = corner([0, 50], b)
			const seg = segmentsOf(Path.cornerCubic(p, r))[1]
			expect(seg.command).toBe('C')
			// The circle tangent at both cuts has its center on the normal at the start
			const n = vec2.rotate90(Segment.tangent(seg, 0))
			const turn = Math.abs(
				vec2.angle(Segment.tangent(seg, 0), Segment.tangent(seg, 1))
			)
			const radius = r / Math.tan((turn * Math.PI) / 360)
			const side = vec2.dot(n, vec2.sub(seg.point, seg.start)) > 0 ? 1 : -1
			const center = vec2.scaleAndAdd(seg.start, n, side * radius)
			for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
				const d = vec2.distance(Segment.point(seg, {time: t}), center)
				// One cubic gets less accurate with the angle: 0.03% at 90°, 0.3% at 135°
				expect(Math.abs(d - radius) / radius).toBeLessThan(0.004)
			}
		}
	})

	it('keeps the tangents at both ends', () => {
		const q = Path.cornerCubic(corner([0, 50], [50, 0]), r, {handle: 0.5})
		const [a, c, b] = segmentsOf(q)
		expect(vec2.approx(Segment.tangent(a, 1), Segment.tangent(c, 0))).toBe(true)
		expect(vec2.approx(Segment.tangent(c, 1), Segment.tangent(b, 0))).toBe(true)
	})

	const middle = (k: number) =>
		segmentsOf(
			Path.cornerCubic(corner([0, 50], [50, 0]), r, {handle: k})
		)[1] as never

	it('runs from a chord to a loop by the handle', () => {
		const flat = middle(0)
		expect(CubicBezier.isStraight(flat)).toBe(true)
		const sharp = middle(1) as {args: [vec2, vec2]}
		expect(sharp.args[0]).toEqual([50, 50])
		expect(sharp.args[1]).toEqual([50, 50])
		expect(CubicBezier.cuspTimes(middle(2)).length).toBe(1)
		expect(CubicBezier.selfIntersectionTimes(middle(1.9))).toBeNull()
		expect(CubicBezier.selfIntersectionTimes(middle(2.5))).not.toBeNull()
	})

	it('reads the handle per corner, and works with groups', () => {
		const q = Path.cornerCubic(square, 4, {
			handle: v => (v.point[0] === 0 ? 0 : 0.5),
			group: v => v.point[1] === 0,
		})
		expect(commands(q).filter(c => c === 'C').length).toBe(2)
	})

	it('survives the operations a looping corner goes through', () => {
		const q = Path.cornerCubic(square, 5, {handle: 3})
		expect(Path.area(q)).toBeCloseTo(Path.area(Path.unite([q])), 6)
		expect(Path.offset(q, 1).curves.length).toBeGreaterThan(0)
	})
})

describe('Path.cornerShape', () => {
	const trim = 8

	it('equals a chamfer at 0', () => {
		const q = Path.cornerShape(square, trim, 0)
		expect(Path.area(q)).toBeCloseTo(Path.area(Path.chamfer(square, trim)), 9)
	})

	it('equals a fillet at 1 at right angles, by an arc', () => {
		const q = Path.cornerShape(square, trim, 1)
		expect(commands(q).filter(c => c === 'A').length).toBe(4)
		expect(Path.area(q)).toBeCloseTo(Path.area(Path.fillet(square, trim)), 6)
		for (const v of Path.fillet(square, trim).curves[0].vertices) {
			if (v.command === 'A') expect(v.args[0]).toEqual([trim, trim])
		}
	})

	it('makes an ellipse tangent to both sides at other angles', () => {
		const p = corner([0, 50], [10, 10])
		const q = Path.cornerShape(p, trim, 1)
		const [a, arc, b] = segmentsOf(q)
		expect(arc.command).toBe('A')
		expect(
			vec2.angle(Segment.tangent(a, 1), Segment.tangent(arc, 0))
		).toBeCloseTo(0, 4)
		expect(
			vec2.angle(Segment.tangent(arc, 1), Segment.tangent(b, 0))
		).toBeCloseTo(0, 4)
	})

	const onSuperellipse = (k: number) => {
		const p = corner([0, 50], [50, 0])
		const q = Path.cornerShape(p, trim, k, {tolerance: 0.001})
		const e = 2 ** k
		for (const seg of segmentsOf(q).slice(1, -1)) {
			for (const t of [0, 0.25, 0.5, 0.75, 1]) {
				const pt = Segment.point(seg, {time: t})
				// Center at [42, 42], running to [42, 50] and [50, 42]
				const x = (pt[1] - 42) / trim
				const y = (pt[0] - 42) / trim
				const value = Math.max(x, 0) ** e + Math.max(y, 0) ** e
				expect(value).toBeCloseTo(1, 1)
			}
		}
		return q
	}

	test.each([0.5, 1.5, 2, 3, -0.5, -1])('follows the curve at %d', k => {
		const q = onSuperellipse(k)
		expect(commands(q).includes('C')).toBe(true)
	})

	/** The largest distance between the result and the true curve, both ways, on a corner. */
	const deviation = (k: number, tolerance?: number) => {
		const size = 32
		const q = Path.cornerShape(
			corner([0, 50], [50, 0]),
			size,
			k,
			tolerance ? {tolerance} : {}
		)
		const curves = segmentsOf(q).filter(s => s.command === 'C')
		const p = 2 / 2 ** k
		const truth = Array.from({length: 2001}, (_, i): vec2 => {
			const a = (i / 2000) * (Math.PI / 2)
			// cos(π/2) is not exactly 0, which a small exponent would turn into a large value
			const x = i === 2000 ? 0 : Math.cos(a) ** p
			const y = Math.sin(a) ** p
			return [18 + y * size, 18 + x * size]
		})
		const result = curves.flatMap(c =>
			Array.from({length: 121}, (_, i) => Segment.point(c, {time: i / 120}))
		)
		const toPolyline = (q: vec2, line: vec2[]) => {
			let best = Infinity
			for (let i = 0; i + 1 < line.length; i++) {
				const d = vec2.sub(line[i + 1], line[i])
				const l = vec2.dot(d, d)
				const t =
					l > 0
						? Math.max(0, Math.min(1, vec2.dot(vec2.sub(q, line[i]), d) / l))
						: 0
				best = Math.min(best, vec2.distance(q, vec2.scaleAndAdd(line[i], d, t)))
			}
			return best
		}
		const out = Math.max(...result.map(p => toPolyline(p, truth)))
		const back = Math.max(
			...truth.filter((_, i) => i % 50 === 0).map(p => toPolyline(p, result))
		)
		return {count: curves.length, error: Math.max(out, back)}
	}

	it('takes two cubics where the curve is easy', () => {
		const {count, error} = deviation(1.5)
		expect(count).toBe(2)
		expect(error).toBeLessThan(0.05)
		const small = Path.cornerShape(Path.rect([0, 0], [100, 100]), 16, 2)
		expect(commands(small).filter(c => c === 'C').length).toBe(2 * 4)
	})

	// A curve this close to a line or to a corner has its curvature spike, taking a few more
	test.each([-3, -2, -1, -0.5, 0.25, 0.5, 3, 4, 5, 6, 8, 12])(
		'stays within the tolerance with few cubics at %d',
		k => {
			const {count, error} = deviation(k)
			expect(count).toBeLessThanOrEqual(8)
			expect(error).toBeLessThan(0.06)
		}
	)

	it('takes more cubics for a tighter tolerance', () => {
		const coarse = deviation(2, 0.5)
		const fine = deviation(2, 0.0005)
		expect(fine.count).toBeGreaterThan(coarse.count)
		expect(fine.error).toBeLessThan(0.001)
	})

	it('is symmetric about the corner', () => {
		const q = Path.cornerShape(corner([0, 50], [50, 0]), trim, 2.5)
		const pts = segmentsOf(q)
			.filter(s => s.command === 'C')
			.flatMap(s => [s.start, s.point])
		for (const p of pts) {
			const mirrored: vec2 = [p[1], p[0]]
			expect(
				Math.min(...pts.map(o => vec2.distance(o, mirrored)))
			).toBeLessThan(1e-9)
		}
	})

	it('joins the sides smoothly when convex', () => {
		const [a, c] = segmentsOf(
			Path.cornerShape(corner([0, 50], [50, 0]), trim, 2)
		)
		expect(
			vec2.angle(Segment.tangent(a, 1), Segment.tangent(c, 0))
		).toBeCloseTo(0, 4)
	})

	it('grows from notch to square, in order', () => {
		const areas = [-Infinity, -1, 0, 1, 2, 4, Infinity].map(k =>
			Path.area(Path.cornerShape(square, trim, k))
		)
		for (let i = 1; i < areas.length; i++) {
			expect(areas[i]).toBeGreaterThan(areas[i - 1])
		}
		expect(areas.at(-1)).toBeCloseTo(400, 9)
	})

	it('reads the shape per corner', () => {
		const p = Path.setAttribute(square, 'k', v => (v.point[0] === 0 ? 0 : 1))
		const q = Path.cornerShape(p, trim, 'k')
		expect(commands(q).filter(c => c === 'A').length).toBe(2)
	})

	it('carries attributes', () => {
		const p: Path = {
			curves: [
				{
					closed: false,
					vertices: [
						{command: 'L', point: [0, 50], attrs: {w: 0}},
						{command: 'L', point: [50, 50], attrs: {w: 50}},
						{command: 'L', point: [50, 0], attrs: {w: 100}},
					],
				},
			],
		}
		const q = Path.cornerShape(p, trim, 2, {tolerance: 0.01})
		const w = q.curves[0].vertices.map(v => v.attrs?.w as number)
		for (let i = 1; i < w.length; i++) {
			expect(w[i]).toBeGreaterThan(w[i - 1])
		}
		expect(w[1]).toBeCloseTo(42, 6)
		expect(w.at(-2)).toBeCloseTo(58, 6)
	})
})

describe('Path.offset with attributes', () => {
	/** The value of a field `f(x, y)` on the source, at its point nearest to `q`. */
	const nearestOnSource = (source: Path, name: string, q: vec2) => {
		let best = Infinity
		let value: unknown
		for (const [curveIndex, curve] of source.curves.entries()) {
			for (const [segmentIndex, seg] of Curve.segments(curve).entries()) {
				for (let i = 0; i <= 200; i++) {
					const time = i / 200
					const d = vec2.distance(Segment.point(seg, {time}), q)
					if (d < best) {
						best = d
						value = Path.attribute(source, name, {
							curveIndex,
							segmentIndex,
							time,
						})
					}
				}
			}
		}
		return value as number
	}

	const expectFollowsSource = (source: Path, q: Path, margin: number) => {
		const vertices = q.curves.flatMap(c => c.vertices)
		expect(vertices.length).toBeGreaterThan(0)
		for (const v of vertices) {
			expect(typeof v.attrs?.w).toBe('number')
			const expected = nearestOnSource(source, 'w', v.point)
			expect(Math.abs((v.attrs?.w as number) - expected)).toBeLessThan(margin)
		}
	}

	const field = (p: Path) => Path.setAttribute(p, 'w', v => v.point[0])

	test.each<[string, Path]>([
		['a square', field(Path.rect([20, 20], [80, 80]))],
		[
			'a cubic shape',
			field(
				Path.close(
					Path.join([
						Path.polyline([20, 80], [20, 20], [80, 20]),
						Path.cubicBezier([80, 20], [95, 45], [65, 60], [80, 80]),
						Path.line([80, 80], [20, 80]),
					])
				)
			),
		],
		[
			'a subdivided circle',
			field(Path.subdivide(Path.circle([50, 50], 30), 2)),
		],
	])('follows the source of %s', (_, p) => {
		expectFollowsSource(p, Path.offset(p, 3, {lineJoin: 'round'}), 4)
		expectFollowsSource(p, Path.offset(p, -3), 4)
	})

	it('follows the source of an open cubic', () => {
		const p = field(Path.cubicBezier([10, 70], [30, 10], [70, 10], [90, 70]))
		expectFollowsSource(p, Path.offset(p, 3), 4)
		expectFollowsSource(p, Path.offset(p, -3), 4)
	})

	it('keeps the values of a uniform attribute exactly, along with arcs', () => {
		const p = Path.setAttribute(Path.circle([50, 50], 20), 'w', 7)
		const q = Path.offset(p, 5)
		expect(q.curves[0].vertices.every(v => v.command === 'A')).toBe(true)
		expect(q.curves[0].vertices.every(v => v.attrs?.w === 7)).toBe(true)
	})

	it('keeps path values, and moves curve values down', () => {
		const a = Path.setAttribute(Path.rect([0, 0], [9, 9]), 'c', 1, {
			level: 'curve',
		})
		const q = Path.offset(Path.setAttribute(a, 'p', 2, {level: 'path'}), 1)
		expect(q.attrs).toEqual({p: 2})
		expect(q.curves[0].vertices.every(v => v.attrs?.c === 1)).toBe(true)
		expect(q.curves[0].attrs).toBeUndefined()
	})

	it('uses the interpolation in the definitions', () => {
		const p = Path.defineAttribute(
			field(Path.subdivide(Path.rect([0, 0], [100, 100]), 1)),
			'w',
			{interpolate: 'step'}
		)
		const values = Path.offset(p, 2).curves[0].vertices.map(v => v.attrs?.w)
		for (const v of values) expect([0, 100]).toContain(v)
	})

	it('adds nothing to a path without attributes', () => {
		const q = Path.offset(Path.rect([0, 0], [9, 9]), 1, {lineJoin: 'round'})
		expect(JSON.stringify(q)).not.toContain('attrs')
	})

	it('carries attributes through strokes too, without its working one', () => {
		const p = field(Path.line([10, 50], [90, 50]))
		const q = Path.offsetStroke(p, 4, {lineCap: 'round'})
		expectFollowsSource(p, q, 3)

		const widths = Path.setAttribute(p, 'width', v => v.point[0] / 10)
		const r = Path.offsetStroke(widths, 'width', {lineCap: 'round'})
		expectFollowsSource(p, r, 5)
		expect(JSON.stringify(r)).not.toContain('__')
	})
})
