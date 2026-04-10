import {describe, expect, it} from 'vitest'

import {Distort} from './Distort'

describe('Distort.bulge', () => {
	it('is identity when strength is zero', () => {
		const center: [number, number] = [50, 50]
		const d = Distort.bulge(center, 40, 0)
		const p: [number, number] = [70, 50]
		const m = d(p)
		expect(m[4]).toBeCloseTo(p[0])
		expect(m[5]).toBeCloseTo(p[1])
	})
})
