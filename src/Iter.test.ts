import {describe, expect, it} from 'vitest'

import {Iter} from './index'

describe('resample', () => {
	it('yield `to` when `from` and `to` are the same', () => {
		const result = [...Iter.resample(0, 0, {emitFrom: false})]
		expect(result).toEqual([0])
	})
})
