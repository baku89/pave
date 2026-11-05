import {mat2d, type vec2} from 'linearly'
import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {bulge, twirl, wave} from './path/distortions'
import {transform} from './path/modifiers'

const line = Path.line([0, 7], [100, 13])
const moved = (path: Path, by: vec2) => transform(path, mat2d.fromTranslation(by))
const expectSame = (a: Path, b: Path) => {
	const [pa, pb] = [Path.bounds(a), Path.bounds(b)]
	expect(pa[0][0]).toBeCloseTo(pb[0][0], 3)
	expect(pa[0][1]).toBeCloseTo(pb[0][1], 3)
	expect(pa[1][0]).toBeCloseTo(pb[1][0], 3)
	expect(pa[1][1]).toBeCloseTo(pb[1][1], 3)
	const [x, y] = Path.point(a, {unit: 0.37})
	const [u, v] = Path.point(b, {unit: 0.37})
	expect(x).toBeCloseTo(u, 1)
	expect(y).toBeCloseTo(v, 1)
}

describe('wave', () => {
	const by: vec2 = [33, -21]

	it('goes with its origin, when that moves as much as the path', () => {
		expectSame(
			wave(moved(line, by), 6, 24, {origin: by}),
			moved(wave(line, 6, 24), by)
		)
	})

	it('goes with its origin at any angle and phase', () => {
		const origin: vec2 = [10, 5]
		const options = {angle: 30, phase: 40}
		expectSame(
			wave(moved(line, by), 6, 24, {
				...options,
				origin: [origin[0] + by[0], origin[1] + by[1]],
			}),
			moved(wave(line, 6, 24, {...options, origin}), by)
		)
	})

	it('starts its phase at the origin', () => {
		const {curves} = wave(Path.line([0, 0], [1e-3, 0]), 6, 24, {
			origin: [6, 0],
		})
		// A quarter of a wave before the origin is the bottom of it.
		expect(curves[0].vertices[0].point[1]).toBeCloseTo(-6, 3)
	})

	it('turns by degrees', () => {
		// At 90, it goes along y and pushes along x.
		const [x] = wave(Path.line([0, 6], [0, 6.001]), 5, 24, {angle: 90})
			.curves[0].vertices[0].point
		expect(Math.abs(x)).toBeCloseTo(5, 3)
	})

	it('is as it was with nothing said', () => {
		const [, y] = wave(Path.line([6, 0], [6.001, 0]), 5, 24).curves[0]
			.vertices[0].point
		expect(y).toBeCloseTo(5, 3)
	})
})

describe('how finely a distortion goes', () => {
	const curve = Path.circle([0, 0], 50)
	const count = (path: Path) =>
		path.curves.reduce((sum, c) => sum + c.vertices.length, 0)

	it('goes no deeper than it is told', () => {
		const fine = {tolerance: 1e-6}
		expect(count(twirl(curve, [0, 0], 60, 200, {...fine, maxDepth: 1}))).toBeLessThan(
			count(twirl(curve, [0, 0], 60, 200, {...fine, maxDepth: 6}))
		)
		expect(count(bulge(curve, [10, 0], 60, 0.8, {...fine, maxDepth: 0}))).toBe(
			count(Path.toCubicBezier(curve, fine.tolerance))
		)
	})
})
