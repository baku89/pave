/**
 * {@link CubicBezier} — tests hit native cubic hull math in `cubicBezierGeometry.ts`
 * (via `CubicBezier.ts`); no bezier-js dependency. Paper.js is not used by these cases.
 *
 * Some fixtures and expected values are adapted from third-party test suites (golden
 * vectors only). Attributions:
 *
 * - **Bezier.js** (bezier-js): scenarios / numeric expectations informed by
 *   https://github.com/Pomax/bezierjs/tree/master/test — MIT License, see
 *   `BEZIER_JS_MIT_LICENSE` at the bottom of this file.
 * - **Paper.js**: golden fixtures from Curve tests — MIT, see section comment below.
 */
import type {vec2} from 'linearly'
import {describe, expect, it, test} from 'vitest'

import {CubicBezier} from './CubicBezier'
import {SegmentC} from './Segment'

/**
 * Bezier.js `utils.derive` style hull for cubics (golden rows from
 * https://github.com/Pomax/bezierjs/blob/master/test/general/cubic.test.js).
 */
function cubicDerivativeHulls(seg: SegmentC): vec2[][] {
	const p0 = seg.start,
		p1 = seg.args[0],
		p2 = seg.args[1],
		p3 = seg.point
	const d1: vec2[] = [
		[3 * (p1[0] - p0[0]), 3 * (p1[1] - p0[1])],
		[3 * (p2[0] - p1[0]), 3 * (p2[1] - p1[1])],
		[3 * (p3[0] - p2[0]), 3 * (p3[1] - p2[1])],
	]
	const d2: vec2[] = [
		[2 * (d1[1][0] - d1[0][0]), 2 * (d1[1][1] - d1[0][1])],
		[2 * (d1[2][0] - d1[1][0]), 2 * (d1[2][1] - d1[1][1])],
	]
	const d3: vec2[] = [[d2[1][0] - d2[0][0], d2[1][1] - d2[0][1]]]
	return [d1, d2, d3]
}

/** Same layout as Bezier.js `utils.pointsToString` for four control points. */
function bezierJsPointsString(seg: SegmentC): string {
	const pts = [seg.start, seg.args[0], seg.args[1], seg.point] as const
	return '[' + pts.map(([x, y]) => `${x}/${y}`).join(', ') + ']'
}

const a: SegmentC = {
	start: [0, 0],
	command: 'C',
	args: [
		[0, 1],
		[1, 1],
	],
	point: [1, 0],
}
const b: SegmentC = {
	start: [0, 0],
	command: 'C',
	args: [
		[2, 0],
		[1, 1],
	],
	point: [1, 0],
}

test('length', () => {
	expect(CubicBezier.length(a)).toEqual(2)
	expect(CubicBezier.length(b)).toEqual(2)
})

test('bound', () => {
	expect(CubicBezier.bounds(a)).toEqual([
		[0, 0],
		[1, 0.75],
	])
	expect(CubicBezier.bounds(b)).toEqual([
		[0, 0],
		[1.25, 0.444444],
	])
})

test('point', () => {
	expect(CubicBezier.point(a, {time: 0})).toEqual([0, 0])
	expect(CubicBezier.point(a, {time: 0.5})).toEqual([0.5, 0.75])
	expect(CubicBezier.point(a, {time: 1})).toEqual([1, 0])
})

test('normal', () => {
	expect(CubicBezier.normal(a, {time: 0.5})).toEqual([0, 1])
})

describe('trim', () => {
	const a: SegmentC = {
		start: [0, 0],
		command: 'C',
		args: [
			[1, 0],
			[1, 1],
		],
		point: [0, 1],
	}
	it('should leave the curve unchanged if the trim range is [0, 1]', () => {
		expect(CubicBezier.trim(a, {time: 0}, {time: 1})).toEqual(a)
	})

	it('should trim the curve if the trim range is [0, 0.5]', () => {
		expect(CubicBezier.trim(a, {time: 0}, {time: 0.5})).toEqual(
			CubicBezier.of([0, 0], [0.5, 0.0], [0.75, 0.25], [0.75, 0.5])
		)
	})

	it('shoud trim the curve if the trim range is [0.5, 1]', () => {
		expect(CubicBezier.trim(a, {time: 0.5}, {time: 1})).toEqual(
			CubicBezier.of([0.75, 0.5], [0.75, 0.75], [0.5, 1.0], [0, 1])
		)
	})
})

describe('canonical cubic (0,0)-(0,1)-(1,1)-(1,0)', () => {
	const b = CubicBezier.of([0, 0], [0, 1], [1, 1], [1, 0])

	it('approximate length', () => {
		expect(CubicBezier.length(b)).toBeCloseTo(2, 10)
	})

	it('axis-aligned bounding box', () => {
		expect(CubicBezier.bounds(b)).toEqual([
			[0, 0],
			[1, 0.75],
		])
	})

	it('derivatives at t = 0, 0.5, 1', () => {
		expect(CubicBezier.derivative(b, {time: 0})).toEqual([0, 3])
		expect(CubicBezier.derivative(b, {time: 0.5})).toEqual([1.5, 0])
		expect(CubicBezier.derivative(b, {time: 1})).toEqual([0, -3])
	})

	it('normals at t = 0, 0.5, 1', () => {
		expect(CubicBezier.normal(b, {time: 0})).toEqual([-1, 0])
		expect(CubicBezier.normal(b, {time: 0.5})).toEqual([0, 1])
		expect(CubicBezier.normal(b, {time: 1})).toEqual([1, 0])
	})
})

