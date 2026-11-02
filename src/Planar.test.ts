import {vec2} from 'linearly'
import {describe, expect, it} from 'vitest'

import {CubicBezier, Curve, Path, Segment} from './index'
import {windingNumber} from './path/planar'
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

describe('offsetStroke at round caps', () => {
	const shortest = (p: Path) =>
		Math.min(...Path.segments(p).map(s => Segment.length(s)))

	const curve = Path.cubicBezier([8, 75], [30, -10], [70, 110], [92, 25])

	it.each([2, 8, 16])('leaves no tiny pieces at a width of %d', width => {
		const o = Path.offsetStroke(curve, width, {
			lineCap: 'round',
			lineJoin: 'round',
		})
		expect(o.curves.length).toBe(1)
		expect(Path.segmentCount(o)).toBeLessThan(40)
		expect(shortest(o)).toBeGreaterThan(0.05)
	})

	it('leaves no tiny pieces on a subdivided curve', () => {
		const o = Path.offsetStroke(Path.subdivide(curve, 12), 8, {
			lineCap: 'round',
			lineJoin: 'round',
		})
		expect(shortest(o)).toBeGreaterThan(0.05)
	})

	it('covers the same area as a stroke with square caps, plus the caps', () => {
		const width = 8
		const butt = Path.area(Path.offsetStroke(curve, width))
		const round = Path.area(Path.offsetStroke(curve, width, {lineCap: 'round'}))
		expect(round - butt).toBeCloseTo(Math.PI * 16, 1)
	})

	it('still finds real crossings between close curves', () => {
		const a = Path.circle([0, 0], 10)
		const b = Path.circle([10, 0], 10)
		expect(Path.intersect([a, b]).curves.length).toBe(1)
		const near = Path.circle([19.999, 0], 10)
		expect(Path.intersect([a, near]).curves.length).toBe(1)
		expect(Path.unite([a, near]).curves.length).toBe(1)
	})
})

