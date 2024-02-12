/**
 * @jest-environment jsdom
 */
import 'jest-canvas-mock'
import '../jest.setup'

import {scalar, vec2} from 'linearly'

import {Arc} from './Arc'

describe('arcCommandToCenterParameterization', () => {
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
})
