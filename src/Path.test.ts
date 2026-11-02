/**
 * Path tests: some length / bounds / area / flatten expectations are ported from
 * Paper.js `test/tests/Path.js` (numeric goldens only). See `PAPER_JS_PATH_TEST_MIT`
 * at the bottom — MIT, https://github.com/paperjs/paper.js
 */
import type {Rect} from 'geome'
import {mat2d, vec2} from 'linearly'
import paper from 'paper'
import {beforeAll, describe, expect, it, test} from 'vitest'

import {Curve} from './Curve'
import {Path} from './Path'
import {Segment} from './Segment'

beforeAll(() => {
	paper.setup(new paper.Size(1, 1))
})

function expectRectClose(
	got: Rect,
	expectedMin: readonly [number, number],
	expectedMax: readonly [number, number],
	digits = 2
) {
	expect(got[0][0]).toBeCloseTo(expectedMin[0], digits)
	expect(got[0][1]).toBeCloseTo(expectedMin[1], digits)
	expect(got[1][0]).toBeCloseTo(expectedMax[0], digits)
	expect(got[1][1]).toBeCloseTo(expectedMax[1], digits)
}

/**
 * Paper.js test/tests/Path.js / Item_Bounds.js — cubic edges from Segment(point, handleIn, handleOut):
 * P1 = P0 + handleOut, P2 = P3 + handleIn (see Paper.js MIT sources).
 */
const PAPER_PATH_LENGTH_FIXTURE: Path = {
	curves: [
		{
			vertices: [
				{point: [121, 334], command: 'L'},
				{
					point: [248, 320],
					command: 'C',
					args: [
						[121 + 30.7666015625, 334 - 61.53369140625],
						[248 - 42, 320 - 74],
					],
				},
			],
			closed: false,
		},
	],
}

const PAPER_PATH_BOUNDS_OPEN_FIXTURE: Path = {
	curves: [
		{
			vertices: [
				{point: [121, 334], command: 'L'},
				{
					point: [248, 320],
					command: 'C',
					args: [
						[121 + 30.7666015625, 334 - 61.53369140625],
						[248 - 42, 320 - 74],
					],
				},
				{
					point: [205, 420.94482421875],
					command: 'C',
					args: [
						[248 + 42, 320 + 74],
						[205 + 66.7890625, 420.94482421875 - 12.72802734375],
					],
				},
			],
			closed: false,
		},
	],
}

describe('area', () => {
	it('compute the area of a simple path as 0', () => {
		const path: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 0], command: 'L'},
						{point: [1, 1], command: 'L'},
						{point: [2, 2], command: 'L'},
					],
					closed: true,
				},
			],
		}
		expect(Path.area(path)).toBe(0)
	})

	it('compute the area of unit square as 1', () => {
		const path: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 0], command: 'L'},
						{point: [1, 0], command: 'L'},
						{point: [1, 1], command: 'L'},
						{point: [0, 1], command: 'L'},
					],
					closed: true,
				},
			],
		}
		expect(Path.area(path)).toBeCloseTo(1, 5)
	})

	it('compute the are of a unit circle as π', () => {
		const path = Path.unarc(Path.circle([0, 0], 1), 0.1)
		expect(Path.area(path)).toBeCloseTo(Math.PI, 2)
	})

	it('compute the area of open path as 0', () => {
		const path: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 0], command: 'L'},
						{point: [1, 1], command: 'L'},
						{point: [2, 2], command: 'L'},
					],
					closed: false,
				},
			],
		}
		expect(Path.area(path)).toBe(0)
	})

	it('rectangle via Path.rect', () => {
		expect(Path.area(Path.rect([0, 0], [4, 5]))).toBeCloseTo(20, 5)
	})

	it('axis-aligned rectangle away from origin', () => {
		expect(Path.area(Path.rect([2, 2], [5, 8]))).toBeCloseTo(18, 5)
	})

	it('right triangle', () => {
		expect(Path.area(Path.polygon([0, 0], [1, 0], [0, 1]))).toBeCloseTo(0.5, 5)
	})
})

// --- Paper.js test/tests/Path.js (MIT, https://github.com/paperjs/paper.js)