describe('offset by a tiny distance', () => {
	const lineAndCubic = Path.close(
		Path.join([
			Path.polyline([60, 90], [60, 60], [90, 60]),
			Path.cubicBezier([90, 60], [95, 75], [82, 78], [90, 90]),
			Path.line([90, 90], [60, 90]),
		])
	)

	const segmentCount = (p: Path) =>
		p.curves.reduce((n, c) => n + Curve.segments(c).length, 0)

	it('does not break a line + cubic loop into a fan of straight lines', () => {
		const o = Path.offset(lineAndCubic, 0.01, {lineJoin: 'round'})
		expect(o.curves.length).toBe(1)
		expect(o.curves[0].closed).toBe(true)
		expect(commands(o).filter(c => c === 'A').length).toBe(4)
		expect(commands(o).filter(c => c === 'C').length).toBeGreaterThan(0)
		expect(commands(o).filter(c => c === 'L').length).toBe(3)
	})

	const shapes: [string, Path, Path.OffsetOptions][] = [
		['line + cubic, round join', lineAndCubic, {lineJoin: 'round'}],
		['line + cubic, miter join', lineAndCubic, {lineJoin: 'miter'}],
		['line + cubic, bevel join', lineAndCubic, {lineJoin: 'bevel'}],
		['round rect', Path.roundRect([14, 64], [36, 86], 5), {}],
		['circle', Path.circle([25, 25], 11), {}],
		['square', Path.rect([0, 0], [20, 20]), {}],
		['cubic circle', Path.toC(Path.circle([25, 25], 11)), {}],
	]
	const distances = [1e-12, 1e-9, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 0.01, 0.05]

	it.each(shapes)('stays one thin ring off a %s', (_, shape, options) => {
		const a0 = area(shape)
		const perimeter = Path.length(shape)
		for (const magnitude of distances) {
			for (const d of [magnitude, -magnitude]) {
				const o = Path.offset(shape, d, options)
				expect(o.curves.length).toBe(1)
				expect(segmentCount(o)).toBeLessThanOrEqual(20)
				// Steiner formula, within the fitting tolerance of d / 4. Offsets below 1e-7 of the
				// coordinates (at most 90 here) are regarded as zero.
				expect(Math.abs(area(o) - (a0 + perimeter * d))).toBeLessThanOrEqual(
					8 * d * d + 0.02 * Math.abs(d) * perimeter + perimeter * 9e-6 + 2e-5
				)
			}
		}
	})

	it('keeps an open cubic in one piece', () => {
		const p = Path.cubicBezier([0, 0], [30, 50], [70, -50], [100, 0])
		const len = Path.length(p)
		for (const magnitude of distances) {
			for (const d of [magnitude, -magnitude]) {
				const o = Path.offset(p, d)
				expect(o.curves.length).toBe(1)
				expect(o.curves[0].closed).toBe(false)
				expect(Math.abs(Path.length(o) - len)).toBeLessThan(0.01)
			}
		}
	})

	it('strokes a cubic loop with a hairline', () => {
		const a0 = Path.length(lineAndCubic)
		for (const width of [1e-5, 1e-3, 0.02]) {
			const o = Path.offsetStroke(lineAndCubic, width)
			expect(o.curves.length).toBe(2)
			expect(Math.abs(area(o) - a0 * width) / (a0 * width)).toBeLessThan(0.05)
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

describe('cubic Béziers crossing themselves', () => {
	/** The corner cubic P0 → P1 around `apex`, with handles of `k` times the distance to it. */
	const cornerHandles = (p0: vec2, apex: vec2, p1: vec2, k: number) =>
		[vec2.lerp(p0, apex, k), vec2.lerp(p1, apex, k)] as const

	const corner = (k: number) =>
		CubicBezier.of(
			[20, 50],
			...cornerHandles([20, 50], [50, 50], [50, 20], k),
			[50, 20]
		)

	const closedCorner = (k: number): Path => ({
		curves: [
			{
				vertices: [
					{command: 'L', point: [20, 80]},
					{command: 'L', point: [20, 50]},
					{command: 'C', args: corner(k).args, point: [50, 20]},
					{command: 'L', point: [80, 20]},
					{command: 'L', point: [80, 80]},
				],
				closed: true,
			},
		],
	})

	const teardrop: Path = {
		curves: [
			{
				vertices: [
					{
						command: 'C',
						args: [
							[90, 10],
							[10, 10],
						],
						point: [50, 70],
					},
				],
				closed: true,
			},
		],
	}

	const shapes: [string, Path][] = [
		['a cusp', closedCorner(2)],
		['a tiny loop', closedCorner(2.01)],
		['a loop', closedCorner(3)],
		['a large loop', closedCorner(5)],
		['a reversed loop', Path.reverse(closedCorner(3))],
		['a teardrop', teardrop],
	]

	const grid: vec2[] = []
	for (let i = 0; i < 36; i++) {
		for (let j = 0; j < 36; j++) {
			grid.push([-10 + (120 * (i + 0.37)) / 36, -10 + (120 * (j + 0.61)) / 36])
		}
	}

	/** Distance to the boundary of the path, by a fine polyline. */
	const distanceTo = (path: Path) => {
		const pts = Path.segments(path).flatMap(seg =>
			Array.from({length: 121}, (_, i) => Segment.point(seg, {time: i / 120}))
		)
		return (q: vec2) => Math.min(...pts.map(p => vec2.distance(p, q)))
	}

	const inside = (path: Path, q: vec2) => windingNumber(path.curves, q) !== 0

	/** Compares with the expected region, away from its boundary where it is undecided. */
	const expectRegion = (
		result: Path,
		expected: (q: vec2) => boolean | null
	) => {
		expect(result.curves.every(c => c.closed)).toBe(true)
		for (const q of grid) {
			const want = expected(q)
			if (want !== null) expect(inside(result, q)).toBe(want)
		}
	}

	it.each(shapes)('fills the same region after unite on %s', (_, p) => {
		expectRegion(Path.unite([p]), q => inside(p, q))
	})

	it.each(shapes)('measures %s by what gets filled', (_, p) => {
		expect(Path.area(p)).toBeCloseTo(Path.area(Path.unite([p])), 6)
	})

	it('counts the overlap of a loop once', () => {
		const p = closedCorner(5)
		const signed = Math.abs(planarPathArea(p))
		expect(signed - Path.area(p)).toBeGreaterThan(100)
	})

	it.each(shapes)('applies boolean operations to %s', (_, p) => {
		const box = Path.rect([35, 35], [65, 65])
		const inBox = (q: vec2) => inside(box, q)
		expectRegion(Path.subtract(p, [box]), q => inside(p, q) && !inBox(q))
		expectRegion(Path.intersect([p, box]), q => inside(p, q) && inBox(q))
		expectRegion(Path.exclude([p, box]), q => inside(p, q) !== inBox(q))
	})

	it.each(shapes)('offsets %s', (_, p) => {
		const distance = distanceTo(Path.unite([p]))
		const away = (q: vec2) => {
			const x = distance(q)
			return Math.abs(x - 3) < 1 ? null : x
		}
		expectRegion(Path.offset(p, 3, {lineJoin: 'round'}), q => {
			const x = away(q)
			return x === null ? null : inside(p, q) || x < 3
		})
		expectRegion(Path.offset(p, -3, {lineJoin: 'round'}), q => {
			const x = away(q)
			return x === null ? null : inside(p, q) && x > 3
		})
	})

	it.each(shapes)('strokes %s along the whole curve', (_, p) => {
		const distance = distanceTo(p)
		expectRegion(Path.offsetStroke(p, 6, {lineJoin: 'round'}), q => {
			const x = distance(q)
			return Math.abs(x - 3) < 1 ? null : x < 3
		})
	})

	it.each([2, 2.01, 3, 5])('strokes an open curve with k = %d', k => {
		const p: Path = {
			curves: [
				{
					vertices: [
						{command: 'L', point: [20, 50]},
						{command: 'C', args: corner(k).args, point: [50, 20]},
					],
					closed: false,
				},
			],
		}
		const distance = distanceTo(p)
		const o = Path.offsetStroke(p, 6, {lineJoin: 'round', lineCap: 'round'})
		expectRegion(o, q => {
			const x = distance(q)
			return Math.abs(x - 3) < 1 ? null : x < 3
		})
		expect(Path.offset(p, 3).curves.length).toBeGreaterThan(0)
		expect(Path.offset(p, -3).curves.length).toBeGreaterThan(0)
	})

	describe('CubicBezier.selfIntersectionTimes', () => {
		it('finds where a loop crosses itself', () => {
			const seg = corner(3)
			const times = CubicBezier.selfIntersectionTimes(seg)!
			expect(times[0]).toBeLessThan(times[1])
			expect(
				vec2.distance(
					CubicBezier.point(seg, {time: times[0]}),
					CubicBezier.point(seg, {time: times[1]})
				)
			).toBeLessThan(1e-9)
		})

		it('finds the ends of a curve returning to its start', () => {
			const seg = CubicBezier.of([50, 70], [90, 10], [10, 10], [50, 70])
			expect(CubicBezier.selfIntersectionTimes(seg)).toEqual([0, 1])
		})

		it.each([0, 0.55, 1, 2])('finds no loop when k = %d', k => {
			expect(CubicBezier.selfIntersectionTimes(corner(k))).toBeNull()
		})

		it('ignores a loop outside the curve', () => {
			// The same cubic, cut off before its loop closes
			const seg = CubicBezier.trim(corner(3), {time: 0}, {time: 0.5})
			expect(CubicBezier.selfIntersectionTimes(seg)).toBeNull()
		})
	})

	describe('CubicBezier.cuspTimes', () => {
		it('finds the cusp at exactly k = 2', () => {
			const times = CubicBezier.cuspTimes(corner(2))
			expect(times.length).toBe(1)
			expect(times[0]).toBeCloseTo(0.5, 9)
		})

		it.each([1, 1.9, 2.1, 3])('finds none when k = %d', k => {
			expect(CubicBezier.cuspTimes(corner(k))).toEqual([])
		})
	})

	describe('CubicBezier.isStraight', () => {
		it('does not take a curve returning to its start for a line', () => {
			const loop = CubicBezier.of([50, 70], [90, 10], [10, 10], [50, 70])
			expect(CubicBezier.isStraight(loop)).toBe(false)
		})

		it('still takes an out-and-back curve for a line', () => {
			const flat = CubicBezier.of([0, 0], [10, 10], [20, 20], [0, 0])
			expect(CubicBezier.isStraight(flat)).toBe(true)
		})
	})
})

describe('winding numbers on many segments', () => {
	const circleOf = (n: number, r: number, reverse = false) => {
		const points = Array.from({length: n}, (_, i) => {
			const a = (i / n) * Math.PI * 2 * (reverse ? -1 : 1)
			return [Math.cos(a) * r, Math.sin(a) * r] as [number, number]
		})
		return Path.polygon(...points)
	}

	// Having to visit every segment per probe, this would take tens of seconds
	it('keeps a dense polygon quick to offset', () => {
		const result = Path.offset(circleOf(2000, 100), 10, {lineJoin: 'round'})
		expect(Math.abs(Path.area(result))).toBeCloseTo(Math.PI * 110 * 110, -2)
	})

	it('sums up curves with holes and repeated vertices', () => {
		const outer = circleOf(64, 100)
		const hole = circleOf(32, 50, true)
		const repeated = {
			curves: [
				{
					closed: true,
					vertices: [
						...outer.curves[0].vertices.slice(0, 8),
						outer.curves[0].vertices[7],
						...outer.curves[0].vertices.slice(8),
					],
				},
				hole.curves[0],
			],
		} as Path
		const united = Path.unite([repeated])

		expect(Path.contains(united, [75, 0])).toBe(true)
		expect(Path.contains(united, [0, 0])).toBe(false)
		expect(Path.contains(united, [120, 0])).toBe(false)
	})
})
