import {mat2d, vec2} from 'linearly'
import {describe, expect, it, test} from 'vitest'

import {Arc} from './Arc'
import {SegmentA} from './Segment'

describe('toCenterParameterization', () => {
	it('should work in right angle case', () => {
		const ret = Arc.toCenterParameterization({
			start: [90, 50],
			point: [50, 90],
			args: [[40, 40], 0, false, true],
		})

		expect(ret).toEqual({
			center: [50, 50],
			radii: [40, 40],
			angles: [0, 90],
			xAxisRotation: 0,
			sweep: true,
		})
	})

	it('should work in two right angle case (CCW)', () => {
		const ret = Arc.toCenterParameterization({
			start: [90, 50],
			point: [10, 50],
			args: [[40, 40], 0, false, false],
		})

		expect(ret).toEqual({
			center: [50, 50],
			radii: [40, 40],
			angles: [0, -180],
			xAxisRotation: 0,
			sweep: false,
		})
	})

	it('should work in small angle case (18°)', () => {
		const center: vec2 = [50, 50]
		const angle = 18
		const point = vec2.scaleAndAdd(center, vec2.direction(angle), 40)

		const ret = Arc.toCenterParameterization({
			start: [90, 50],
			point,
			args: [[40, 40], 0, false, true],
		})

		expect(ret).toEqual({
			center,
			radii: [40, 40],
			angles: [0, angle],
			xAxisRotation: 0,
			sweep: true,
		})
	})

	it('should work in the case [-120°, 120°]', () => {
		const startAngle = -120
		const endAngle = 120

		const ret = Arc.toCenterParameterization({
			start: vec2.direction(startAngle),
			point: vec2.direction(endAngle),
			args: [[1, 1], 0, true, true],
		})

		ret.angles = [startAngle, endAngle]

		expect(ret).toEqual({
			center: [0, 0],
			radii: [1, 1],
			angles: [startAngle, endAngle],
			xAxisRotation: 0,
			sweep: true,
		})
	})

	it('should work in an ellipse', () => {
		const ret = Arc.toCenterParameterization({
			start: [70, 50],
			point: [30, 50],
			args: [[20, 10], 0, false, true],
		})

		expect(ret).toEqual({
			center: [50, 50],
			radii: [20, 10],
			angles: [0, 180],
			xAxisRotation: 0,
			sweep: true,
		})
	})

	it('should work in a rotated ellipse', () => {
		const xAxisRotation = 45
		const rotMat = mat2d.fromRotation(xAxisRotation)

		const ret = Arc.toCenterParameterization({
			start: vec2.transformMat2d([70, 50], rotMat),
			point: vec2.transformMat2d([30, 50], rotMat),
			args: [[20, 10], xAxisRotation, false, true],
		})

		expect(ret).toEqual({
			center: vec2.transformMat2d([50, 50], rotMat),
			radii: [20, 10],
			angles: [0, 180],
			xAxisRotation,
			sweep: true,
		})
	})

	it('should work in an ellipse', () => {
		const ret = Arc.toCenterParameterization({
			start: [50, 0],
			point: [0, 25],
			args: [[50, 25], 0, false, true],
		})

		expect(ret).toEqual({
			center: [0, 0],
			radii: [50, 25],
			angles: [0, 90],
			xAxisRotation: 0,
			sweep: true,
		})
	})

	it('should work in the angle case [170°, 190°]', () => {
		const startAngle = 170
		const endAngle = 190
		const r = 1
		const start = vec2.direction(startAngle, r)
		const point = vec2.direction(endAngle, r)

		const ret = Arc.toCenterParameterization({
			start,
			point,
			args: [[r, r], 0, false, true],
		})

		expect(ret).toEqual({
			center: vec2.zero,
			radii: [r, r],
			angles: [startAngle, endAngle],
			xAxisRotation: 0,
			sweep: true,
		})
	})

	it('should work in rotated elliptic arc whose angle is not 180°', () => {
		const ret = Arc.toCenterParameterization({
			start: [100 / Math.sqrt(2), 100 / Math.sqrt(2)],
			point: [-50 / Math.sqrt(2), 50 / Math.sqrt(2)],
			args: [[100, 50], 45, false, true],
		})

		expect(ret).toEqual({
			center: [0, 0],
			radii: [100, 50],
			angles: [0, 90],
			xAxisRotation: 45,
			sweep: true,
		})
	})
})