describe('fromQuadraticBezier degree elevation', () => {
	const cubic = CubicBezier.fromQuadraticBezier([0, 0], [0.5, 1], [1, 0])

	it('length', () => {
		expect(CubicBezier.length(cubic)).toBeCloseTo(1.4789428575453212, 12)
	})

	it('bounds', () => {
		expect(CubicBezier.bounds(cubic)).toEqual([
			[0, 0],
			[1, 0.5],
		])
	})

	it('derivatives at t = 0, 0.5, 1', () => {
		expect(CubicBezier.derivative(cubic, {time: 0})).toEqual([1, 2])
		expect(CubicBezier.derivative(cubic, {time: 0.5})).toEqual([1, 0])
		expect(CubicBezier.derivative(cubic, {time: 1})).toEqual([1, -2])
	})

	it('normals at t = 0, 0.5, 1', () => {
		expect(CubicBezier.normal(cubic, {time: 0})[0]).toBeCloseTo(
			-0.8944271909999159,
			12
		)
		expect(CubicBezier.normal(cubic, {time: 0})[1]).toBeCloseTo(
			0.4472135954999579,
			12
		)
		expect(CubicBezier.normal(cubic, {time: 0.5})).toEqual([0, 1])
		expect(CubicBezier.normal(cubic, {time: 1})[0]).toBeCloseTo(
			0.8944271909999159,
			12
		)
		expect(CubicBezier.normal(cubic, {time: 1})[1]).toBeCloseTo(
			0.4472135954999579,
			12
		)
	})
})

// --- Bezier.js test/general/cubic.test.js (MIT, https://github.com/Pomax/bezierjs)

describe('Bezier.js cubic.test.js (ported expectations)', () => {
	describe('constructor curve Bezier(0,0,0,1,1,1,1,0)', () => {
		const b = CubicBezier.of([0, 0], [0, 1], [1, 1], [1, 0])

		it('serializes like Bezier#toString()', () => {
			expect(bezierJsPointsString(b)).toBe('[0/0, 0/1, 1/1, 1/0]')
		})

		it('approximate length', () => {
			expect(CubicBezier.length(b)).toBeCloseTo(2, 10)
		})

		it('derivative control hull matches Bezier dpoints', () => {
			expect(cubicDerivativeHulls(b)).toEqual([
				[
					[0, 3],
					[3, 0],
					[0, -3],
				],
				[
					[6, -6],
					[-6, -6],
				],
				[[-12, 0]],
			])
			expect(CubicBezier.derivative(b, {time: 0})).toEqual([0, 3])
			expect(CubicBezier.derivative(b, {time: 0.5})).toEqual([1.5, 0])
			expect(CubicBezier.derivative(b, {time: 1})).toEqual([0, -3])
		})

		it('normals at t = 0, 0.5, 1', () => {
			expect(CubicBezier.normal(b, {time: 0})).toEqual([-1, 0])
			expect(CubicBezier.normal(b, {time: 0.5})).toEqual([0, 1])
			expect(CubicBezier.normal(b, {time: 1})).toEqual([1, 0])
		})

		it('axis-aligned bounding box (min/max match Bezier bbox)', () => {
			expect(CubicBezier.bounds(b)).toEqual([
				[0, 0],
				[1, 0.75],
			])
		})
	})
})

// --- Bezier.js test/functionality/projection.test.js (quadratic as cubic)

describe('Bezier.js projection.test.js (quadratic raised to cubic)', () => {
	it('projects onto the expected on-curve point', () => {
		const b = CubicBezier.fromQuadraticBezier([0, 0], [100, 0], [100, 100])
		const projection = CubicBezier.project(b, [80, 20])
		expectVecClose(projection.position, [75, 25], 12)
		expect(projection.t).toBe(0.5)
		expect(projection.distance).toBeCloseTo(7.0710678118654755, 12)
	})
})

// --- Paper.js test/tests/Curve.js golden fixtures (MIT, github.com/paperjs/paper.js)

/** Cubic coefficients for Path.Circle([100,100], 100).firstCurve in Paper.js 0.12.x */
const CIRCLE_QUADRANT_SEGMENT: SegmentC = {
	start: [0, 100],
	command: 'C',
	args: [
		[0, 44.77152501692064],
		[44.77152501692064, 0],
	],
	point: [100, 0],
}

function expectVecClose(
	a: readonly [number, number],
	b: readonly [number, number],
	digits = 4
) {
	expect(a[0]).toBeCloseTo(b[0], digits)
	expect(a[1]).toBeCloseTo(b[1], digits)
}

