import {mat2d, type vec2} from 'linearly'
import {describe, expect, it, test} from 'vitest'

import {Path} from './index'
import {windingNumber} from './path/planar'

const blob: Path = {
	curves: [
		{
			vertices: [
				{command: 'L', point: [-30, -60]},
				{
					command: 'C',
					args: [
						[120, -30],
						[-120, 30],
					],
					point: [30, 60],
				},
				{command: 'A', args: [[60, 40], 20, true, true], point: [70, -10]},
			],
			closed: true,
		},
	],
}

/**
 * The defining property: at a point in the wedge the winding number is that of the source, and
 * at each of its images it is the same.
 */
function expectRadialWinding(
	source: Path,
	center: vec2,
	count: number,
	angle: number,
	result: Path
) {
	const n = 37
	let checked = 0
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			const q: vec2 = [
				center[0] - 150 + (300 * (i + 0.137)) / n,
				center[1] - 150 + (300 * (j + 0.271)) / n,
			]
			const theta =
				(((Math.atan2(q[1] - center[1], q[0] - center[0]) * 180) / Math.PI -
					angle) %
					360) +
				360
			const inWedge = theta % 360 < 180 / count
			if (!inWedge) continue

			const w = windingNumber(source.curves, q) + 0
			for (let k = 0; k < count; k++) {
				const rotated = mat2d.pivot(
					mat2d.fromRotation((360 / count) * k),
					center
				)
				const at: vec2 = [
					rotated[0] * q[0] + rotated[2] * q[1] + rotated[4],
					rotated[1] * q[0] + rotated[3] * q[1] + rotated[5],
				]
				expect(windingNumber(result.curves, at) + 0).toBe(w)
			}
			checked++
		}
	}
	expect(checked).toBeGreaterThan(0)
}

describe('Path.kaleidoscope', () => {
	it('is a mirror when there is one mirror', () => {
		const axis: [vec2, vec2] = [
			[0, 0],
			[1, 0],
		]
		expect(Path.toD(Path.kaleidoscope(blob, [0, 0], 1))).toBe(
			Path.toD(Path.mirror(blob, axis))
		)
	})

	it('makes a whole curve in the wedge into twice as many copies as mirrors', () => {
		const p = Path.kaleidoscope(Path.circle([50, 10], 5), [0, 0], 4)
		expect(p.curves.length).toBe(8)
		expect(p.curves.every(c => c.closed)).toBe(true)
		const bounds = Path.bounds(p)
		expect(Math.hypot(bounds[1][0], bounds[1][1])).toBeGreaterThan(50)
		// All of them have the same orientation, for a fill rule to see them the same
		const areas = p.curves.map(c => Path.area({curves: [c]}))
		for (const area of areas) expect(area).toBeCloseTo(areas[0], 6)
	})

	it('joins a curve around the center into a ring', () => {
		const p = Path.kaleidoscope(Path.circle([0, 0], 50), [0, 0], 3)
		expect(p.curves.length).toBe(1)
		expect(p.curves[0].closed).toBe(true)
		expect(Math.abs(Path.area(p))).toBeCloseTo(Math.PI * 2500, 6)
		expect(p.curves[0].vertices.every(v => v.command === 'A')).toBe(true)
	})

	it('makes a petal of what crosses one mirror, for each pair of them', () => {
		const p = Path.kaleidoscope(Path.circle([50, 0], 10), [0, 0], 3)
		expect(p.curves.length).toBe(3)
		expect(p.curves.every(c => c.closed)).toBe(true)
	})

	it('is nothing when nothing is in the wedge', () => {
		const p = Path.kaleidoscope(Path.circle([-50, -50], 10), [0, 0], 4)
		expect(p.curves).toEqual([])
	})

	it('joins an open line from mirror to mirror into a ring', () => {
		const p = Path.kaleidoscope(Path.line([100, 0], [0, 100]), [0, 0], 2)
		expect(p.curves.length).toBe(1)
		expect(p.curves[0].closed).toBe(true)
		expect(p.curves[0].vertices.length).toBe(4)
	})

	it('joins an open curve with one end free at the mirror it reaches', () => {
		const p = Path.kaleidoscope(Path.line([0, 0.0], [50, 10]), [10, 0], 2)
		expect(p.curves.length).toBe(2)
		expect(p.curves.every(c => !c.closed)).toBe(true)
	})

	it('goes through the center without trouble', () => {
		const p = Path.kaleidoscope(Path.line([-50, -20], [50, 20]), [0, 0], 3)
		expect(p.curves.length).toBeGreaterThan(0)
		for (const curve of p.curves) {
			for (const {point} of curve.vertices) {
				expect(Number.isFinite(point[0] + point[1])).toBe(true)
			}
		}
	})

	it('turns with its angle', () => {
		const circle = Path.circle([-20, 50], 5)
		expect(Path.kaleidoscope(circle, [0, 0], 2, 90).curves.length).toBe(4)
		expect(Path.kaleidoscope(circle, [0, 0], 2, 180).curves).toEqual([])
	})

	test.each<[number, number, vec2]>([
		[1, 0, [0, 0]],
		[2, 0, [0, 0]],
		[3, 10, [5, -7]],
		[5, -33, [2, 3]],
		[8, 77, [-1, 1]],
	])(
		'keeps winding numbers, with %i mirrors at %i°',
		(count, angle, center) => {
			expectRadialWinding(
				blob,
				center,
				count,
				angle,
				Path.kaleidoscope(blob, center, count, angle)
			)
		}
	)

	it('keeps a hole around the center a hole', () => {
		const ring = Path.subtract(Path.circle([0, 0], 50), [
			Path.circle([0, 0], 20),
		])
		const p = Path.kaleidoscope(ring, [0, 0], 3)
		expect(p.curves.length).toBe(2)
		expect(Math.abs(Path.area(p))).toBeCloseTo(Math.PI * (2500 - 400), 6)
	})
})

