import {expect} from '@jest/globals'

const EPSILON = 1e-4

function nearlyEqual(a: number, b: number) {
	return (
		Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) ||
		undefined
	)
}

expect.addEqualityTesters([nearlyEqual])