describe('Paper.js Path.js area regressions', () => {
	it('Path#area — 10×10 rectangle at origin equals 100', () => {
		expect(Path.area(Path.rect([0, 0], [10, 10]))).toBe(100)
	})

	it('Path#area — circle r=10 at origin (QUnit tolerance 0.1)', () => {
		expect(
			Math.abs(Path.area(Path.circle([0, 0], 10)) - 100 * Math.PI)
		).toBeLessThanOrEqual(0.1)
	})
})

describe('Paper.js Path.js flatten regressions', () => {
	it('Path#flatten(maxDistance) — ellipse Path.circle([80,50],35) tolerance 5 segment count', () => {
		const flat = Path.flatten(Path.circle([80, 50], 35), 5)
		expect(flat.curves).toHaveLength(1)
		expect(Path.segmentCount(flat)).toBe(8)
		expect(flat.curves[0].closed).toBe(true)
		const verts = flat.curves[0].vertices
		const first = verts[0].point
		const last = verts[verts.length - 1].point
		expect(first[0]).not.toBeCloseTo(last[0], 5)
		expect(first[1]).not.toBeCloseTo(last[1], 5)
	})

	it('Path#flatten — single-segment degenerate closed cubic (#1338) does not throw', () => {
		const p = Path.fromSVGString(
			'm445.26701,223.69688c6.1738,8.7566 -7.05172,14.0468 0,0z'
		)
		expect(() => Path.flatten(p)).not.toThrow()
	})
})

describe('length', () => {
	it('empty path', () => {
		expect(Path.length(Path.empty)).toBe(0)
	})

	it('single line (3-4-5)', () => {
		expect(Path.length(Path.line([0, 0], [3, 4]))).toBe(5)
	})

	it('closed rectangle perimeter', () => {
		expect(Path.length(Path.rect([0, 0], [2, 3]))).toBeCloseTo(10, 10)
	})

	it('canonical cubic (same control polygon as CubicBezier tests)', () => {
		const p = Path.cubicBezier([0, 0], [0, 1], [1, 1], [1, 0])
		expect(Path.length(p)).toBeCloseTo(2, 10)
	})

	it('Paper.js Path#length cubic fixture', () => {
		expect(Path.length(PAPER_PATH_LENGTH_FIXTURE)).toBeCloseTo(
			172.10112809179614,
			7
		)
	})
})

describe('bounds', () => {
	it('axis-aligned rectangle', () => {
		expect(Path.bounds(Path.rect([0, 0], [2, 3]))).toEqual([
			[0, 0],
			[2, 3],
		])
	})

	it('line segment', () => {
		expect(Path.bounds(Path.line([10, 20], [30, 50]))).toEqual([
			[10, 20],
			[30, 50],
		])
	})

	it('canonical cubic bounding box', () => {
		const p = Path.cubicBezier([0, 0], [0, 1], [1, 1], [1, 0])
		expect(Path.bounds(p)).toEqual([
			[0, 0],
			[1, 0.75],
		])
	})

	it('compound path (merged curves)', () => {
		const p = Path.merge([
			Path.line([0, 0], [1, 0]),
			Path.line([5, 5], [6, 10]),
		])
		expect(Path.bounds(p)).toEqual([
			[0, 0],
			[6, 10],
		])
	})

	it('Paper.js Item_Bounds.js open path (Rectangle as min/max)', () => {
		const min: [number, number] = [121, 275.068]
		const max: [number, number] = [121 + 149.49305, 275.068 + 145.87682]
		expectRectClose(Path.bounds(PAPER_PATH_BOUNDS_OPEN_FIXTURE), min, max, 2)
	})
})

describe('segmentCount', () => {
	it('should return 0 for an empty path', () => {
		const path: Path = Path.empty
		expect(Path.segmentCount(path)).toBe(0)
	})

	it('should return 1 for a path with a single line', () => {
		const path: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 0], command: 'L'},
						{point: [1, 1], command: 'L'},
					],
					closed: false,
				},
			],
		}
		expect(Path.segmentCount(path)).toBe(1)
	})

	it('should return 2 for a closed path with two lines', () => {
		const path: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 0], command: 'L'},
						{point: [1, 1], command: 'L'},
					],
					closed: true,
				},
			],
		}
		expect(Path.segmentCount(path)).toBe(2)
	})

	it('should return 2 for a compound path with two lines', () => {
		const path: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 0], command: 'L'},
						{point: [1, 1], command: 'L'},
					],
					closed: false,
				},
				{
					vertices: [
						{point: [2, 2], command: 'L'},
						{point: [3, 3], command: 'L'},
					],
					closed: false,
				},
			],
		}
		expect(Path.segmentCount(path)).toBe(2)
	})

	it('should return 3 for a compound path with a line and a closed path with 2 vertices', () => {
		const path: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 0], command: 'L'},
						{point: [1, 1], command: 'L'},
					],
					closed: false,
				},
				{
					vertices: [
						{point: [4, 4], command: 'L'},
						{
							point: [5, 5],
							command: 'C',
							args: [
								[6, 6],
								[7, 7],
							],
						},
					],
					closed: true,
				},
			],
		}
		expect(Path.segmentCount(path)).toBe(3)
	})
})

