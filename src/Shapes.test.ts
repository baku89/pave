import {vec2} from 'linearly'
import {describe, expect, it} from 'vitest'

import {Path, Segment} from './index'

/** Dense samples along a path. */
const samplesOf = (p: Path, perSegment = 24): vec2[] =>
	Path.segments(p).flatMap(s =>
		Array.from({length: perSegment + 1}, (_, i) =>
			Segment.point(s, {time: i / perSegment})
		)
	)

const expectSmooth = (p: Path, limit = 1e-6) => {
	const segs = Path.segments(p)
	for (let i = 0; i + 1 < segs.length; i++) {
		expect(vec2.distance(segs[i].point, segs[i + 1].start)).toBeLessThan(1e-9)
		expect(
			vec2.distance(
				Segment.tangent(segs[i], 1),
				Segment.tangent(segs[i + 1], 0)
			)
		).toBeLessThan(limit)
	}
}

describe('star', () => {
	it('alternates between the radii, starting with a tip on +X', () => {
		const p = Path.star([50, 50], 40, 15, 5)
		const {vertices, closed} = p.curves[0]
		expect(closed).toBe(true)
		expect(vertices).toHaveLength(10)
		expect(vertices[0].point).toEqual([90, 50])
		vertices.forEach((v, i) => {
			expect(vec2.distance(v.point, [50, 50])).toBeCloseTo(
				i % 2 === 0 ? 40 : 15,
				9
			)
		})
	})

	it('has the area of its triangles', () => {
		const n = 7
		const area = Path.area(Path.star([0, 0], 30, 12, n))
		expect(Math.abs(area)).toBeCloseTo(n * 30 * 12 * Math.sin(Math.PI / n), 6)
	})

	it('rejects an invalid number of points', () => {
		for (const n of [0, 1, 2.5, NaN]) {
			expect(() => Path.star([0, 0], 2, 1, n)).toThrow()
		}
	})
})

describe('capsule', () => {
	const a: vec2 = [20, 70]
	const b: vec2 = [80, 30]
	const r = 12
	const d = vec2.distance(a, b)

	it('has the exact length and area', () => {
		const p = Path.capsule(a, b, r)
		expect(Path.length(p)).toBeCloseTo(2 * d + 2 * Math.PI * r, 5)
		expect(Math.abs(Path.area(p))).toBeCloseTo(2 * r * d + Math.PI * r * r, 4)
	})

	it('stays at the radius from the core line', () => {
		for (const q of samplesOf(Path.capsule(a, b, r))) {
			const u = Math.min(
				Math.max(vec2.dot(vec2.sub(q, a), vec2.sub(b, a)) / (d * d), 0),
				1
			)
			expect(vec2.distance(q, vec2.lerp(a, b, u))).toBeCloseTo(r, 6)
		}
	})

	it('is smooth all around and winds like a circle', () => {
		const p = Path.capsule(a, b, r)
		expectSmooth(p)
		const segs = Path.segments(p)
		expect(
			vec2.distance(
				Segment.tangent(segs.at(-1)!, 1),
				Segment.tangent(segs[0], 0)
			)
		).toBeLessThan(1e-6)
		expect(Math.sign(Path.area(p))).toBe(
			Math.sign(Path.area(Path.circle([0, 0], 1)))
		)
	})

	it('degenerates to a circle and a line', () => {
		expect(Path.capsule(a, a, r)).toEqual(Path.circle(a, r))
		expect(Path.capsule(a, b, 0)).toEqual(Path.line(a, b))
		expect(() => Path.capsule(a, b, -1)).toThrow()
	})

	it('works with the boolean operations and offset', () => {
		const p = Path.capsule(a, b, r)
		const united = Path.unite([p, Path.capsule(b, a, r)])
		expect(Math.abs(Path.area(united))).toBeCloseTo(Math.abs(Path.area(p)), 3)
		expect(Math.abs(Path.area(Path.offset(p, 3)))).toBeCloseTo(
			Math.abs(Path.area(Path.capsule(a, b, r + 3))),
			1
		)
	})
})

