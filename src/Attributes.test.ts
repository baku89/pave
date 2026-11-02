import {vec2} from 'linearly'
import {describe, expect, it, test} from 'vitest'

import {Curve, Path, Segment} from './index'
import {windingNumber} from './path/planar'

const line = (a: vec2, b: vec2, attrsA?: object, attrsB?: object): Path => ({
	curves: [
		{
			vertices: [
				{command: 'L', point: a, ...(attrsA ? {attrs: attrsA as never} : {})},
				{command: 'L', point: b, ...(attrsB ? {attrs: attrsB as never} : {})},
			],
			closed: false,
		},
	],
})

const attrsOf = (p: Path, name: string) =>
	p.curves.flatMap(c => c.vertices.map(v => v.attrs?.[name]))

describe('reading attributes', () => {
	const p: Path = {
		attrDefs: {
			width: {default: 1},
			color: {default: [0, 0, 0], interpolate: 'oklab'},
			tag: {default: 9, interpolate: 'step'},
			opacity: {default: 0.5},
		},
		attrs: {width: 2},
		curves: [
			{
				attrs: {color: [1, 0, 0]},
				closed: false,
				vertices: [
					{command: 'L', point: [0, 0], attrs: {width: 4, tag: 1}},
					{command: 'L', point: [10, 0]},
				],
			},
		],
	}

	it('cascades from the vertex up to the default', () => {
		expect(Path.attribute(p, 'width', {time: 0})).toBe(4)
		expect(Path.attribute(p, 'width', {time: 1})).toBe(2)
		expect(Path.attribute(p, 'color', {time: 0})).toEqual([1, 0, 0])
		expect(Path.attribute(p, 'opacity', {time: 0.5})).toBe(0.5)
		expect(Path.attribute(p, 'missing', {time: 0.5})).toBeUndefined()
	})

	it('interpolates through the levels by time', () => {
		expect(Path.attribute(p, 'width', {time: 0.5})).toBeCloseTo(3, 9)
	})

	it('follows the interpolation in the definition', () => {
		expect(Path.attribute(p, 'tag', {time: 0.5})).toBe(1)
		expect(Path.attribute(p, 'tag', {time: 1})).toBe(9)
	})

	it('needs no definition', () => {
		const q = line(
			[0, 0],
			[10, 0],
			{a: 0, on: true, n: 'x'},
			{a: 10, on: false, n: 'y'}
		)
		expect(Path.attribute(q, 'a', {time: 0.5})).toBeCloseTo(5, 9)
		expect(Path.attribute(q, 'on', {time: 0.5})).toBe(false)
		expect(Path.attribute(q, 'n', {time: 0.5})).toBe('x')
	})

	it('reads the closing segment of a closed curve', () => {
		const q: Path = {
			curves: [
				{
					closed: true,
					vertices: [
						{command: 'L', point: [0, 0], attrs: {a: 0}},
						{command: 'L', point: [10, 0], attrs: {a: 10}},
						{command: 'L', point: [10, 10], attrs: {a: 20}},
					],
				},
			],
		}
		expect(
			Path.attribute(q, 'a', {curveIndex: 0, segmentIndex: 2, time: 0.5})
		).toBeCloseTo(10, 9)
	})

	it('lists the names on all levels', () => {
		expect(Path.attributeNames(p).sort()).toEqual([
			'color',
			'opacity',
			'tag',
			'width',
		])
	})
})