describe('segment', () => {
	const rect: Path = Path.rect([0, 0], [1, 1])

	it('should return the first segment of a path', () => {
		expect(Path.segment(rect, 0, 0)).toEqual({
			start: [0, 0],
			command: 'L',
			point: [1, 0],
		})
	})

	it('should return the second segment of a path', () => {
		expect(Path.segment(rect, 0, 1)).toEqual({
			start: [1, 0],
			command: 'L',
			point: [1, 1],
		})
	})

	it('should return the last segment of a path', () => {
		expect(Path.segment(rect, 0, 3)).toEqual({
			start: [0, 1],
			command: 'L',
			point: [0, 0],
		})
	})
})

describe('segment', () => {
	const rect: Path = Path.rect([0, 0], [1, 1])

	it('should return the first segment of a path', () => {
		expect(Path.segment(rect, 0)).toEqual({
			start: [0, 0],
			command: 'L',
			point: [1, 0],
		})
	})

	it('should return the second segment of a path', () => {
		expect(Path.segment(rect, 1)).toEqual({
			start: [1, 0],
			command: 'L',
			point: [1, 1],
		})
	})

	it('should return the last segment of a path', () => {
		expect(Path.segment(rect, 3)).toEqual({
			start: [0, 1],
			command: 'L',
			point: [0, 0],
		})
	})
})

describe('fromSVG', () => {
	it('should convert a line', () => {
		const path = Path.fromSVG(['M', [0, 1], 'L', [2, 3]])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: 'L'},
						{point: [2, 3], command: 'L'},
					],
					closed: false,
				},
			],
		})
	})

	it('should convert a cubic bezier', () => {
		const path = Path.fromSVG(['M', [0, 1], 'C', [2, 3], [4, 5], [6, 7]])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: 'L'},
						{
							point: [6, 7],
							command: 'C',
							args: [
								[2, 3],
								[4, 5],
							],
						},
					],
					closed: false,
				},
			],
		})
	})

	it('should convert a closed polygon', () => {
		const path = Path.fromSVG(['M', [0, 1], 'L', [2, 3], 'L', [4, 5], 'Z'])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: 'L'},
						{point: [2, 3], command: 'L'},
						{point: [4, 5], command: 'L'},
					],
					closed: true,
				},
			],
		})
	})

	it('should convert a closed path with a cubic bezier whose first and last point are identical', () => {
		const path = Path.fromSVG(['M', [0, 1], 'C', [2, 3], [4, 5], [0, 1], 'Z'])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{
							point: [0, 1],
							command: 'C',
							args: [
								[2, 3],
								[4, 5],
							],
						},
					],
					closed: true,
				},
			],
		})
	})

	it('should convert a closed path with a cubic bezier', () => {
		const path = Path.fromSVG(['M', [0, 1], 'C', [2, 3], [4, 5], [6, 7], 'Z'])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: 'L'},
						{
							point: [6, 7],
							command: 'C',
							args: [
								[2, 3],
								[4, 5],
							],
						},
					],
					closed: true,
				},
			],
		})
	})

	it('should convert an arc', () => {
		const path = Path.fromSVG([
			'M',
			[0, 1],
			'A',
			[2, 3],
			4,
			false,
			true,
			[5, 6],
		])

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: 'L'},
						{point: [5, 6], command: 'A', args: [[2, 3], 4, false, true]},
					],
					closed: false,
				},
			],
		})
	})
})

