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

// Define the gradient function
function gradient(f: (v: vec2) => number, v: vec2, h: number = 1e-5): vec2 {
	const [x, y] = v
	const df_dx = (f([x + h, y]) - f([x - h, y])) / (2 * h)
	const df_dy = (f([x, y + h]) - f([x, y - h])) / (2 * h)
	return [df_dx, df_dy]
}

// Define a function to perform the BFGS update
function bfgsUpdate(H: mat2, s: vec2, y: vec2): mat2 {
	const rho = 1 / vec2.dot(y, s)
	const sy: mat2 = [s[0] * y[0], s[0] * y[1], s[1] * y[0], s[1] * y[1]]
	const ys: mat2 = [y[0] * s[0], y[0] * s[1], y[1] * s[0], y[1] * s[1]]

	const term1 = mat2.scale(sy, rho)
	const term2 = mat2.sub(mat2.id, mat2.scale(mat2.mul(H, sy), rho))
	const term3 = mat2.sub(mat2.id, mat2.scale(mat2.mul(ys, H), rho))

	return mat2.add(H, term1, mat2.mul(term2, term3))
}

/**
 * Minimize a function of two variables using the BFGS method.
 * @param f The objective function to minimize
 * @param initial The initial guess
 * @returns The pair of vec2 that minimizes the function
 */
export const minimizeVec2 = (f: (v: vec2) => number, initial: vec2): vec2 => {
	const tolerance = 1e-6,
		maxIterations = 10000

	let v = initial
	let H = mat2.id
	let grad = gradient(f, v)

	for (let iter = 0; iter < maxIterations; iter++) {
		// Check for convergence
		if (Math.sqrt(grad[0] ** 2 + grad[1] ** 2) < tolerance) {
			break
		}

		// Calculate the search direction
		const invH = mat2.inv(H) ?? mat2.id
		const p = vec2.transformMat2(vec2.neg(grad), invH)

		// Perform line search (simple backtracking line search)
		let alpha = 1
		const c = 1e-4
		while (
			f(vec2.scaleAndAdd(v, p, alpha)) >
			f(v) + vec2.dot(p, grad) * c * alpha
		) {
			alpha *= 0.5
		}

		// Update the position
		const vNew = vec2.scaleAndAdd(v, p, alpha)
		const gradNew = gradient(f, vNew)

		// Update the Hessian approximation
		const s = vec2.sub(vNew, v)
		const y = vec2.sub(gradNew, grad)

		H = bfgsUpdate(H, s, y)

		// Update variables for next iteration
		v = vNew
		grad = gradNew
	}

	return v
}
