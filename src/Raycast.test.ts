import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {raycast} from './path/raycast'

describe('raycast', () => {
	const circle = Path.circle([0, 0], 100)

	it('hits a circle twice from outside', () => {
		const hits = raycast(circle, [-300, 0], [1, 0])
		expect(hits).toHaveLength(2)
		expect(hits[0].distance).toBeCloseTo(200, 4)
		expect(hits[1].distance).toBeCloseTo(400, 4)
		expect(hits[0].point).toEqual([-100, 0])
		expect(hits[0].front).not.toBe(hits[1].front)
	})

	it('hits once from inside and respects maxDistance', () => {
		expect(raycast(circle, [0, 0], [0, 1])).toHaveLength(1)
		expect(raycast(circle, [0, 0], [0, 1], {maxDistance: 50})).toHaveLength(0)
	})

	it('reports hits behind the origin with both', () => {
		const hits = raycast(circle, [0, 0], [1, 0], {both: true})
		expect(hits.map(h => h.distance)).toEqual([-100, 100])
	})

	it('reports a vertex hit once', () => {
		const square = Path.rect([0, 0], [100, 100])
		const hits = raycast(square, [-50, 0], [1, 0])
		expect(hits).toHaveLength(2)
	})

	it('returns nothing when missing', () => {
		expect(raycast(circle, [0, 300], [1, 0])).toHaveLength(0)
	})
})
