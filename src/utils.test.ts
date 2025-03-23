import {vec2} from 'linearly'
import {describe, expect, it} from 'vitest'

import {minimizeVec2, toFixedSimple} from './utils'

describe('toFixedSimple', () => {
	it('should work', () => {
		expect(toFixedSimple(0.0, 2)).toEqual('0')
		expect(toFixedSimple(0.000001, 2)).toEqual('0')
		expect(toFixedSimple(0.1, 0)).toEqual('0')
		expect(toFixedSimple(0.6, 0)).toEqual('1')
		expect(toFixedSimple(-0, 2)).toEqual('0')
		expect(toFixedSimple(0.1, 2)).toEqual('.1')
		expect(toFixedSimple(-0.1, 2)).toEqual('-.1')
		expect(toFixedSimple(40000.25, 2)).toEqual('40000.25')
		expect(toFixedSimple(0.019, 2)).toEqual('.02')
	})
})

describe('minimizeVec2', () => {
	it('should minimize the function', () => {
		const f = (v: vec2) => vec2.sqrDist(v, [-2.2, 2])
		const initial: vec2 = [0.1, -200]
		const result = minimizeVec2(f, initial)
		expect(result).toEqual([-2.2, 2])
	})
})
