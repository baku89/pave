import {vec2} from 'linearly'
import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {contains} from './path/queries'
import {shadow, shadowFrom} from './path/shadow'

describe('shadow', () => {
	it('sweeps a square into a hexagon-like region', () => {
		const square = Path.rect([0, 0], [100, 100])
		const s = shadow(square, [1, 0], 100)
		expect(Math.abs(Path.area(s))).toBeCloseTo(20000, 1)
		expect(contains(s, [150, 50])).toBe(true)
	})

	it('covers the whole sweep of a circle', () => {
		const circle = Path.circle([0, 0], 50)
		const s = shadow(circle, [1, 1], 100)
		expect(contains(s, [50, 50])).toBe(true)
		expect(contains(s, [0, 0])).toBe(true)
		expect(contains(s, [-40, 40])).toBe(false)
		expect(Math.abs(Path.area(s))).toBeCloseTo(Math.PI * 2500 + 100 * 100, -1)
	})

	it('casts from a point', () => {
		const circle = Path.circle([0, 100], 20)
		const s = shadowFrom(circle, [0, 0], 2)
		expect(contains(s, [0, 150])).toBe(true)
		expect(contains(s, [0, 60])).toBe(false)
		const b = Path.bounds(s)
		expect(b[1][1]).toBeCloseTo(240, 2)
	})
})

describe('shadow stability', () => {
	const shape = Path.unite([
		Path.toCubicBezier(Path.circle([0, 0], 60)),
		Path.rect([30, -20], [140, 40]),
	])

	it('stays one region and changes smoothly as the light turns', () => {
		let prev = 0
		for (let i = 0; i < 120; i++) {
			const s = shadow(shape, vec2.dir(i * 3), 100)
			expect(s.curves).toHaveLength(1)
			const area = Math.abs(Path.area(s))
			if (prev) expect(Math.abs(area - prev) / prev).toBeLessThan(0.03)
			prev = area
		}
	})

	it('stays one region as a point light circles the shape', () => {
		let prev = 0
		for (let i = 0; i < 120; i++) {
			const a = (i / 120) * Math.PI * 2
			const s = shadowFrom(shape, [Math.cos(a) * 250, Math.sin(a) * 250], 1.8)
			expect(s.curves).toHaveLength(1)
			const area = Math.abs(Path.area(s))
			if (prev) expect(Math.abs(area - prev) / prev).toBeLessThan(0.05)
			prev = area
		}
	})

	it('sweeps an open curve too', () => {
		const arch = Path.cubicBezier([0, 0], [0, 100], [100, 100], [100, 0])
		const s = shadow(arch, [1, 0], 50)
		expect(s.curves).toHaveLength(1)
		// Covered by a translate of the arch, and in the notch under the arch's top
		expect(contains(s, [90, 70])).toBe(true)
		expect(contains(s, [75, 10])).toBe(false)
	})
})