test('toSVGString', () => {
	const path: Path = {
		curves: [
			{
				vertices: [
					{point: [0, 0], command: 'L'},
					{point: [1, 1], command: 'L'},
					{point: [2, 2], command: 'L'},
					{
						point: [3, 3],
						command: 'C',
						args: [
							[4, 4],
							[5, 5],
						],
					},
					{point: [1, 1], command: 'A', args: [[2, 2], 1, false, true]},
				],
				closed: true,
			},
		],
	}
	expect(Path.toSVGString(path)).toEqual(
		'M 0,0 L 1,1 L 2,2 C 4,4 5,5 3,3 A 2,2 1 0 1 1,1 Z'
	)
})

describe('toPaperPath', () => {
	it('should convert a line', () => {
		const testPath: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 1], command: 'L'},
						{point: [2, 3], command: 'L'},
					],
					closed: false,
				},
			],
		}
		const paperPath = Path.toPaperPath(testPath, paper) as paper.Path

		expect(paperPath).toBeInstanceOf(paper.Path)
		expect(paperPath.closed).toBe(false)
		expect(paperPath.curves.length).toBe(1)
		expect(paperPath.curves[0].point1.equals(new paper.Point(0, 1))).toBe(true)
		expect(paperPath.curves[0].point2.equals(new paper.Point(2, 3))).toBe(true)
		expect(paperPath.curves[0].isStraight()).toBe(true)
	})

	it('should convert a cubic bezier', () => {
		const testPath: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 1], command: 'L'},
						{
							point: [2, 3],
							command: 'C',
							args: [
								[4, 5],
								[6, 7],
							],
						},
					],
					closed: false,
				},
			],
		}
		const paperPath = Path.toPaperPath(testPath, paper) as paper.Path

		expect(paperPath).toBeInstanceOf(paper.Path)
		expect(paperPath.closed).toBe(false)
		expect(paperPath.curves.length).toBe(1)
		expect(paperPath.curves[0].point1.equals(new paper.Point(0, 1))).toBe(true)
		expect(paperPath.curves[0].handle1.equals(new paper.Point(4, 4))).toBe(true)
		expect(paperPath.curves[0].handle1.equals(new paper.Point(4, 4))).toBe(true)
		expect(paperPath.curves[0].point2.equals(new paper.Point(2, 3))).toBe(true)
	})

	it('should convert a polygon', () => {
		const testPath: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 1], command: 'L'},
						{point: [2, 3], command: 'L'},
						{point: [4, 5], command: 'L'},
					],
					closed: true,
				},
			],
		}
		const paperPath = Path.toPaperPath(testPath, paper)

		expect(paperPath).toBeInstanceOf(paper.Path)
		expect(paperPath.closed).toBe(true)
		expect(paperPath.curves.length).toBe(3)
		expect(paperPath.curves[0].point1.equals(new paper.Point(0, 1))).toBe(true)
		expect(paperPath.curves[1].point1.equals(new paper.Point(2, 3))).toBe(true)
		expect(paperPath.curves[2].point1.equals(new paper.Point(4, 5))).toBe(true)
	})

	it('should return a fresh paper path when the same Path is reused after project clear', async () => {
		const testPath: Path = {
			curves: [
				{
					vertices: [
						{point: [0, 0], command: 'L'},
						{point: [10, 0], command: 'L'},
						{point: [10, 10], command: 'L'},
						{point: [0, 10], command: 'L'},
					],
					closed: true,
				},
			],
		}
		const paperPath1 = Path.toPaperPath(testPath, paper) as paper.Path
		expect(paperPath1.segments.length).toBeGreaterThan(0)

		await new Promise<void>(resolve => {
			setTimeout(resolve, 0)
		})

		const paperPath2 = Path.toPaperPath(testPath, paper) as paper.Path
		expect(paperPath2.segments.length).toBeGreaterThan(0)
	})
})

describe('fromPaperPath', () => {
	it('should convert a open polygon', () => {
		const paperPath = new paper.Path([
			new paper.Point(0, 1),
			new paper.Point(2, 3),
			new paper.Point(4, 5),
		])
		paperPath.closed = false
		const path = Path.fromPaperPath(paperPath)

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: 'L'},
						{point: [2, 3], command: 'L'},
						{point: [4, 5], command: 'L'},
					],
					closed: false,
				},
			],
		})
	})

	it('should convert a closed polygon', () => {
		const paperPath = new paper.Path([
			new paper.Point(0, 1),
			new paper.Point(2, 3),
			new paper.Point(4, 5),
		])
		paperPath.closed = true
		const path = Path.fromPaperPath(paperPath)

		expect(path).toEqual({
			curves: [
				{
					vertices: [
						{point: [0, 1], command: 'L'},
						{point: [2, 3], command: 'L'},
						{point: [4, 5], command: 'L'},
					],
					closed: true,
				},
			],
		})
	})
})

