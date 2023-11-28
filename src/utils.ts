export function toFixedSimple(a: number, fractionDigits = 2): string {
	return a
		.toFixed(fractionDigits)
		.replace(/(?:\.0+$)|(?:(\.[0-9]*?)0+$)/, '$1')
		.replace(/^(-?)0\./, '$1.')
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