const square: vec2[] = [
	[0, 0],
	[10, 0],
	[10, 10],
	[0, 10],
]

/** Where a point of the plane falls, for a rectangular tile from the origin. */
function foldInto(x: number, size: number) {
	const m = ((x % (2 * size)) + 2 * size) % (2 * size)
	return m < size ? m : 2 * size - m
}

describe('Path.kaleidoscopeTile', () => {
	const area = (x0: number, y0: number, x1: number, y1: number) =>
		[
			[x0, y0],
			[x1, y1],
		] as const

	it('makes a copy of what is inside, for each tile', () => {
		const p = Path.kaleidoscopeTile(
			Path.circle([3, 3], 1),
			square,
			area(1, 1, 29, 29)
		)
		expect(p.curves.length).toBe(9)
		expect(Math.abs(Path.area(p))).toBeCloseTo(9 * Math.PI, 6)
	})

	it('leaves out a tile that only touches the area', () => {
		const p = Path.kaleidoscopeTile(
			Path.circle([3, 3], 1),
			square,
			area(0, 0, 10, 10)
		)
		expect(p.curves.length).toBe(1)
	})

	it('goes to an area that is away from the tile', () => {
		const p = Path.kaleidoscopeTile(
			Path.circle([3, 3], 1),
			square,
			area(31, 1, 39, 9)
		)
		expect(p.curves.length).toBe(1)
		// In the fourth column, which is turned over, so that 3 from its left is 7
		expect(Path.bounds(p)[0][0]).toBeCloseTo(36)
	})

	it('joins across the sides of the tiles', () => {
		// A circle across the right side of the tile is whole, across that side
		const p = Path.kaleidoscopeTile(
			Path.circle([10, 5], 2),
			square,
			area(1, 1, 19, 9)
		)
		expect(p.curves.length).toBe(1)
		expect(p.curves[0].closed).toBe(true)
		expect(Math.abs(Path.area(p))).toBeCloseTo(4 * Math.PI, 6)
	})

	it('fills what the source covers all of, closing it on the outside', () => {
		const p = Path.kaleidoscopeTile(
			Path.circle([5, 5], 100),
			square,
			area(1, 1, 29, 19)
		)
		expect(p.curves.length).toBe(1)
		expect(Math.abs(Path.area(p))).toBeCloseTo(30 * 20, 6)
		expect(Path.bounds(p)).toEqual([
			[0, 0],
			[30, 20],
		])
	})

	it('has nothing around what no tile has anything of', () => {
		const p = Path.kaleidoscopeTile(
			Path.circle([100, 100], 5),
			square,
			area(1, 1, 29, 19)
		)
		expect(p.curves).toEqual([])
	})

	it('fills a band going through, closed on the outside', () => {
		const band = Path.rect([-100, 2], [100, 6])
		const p = Path.kaleidoscopeTile(band, square, area(1, 1, 29, 9))
		expect(p.curves.length).toBe(1)
		expect(p.curves[0].closed).toBe(true)
		expect(Math.abs(Path.area(p))).toBeCloseTo(4 * 30, 6)
	})

	it('leaves an open line open on the outside', () => {
		const p = Path.kaleidoscopeTile(
			Path.line([-100, 2], [100, 2]),
			square,
			area(1, 1, 29, 9)
		)
		expect(p.curves.length).toBe(1)
		expect(p.curves[0].closed).toBe(false)
		expect(Path.bounds(p)).toEqual([
			[0, 2],
			[30, 2],
		])
	})

	test.each<[string, Path]>([
		['a blob', blob],
		[
			'a blob with a hole',
			Path.subtract(Path.circle([8, 8], 14), [Path.circle([3, 6], 5)]),
		],
		[
			'two overlaps of the same direction',
			{
				curves: [
					...Path.circle([5, 5], 12).curves,
					...Path.circle([9, 3], 7).curves,
				],
			},
		],
	])('keeps winding numbers everywhere in the tiles, of %s', (_, source) => {
		const result = Path.kaleidoscopeTile(source, square, area(1, 1, 39, 29))
		let checked = 0
		for (let i = 0; i < 40; i++) {
			for (let j = 0; j < 30; j++) {
				const x = 0.13 + i
				const y = 0.37 + j
				const inside = windingNumber(source.curves, [
					foldInto(x, 10),
					foldInto(y, 10),
				])
				expect(windingNumber(result.curves, [x, y]) + 0).toBe(inside + 0)
				checked++
			}
		}
		expect(checked).toBe(1200)
		// And there is nothing on the outside of them
		expect(windingNumber(result.curves, [-1, 5]) + 0).toBe(0)
		expect(windingNumber(result.curves, [41, 5]) + 0).toBe(0)
	})

	it('goes the same whichever way around the tile is given', () => {
		const circle = Path.circle([3, 3], 1)
		expect(
			Path.area(
				Path.kaleidoscopeTile(circle, [...square].reverse(), area(1, 1, 19, 9))
			)
		).toBeCloseTo(
			Path.area(Path.kaleidoscopeTile(circle, square, area(1, 1, 19, 9))),
			6
		)
	})

	it('tiles with a turned rectangle', () => {
		const m = mat2d.fromRotation(30)
		const turned = square.map(([x, y]): vec2 => [
			m[0] * x + m[2] * y,
			m[1] * x + m[3] * y,
		])
		const p = Path.kaleidoscopeTile(
			Path.circle([turned[2][0] / 2, turned[2][1] / 2], 2),
			turned,
			area(-50, -50, 50, 50)
		)
		expect(p.curves.length).toBeGreaterThan(20)
		expect(Math.abs(Path.area(p))).toBeCloseTo(p.curves.length * 4 * Math.PI, 3)
	})

	const SQRT3 = Math.sqrt(3)
	test.each<[string, vec2[], number]>([
		[
			'60-60-60',
			[
				[0, 0],
				[30, 0],
				[15, 15 * SQRT3],
			],
			6,
		],
		[
			'45-45-90',
			[
				[0, 0],
				[30, 0],
				[0, 30],
			],
			8,
		],
		[
			'30-60-90',
			[
				[0, 0],
				[30, 0],
				[0, 30 * SQRT3],
			],
			12,
		],
	])('goes around each corner of a triangle of %s', (_, cell, around) => {
		const [a, b, c] = cell
		const inCell: vec2 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]
		// Going around a corner where the most of them meet shows how many they are
		const corner = around === 6 ? a : around === 8 ? b : c
		const size = 4
		const p = Path.kaleidoscopeTile(Path.circle(inCell, 1), cell, [
			[corner[0] - size, corner[1] - size],
			[corner[0] + size, corner[1] + size],
		])
		expect(p.curves.length).toBe(around)
		expect(Math.abs(Path.area(p))).toBeCloseTo(around * Math.PI, 4)
	})

	it('makes nearly exact corners exact, for the images to come together', () => {
		const p = Path.kaleidoscopeTile(
			Path.circle([8, 5], 1),
			[
				[0, 0],
				[30, 0],
				[0, 51.9],
			],
			[
				[-100, -100],
				[100, 100],
			]
		)
		expect(p.curves.length).toBeLessThan(10000)
		expect(p.curves.length).toBeGreaterThan(50)
	})

	test.each<[string, vec2[]]>([
		[
			'a triangle of other angles',
			[
				[0, 0],
				[30, 0],
				[10, 20],
			],
		],
		[
			'a pentagon',
			[
				[0, 0],
				[2, 0],
				[3, 2],
				[1, 3],
				[-1, 2],
			],
		],
		[
			'a parallelogram',
			[
				[0, 0],
				[10, 0],
				[15, 10],
				[5, 10],
			],
		],
		[
			'nothing at all',
			[
				[0, 0],
				[0, 0],
				[0, 0],
			],
		],
	])('refuses %s', (_, cell) => {
		expect(() =>
			Path.kaleidoscopeTile(Path.circle([1, 1], 1), cell, area(0, 0, 9, 9))
		).toThrow()
	})

	it('comes to an end with a thin tile turned far from where it is', () => {
		// Its images come by long products, whose error crosses any rounding of the matrices
		const cell: vec2[] = [
			[-134.68825756572187, 169.71620051190257],
			[-134.16947553013466, 170.01571945979958],
			[-189.9940040973948, 266.7066392468744],
			[-190.512786132982, 266.40712029897736],
		]
		const p = Path.kaleidoscopeTile(Path.rect(cell[0], cell[2]), cell, [
			[-51.01460628211498, 54.119046265259385],
			[317.5538460719399, 1443.1395707882475],
		])
		expect(p.curves.length).toBeGreaterThan(0)
	})

	it('has each image across a wall be across it from that one, for a thin turned tile', () => {
		const turn = mat2d.fromRotation(30)
		const turned = ([x, y]: vec2): vec2 => [
			turn[0] * x + turn[2] * y,
			turn[1] * x + turn[3] * y,
		]
		const cell = (
			[
				[0, 0],
				[0.6, 0],
				[0.6, 112],
				[0, 112],
			] as vec2[]
		).map(turned)
		// Something whole in the tile comes to one curve for each image, and a line across it
		// comes to a single line through all the tiles that are in a row
		const p = Path.kaleidoscopeTile(
			Path.line(turned([-1000, 50]), turned([1000, 50])),
			cell,
			[
				[-100, -100],
				[100, 100],
			]
		)
		for (const curve of p.curves) expect(curve.closed).toBe(false)
		expect(p.curves.length).toBeLessThan(40)
	})

	it('comes to an end however small the tile', () => {
		const p = Path.kaleidoscopeTile(
			Path.circle([0.5, 0.5], 0.1),
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 1],
			],
			area(-1000, -1000, 1000, 1000)
		)
		expect(p.curves.length).toBeLessThanOrEqual(10000)
	})
})
