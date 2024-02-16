import {vec2} from 'linearly'

import {Command} from './Path'
import {Segment} from './Segment'

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

export function memoizeSegmentFunction<C extends Command, T>(
	f: (segment: Segment<C>) => T
) {
	const cache = new WeakMap<vec2, WeakMap<Command, WeakMap<vec2, T>>>()

	return (segment: Segment<C>): T => {
		const {start, command, end} = segment

		if (!cache.has(start)) {
			cache.set(start, new WeakMap())
		}

		const cache1 = cache.get(start)!

		if (!cache1.has(command)) {
			cache1.set(command, new WeakMap())
		}

		const cache2 = cache1.get(command)!

		if (!cache2.has(end)) {
			cache2.set(end, f(segment))
		}

		return cache2.get(end)!
	}
}