describe('interpolations', () => {
	const between = (a: unknown, b: unknown, interpolate?: never) =>
		Path.attribute(
			{
				...line([0, 0], [1, 0], {v: a}, {v: b}),
				attrDefs: {v: {interpolate}},
			},
			'v',
			{time: 0.5}
		)

	it('interpolates sRGB in OKLab', () => {
		const mid = between([0, 0, 0], [1, 1, 1], 'oklab' as never) as number[]
		// The perceptual midpoint is lighter than the numeric one
		expect(mid[0]).toBeGreaterThan(0.3)
		expect(mid[0]).toBeLessThan(0.5)
		expect(mid[0]).toBeCloseTo(mid[1], 6)
	})

	it('keeps alpha linear in OKLab', () => {
		const mid = between(
			[1, 0, 0, 0],
			[0, 0, 1, 1],
			'oklab' as never
		) as number[]
		expect(mid[3]).toBeCloseTo(0.5, 9)
	})

	it('returns the same color when both ends are the same', () => {
		expect(between([0.2, 0.4, 0.6], [0.2, 0.4, 0.6], 'oklab' as never)).toEqual(
			[0.2, 0.4, 0.6]
		)
	})

	it('accepts a function', () => {
		const fn = ((a: number, b: number, t: number) =>
			a * (1 - t) + b * t + 100) as never
		expect(between(0, 10, fn)).toBe(105)
	})

	it.each(['linear', 'oklab', 'step', 'and'] as const)(
		'%s does not depend on how a segment is subdivided',
		interpolate => {
			const [a, b] =
				interpolate === 'and'
					? [true, false]
					: interpolate === 'step'
						? [1, 2]
						: [
								[0.1, 0.8, 0.3],
								[0.9, 0.2, 0.6],
							]
			const p: Path = {
				...line([0, 0], [8, 0], {v: a}, {v: b}),
				attrDefs: {v: {interpolate}},
			}
			const sub = Path.subdivide(Path.subdivide(p, 2), 2)
			for (const t of [0.25, 0.5, 0.75]) {
				const direct = Path.attribute(p, 'v', {time: t})
				const i = t * 4
				const viaSubdivided = sub.curves[0].vertices[i].attrs?.v
				expect(viaSubdivided).toEqual(direct)
			}
		}
	)
})

describe('setAttribute and friends', () => {
	const p = line([0, 0], [10, 0])

	it('does not mutate the input', () => {
		const q = Path.setAttribute(p, 'a', 1)
		expect(p.curves[0].vertices[0].attrs).toBeUndefined()
		expect(q).not.toBe(p)
	})

	it('writes constants, closures and copies', () => {
		const q = Path.setAttribute(p, 'a', 3)
		expect(attrsOf(q, 'a')).toEqual([3, 3])
		const r = Path.setAttribute(q, 'b', v => v.point[0] * 2)
		expect(attrsOf(r, 'b')).toEqual([0, 20])
		const s = Path.setAttribute(r, 'c', 'b')
		expect(attrsOf(s, 'c')).toEqual([0, 20])
	})

	it('passes where the vertex is', () => {
		const q = Path.setAttribute(
			p,
			'i',
			(_, {index, curveIndex}) => index + curveIndex * 10
		)
		expect(attrsOf(q, 'i')).toEqual([0, 1])
	})

	it('limits the writing to a group', () => {
		const q = Path.setAttribute(p, 'a', 1)
		const r = Path.setAttribute(q, 'a', 5, {group: v => v.point[0] > 5})
		expect(attrsOf(r, 'a')).toEqual([1, 5])
	})

	it('makes a group, which is a boolean attribute', () => {
		const q = Path.setAttribute(p, 'right', v => v.point[0] > 5)
		const r = Path.setAttribute(q, 'a', 5, {group: 'right'})
		expect(attrsOf(r, 'a')).toEqual([undefined, 5])
	})

	it('writes to curves and the path', () => {
		const q = Path.setAttribute(p, 'a', 1, {level: 'curve'})
		expect(q.curves[0].attrs).toEqual({a: 1})
		const r = Path.setAttribute(q, 'b', 2, {level: 'path'})
		expect(r.attrs).toEqual({b: 2})
		const s = Path.setAttribute(
			r,
			'c',
			(c, {index}) => c.vertices.length + index,
			{
				level: 'curve',
			}
		)
		expect(s.curves[0].attrs?.c).toBe(2)
		const t = Path.setAttribute(s, 'd', q2 => q2.curves.length, {level: 'path'})
		expect(t.attrs?.d).toBe(1)
	})

	it('copying pushes a value down', () => {
		const q = Path.setAttribute(p, 'a', 7, {level: 'curve'})
		expect(attrsOf(Path.setAttribute(q, 'b', 'a'), 'b')).toEqual([7, 7])
	})

	it('deletes per level, revealing the upper one', () => {
		let q = Path.setAttribute(p, 'a', 1)
		q = Path.setAttribute(q, 'a', 2, {level: 'curve'})
		q = Path.defineAttribute(q, 'a', {default: 3})

		const vertexOnly = Path.deleteAttribute(q, 'a', {level: 'vertex'})
		expect(Path.attribute(vertexOnly, 'a', {time: 0})).toBe(2)
		expect(vertexOnly.attrDefs?.a).toBeDefined()

		const all = Path.deleteAttribute(q, 'a')
		expect(Path.attribute(all, 'a', {time: 0})).toBeUndefined()
		expect(all.attrDefs).toBeUndefined()
		expect(all.curves[0].attrs).toBeUndefined()
		expect(all.curves[0].vertices[0].attrs).toBeUndefined()
		expect(JSON.stringify(all)).toEqual(JSON.stringify(p))
	})

	it('renames everywhere', () => {
		let q = Path.setAttribute(p, 'a', 1)
		q = Path.setAttribute(q, 'a', 2, {level: 'curve'})
		q = Path.setAttribute(q, 'a', 3, {level: 'path'})
		q = Path.defineAttribute(q, 'a', {default: 4})
		const r = Path.renameAttribute(q, 'a', 'b')
		expect(Path.attributeNames(r)).toEqual(['b'])
		expect(attrsOf(r, 'b')).toEqual([1, 1])
		expect(r.curves[0].attrs).toEqual({b: 2})
		expect(r.attrs).toEqual({b: 3})
		expect(r.attrDefs).toEqual({b: {default: 4}})
	})

	it('stays representable in JSON with named interpolations', () => {
		const q = Path.defineAttribute(Path.setAttribute(p, 'c', [1, 0, 0]), 'c', {
			interpolate: 'oklab',
			default: [0, 0, 0],
		})
		const r = JSON.parse(JSON.stringify(q)) as Path
		expect(Path.attribute(r, 'c', {time: 0.5})).toEqual([1, 0, 0])
	})
})

