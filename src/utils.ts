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

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * Iterates over a range between `from` and `to` with a given `step`, while avoiding infinite loops.
 */
export function* iterateRange(
	from: number,
	to: number,
	step: number,
	maxCount = 100_000_000
): Generator<number> {
	if (from === to) {
		// If the range is empty
		yield from
		return
	}

	// Check if the iteration is too large, and if so, clamp the step

	const count =
		step === 0
			? maxCount
			: Math.min(Math.ceil(Math.abs(to - from) / step), maxCount)

	step = (to - from) / count

	for (let i = 0; i <= count; i++) {
		yield from + i * step
	}
}