describe('superellipse', () => {
	/** A dense outline of the first quadrant in the unit frame, even along each axis. */
	const outlineOf = (e: number) => {
		const out: vec2[] = []
		const n = 2000
		for (let i = 0; i <= n; i++) {
			const v = i / n
			out.push([(1 - v) ** (1 / e), v ** (1 / e)])
			out.push([(1 - v ** e) ** (1 / e), v])
			out.push([v, (1 - v ** e) ** (1 / e)])
		}
		return out
	}

	it.each([-4, -3, -2, -1.5, -0.5, 0.1, 0.5, 1.5, 2, 3, 5, 8, 9, 10, 12, 16])(
		'follows the exact curve with shape %d',
		shape => {
			const tolerance = 0.05
			const r = 40
			const p = Path.superellipse([0, 0], [r, r], shape, {tolerance})
			const outline = outlineOf(2 ** shape).map(q => vec2.scale(q, r))
			for (const [x, y] of samplesOf(p, 12)) {
				const q: vec2 = [Math.abs(x), Math.abs(y)]
				const distance = Math.min(...outline.map(o => vec2.distance(o, q)))
				// The second term is the resolution of the outline
				expect(distance).toBeLessThan(tolerance * 1.2 + r / 2000)
				expect(Math.max(q[0], q[1])).toBeLessThan(r + tolerance)
			}
			expect(p.curves[0].closed).toBe(true)
		}
	)

	it('has the area by the Gamma function formula for a squircle', () => {
		// 4 * Γ(1.25)^2 / Γ(1.5)
		const unit = 3.7081493546027438
		const area = Path.area(
			Path.superellipse([10, 20], [30, 15], 2, {tolerance: 1e-3})
		)
		expect(Math.abs(area)).toBeCloseTo(unit * 30 * 15, 1)
	})

	it('is the known shape for the special values', () => {
		expect(Path.superellipse([5, 5], [3, 2], 1)).toEqual(
			Path.ellipse([5, 5], [3, 2])
		)
		expect(
			Math.abs(Path.area(Path.superellipse([0, 0], [3, 2], 0)))
		).toBeCloseTo(12, 9)
		expect(
			Math.abs(Path.area(Path.superellipse([0, 0], [3, 2], Infinity)))
		).toBeCloseTo(24, 9)
		expect(
			Math.abs(Path.area(Path.superellipse([0, 0], [3, 2], -Infinity)))
		).toBeCloseTo(0, 9)
	})

	it('has the first vertex on +X and is closed without a gap', () => {
		const p = Path.superellipse([10, 20], [30, 15], 2.5)
		const {vertices} = p.curves[0]
		expect(vertices[0].point[0]).toBeCloseTo(40, 9)
		expect(vertices[0].point[1]).toBeCloseTo(20, 9)
		const segs = Path.segments(p)
		expect(vec2.distance(segs.at(-1)!.point, segs[0].start)).toBeLessThan(1e-9)
		expect(Math.sign(Path.area(p))).toBe(
			Math.sign(Path.area(Path.circle([0, 0], 1)))
		)
	})

	it('approaches the limits smoothly for the large shapes', () => {
		for (const shape of [8, 12, 20, 40, 1000]) {
			const p = Path.superellipse([0, 0], [3, 2], shape)
			const area = Math.abs(Path.area(p))
			expect(Number.isFinite(area)).toBe(true)
			expect(area).toBeGreaterThan(23)
			// The tolerance times the perimeter
			expect(area).toBeLessThanOrEqual(24 + 0.05 * 20)
		}
		for (const shape of [-8, -12, -20, -40, -1000]) {
			const area = Math.abs(Path.area(Path.superellipse([0, 0], [3, 2], shape)))
			expect(Number.isFinite(area)).toBe(true)
			expect(area).toBeLessThan(1)
		}
	})

	it('keeps the corners of cornerShape finite for any shape', () => {
		const square = Path.rect([0, 0], [100, 100])
		for (const shape of [-1000, -40, -8, -3, 8, 12, 1000]) {
			for (const s of Path.segments(Path.cornerShape(square, 20, shape))) {
				expect(Number.isFinite(s.point[0] + s.point[1])).toBe(true)
				if (s.command === 'C') {
					expect(s.args.flat().every(Number.isFinite)).toBe(true)
				}
			}
		}
	})

	it('stays small', () => {
		for (const shape of [0.5, 2, 3, -1]) {
			const n = Path.superellipse([50, 50], [40, 40], shape).curves[0].vertices
				.length
			expect(n).toBeLessThanOrEqual(40)
		}
	})
})