describe('carrying attributes through modifiers', () => {
	const ramp = line([0, 0], [10, 0], {w: 0}, {w: 10})
	const closedRamp: Path = {
		attrs: {keep: 1},
		attrDefs: {w: {default: 0}},
		curves: [
			{
				attrs: {curveKeep: 2},
				closed: true,
				vertices: [
					{command: 'L', point: [0, 0], attrs: {w: 0}},
					{command: 'L', point: [10, 0], attrs: {w: 10}},
					{
						command: 'C',
						args: [
							[12, 4],
							[8, 8],
						],
						point: [10, 10],
						attrs: {w: 20},
					},
					{
						command: 'A',
						args: [[8, 8], 0, false, true],
						point: [0, 10],
						attrs: {w: 30},
					},
				],
			},
		],
	}

	/** Every vertex must agree with the field read on the source at the same place. */
	const expectOnRamp = (p: Path) => {
		for (const curve of p.curves) {
			for (const v of curve.vertices) {
				expect(v.attrs?.w).toBeCloseTo(v.point[0], 6)
			}
		}
	}

	it('transforms', () => {
		const q = Path.transform(closedRamp, [2, 0, 0, 2, 0, 0])
		expect(attrsOf(q, 'w')).toEqual([0, 10, 20, 30])
		expect(q.attrs).toEqual({keep: 1})
		expect(q.attrDefs).toEqual(closedRamp.attrDefs)
		expect(q.curves[0].attrs).toEqual({curveKeep: 2})
	})

	it('reverses, keeping values on their anchors', () => {
		const q = Path.reverse(ramp)
		expect(q.curves[0].vertices.map(v => [v.point[0], v.attrs?.w])).toEqual([
			[10, 10],
			[0, 0],
		])

		const r = Path.reverse(closedRamp)
		for (const v of r.curves[0].vertices) {
			const source = closedRamp.curves[0].vertices.find(
				s => s.point[0] === v.point[0] && s.point[1] === v.point[1]
			)
			expect(v.attrs?.w).toBe(source?.attrs?.w)
		}
		expect(r.attrs).toEqual({keep: 1})
		expect(r.curves[0].attrs).toEqual({curveKeep: 2})
	})

	it('reverses twice to the same values', () => {
		const q = Path.reverse(Path.reverse(closedRamp))
		expect(q.curves[0].vertices.map(v => v.attrs?.w).sort()).toEqual(
			closedRamp.curves[0].vertices.map(v => v.attrs?.w).sort()
		)
	})

	it('trims', () => {
		const q = Path.trim(ramp, {time: 0.25}, {time: 0.75})
		expect(attrsOf(q, 'w')).toEqual([2.5, 7.5])
	})

	it('trims in the reverse direction', () => {
		const q = Path.trim(ramp, {time: 0.75}, {time: 0.25}, false)
		expect(q.curves[0].vertices[0].attrs?.w).toBeCloseTo(7.5, 9)
		expect(q.curves[0].vertices.at(-1)?.attrs?.w).toBeCloseTo(2.5, 9)
	})

	it('trims across a closed curve start, keeping levels', () => {
		const q = Path.trim(
			closedRamp,
			{segmentIndex: 3, time: 0.5},
			{segmentIndex: 0, time: 0.5}
		)
		expect(q.attrs).toEqual({keep: 1})
		expect(q.curves[0].attrs).toEqual({curveKeep: 2})
		const w = attrsOf(q, 'w')
		expect(w[0]).toBeCloseTo(15, 9)
		expect(w.at(-1)).toBeCloseTo(5, 9)
	})

	it('splits', () => {
		const parts = Path.split(ramp, [{time: 0}, {time: 0.5}, {time: 1}])
		expect(attrsOf(parts[0], 'w')).toEqual([0, 5])
		expect(attrsOf(parts[1], 'w')).toEqual([5, 10])
	})

	it('subdivides', () => {
		const q = Path.subdivide(ramp, 4)
		expect(attrsOf(q, 'w')).toEqual([0, 2.5, 5, 7.5, 10])
	})

	it('flattens curved segments', () => {
		const q = Path.flatten(closedRamp, 0.5)
		const w = attrsOf(q, 'w') as number[]
		expect(w.length).toBeGreaterThan(4)
		for (let i = 1; i < w.length; i++) {
			expect(w[i]).toBeGreaterThanOrEqual(w[i - 1])
		}
		expect(q.attrs).toEqual({keep: 1})
		expect(q.curves[0].attrs).toEqual({curveKeep: 2})
	})

	it('approximates arcs, keeping values', () => {
		const q = Path.unarc(closedRamp)
		const w = attrsOf(q, 'w') as number[]
		expect(w).toContain(20)
		expect(w).toContain(30)
		for (let i = 1; i < w.length; i++) {
			expect(w[i]).toBeGreaterThanOrEqual(w[i - 1])
		}
		const c = Path.toCubicBezier(closedRamp)
		expect(c.curves[0].vertices.every(v => v.attrs?.w !== undefined)).toBe(true)
	})

	it('distorts', () => {
		const curved = Path.setAttribute(
			Path.toCubicBezier(Path.subdivide(line([0, 0], [10, 0]), 1)),
			'w',
			v => v.point[0]
		)
		const q = Path.distort(curved, ([x, y]) => [x, y + Math.sin(x)], {
			tolerance: 0.01,
		})
		expect(q.curves[0].vertices.length).toBeGreaterThan(2)
		expectOnRamp(q)
	})

	it('mirrors', () => {
		const p = Path.setAttribute(line([-5, 0], [10, 0]), 'w', v => v.point[0])
		const q = Path.mirror(p, {theta: 0, offset: 0})
		const byX = q.curves[0].vertices.map(v => [v.point[0], v.attrs?.w])
		expect(byX[0]).toEqual([-10, 10])
		expect(byX[1][0]).toBeCloseTo(0, 9)
		expect(byX[1][1]).toBeCloseTo(0, 9)
		expect(byX[2]).toEqual([10, 10])
	})

	it('reads upper levels when interpolating towards a vertex without its own', () => {
		const p: Path = {
			curves: [
				{
					attrs: {w: 2},
					closed: false,
					vertices: [
						{command: 'L', point: [0, 0], attrs: {w: 8}},
						{command: 'L', point: [10, 0]},
					],
				},
			],
		}
		expect(Path.attribute(p, 'w', {time: 0.5})).toBeCloseTo(5, 9)
		const q = Path.trim(p, {time: 0}, {time: 0.5})
		expect(q.curves[0].vertices[1].attrs?.w).toBeCloseTo(5, 9)
	})

	it('leaves paths without attributes as they were', () => {
		const p = Path.circle([0, 0], 10)
		for (const q of [
			Path.transform(p, [1, 0, 0, 1, 1, 1]),
			Path.reverse(p),
			Path.subdivide(p, 2),
			Path.trim(p, {time: 0.1}, {time: 0.4}),
			Path.fillet(Path.rect([0, 0], [9, 9]), 2),
			Path.unite([p]),
			Path.offset(p, 1),
		]) {
			const text = JSON.stringify(q)
			expect(text).not.toContain('attrs')
			expect(text).not.toContain('startAttrs')
			expect(text).not.toContain('attrDefs')
		}
	})
})