describe('chamfer and fillet on curves', () => {
	const cubicLineCorner: Path = {
		curves: [
			{
				closed: false,
				vertices: [
					{point: [0, 0], command: 'L'},
					{
						point: [50, 40],
						command: 'C',
						args: [
							[20, 0],
							[40, 20],
						],
					},
					{point: [80, 40], command: 'L'},
				],
			},
		],
	}

	it('chamfers cubic-to-line joint using arc-length trim', () => {
		const out = Path.chamfer(cubicLineCorner, 4)
		expect(out.curves[0].vertices.length).toBeGreaterThan(
			cubicLineCorner.curves[0].vertices.length
		)
	})

	it('fillets cubic-to-line joint with a cubic corner', () => {
		const out = Path.fillet(cubicLineCorner, 6)
		expect(out.curves[0].vertices.some(v => v.command === 'C')).toBe(true)
	})
})

/*
 * -----------------------------------------------------------------------------
 * MIT License — Paper.js (test/tests/Path.js numeric fixtures)
 *
 * Repository: https://github.com/paperjs/paper.js
 * SPDX-License-Identifier: MIT (see upstream LICENSE file)
 *
 * Copyright (c) 2011 - 2020, Jürg Lehni & Jonathan Puckey
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
 * (End Paper.js MIT notice — identifier: PAPER_JS_PATH_TEST_MIT)
 */

function expectPathClose(got: Path, expected: Path, digits = 10) {
	expect(got.curves.length).toBe(expected.curves.length)
	for (const [ci, curve] of got.curves.entries()) {
		const expectedCurve = expected.curves[ci]
		expect(curve.closed).toBe(expectedCurve.closed)
		expect(curve.vertices.length).toBe(expectedCurve.vertices.length)
		for (const [vi, v] of curve.vertices.entries()) {
			const ev = expectedCurve.vertices[vi]
			expect(v.command).toBe(ev.command)
			expect(v.point[0]).toBeCloseTo(ev.point[0], digits)
			expect(v.point[1]).toBeCloseTo(ev.point[1], digits)
			if (v.command === 'C' && ev.command === 'C') {
				for (const k of [0, 1] as const) {
					expect(v.args[k][0]).toBeCloseTo(ev.args[k][0], digits)
					expect(v.args[k][1]).toBeCloseTo(ev.args[k][1], digits)
				}
			}
		}
	}
}

