import {vec2} from 'linearly'
import {describe, expect, it, test} from 'vitest'

import {Path, Segment} from './index'
import {windingNumber} from './path/planar'

const types = ['LSL', 'RSR', 'LSR', 'RSL', 'RLR', 'LRL'] as const

const dirOf = (deg: number): vec2 => [
	Math.cos((deg * Math.PI) / 180),
	Math.sin((deg * Math.PI) / 180),
]

/** A reproducible list of poses. */
const poses = (() => {
	let seed = 42
	const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
	return Array.from({length: 60}, () => ({
		a: [rnd() * 100, rnd() * 100] as vec2,
		from: rnd() * 720 - 360,
		b: [rnd() * 100, rnd() * 100] as vec2,
		to: rnd() * 720 - 360,
		r: 3 + rnd() * 25,
	}))
})()

const expectValidDubins = (
	p: Path,
	{a, from, b, to, r}: (typeof poses)[number]
) => {
	const segs = Path.segments(p)
	expect(segs[0].start).toEqual(a)
	expect(segs.at(-1)!.point).toEqual(b)

	const t0 = Segment.tangent(segs[0], 0)
	const t1 = Segment.tangent(segs.at(-1)!, 1)
	expect(vec2.distance(t0, dirOf(from))).toBeLessThan(1e-6)
	expect(vec2.distance(t1, dirOf(to))).toBeLessThan(1e-6)

	// Smooth everywhere, at the given radius
	for (let i = 0; i + 1 < segs.length; i++) {
		const d = vec2.distance(
			Segment.tangent(segs[i], 1),
			Segment.tangent(segs[i + 1], 0)
		)
		expect(d).toBeLessThan(1e-6)
		expect(vec2.distance(segs[i].point, segs[i + 1].start)).toBe(0)
	}
	for (const s of segs) {
		if (s.command === 'A') expect(s.args[0]).toEqual([r, r])
		if (s.command === 'A') {
			expect(Math.abs(Segment.curvature(s, 0.5))).toBeCloseTo(1 / r, 6)
		}
	}
}