describe('moving values down when curves and paths combine', () => {
	const a = Path.setAttribute(line([0, 0], [1, 0]), 'w', 3, {level: 'curve'})
	const b = Path.setAttribute(line([2, 0], [3, 0]), 'w', 8, {level: 'path'})

	it('joins into vertex values', () => {
		const q = Path.join([a, b])
		expect(q.curves.length).toBe(1)
		expect(attrsOf(q, 'w')).toEqual([3, 3, 8, 8])
		expect(q.attrs).toBeUndefined()
		expect(q.curves[0].attrs).toBeUndefined()
	})

	it('merges keeping curves, and path values on them', () => {
		const q = Path.merge([a, b])
		expect(q.curves.map(c => c.attrs?.w)).toEqual([3, 8])
		expect(q.attrs).toBeUndefined()
	})

	it('merges definitions, the former one winning', () => {
		const x = Path.defineAttribute(line([0, 0], [1, 0]), 'w', {default: 1})
		const y = Path.defineAttribute(line([0, 0], [1, 0]), 'w', {default: 2})
		const z = Path.defineAttribute(y, 'v', {default: 5})
		expect(Path.merge([x, z]).attrDefs).toEqual({
			w: {default: 1},
			v: {default: 5},
		})
		expect(Path.join([x, z]).attrDefs).toEqual({
			w: {default: 1},
			v: {default: 5},
		})
	})
})