describe('distort', () => {
	const cubic = Path.cubicBezier([10, 10], [30, 80], [70, -20], [90, 50])

	it('with the identity map returns the same cubic', () => {
		expectPathClose(
			Path.distort(cubic, p => p),
			Path.toCubicBezier(cubic)
		)
	})

	it('with an affine map matches Path.transform exactly', () => {
		const m = mat2d.mul(
			mat2d.translation([12, -7]),
			mat2d.rotation(37),
			mat2d.scaling([1.5, 0.6])
		)

		expectPathClose(
			Path.distort(cubic, p => vec2.transformMat2d(p, m)),
			Path.transform(Path.toCubicBezier(cubic), m)
		)
	})

	it('keeps in/out handles anti-parallel at a smooth vertex with equal handle lengths', () => {
		const smooth = Path.fromSVG([
			'M',
			[0, 0],
			'C',
			[10, 20],
			[40, 30],
			[50, 30],
			'C',
			[60, 30],
			[90, 20],
			[100, 0],
		])

		const wave = ([x, y]: vec2): vec2 => [
			x,
			y + 8 * Math.sin((x / 60) * 2 * Math.PI),
		]
		const warped = Path.distort(smooth, wave)

		// Adaptive subdivision inserts vertices, so locate the warped smooth vertex by its position
		const vertices = warped.curves[0].vertices
		const i = vertices.findIndex(v => vec2.approx(v.point, wave([50, 30])))
		const v1 = vertices[i]
		const v2 = vertices[i + 1]
		if (v1.command !== 'C' || v2.command !== 'C')
			throw new Error('expected cubics')

		const hIn = vec2.sub(v1.args[1], v1.point)
		const hOut = vec2.sub(v2.args[0], v1.point)

		expect(vec2.angle(hIn, vec2.neg(hOut))).toBeCloseTo(0, 10)
	})

	it('subdivides until the fitted cubics stay within tolerance', () => {
		const tolerance = 0.01
		const f = (x: number) => 5 * Math.sin((x / 24) * 2 * Math.PI)
		const map = ([x, y]: vec2): vec2 => [x, y + f(x)]
		const out = Path.distort(Path.line([0, 0], [100, 0]), map, {tolerance})

		expect(out.curves[0].vertices.length).toBeGreaterThan(2)

		// The source is the x-axis and the map keeps x, so the true image of a piece
		// spanning [x0, x1] at parameter t is map([x0 + t (x1 - x0), 0]).
		for (const seg of Curve.segments(out.curves[0])) {
			const x0 = seg.start[0]
			const x1 = seg.point[0]
			for (let i = 0; i <= 20; i++) {
				const t = i / 20
				const expected = map([x0 + t * (x1 - x0), 0])
				const actual = Segment.point(seg, {time: t})
				// The fit is checked at three parameters per piece, so allow some margin in between
				expect(vec2.distance(expected, actual)).toBeLessThanOrEqual(
					tolerance * 2
				)
			}
		}
	})

	it('uses fewer pieces when the tolerance is looser', () => {
		const map = ([x, y]: vec2): vec2 => [x, y + 5 * Math.sin(x / 4)]
		const line = Path.line([0, 0], [100, 0])
		const fine = Path.distort(line, map, {tolerance: 0.001}).curves[0].vertices
		const coarse = Path.distort(line, map, {tolerance: 0.5}).curves[0].vertices
		expect(fine.length).toBeGreaterThan(coarse.length)
	})
})

describe('unarc', () => {
	it('keeps every point of a large circle within tolerance', () => {
		const r = 1000
		const tolerance = 0.01
		const path = Path.unarc(Path.circle([0, 0], r), tolerance)

		for (const curve of path.curves) {
			for (const seg of Curve.segments(curve)) {
				for (let i = 0; i <= 20; i++) {
					const p = Segment.point(seg, {time: i / 20})
					expect(Math.abs(vec2.length(p) - r)).toBeLessThanOrEqual(tolerance)
				}
			}
		}
	})

	it('uses fewer cubics when the tolerance is looser', () => {
		const circle = Path.circle([0, 0], 1000)
		const fine = Path.unarc(circle, 0.001).curves[0].vertices.length
		const coarse = Path.unarc(circle, 1).curves[0].vertices.length
		expect(fine).toBeGreaterThan(coarse)
		expect(coarse).toBeGreaterThanOrEqual(4)
	})
})

describe('wave / twirl / bulge', () => {
	it('wave moves every vertex onto the sine curve and bends a plain line', () => {
		const out = Path.wave(Path.line([0, 0], [100, 0]), 5, 24)
		const vertices = out.curves[0].vertices

		expect(vertices.length).toBeGreaterThan(2)
		for (const {
			point: [x, y],
		} of vertices) {
			expect(y).toBeCloseTo(5 * Math.sin((x / 24) * 2 * Math.PI), 10)
		}
	})

	it('twirl with a constant ramp is a plain rotation about the center', () => {
		const rect = Path.rectangle([20, 20], [80, 80])
		const out = Path.twirl(rect, [50, 50], 1000, 90, {ramp: () => 1})
		expectPathClose(
			out,
			Path.transform(Path.toCubicBezier(rect), mat2d.rotation(90, [50, 50]))
		)
	})

	it('bulge with a constant ramp is a uniform scaling about the center', () => {
		const rect = Path.rectangle([20, 20], [80, 80])
		const out = Path.bulge(rect, [50, 50], 1000, 0.5, {ramp: () => 1})
		expectPathClose(
			out,
			Path.transform(
				Path.toCubicBezier(rect),
				mat2d.scaling([1.5, 1.5], [50, 50])
			)
		)
	})

	it('bulge with zero strength is the identity', () => {
		const rect = Path.rectangle([20, 20], [80, 80])
		expectPathClose(Path.bulge(rect, [50, 50], 40, 0), Path.toCubicBezier(rect))
	})
})
