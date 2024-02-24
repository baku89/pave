import {resample, toFixedSimple} from './utils'

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

describe('resample', () => {
	it('yield `to` when `from` and `to` are the same', () => {
		const result = [...resample(0, 0)]
		expect(result).toEqual([0])
	})

	it('yield `to` when `from` and `to` are the same', () => {
		const result = [...resample(0, -0)]
		expect(result).toEqual([0])
	})
})