describe('Path.dubins', () => {
	it('connects any two poses smoothly', () => {
		for (const pose of poses) {
			expectValidDubins(
				Path.dubins(pose.a, pose.from, pose.b, pose.to, pose.r),
				pose
			)
		}
	})

	test.each(types)('reaches the end with the type %s', type => {
		let tried = 0
		for (const pose of poses) {
			let p: Path
			try {
				p = Path.dubins(pose.a, pose.from, pose.b, pose.to, pose.r, {type})
			} catch {
				continue
			}
			tried++
			expectValidDubins(p, pose)
		}
		expect(tried).toBeGreaterThan(0)
	})

	it('takes the shortest of all the types', () => {
		for (const pose of poses) {
			const {a, from, b, to, r} = pose
			const length = Path.length(Path.dubins(a, from, b, to, r))
			for (const type of types) {
				let other = Infinity
				try {
					other = Path.length(Path.dubins(a, from, b, to, r, {type}))
				} catch {
					continue
				}
				expect(length).toBeLessThanOrEqual(other + 1e-6)
			}
		}
	})

	it('goes straight when the poses line up', () => {
		const p = Path.dubins([0, 0], 0, [50, 0], 0, 10)
		expect(p.curves[0].vertices.map(v => v.command)).toEqual(['L', 'L'])
		expect(Path.length(p)).toBeCloseTo(50, 9)
	})

	it('is an exact half circle between opposite poses at twice the radius', () => {
		const p = Path.dubins([0, 0], 0, [0, 20], 180, 10)
		expect(Path.length(p)).toBeCloseTo(Math.PI * 10, 6)
		const [lo, hi] = Path.bounds(p)
		expect(lo[1]).toBeCloseTo(0, 6)
		expect(hi[1]).toBeCloseTo(20, 6)
		expect(hi[0]).toBeCloseTo(10, 6)
	})

	it('names the turns as seen on a Y-down canvas', () => {
		// Heading +X and turning clockwise on screen goes towards +Y
		const right = Path.dubins([0, 0], 0, [0, 20], 180, 10, {type: 'RSR'})
		expect(Path.point(right, 0.5)[0]).toBeGreaterThan(5)
		const left = Path.dubins([0, 0], 0, [0, -20], 180, 10, {type: 'LSL'})
		expect(Path.point(left, 0.5)[1]).toBeLessThan(-5)
	})

	it('turns a full circle when it has to', () => {
		const p = Path.dubins([0, 0], 0, [0.001, 0], 0, 10, {type: 'LSL'})
		expect(Path.length(p)).toBeGreaterThan(0)
		expect(Path.segments(p).every(s => s.command !== 'A' || !s.args[2])).toBe(
			true
		)
	})

	it('needs no large arc flag, even past a half turn', () => {
		const p = Path.dubins([0, 0], 0, [-1, 0], 180, 10)
		expect(Path.length(p)).toBeGreaterThan(Math.PI * 10)
		expectValidDubins(p, {a: [0, 0], from: 0, b: [-1, 0], to: 180, r: 10})
	})

	it('stays at a point when the poses are the same', () => {
		const p = Path.dubins([5, 5], 30, [5, 5], 30, 10)
		expect(Path.length(p)).toBeCloseTo(0, 6)
		expect(p.curves[0].vertices[0].point).toEqual([5, 5])
	})

	it('tells the possible types, the shortest first', () => {
		for (const {a, from, b, to, r} of poses) {
			const list = Path.dubinsTypes(a, from, b, to, r)
			expect(list.length).toBeGreaterThan(0)
			for (let i = 1; i < list.length; i++) {
				expect(list[i].length).toBeGreaterThanOrEqual(list[i - 1].length)
			}
			expect(Path.length(Path.dubins(a, from, b, to, r))).toBeCloseTo(
				list[0].length,
				6
			)
			for (const {type, length} of list) {
				expect(Path.length(Path.dubins(a, from, b, to, r, {type}))).toBeCloseTo(
					length,
					6
				)
			}
		}
	})

	it('leaves out the types that are impossible', () => {
		const far = Path.dubinsTypes([0, 0], 0, [1000, 0], 0, 1).map(t => t.type)
		expect(far).not.toContain('RLR')
		expect(far).not.toContain('LRL')
		expect(far.length).toBe(4)
	})

	it('reuses the type of one setting for another', () => {
		const [{type}] = Path.dubinsTypes([20, 70], -90, [80, 30], 180, 15)
		const moved = Path.dubins([20, 70], -90, [85, 40], 170, 12, {type})
		const expected = Path.dubinsTypes([20, 70], -90, [85, 40], 170, 12).find(
			t => t.type === type
		)
		expect(Path.length(moved)).toBeCloseTo(expected!.length, 6)
	})

	it('rejects a bad radius, and a type that is impossible', () => {
		expect(() => Path.dubins([0, 0], 0, [1, 0], 0, 0)).toThrow()
		expect(() =>
			Path.dubins([0, 0], 0, [1000, 0], 0, 1, {type: 'RLR'})
		).toThrow()
	})
})