describe('booleans', () => {
	const box = (x0: number, x1: number, w?: number): Path => {
		const p = Path.rect([x0, 0], [x1, 10])
		return w === undefined ? p : Path.setAttribute(p, 'w', w)
	}

	const valuesAtCrossings = (p: Path) =>
		p.curves[0].vertices.filter(v => v.point[0] === 6).map(v => v.attrs?.w)

	it('averages where two curves hand over', () => {
		const q = Path.unite(
			[box(0, 6, 2), box(4, 10, 8)].map((b, i) =>
				i === 0 ? b : Path.transform(b, [1, 0, 0, 1, 0, 5])
			)
		)
		const nonCorner = q.curves[0].vertices.filter(
			v => v.point[0] === 6 || v.point[0] === 4
		)
		const crossing = nonCorner.filter(v => v.attrs?.w === 5)
		expect(crossing.length).toBeGreaterThan(0)
	})

	it('uses the other value when one curve has no attribute', () => {
		const q = Path.unite([
			box(0, 6, 2),
			Path.transform(box(4, 10), [1, 0, 0, 1, 0, 5]),
		])
		const values = q.curves[0].vertices.map(v => v.attrs?.w)
		expect(values.filter(v => v === 2).length).toBeGreaterThan(0)
		expect(values.some(v => v !== undefined && v !== 2)).toBe(false)
	})

	it('interpolates along a split edge', () => {
		const p: Path = {
			curves: [
				{
					closed: true,
					vertices: [
						{command: 'L', point: [0, 0], attrs: {w: 0}},
						{command: 'L', point: [10, 0], attrs: {w: 10}},
						{command: 'L', point: [10, 10], attrs: {w: 20}},
						{command: 'L', point: [0, 10], attrs: {w: 30}},
					],
				},
			],
		}
		const cut = Path.subtract(p, [Path.rect([4, -5], [6, 5])])
		const at = cut.curves[0].vertices.find(
			v => v.point[0] === 4 && v.point[1] === 0
		)
		expect(at?.attrs?.w).toBeCloseTo(4, 6)
		expect(valuesAtCrossings(cut).length).toBeGreaterThan(0)
	})

	it('moves curve values down and keeps the values of a single path', () => {
		const p = Path.setAttribute(
			Path.setAttribute(box(0, 10), 'c', 7, {level: 'curve'}),
			'd',
			9,
			{level: 'path'}
		)
		const q = Path.unite([p])
		expect(q.attrs).toEqual({d: 9})
		expect(q.curves[0].attrs).toBeUndefined()
		expect(q.curves[0].vertices.every(v => v.attrs?.c === 7)).toBe(true)
	})

	it('moves path values down when paths combine', () => {
		const p = Path.setAttribute(box(0, 6), 'd', 9, {level: 'path'})
		const q = Path.unite([p, Path.rect([20, 0], [30, 10])])
		expect(q.attrs).toBeUndefined()
		const ofP = q.curves.find(c => c.vertices[0].point[0] <= 6)
		expect(ofP?.vertices.every(v => v.attrs?.d === 9)).toBe(true)
	})

	it('does not change the geometry', () => {
		const plain = Path.unite([box(0, 6), box(4, 10)])
		const withAttrs = Path.unite([box(0, 6, 2), box(4, 10, 8)])
		expect(Path.area(withAttrs)).toBeCloseTo(Path.area(plain), 9)
	})

	it('keeps a vertex between differing values', () => {
		const p: Path = {
			curves: [
				{
					closed: true,
					vertices: [
						{command: 'L', point: [0, 0], attrs: {w: 0}},
						{command: 'L', point: [5, 0], attrs: {w: 50}},
						{command: 'L', point: [10, 0], attrs: {w: 10}},
						{command: 'L', point: [10, 10], attrs: {w: 0}},
					],
				},
			],
		}
		const q = Path.unite([p])
		expect(q.curves[0].vertices.some(v => v.attrs?.w === 50)).toBe(true)
	})
})

