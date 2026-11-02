import {vec2} from 'linearly'
import {describe, expect, it} from 'vitest'

import {Arc, Path, Segment, type SegmentA} from './index'
import {arcify} from './path/arcify'
import {nearestTime} from './path/intersections'

const tolerance = 0.05

const arcSegments = (path: Path) =>
	Path.segments(path).filter((seg): seg is SegmentA => seg.command === 'A')

/** The largest distance from points sampled along `original` to `approx`. */
const maxDeviation = (original: Path, approx: Path, samples = 50) => {
	const segs = Path.segments(approx)
	let max = 0
	for (let i = 0; i <= samples; i++) {
		const p = Path.point(original, i / samples)
		const d = Math.min(...segs.map(seg => nearestTime(seg, p).distance))
		max = Math.max(max, d)
	}
	return max
}

const expectWithinTolerance = (original: Path) => {
	const result = arcify(original, {tolerance})

	for (const seg of Path.segments(result)) {
		expect(seg.command === 'L' || seg.command === 'A').toBe(true)
	}

	expect(maxDeviation(original, result)).toBeLessThanOrEqual(tolerance + 1e-9)
	expect(Math.abs(Path.length(result) - Path.length(original))).toBeLessThan(
		tolerance * 4
	)

	return result
}

describe('arcify', () => {
	it('recovers a circle from its cubic approximation', () => {
		const original = Path.unarc(Path.arc([0, 0], 100, 0, 90))
		const result = expectWithinTolerance(original)

		const arcs = arcSegments(result)
		expect(arcs.length).toBeGreaterThanOrEqual(1)

		for (const arc of arcs) {
			const {center, radii} = Arc.toCenterParameterization(arc)
			expect(Math.abs(radii[0] - 100)).toBeLessThan(0.5)
			expect(Math.abs(radii[1] - 100)).toBeLessThan(0.5)
			expect(vec2.distance(center, [0, 0])).toBeLessThan(0.5)
		}

		// Should not need many arcs for a single quarter circle
		expect(Path.segmentCount(result)).toBeLessThanOrEqual(4)
	})

	it('arcifies a full circle made of cubics', () => {
		const original = Path.unarc(Path.circle([50, 50], 30))
		const result = expectWithinTolerance(original)

		expect(result.curves[0].closed).toBe(true)
		for (const arc of arcSegments(result)) {
			const {center, radii} = Arc.toCenterParameterization(arc)
			expect(Math.abs(radii[0] - 30)).toBeLessThan(0.5)
			expect(vec2.distance(center, [50, 50])).toBeLessThan(0.5)
		}
	})

	it('turns a nearly straight cubic into a line', () => {
		const original = Path.cubicBezier([0, 0], [30, 0.01], [70, -0.01], [100, 0])
		const result = arcify(original, {tolerance})

		expect(result.curves[0].vertices).toHaveLength(2)
		expect(result.curves[0].vertices[1].command).toBe('L')
		expect(result.curves[0].vertices[1].point).toEqual([100, 0])
	})

	it('splits an S-shaped cubic at the inflection with opposite sweeps', () => {
		const original = Path.cubicBezier([0, 0], [50, 100], [50, -100], [100, 0])
		const result = expectWithinTolerance(original)

		const arcs = arcSegments(result)
		expect(arcs.length).toBeGreaterThanOrEqual(2)

		const sweeps = new Set(arcs.map(arc => arc.args[3]))
		expect(sweeps.size).toBe(2)

		// Sweep flags change only once, at the inflection
		let changes = 0
		for (let i = 1; i < arcs.length; i++) {
			if (arcs[i].args[3] !== arcs[i - 1].args[3]) changes++
		}
		expect(changes).toBe(1)
	})

	it('keeps the sweep direction of the original', () => {
		// Going +x while bulging towards -y turns in the positive-angle direction
		// (clockwise on a y-down screen), which is what the sweep flag means
		const cw = Path.cubicBezier([0, 0], [30, -40], [70, -40], [100, 0])
		expect(Segment.curvature(Path.segments(cw)[0], 0.5)).toBeGreaterThan(0)
		for (const arc of arcSegments(arcify(cw, {tolerance}))) {
			expect(arc.args[3]).toBe(true)
		}

		const ccw = Path.cubicBezier([0, 0], [30, 40], [70, 40], [100, 0])
		expect(Segment.curvature(Path.segments(ccw)[0], 0.5)).toBeLessThan(0)
		for (const arc of arcSegments(arcify(ccw, {tolerance}))) {
			expect(arc.args[3]).toBe(false)
		}
	})

	it('stays within tolerance for assorted cubics', () => {
		const cubics = [
			Path.cubicBezier([0, 0], [100, 0], [100, 100], [0, 100]),
			Path.cubicBezier([0, 0], [120, 30], [-20, 30], [100, 0]),
			Path.cubicBezier([10, 10], [10, 90], [90, 90], [90, 10]),
			Path.cubicBezier([0, 0], [100, 100], [0, 100], [100, 0]),
			Path.cubicBezier([0, 0], [20, 80], [80, 80], [100, 0]),
		]

		for (const cubic of cubics) {
			expectWithinTolerance(cubic)
		}

		for (const t of [0.01, 0.2, 1]) {
			const original = Path.cubicBezier([0, 0], [100, 0], [100, 100], [0, 100])
			const result = arcify(original, {tolerance: t})
			expect(maxDeviation(original, result)).toBeLessThanOrEqual(t + 1e-9)
		}
	})

	it('is tangent-continuous inside each fitted cubic', () => {
		const original = Path.cubicBezier([0, 0], [20, 80], [80, 80], [100, 0])
		const segs = Path.segments(arcify(original, {tolerance}))

		for (let i = 1; i < segs.length; i++) {
			const a = Segment.tangent(segs[i - 1], 1)
			const b = Segment.tangent(segs[i], 0)
			// Lines replacing shallow arcs may introduce slight kinks
			expect(vec2.dot(a, b)).toBeGreaterThan(0.99)
		}
	})

	it('passes lines and arcs through unchanged', () => {
		const polygon = Path.polygon([0, 0], [100, 0], [100, 100], [0, 100])
		expect(arcify(polygon)).toEqual(polygon)

		const arc = Path.arc([50, 50], 40, -30, 200)
		expect(arcify(arc)).toEqual(arc)

		const circle = Path.circle([10, 20], 30)
		expect(arcify(circle)).toEqual(circle)

		const ellipse = Path.ellipse([0, 0], [50, 20])
		expect(arcify(ellipse)).toEqual(ellipse)
	})

	it('handles mixed paths and keeps attributes', () => {
		const original: Path = {
			curves: [
				{
					vertices: [
						{command: 'L', point: [0, 0], attrs: {id: 0}},
						{
							command: 'C',
							args: [
								[30, 40],
								[70, 40],
							],
							point: [100, 0],
							attrs: {id: 1},
						},
						{
							command: 'A',
							args: [[50, 50], 0, false, true],
							point: [200, 0],
							attrs: {id: 2},
						},
						{command: 'L', point: [200, 100], attrs: {id: 3}},
					],
					closed: false,
					attrs: {name: 'curve'},
				},
			],
			attrs: {name: 'path'},
		}

		const result = arcify(original, {tolerance})
		const {vertices} = result.curves[0]

		expect(result.attrs).toEqual({name: 'path'})
		expect(result.curves[0].attrs).toEqual({name: 'curve'})
		expect(vertices[0]).toEqual({command: 'L', point: [0, 0], attrs: {id: 0}})

		const cubicEnd = vertices.findIndex(v => vec2.approx(v.point, [100, 0]))
		expect(cubicEnd).toBeGreaterThan(0)
		expect(vertices[cubicEnd].attrs).toEqual({id: 1})
		for (let i = 1; i < cubicEnd; i++) {
			expect(vertices[i].command).toBe('A')
		}

		expect(vertices[cubicEnd + 1]).toEqual({
			command: 'A',
			args: [[50, 50], 0, false, true],
			point: [200, 0],
			attrs: {id: 2},
		})
		expect(vertices[cubicEnd + 2]).toEqual({
			command: 'L',
			point: [200, 100],
			attrs: {id: 3},
		})

		expect(maxDeviation(original, result)).toBeLessThanOrEqual(tolerance + 1e-9)
	})

	it('drops zero-length cubics', () => {
		const original: Path = {
			curves: [
				{
					vertices: [
						{command: 'L', point: [0, 0]},
						{
							command: 'C',
							args: [
								[0, 0],
								[0, 0],
							],
							point: [0, 0],
						},
						{command: 'L', point: [100, 0]},
					],
					closed: false,
				},
			],
		}

		const result = arcify(original)
		expect(result.curves[0].vertices).toEqual([
			{command: 'L', point: [0, 0]},
			{command: 'L', point: [100, 0]},
		])
	})

	it('handles a cubic with a cusp', () => {
		// Control points swapped across the chord produce a cusp at t = 0.5
		const original = Path.cubicBezier([0, 0], [100, 50], [0, 50], [100, 0])
		const result = arcify(original, {tolerance})
		expect(maxDeviation(original, result)).toBeLessThanOrEqual(tolerance + 1e-9)
	})
})
