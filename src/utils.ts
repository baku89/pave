import {scalar} from 'linearly'

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