describe('corners with attributes', () => {
	const square = Path.rect([0, 0], [20, 20])
	const count = (p: Path, command: string) =>
		p.curves[0].vertices.filter(v => v.command === command).length

	it('applies to a group by a closure', () => {
		const q = Path.fillet(square, 3, {group: v => v.point[0] === 0})
		expect(count(q, 'A')).toBe(2)
		const r = Path.chamfer(square, 3, {group: (_, {index}) => index === 0})
		expect(r.curves[0].vertices.length).toBe(5)
	})

	it('applies to a stored group', () => {
		const p = Path.setAttribute(square, 'round', v => v.point[1] === 0)
		expect(count(Path.fillet(p, 3, {group: 'round'}), 'A')).toBe(2)
	})

	it('selects nothing with a missing group', () => {
		const q = Path.fillet(square, 3, {group: 'missing'})
		expect(count(q, 'A')).toBe(0)
		expect(q.curves[0].vertices.length).toBe(4)
	})

	it('reads the amount per corner', () => {
		const q = Path.fillet(square, v => (v.point[0] === 0 ? 0 : 3))
		expect(count(q, 'A')).toBe(2)
		const p = Path.setAttribute(square, 'r', v => (v.point[1] === 0 ? 4 : 0))
		const radii = Path.fillet(p, 'r')
			.curves[0].vertices.filter(v => v.command === 'A')
			.map(v => v.args?.[0])
		expect(radii.length).toBe(2)
		for (const r of radii) expect(r).toEqual([4, 4])
	})

	it('reads the amount through the levels', () => {
		const p = Path.setAttribute(square, 'r', 3, {level: 'curve'})
		expect(count(Path.fillet(p, 'r'), 'A')).toBe(4)
	})

	it('gives an unselected corner its whole share to the neighbours', () => {
		const q = Path.chamfer(square, 15, {group: (_, {index}) => index === 0})
		// With one corner selected, the cut is not limited to half of each side
		const lengths = Path.segments(q).map(s => Segment.length(s))
		expect(Math.min(...lengths)).toBeCloseTo(5, 6)
	})

	it('carries attributes across the cuts', () => {
		const p: Path = {
			curves: [
				{
					closed: false,
					vertices: [
						{command: 'L', point: [0, 0], attrs: {w: 0}},
						{command: 'L', point: [10, 0], attrs: {w: 10}},
						{command: 'L', point: [10, 10], attrs: {w: 20}},
					],
				},
			],
		}
		for (const q of [Path.chamfer(p, 2), Path.fillet(p, 2)]) {
			const vs = q.curves[0].vertices
			expect(vs[0].attrs?.w).toBe(0)
			expect(vs.at(-1)?.attrs?.w).toBe(20)
			expect(vs[1].attrs?.w).toBeCloseTo(vs[1].point[0], 6)
			expect(vs[2].attrs?.w).toBeCloseTo(10 + vs[2].point[1], 6)
		}
	})
})

