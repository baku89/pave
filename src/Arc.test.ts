/**
 * @jest-environment jsdom
 */
import 'jest-canvas-mock'
import '../jest.setup'

import {mat2d, scalar, vec2} from 'linearly'

import {Arc} from './Arc'

describe('toCenterParameterization', () => {
	it('should work in right angle case', () => {
		const ret = Arc.toCenterParameterization({
			start: [90, 50],
			end: [50, 90],
			command: ['A', [40, 40], 0, false, true],
		})

		expect(ret).toEqual({
			center: [50, 50],
			radii: [40, 40],
			angles: [0, Math.PI / 2],
			xAxisRotation: 0,
			counterclockwise: false,
		})
	})

	it('should work in two right angle case (CCW)', () => {
		const ret = Arc.toCenterParameterization({
			start: [90, 50],
			end: [10, 50],
			command: ['A', [40, 40], 0, false, false],
		})

		expect(ret).toEqual({
			center: [50, 50],
			radii: [40, 40],
			angles: [0, -Math.PI],
			xAxisRotation: 0,
			counterclockwise: true,
		})
	})

	it('should work in small angle case (18°)', () => {
		const center: vec2 = [50, 50]
		const angle = scalar.rad(18)
		const end = vec2.scaleAndAdd(center, vec2.direction(angle), 40)

		const ret = Arc.toCenterParameterization({
			start: [90, 50],
			end,
			command: ['A', [40, 40], 0, false, true],
		})

		expect(ret).toEqual({
			center,
			radii: [40, 40],
			angles: [0, angle],
			xAxisRotation: 0,
			counterclockwise: false,
		})
	})

	it('should work in the case [-120°, 120°]', () => {
		const startAngle = scalar.rad(-120)
		const endAngle = scalar.rad(120)

		const ret = Arc.toCenterParameterization({
			start: vec2.direction(startAngle),
			end: vec2.direction(endAngle),
			command: ['A', [1, 1], 0, true, true],
		})

		ret.angles = [startAngle, endAngle]

		expect(ret).toEqual({
			center: [0, 0],
			radii: [1, 1],
			angles: [startAngle, endAngle],
			xAxisRotation: 0,
			counterclockwise: false,
		})
	})

	it('should work in an ellipse', () => {
		const ret = Arc.toCenterParameterization({
			start: [70, 50],
			end: [30, 50],
			command: ['A', [20, 10], 0, false, true],
		})

		expect(ret).toEqual({
			center: [50, 50],
			radii: [20, 10],
			angles: [0, Math.PI],
			xAxisRotation: 0,
			counterclockwise: false,
		})
	})

	it('should work in a rotated ellipse', () => {
		const rotDeg = 45
		const rotRad = scalar.rad(rotDeg)
		const rotMat = mat2d.fromRotation(rotRad)

		const ret = Arc.toCenterParameterization({
			start: vec2.transformMat2d([70, 50], rotMat),
			end: vec2.transformMat2d([30, 50], rotMat),
			command: ['A', [20, 10], rotDeg, false, true],
		})

		expect(ret).toEqual({
			center: vec2.transformMat2d([50, 50], rotMat),
			radii: [20, 10],
			angles: [0, Math.PI],
			xAxisRotation: rotRad,
			counterclockwise: false,
		})
	})
})

describe('bounds', () => {
	test('should work in the angle case [0°, 90°]', () => {
		const ret = Arc.bounds({
			start: [90, 50],
			end: [50, 90],
			command: ['A', [40, 40], 0, false, true],
		})

		expect(ret).toEqual([
			[50, 50],
			[90, 90],
		])
	})

	test('should work in the angle case [0°, 120°]', () => {
		const startAngle = scalar.rad(0)
		const endAngle = scalar.rad(120)
		const r = 1
		const start = vec2.direction(startAngle, r)
		const end = vec2.direction(endAngle, r)

		const ret = Arc.bounds({
			start,
			end,
			command: ['A', [r, r], 0, false, true],
		})

		expect(ret).toEqual([
			[end[0], 0],
			[r, r],
		])
	})

	test('should work in the angle case [170°, 190°]', () => {
		const startAngle = scalar.rad(170)
		const endAngle = scalar.rad(190)
		const r = 1
		const start = vec2.direction(startAngle, r)
		const end = vec2.direction(endAngle, r)

		const ret = Arc.bounds({
			start,
			end,
			command: ['A', [r, r], 0, false, true],
		})

		expect(ret).toEqual([[-r, end[1]], start])
	})

	test('should work in the angle case [-120°, 120°]', () => {
		const startAngle = scalar.rad(-120)
		const endAngle = scalar.rad(120)
		const r = 1
		const start = vec2.direction(startAngle, r)
		const end = vec2.direction(endAngle, r)

		const ret = Arc.bounds({
			start,
			end,
			command: ['A', [r, r], 0, true, true],
		})

		expect(ret).toEqual([
			[end[0], -r],
			[r, r],
		])
	})
})