describe('spiral', () => {
	const center: vec2 = [50, 50]

	/** The unwrapped angle and radius along the path. */
	const polarOf = (p: Path) => {
		let last = NaN
		let unwrapped = 0
		return samplesOf(p).map(q => {
			const v = vec2.sub(q, center)
			const r = vec2.len(v)
			const a = Math.atan2(v[1], v[0])
			if (Number.isNaN(last)) unwrapped = a
			else {
				let d = a - last
				while (d > Math.PI) d -= 2 * Math.PI
				while (d < -Math.PI) d += 2 * Math.PI
				unwrapped += d
			}
			last = a
			return {r, a: unwrapped}
		})
	}

	it('follows an Archimedean spiral', () => {
		const tolerance = 0.02
		const p = Path.spiral(center, 5, 40, 4, {startAngle: 30, tolerance})
		const polar = polarOf(p)
		const a0 = polar[0].a
		for (const {r, a} of polar) {
			const t = (a - a0) / (4 * 2 * Math.PI)
			expect(Math.abs(r - (5 + 35 * t))).toBeLessThan(tolerance * 1.5)
		}
		expect(polar.at(-1)!.a - a0).toBeCloseTo(4 * 2 * Math.PI, 3)
	})

	it('follows a logarithmic spiral', () => {
		const tolerance = 0.02
		const p = Path.spiral(center, 2, 40, 3, {
			type: 'logarithmic',
			tolerance,
		})
		const polar = polarOf(p)
		for (const {r, a} of polar) {
			const t = a / (3 * 2 * Math.PI)
			expect(Math.abs(r - 2 * 20 ** t)).toBeLessThan(tolerance * 1.5)
		}
	})

	it('runs the other way with negative turns', () => {
		const positive = polarOf(Path.spiral(center, 10, 30, 2))
		const negative = polarOf(Path.spiral(center, 10, 30, -2))
		expect(positive.at(-1)!.a).toBeGreaterThan(0)
		expect(negative.at(-1)!.a).toBeLessThan(0)
	})

	it('starts and ends at the exact points, and is smooth', () => {
		const p = Path.spiral(center, 10, 30, 2.25, {startAngle: 90})
		const segs = Path.segments(p)
		expect(vec2.distance(segs[0].start, [50, 60])).toBeLessThan(1e-9)
		// 90 + 2.25 * 360 = 900, which points to -X
		expect(vec2.distance(segs.at(-1)!.point, [20, 50])).toBeLessThan(1e-9)
		expectSmooth(p)
		expect(p.curves[0].closed).toBe(false)
	})

	it('handles a radius of zero at either end', () => {
		for (const p of [
			Path.spiral(center, 0, 30, 3),
			Path.spiral(center, 30, 0, 3),
		]) {
			expectSmooth(p, 1e-5)
			const min = Math.min(...samplesOf(p).map(q => vec2.distance(q, center)))
			expect(min).toBeLessThan(1e-9)
		}
	})

	it('degenerates without NaN', () => {
		expect(Path.spiral(center, 10, 30, 0)).toEqual(
			Path.line([60, 50], [80, 50])
		)
		expect(Path.segments(Path.spiral(center, 0, 0, 3))).toHaveLength(
			Path.segments(Path.dot(center)).length
		)
		const circular = Path.spiral(center, 20, 20, 1)
		for (const q of samplesOf(circular)) {
			expect(Math.abs(vec2.distance(q, center) - 20)).toBeLessThan(0.05)
		}
		for (const q of samplesOf(Path.spiral(center, 1e-6, 30, 1e-3))) {
			expect(Number.isFinite(q[0] + q[1])).toBe(true)
		}
	})

	it('rejects invalid radii', () => {
		expect(() => Path.spiral(center, -1, 10, 1)).toThrow()
		expect(() => Path.spiral(center, 0, 10, 1, {type: 'logarithmic'})).toThrow()
	})

	it('does not grow with a low accuracy', () => {
		const n = Path.spiral(center, 4, 42, 5).curves[0].vertices.length
		expect(n).toBeLessThanOrEqual(5 * 4 * 2 + 1)
	})
})

