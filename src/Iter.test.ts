import {Iter} from './Iter'

describe('resample', () => {
	it('yield `to` when `from` and `to` are the same', () => {
		const result = [...Iter.resample(0, 0)]
		expect(result).toEqual([0])
	})
})
