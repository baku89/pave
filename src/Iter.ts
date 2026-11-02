import {scalar} from 'linearly'

/**
 * Yields overlapping consecutive pairs from the iterable: [a,b], [b,c], ...
 * @param iter The input iterable.
 * @returns A generator yielding [previous, current] pairs.
 */
export function* pairwise<T>(iter: Iterable<T>): Generator<[T, T]> {
	let prev: T | undefined = undefined

	for (const value of iter) {
		if (prev !== undefined) {
			yield [prev, value]
		}

		prev = value
	}
}

/**
 * Yields tuples of values from the input generator, where its first element is the index of the value and the second one is the value itself.
 * @param iter The input generator.
 */
export function* enumerate<T>(iter: Iterable<T>): Generator<[number, T]> {
	let i = 0

	for (const value of iter) {
		yield [i, value]
		i++
	}
}

export interface ResampleOptions {
	/**
	 * The step size to use for resampling. If not provided, the step size will be calculated based on the `count` and `align` options.
	 * @default `to - from`
	 */
	step?: number
	/**
	 * How to align the resampled values.
	 * @default `'uniform'`
	 */
	align?: 'uniform' | 'start' | 'center' | 'end'
	/**
	 * The number of samples to generate.  If this is specified, the `step` will be ignored and the number will be distributed uniformly across the range.
	 * @default `undefined`
	 */
	count?: number
	/**
	 * Whether to emit the `from` value.
	 * @default `true`
	 */
	emitFrom?: boolean
	/**
	 * Whether to emit the `to` value.
	 * @default `true`
	 */
	emitTo?: boolean
}

export function* resample(
	from: number,
	to: number,
	{
		step,
		align = 'uniform',
		count,
		emitFrom = true,
		emitTo = true,
	}: ResampleOptions = {}
) {
	const diff = to - from

	if (step === undefined) {
		step = diff
	}

	let fromOffset = from

	if (count !== undefined) {
		count = Math.max(1, Math.floor(count))
		step = diff / count
	} else if (align === 'start' || align === 'center' || align === 'end') {
		count = Math.floor(Math.abs(diff / step))
		step *= Math.sign(diff)

		if (align === 'end') {
			fromOffset = to - count * step
		} else if (align === 'center') {
			fromOffset = scalar.lerp(from, to - count * step, 0.5)
		}
	} else {
		// align === 'uniform'
		count = Math.ceil(Math.abs(diff / step))
		step = diff / count
	}

	if (emitFrom) {
		yield from
	}

	if (from !== fromOffset) {
		yield fromOffset
	}

	for (let i = 1; i <= count; i++) {
		yield fromOffset + i * step
	}

	if (emitTo && !scalar.approx(fromOffset + count * step, to)) {
		yield to
	}
}
