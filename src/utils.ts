import {mat2, scalar, vec2} from 'linearly'

export function toFixedSimple(a: number, fractionDigits = 2): string {
	return a
		.toFixed(fractionDigits)
		.replace(/(?:\.0+$)|(?:(\.[0-9]*?)0+$)/, '$1')
		.replace(/^(-?)0\./, '$1.')
}

export function normalizeOffset(offset: number, max: number) {
	return scalar.clamp(offset >= 0 ? offset : max + offset, 0, max)
}

/**
 * Normalize an index to the range 0 to length - 1. Negative values are interpreted as offsets from the end. If the index is out of bounds, it is clamped to the nearest bound.
 */
export function normalizeIndex(index: number, length: number) {
	return scalar.clamp(index >= 0 ? index : length + index, 0, length - 1)
}

/**
 * Memoizes a function that takes a single object argument, using a WeakMap.
 */
export function memoize<Arg extends object, ReturnType>(
	f: (arg: Arg) => ReturnType
): (arg: Arg) => ReturnType {
	const cache = new WeakMap<Arg, ReturnType>()

	return arg => {
		if (cache.has(arg)) {
			return cache.get(arg)!
		} else {
			const result = f(arg)
			cache.set(arg, result)
			return result
		}
	}
}

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

const gradientVec2 = (
	f: ([x, y]: vec2) => number,
	[x, y]: vec2,
	h: number = 1e-5
): vec2 => {
	const df_dx = (f([x + h, y]) - f([x - h, y])) / (2 * h)
	const df_dy = (f([x, y + h]) - f([x, y - h])) / (2 * h)
	return [df_dx, df_dy]
}

const outerVec2 = (a: vec2, b: vec2): mat2 => [
	a[0] * b[0],
	a[0] * b[1],
	a[1] * b[0],
	a[1] * b[1],
]

/**
 * Minimize a function of two variables using the BFGS method.
 * @param f The objective function to minimize
 * @param initial The initial guess
 * @returns The pair of vec2 that minimizes the function
 */
export const minimizeVec2 = (f: (v: vec2) => number, initial: vec2): vec2 => {
	const maxIter = 100
	const tolerance = 1e-8

	let current: vec2 = initial
	let Hk: mat2 = mat2.id

	let iter

	for (iter = 0; iter < maxIter; iter++) {
		const grad = gradientVec2(f, current)

		if (vec2.len(grad) < tolerance) break

		// Calculate the descent direction using the approximate inverse Hessian
		const pk = vec2.neg(vec2.transformMat2(grad, Hk)) // pk = -Hk * grad

		// Update the position
		current = vec2.add(current, pk)

		// Calculate yk = gradient(f, next) - gradient(f, current)
		const yk = vec2.sub(gradientVec2(f, current), grad)

		const rho = 1.0 / vec2.dot(yk, pk)

		// BFGS update
		const term1 = mat2.sub(mat2.ident, mat2.scale(outerVec2(pk, yk), rho))
		const term2 = mat2.sub(mat2.ident, mat2.scale(outerVec2(yk, pk), rho))
		const term3 = mat2.scale(outerVec2(pk, pk), rho)

		Hk = mat2.add(mat2.mul(term1, Hk, term2), term3)
	}

	return current
}