/** Undirected unit normal: either orientation is acceptable. */
function expectUnitParallel(
	a: readonly [number, number],
	ref: readonly [number, number],
	digits = 4
) {
	const [rx, ry] = ref
	const rl = Math.hypot(rx, ry)
	const nx = rx / rl
	const ny = ry / rl
	const dot = a[0] * nx + a[1] * ny
	expect(Math.abs(dot)).toBeCloseTo(1, digits)
}

describe('CubicBezier.isStraight (Paper.js Curve#isStraight cases)', () => {
	const cases: {name: string; seg: SegmentC; straight: boolean}[] = [
		{
			name: 'line segment, no handles',
			seg: {
				start: [100, 100],
				command: 'C',
				args: [
					[100, 100],
					[200, 200],
				],
				point: [200, 200],
			},
			straight: true,
		},
		{
			name: 'collinear handle out and in',
			seg: {
				start: [100, 100],
				command: 'C',
				args: [
					[150, 150],
					[150, 150],
				],
				point: [200, 200],
			},
			straight: true,
		},
		{
			name: 'collinear handle in only',
			seg: {
				start: [100, 100],
				command: 'C',
				args: [
					[100, 100],
					[150, 150],
				],
				point: [200, 200],
			},
			straight: true,
		},
		{
			name: '#1269 collinear controls',
			seg: {
				start: [100, 300],
				command: 'C',
				args: [
					[120, 280],
					[190, 210],
				],
				point: [200, 200],
			},
			straight: true,
		},
		{
			name: 'handle breaks collinearity (out)',
			seg: {
				start: [100, 100],
				command: 'C',
				args: [
					[50, 50],
					[200, 200],
				],
				point: [200, 200],
			},
			straight: false,
		},
		{
			name: 'serpentine cubic',
			seg: {
				start: [100, 100],
				command: 'C',
				args: [
					[150, 100],
					[173, 154],
				],
				point: [200, 200],
			},
			straight: false,
		},
		{
			name: 'symmetric S-shaped handles',
			seg: {
				start: [100, 100],
				command: 'C',
				args: [
					[150, 150],
					[250, 250],
				],
				point: [200, 200],
			},
			straight: false,
		},
		{
			name: 'handle in breaks collinearity',
			seg: {
				start: [100, 100],
				command: 'C',
				args: [
					[100, 100],
					[250, 250],
				],
				point: [200, 200],
			},
			straight: false,
		},
	]

	for (const {name, seg, straight} of cases) {
		it(name, () => {
			expect(CubicBezier.isStraight(seg)).toBe(straight)
		})
	}
})

describe('CubicBezier point / tangent / normal (circle quadrant, Paper.js Curve#getPointAtTime vectors)', () => {
	const seg = CIRCLE_QUADRANT_SEGMENT

	const points: [number, readonly [number, number]][] = [
		[0, [0, 100]],
		[0.25, [7.8585, 61.07549]],
		[0.5, [29.28932, 29.28932]],
		[0.75, [61.07549, 7.8585]],
		[1, [100, 0]],
	]

	for (const [t, expected] of points) {
		it(`point at t=${t}`, () => {
			expectVecClose(CubicBezier.point(seg, {time: t}), expected, 4)
		})
	}

	const tangents: [number, readonly [number, number]][] = [
		[0, [0, -1]],
		[0.25, [0.3895520040922369, -0.9210044712745546]],
		[0.5, [0.7071067811865476, -0.7071067811865476]],
		[0.75, [0.9210044712745546, -0.3895520040922369]],
		[1, [1, 0]],
	]

	for (const [t, expected] of tangents) {
		it(`tangent at t=${t}`, () => {
			expectVecClose(CubicBezier.tangent(seg, {time: t}), expected, 4)
		})
	}

	const normals: [number, readonly [number, number]][] = [
		[0, [-1, 0]],
		[0.25, [-0.9210044712745546, -0.3895520040922369]],
		[0.5, [-0.7071067811865476, -0.7071067811865476]],
		[0.75, [-0.3895520040922369, -0.9210044712745546]],
		[1, [0, -1]],
	]

	for (const [t, expected] of normals) {
		it(`normal at t=${t} (parallel to reference unit; sign may differ)`, () => {
			const n = CubicBezier.normal(seg, {time: t})
			expectUnitParallel(n, expected, 4)
		})
	}
})

/*
 * -----------------------------------------------------------------------------
 * MIT License — Bezier.js (bezier-js)
 *
 * Repository: https://github.com/Pomax/bezierjs
 * SPDX-License-Identifier: MIT (see upstream package.json "license": "MIT")
 *
 * Upstream source headers credit the library to Pomax and state MIT licensing.
 * The following is the standard MIT license text for reproduction as required by
 * the license when distributing derivative notices.
 *
 * Copyright (c) Pomax
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * -----------------------------------------------------------------------------
 * (End Bezier.js MIT notice — identifier: BEZIER_JS_MIT_LICENSE)
 */