describe('offsetStroke with varying widths', () => {
	const grid: vec2[] = []
	for (let i = 0; i < 44; i++) {
		for (let j = 0; j < 44; j++) {
			grid.push([-10 + (120 * (i + 0.37)) / 44, -10 + (120 * (j + 0.61)) / 44])
		}
	}
	const inside = (p: Path, q: vec2) => windingNumber(p.curves, q) !== 0

	it('gives the same as a constant when the attribute is uniform', () => {
		const p = Path.setAttribute(Path.circle([50, 50], 20), 'w', 6)
		const q = Path.offsetStroke(p, 'w')
		expect(q.curves.length).toBe(2)
		expect(Path.area(q)).toBeCloseTo(Path.area(Path.offsetStroke(p, 6)), 6)
		expect(q.curves[0].vertices.every(v => v.command === 'A')).toBe(true)
	})

	it('reads the width per curve', () => {
		const p = Path.merge([
			Path.setAttribute(Path.circle([25, 50], 10), 'w', 2, {level: 'curve'}),
			Path.setAttribute(Path.circle([75, 50], 10), 'w', 6, {level: 'curve'}),
		])
		const expected =
			Path.area(Path.offsetStroke(Path.circle([0, 0], 10), 2)) +
			Path.area(Path.offsetStroke(Path.circle([0, 0], 10), 6))
		expect(Path.area(Path.offsetStroke(p, 'w'))).toBeCloseTo(expected, 4)
	})

	it('tapers a line exactly', () => {
		const p = Path.setAttribute(Path.line([10, 50], [90, 50]), 'w', v =>
			v.point[0] === 10 ? 4 : 20
		)
		const q = Path.offsetStroke(p, 'w')
		expect(q.curves.every(c => c.closed)).toBe(true)
		expect(Path.area(q)).toBeCloseTo(((4 + 20) / 2) * 80, 6)
		for (const pt of grid) {
			const half = 2 + ((pt[0] - 10) / 80) * 8
			const d = Math.abs(pt[1] - 50)
			if (pt[0] < 11 || pt[0] > 89 || Math.abs(d - half) < 0.5) continue
			expect(inside(q, pt)).toBe(d < half)
		}
	})

	it('accepts a closure', () => {
		const p = Path.line([10, 50], [90, 50])
		const q = Path.offsetStroke(p, v => (v.point[0] === 10 ? 4 : 20))
		expect(Path.area(q)).toBeCloseTo(((4 + 20) / 2) * 80, 6)
	})

	it('comes to a point at a width of 0', () => {
		const p = Path.setAttribute(Path.line([10, 50], [90, 50]), 'w', v =>
			v.point[0] === 10 ? 0 : 20
		)
		const q = Path.offsetStroke(p, 'w')
		expect(Path.area(q)).toBeCloseTo((20 / 2) * 80, 6)
		expect(Path.bounds(q)[0][0]).toBeCloseTo(10, 6)
	})

	it('returns nothing without any width', () => {
		expect(Path.offsetStroke(Path.line([0, 0], [1, 0]), 0).curves).toEqual([])
		expect(
			Path.offsetStroke(Path.line([0, 0], [1, 0]), 'missing').curves
		).toEqual([])
	})

	const curved = (w0: number, w1: number): Path => ({
		curves: [
			{
				closed: false,
				vertices: [
					{command: 'L', point: [10, 70], attrs: {w: w0}},
					{
						command: 'C',
						args: [
							[30, 10],
							[70, 10],
						],
						point: [90, 70],
						attrs: {w: w1},
					},
				],
			},
		],
	})

	/** Half the width on the curve nearest to the point, by a dense sampling. */
	const expected = (seg: Segment, w0: number, w1: number, q: vec2) => {
		let best = Infinity
		for (let i = 0; i <= 400; i++) {
			const t = i / 400
			const s = (w0 + (w1 - w0) * t) / 2
			const b = Segment.point(seg, {time: t})
			best = Math.min(best, vec2.distance(b, q) - s)
		}
		return best
	}

	test.each([
		[4, 16],
		[16, 4],
		[0, 12],
		[6, 6.5],
	])('fills around a curve tapering from %d to %d', (w0, w1) => {
		const p = curved(w0, w1)
		const seg = Curve.segments(p.curves[0])[0]
		const q = Path.offsetStroke(p, 'w', {lineCap: 'round', lineJoin: 'round'})
		expect(q.curves.every(c => c.closed)).toBe(true)
		for (const pt of grid) {
			const margin = expected(seg, w0, w1, pt)
			if (Math.abs(margin) < 1.2) continue
			expect(inside(q, pt)).toBe(margin < 0)
		}
	})

	it('widens through a corner', () => {
		const p: Path = {
			curves: [
				{
					closed: false,
					vertices: [
						{command: 'L', point: [20, 80], attrs: {w: 2}},
						{command: 'L', point: [50, 20], attrs: {w: 10}},
						{command: 'L', point: [80, 80], attrs: {w: 2}},
					],
				},
			],
		}
		const q = Path.offsetStroke(p, 'w', {lineJoin: 'round'})
		expect(q.curves.length).toBeGreaterThanOrEqual(1)
		expect(inside(q, [50, 22])).toBe(true)
		expect(inside(q, [50, 16])).toBe(true)
		expect(inside(q, [50, 13])).toBe(false)
		expect(inside(q, [21, 78.5])).toBe(true)
	})

	it('widens around a closed curve', () => {
		const p = Path.setAttribute(
			Path.subdivide(Path.circle([50, 50], 20), 4),
			'w',
			v => (v.point[0] > 50 ? 10 : 4)
		)
		const q = Path.offsetStroke(p, 'w')
		expect(inside(q, [50, 50])).toBe(false)
		expect(inside(q, [74, 50])).toBe(true)
		expect(inside(q, [26.5, 50])).toBe(false)
		expect(inside(q, [30, 50])).toBe(true)
	})

	it('does not leave its working attribute behind', () => {
		const p = Path.setAttribute(Path.line([10, 50], [90, 50]), 'w', 4)
		expect(JSON.stringify(Path.offsetStroke(p, 'w'))).not.toContain('__')
	})
})