describe('bounds', () => {
	test('should work in the angle case [0°, 90°]', () => {
		const ret = Arc.bounds({
			start: [90, 50],
			point: [50, 90],
			args: [[40, 40], 0, false, true],
		})

		expect(ret).toEqual([
			[50, 50],
			[90, 90],
		])
	})

	test('should work in the angle case [0°, 120°]', () => {
		const startAngle = 0
		const endAngle = 120
		const r = 1
		const start = vec2.direction(startAngle, r)
		const point = vec2.direction(endAngle, r)

		const ret = Arc.bounds({
			start,
			point,
			args: [[r, r], 0, false, true],
		})

		expect(ret).toEqual([
			[point[0], 0],
			[r, r],
		])
	})

	test('should work in the angle case [170°, 190°]', () => {
		const startAngle = 170
		const endAngle = 190
		const r = 1
		const start = vec2.direction(startAngle, r)
		const point = vec2.direction(endAngle, r)

		const ret = Arc.bounds({
			start,
			point,
			args: [[r, r], 0, false, true],
		})

		expect(ret).toEqual([[-r, point[1]], start])
	})

	test('should work in the angle case [-120°, 120°]', () => {
		const startAngle = -120
		const endAngle = 120
		const r = 1
		const start = vec2.direction(startAngle, r)
		const point = vec2.direction(endAngle, r)

		const ret = Arc.bounds({
			start,
			point,
			args: [[r, r], 0, true, true],
		})

		expect(ret).toEqual([
			[point[0], -r],
			[r, r],
		])
	})
})

describe('length', () => {
	test('should work in unit circle', () => {
		const ret = Arc.length({
			start: [1, 0],
			point: [-1, 0],
			args: [[1, 1], 0, false, true],
		})

		expect(ret).toEqual(Math.PI)
	})

	test('should work in an ellipse whose radii are [.5, 1]', () => {
		const ret = Arc.length({
			start: [0.5, 0],
			point: [-0.5, 0],
			args: [[0.5, 1], 0, false, true],
		})

		expect(ret).toEqual(2.42211)
	})

	test('should work in an ellipse whose radii are [2, 1]', () => {
		const ret = Arc.length({
			start: [2, 0],
			point: [-2, 0],
			args: [[2, 1], 0, false, true],
		})

		expect(ret).toEqual(4.84422)
	})

	test('should work in an ellipse whose radii are [2, 3]', () => {
		const ret = Arc.length({
			start: [2, 0],
			point: [-2, 0],
			args: [[2, 3], 0, false, true],
		})

		expect(ret).toEqual(7.93272)
	})
})

describe('ellipticArcLength', () => {
	test('should work in unit circle', () => {
		const ret = Arc.ellipticArcLength([1, 1], [0, 180])

		expect(ret).toEqual(Math.PI)
	})

	test('should work in an ellipse whose radii are [.5, 1]', () => {
		const ret = Arc.ellipticArcLength([0.5, 1], [0, 180])

		expect(ret).toEqual(2.42211)
	})

	test('should work in an ellipse whose radii are [2, 1]', () => {
		const ret = Arc.ellipticArcLength([2, 1], [0, 180])

		expect(ret).toEqual(4.84422)
	})

	test('should work in an ellipse whose radii are [2, 3]', () => {
		const ret = Arc.ellipticArcLength([2, 3], [0, 180])

		expect(ret).toEqual(7.93272)
	})

	test('should work in a unit arc whose angles are [30°, 70°]', () => {
		const ret = Arc.ellipticArcLength([1, 1], [30, 70])

		expect(ret).toEqual(0.698132)
	})

	test('should work in an ellipse whose radii are [1, 2] and angles are [0°, 30°]', () => {
		const ret = Arc.ellipticArcLength([1, 2], [0, 30])

		expect(ret).toEqual(1.01218)
	})

	test('should return 0 for a zero-length angle span', () => {
		expect(Arc.ellipticArcLength([3, 2], [45, 45])).toEqual(0)
	})

	test('should match for reversed angle order (same geometric arc)', () => {
		const forward = Arc.ellipticArcLength([2, 1], [0, 180])
		const backward = Arc.ellipticArcLength([2, 1], [180, 0])

		expect(forward).toEqual(backward)
	})

	test('should add along adjacent angle ranges', () => {
		const radii: [number, number] = [2, 3]
		const whole = Arc.ellipticArcLength(radii, [0, 180])
		const part =
			Arc.ellipticArcLength(radii, [0, 60]) +
			Arc.ellipticArcLength(radii, [60, 120]) +
			Arc.ellipticArcLength(radii, [120, 180])

		expect(part).toEqual(whole)
	})

	test('should stay close to a fine Riemann reference on a flat ellipse', () => {
		const rx = 10
		const ry = 1
		const steps = 4000
		const startDeg = 0
		const endDeg = 45
		const startRad = (startDeg * Math.PI) / 180
		const endRad = (endDeg * Math.PI) / 180
		const delta = (endRad - startRad) / steps
		let riemann = 0
		for (let i = 0; i < steps; i++) {
			const t = startRad + (i + 0.5) * delta
			riemann += delta * Math.hypot(rx * Math.sin(t), ry * Math.cos(t))
		}

		expect(Arc.ellipticArcLength([rx, ry], [startDeg, endDeg])).toEqual(riemann)
	})
})

