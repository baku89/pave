import {expect} from 'vitest'

const EPSILON = 1e-4

function nearlyEqual(a: number, b: number) {
	return (
		Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) ||
		undefined
	)
}

expect.addEqualityTesters([nearlyEqual])

// Mocking canvas for Paper.js
HTMLCanvasElement.prototype.getContext = () =>
	({
		save: () => undefined,
		restore: () => undefined,
	}) as unknown as any
