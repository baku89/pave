/**
 * @jest-environment jsdom
 */
import 'jest-canvas-mock'
import '../jest.setup'

import {mat2d, vec2} from 'linearly'

import {Arc} from './Arc'

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
			command: 'A',
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

	test('should work in the angle case [170°, 190°]', () => {
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
})