describe('transform', () => {
	const arc: SegmentA = {
		command: 'A',
		start: [50, 0],
		point: [0, 25],
		args: [[50, 25], 0, false, true],
	}

	it('should not change anything if the matrix is identity', () => {
		const ret = Arc.transform(arc, mat2d.identity)

		expect(ret).toEqual(arc)
	})

	it('should scale x by 0.5', () => {
		const ret = Arc.transform(arc, mat2d.scaling([0.5, 3]))

		expect(ret).toEqual({
			command: 'A',
			start: [25, 0],
			point: [0, 75],
			args: [[25, 75], 0, false, true],
		})
	})

	it('should rotate 90°', () => {
		const ret = Arc.transform(arc, mat2d.rotation(90))

		expect(ret).toEqual({
			command: 'A',
			start: [0, 50],
			point: [-25, 0],
			args: [[50, 25], 90, false, true],
		})
	})

	it('should rotate 180', () => {
		const ret = Arc.transform(arc, mat2d.rotation(180))

		expect(ret).toEqual({
			command: 'A',
			start: [-50, 0],
			point: [0, -25],
			args: [[50, 25], 0, false, true],
		})
	})
})

describe('toTime offset', () => {
	it('interprets negative offset as arc length back from the end', () => {
		const seg = Arc.of([90, 50], [40, 40], 0, false, true, [50, 90])
		const len = Arc.length(seg)
		const tNearEnd = Arc.toTime(seg, {offset: -len * 0.05})
		expect(tNearEnd).toBeGreaterThan(0)
		expect(tNearEnd).toBeLessThan(1)
	})
})

describe('ellipticArcLength on wide spans', () => {
	function riemann(rx: number, ry: number, startDeg: number, endDeg: number) {
		const steps = 200000
		const startRad = (startDeg * Math.PI) / 180
		const endRad = (endDeg * Math.PI) / 180
		const delta = (endRad - startRad) / steps
		let sum = 0
		for (let i = 0; i < steps; i++) {
			const t = startRad + (i + 0.5) * delta
			sum += Math.abs(delta) * Math.hypot(rx * Math.sin(t), ry * Math.cos(t))
		}
		return sum
	}

	test.each([
		[10, 1, 0, 270],
		[10, 1, 0, 359],
		[100, 1, 0, 315],
		[100, 1, 30, 300],
		[2, 1, 0, -229],
	])(
		'stays within 1e-5 relative error for radii [%d, %d] over [%d°, %d°]',
		(rx, ry, startDeg, endDeg) => {
			const expected = riemann(rx, ry, startDeg, endDeg)
			const actual = Arc.ellipticArcLength([rx, ry], [startDeg, endDeg])
			expect(Math.abs(actual - expected) / expected).toBeLessThan(1e-5)
		}
	)
})

describe('toTime unit on elliptic arcs', () => {
	function arcTo(rx: number, ry: number, endRad: number): SegmentA {
		return Arc.of(
			[rx, 0],
			[rx, ry],
			0,
			Math.abs(endRad) > Math.PI,
			endRad > 0,
			[rx * Math.cos(endRad), ry * Math.sin(endRad)]
		)
	}

	test.each([
		[2, 1, 5.5],
		[10, 1, 2],
		[100, 1, -1],
		[100, 1, -4],
	])(
		'solves the inverse of the swept arc length for radii [%d, %d] to angle %f rad',
		(rx, ry, endRad) => {
			const seg = arcTo(rx, ry, endRad)
			const {
				angles: [startAngle, endAngle],
			} = Arc.toCenterParameterization(seg)
			const len = Arc.length(seg)

			for (let unit = 0.05; unit < 1; unit += 0.05) {
				const time = Arc.toTime(seg, {unit})
				const angle = startAngle + (endAngle - startAngle) * time
				const swept = Arc.ellipticArcLength([rx, ry], [startAngle, angle])
				expect(swept / len).toBeCloseTo(unit, 5)
			}
		}
	)

	test('clamps to the ends', () => {
		const seg = arcTo(10, 1, 2)
		expect(Arc.toTime(seg, {unit: 0})).toBe(0)
		expect(Arc.toTime(seg, {unit: 1})).toBe(1)
	})
})

describe('derivative direction', () => {
	it('follows the sweep direction for both flags', () => {
		// Lower half circle from (3,5) to (7,5), center (5,5)
		const ccw = Arc.of([3, 5], [2, 2], 0, false, true, [7, 5])
		const cw = Arc.of([3, 5], [2, 2], 0, false, false, [7, 5])

		// sweep=true passes through (5,3): tangent at start points to -y
		expect(Arc.tangent(ccw, {time: 0})).toEqual([0, -1])
		expect(Arc.point(ccw, {time: 0.5})).toEqual([5, 3])
		// sweep=false passes through (5,7): tangent at start points to +y
		expect(Arc.tangent(cw, {time: 0})).toEqual([0, 1])
		expect(Arc.point(cw, {time: 0.5})).toEqual([5, 7])
	})
})

describe('bounds with perturbed 180° arcs', () => {
	it('keeps the half-circle on the sweep side', () => {
		// End points carry floating-point noise, which can flip the start angle to -180°
		const noisy = Arc.of(
			[-10, 9.387105746808683e-14],
			[10, 10],
			0,
			false,
			false,
			[10, 9.42499576350777e-14]
		)
		const [[minX, minY], [maxX, maxY]] = Arc.bounds(noisy)
		expect([minX, maxX]).toEqual([-10, 10])
		expect(minY).toBeCloseTo(0, 9)
		expect(maxY).toBeCloseTo(10, 9)
	})
})