describe('clothoid', () => {
	it('matches the Fresnel integrals', () => {
		// With a curvature of `πs`, the end point is (C(1), S(1))
		const scale = 100
		const p = Path.clothoid([0, 0], 0, scale, 0, Math.PI / scale, {
			tolerance: 1e-3,
		})
		const end = Path.segments(p).at(-1)!.point
		expect(end[0] / scale).toBeCloseTo(0.7798934, 6)
		expect(end[1] / scale).toBeCloseTo(0.4382591, 6)
	})

	it('has the length and the end direction asked for', () => {
		const p = Path.clothoid([10, 20], 30, 120, -0.02, 0.07)
		expect(Path.length(p)).toBeCloseTo(120, 1)
		const segs = Path.segments(p)
		const deg = 30 + (((-0.02 + 0.07) / 2) * 120 * 180) / Math.PI
		const rad = (deg * Math.PI) / 180
		expect(
			vec2.distance(Segment.tangent(segs.at(-1)!, 1), [
				Math.cos(rad),
				Math.sin(rad),
			])
		).toBeLessThan(1e-9)
		expect(segs[0].start).toEqual([10, 20])
		expectSmooth(p)
	})

	it('has a curvature proportional to the distance', () => {
		const length = 150
		const k1 = 0.2
		const p = Path.clothoid([0, 0], 0, length, 0, k1, {tolerance: 1e-3})
		// Turning angle by distance, measured over chords in steps of equal arc
		const step = 5
		for (let s = step; s + step < length; s += step * 4) {
			const at = (x: number) => Path.point(p, {offset: x})
			const a = at(s - step)
			const b = at(s)
			const c = at(s + step)
			const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
			const curvature =
				(2 * area) /
				(vec2.distance(a, b) * vec2.distance(b, c) * vec2.distance(a, c))
			expect(curvature).toBeCloseTo((k1 * s) / length, 2)
		}
	})

	it('is a line without curvature, and a circle with a constant one', () => {
		expect(Path.clothoid([0, 0], 90, 10, 0, 0).curves[0].vertices).toHaveLength(
			2
		)
		const end = Path.segments(Path.clothoid([0, 0], 90, 10, 0, 0))[0].point
		expect(vec2.distance(end, [0, 10])).toBeLessThan(1e-9)

		const k = 1 / 20
		const circle = Path.clothoid([0, 0], 0, 2 * Math.PI * 20, k, k, {
			tolerance: 0.01,
		})
		for (const q of samplesOf(circle)) {
			expect(Math.abs(vec2.distance(q, [0, 20]) - 20)).toBeLessThan(0.02)
		}
	})

	it('passes through an inflection when the curvature changes the sign', () => {
		const p = Path.clothoid([0, 0], 0, 100, -0.05, 0.05)
		// Symmetric about its middle, so that the end direction is the same as the start
		expect(
			vec2.distance(Segment.tangent(Path.segments(p).at(-1)!, 1), [1, 0])
		).toBeLessThan(1e-9)
		expectSmooth(p)
	})

	it('handles a length of zero and rejects a negative one', () => {
		expect(Path.clothoid([3, 4], 0, 0, 1, 2)).toEqual(Path.dot([3, 4]))
		expect(() => Path.clothoid([0, 0], 0, -1, 0, 1)).toThrow()
	})
})