describe('Path.zigzag', () => {
	const line = Path.line([0, 50], [100, 50])

	it('alternates along the normal, keeping the ends of an open curve', () => {
		const q = Path.zigzag(line, 5, 20)
		const pts = q.curves[0].vertices.map(v => v.point)
		expect(pts.length).toBe(12)
		expect(pts[0]).toEqual([0, 50])
		expect(pts.at(-1)).toEqual([100, 50])
		expect(pts[1]).toEqual([5, 55])
		expect(pts[2]).toEqual([15, 45])
		expect(q.curves[0].closed).toBe(false)
		expect(q.curves[0].vertices.every(v => v.command === 'L')).toBe(true)
	})

	it('fits a whole number of peaks', () => {
		const n = (w: number) => Path.zigzag(line, 1, w).curves[0].vertices.length
		expect(n(23)).toBe(n(20) - 1)
		expect(n(1000)).toBe(3)
	})

	it('stays closed with an even number of peaks', () => {
		for (const w of [10, 13, 17, 30, 500]) {
			const q = Path.zigzag(Path.circle([50, 50], 30), 4, w)
			expect(q.curves[0].closed).toBe(true)
			expect(q.curves[0].vertices.length % 2).toBe(0)
			const radii = q.curves[0].vertices.map(v =>
				vec2.distance(v.point, [50, 50])
			)
			for (const [i, r] of radii.entries()) {
				expect(r).toBeCloseTo(i % 2 ? 34 : 26, 6)
			}
		}
	})

	it('follows curves along their arc length', () => {
		const p = Path.cubicBezier([0, 50], [30, 0], [70, 100], [100, 50])
		const q = Path.zigzag(p, 2, 10)
		const vs = q.curves[0].vertices
		const n = vs.length - 2
		for (let k = 0; k < n; k++) {
			const on = Path.point(p, (k + 0.5) / n)
			expect(vec2.distance(vs[k + 1].point, on)).toBeCloseTo(2, 3)
		}
	})

	it('draws waves when smooth', () => {
		const q = Path.zigzag(line, 5, 20, {smooth: true})
		const segs = Path.segments(q)
		expect(segs.every(s => s.command === 'C')).toBe(true)
		for (let i = 0; i + 1 < segs.length; i++) {
			expect(
				vec2.distance(
					Segment.tangent(segs[i], 1),
					Segment.tangent(segs[i + 1], 0)
				)
			).toBeLessThan(1e-6)
		}
		// Between peaks it stays within them, unlike a looping curve
		const [lo, hi] = Path.bounds(q)
		expect(hi[1]).toBeCloseTo(55, 6)
		expect(lo[1]).toBeCloseTo(45, 6)
	})

	it('closes smoothly as well', () => {
		const q = Path.zigzag(Path.circle([50, 50], 30), 3, 12, {smooth: true})
		const segs = Path.segments(q)
		for (let i = 0; i < segs.length; i++) {
			const next = segs[(i + 1) % segs.length]
			expect(vec2.distance(segs[i].point, next.start)).toBeLessThan(1e-9)
			expect(
				vec2.distance(Segment.tangent(segs[i], 1), Segment.tangent(next, 0))
			).toBeLessThan(1e-6)
		}
		expect(windingNumber(q.curves, [50, 50])).not.toBe(0)
	})

	it('reads the amplitude along the path', () => {
		const p = Path.setAttribute(line, 'a', v => (v.point[0] === 0 ? 0 : 10))
		const q = Path.zigzag(p, 'a', 20)
		const vs = q.curves[0].vertices
		for (const v of vs.slice(1, -1)) {
			expect(Math.abs(v.point[1] - 50)).toBeCloseTo(v.point[0] / 10, 6)
		}
		const r = Path.zigzag(line, v => (v.point[0] === 0 ? 0 : 10), 20)
		expect(r.curves[0].vertices[1].point).toEqual(vs[1].point)
		expect(JSON.stringify(r)).not.toContain('__')
	})

	it('carries attributes, on all levels', () => {
		const p = Path.setAttribute(
			Path.setAttribute(
				Path.setAttribute(line, 'w', v => v.point[0]),
				'c',
				1,
				{level: 'curve'}
			),
			'd',
			2,
			{level: 'path'}
		)
		const q = Path.zigzag(p, 5, 20)
		expect(q.attrs).toEqual({d: 2})
		expect(q.curves[0].attrs).toEqual({c: 1})
		for (const v of q.curves[0].vertices) {
			expect(v.attrs?.w).toBeCloseTo(v.point[0], 6)
		}
	})

	describe('phase', () => {
		const pointsOf = (q: Path) => q.curves[0].vertices.map(v => v.point)

		it('changes nothing at 0', () => {
			expect(pointsOf(Path.zigzag(line, 5, 20, {phase: 0}))).toEqual(
				pointsOf(Path.zigzag(line, 5, 20))
			)
		})

		it('moves the peaks backwards along the path', () => {
			// One period is 20 long, so a quarter of it is 5
			const q = Path.zigzag(line, 5, 20, {phase: 0.25})
			const pts = pointsOf(q)
			expect(pts[0][0]).toBe(0)
			expect(pts[0][1]).toBeCloseTo(55, 9)
			for (const p of pts.slice(1, -1)) {
				expect(p[0] % 10).toBeCloseTo(0, 6)
			}
		})

		it('makes a seamless loop by a whole period', () => {
			const a = pointsOf(Path.zigzag(line, 5, 20, {phase: 0.3}))
			const b = pointsOf(Path.zigzag(line, 5, 20, {phase: 1.3}))
			const c = pointsOf(Path.zigzag(line, 5, 20, {phase: -0.7}))
			expect(a.length).toBe(b.length)
			for (const [i, p] of a.entries()) {
				expect(vec2.distance(p, b[i])).toBeLessThan(1e-6)
				expect(vec2.distance(p, c[i])).toBeLessThan(1e-6)
			}
			const circle = Path.circle([50, 50], 30)
			expect(Path.area(Path.zigzag(circle, 4, 10, {phase: 0.3}))).toBeCloseTo(
				Path.area(Path.zigzag(circle, 4, 10, {phase: 1.3})),
				6
			)
		})

		it('keeps the wave continuous at the ends of an open curve', () => {
			// No jump between two nearby phases, even as a peak passes through an end
			const heightAt = (x: number, phase: number) => {
				const pts = pointsOf(Path.zigzag(line, 5, 20, {phase}))
				for (let i = 0; i + 1 < pts.length; i++) {
					if (pts[i][0] <= x && x <= pts[i + 1][0]) {
						const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0] || 1)
						return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
					}
				}
				throw new Error('out of range')
			}
			for (let k = 0; k < 400; k++) {
				const phase = k / 400
				for (const x of [0, 1, 50, 99, 100]) {
					const d = Math.abs(heightAt(x, phase) - heightAt(x, phase + 1 / 400))
					expect(d).toBeLessThan(0.2)
				}
			}
		})

		it('stays closed with the same number of peaks', () => {
			const circle = Path.circle([50, 50], 30)
			const n = Path.zigzag(circle, 4, 10).curves[0].vertices.length
			for (const phase of [0.1, 0.25, 0.5, 0.77, -0.3, 2.6]) {
				for (const smooth of [false, true]) {
					const q = Path.zigzag(circle, 4, 10, {phase, smooth})
					expect(q.curves[0].closed).toBe(true)
					expect(q.curves[0].vertices.length).toBe(n)
					const radii = q.curves[0].vertices.map(v =>
						vec2.distance(v.point, [50, 50])
					)
					for (const r of radii) {
						expect(Math.abs(r - 30)).toBeCloseTo(4, 6)
					}
					// Alternating sides all the way around, also across the seam
					for (const [i, r] of radii.entries()) {
						const next = radii[(i + 1) % radii.length]
						expect(Math.sign(r - 30)).toBe(-Math.sign(next - 30))
					}
				}
			}
		})

		it('works with smooth, and carries attributes', () => {
			const p = Path.setAttribute(line, 'w', v => v.point[0])
			const q = Path.zigzag(p, 5, 20, {phase: 0.4, smooth: true})
			for (const v of q.curves[0].vertices) {
				expect(v.attrs?.w).toBeCloseTo(v.point[0], 6)
			}
		})
	})

	it('leaves what it cannot process', () => {
		const p = Path.dot([1, 1])
		expect(Path.zigzag(p, 1, 1).curves[0].vertices.length).toBe(
			p.curves[0].vertices.length
		)
		expect(Path.zigzag(line, 1, 0)).toBe(line)
		expect(JSON.stringify(Path.zigzag(line, 1, 5))).not.toContain('attrs')
	})
})
