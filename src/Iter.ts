import {scalar} from 'linearly'

export type Iter = Generator<number>

export namespace Iter {
	/**
	 * Iterates over a range between [from, to) with a given `step`, while avoiding infinite loops.
	 * @param from The start of the range.
	 * @param to The end of the range.
	 * @param step The step size.
	 * @param maxCount The maximum number of values to yield.
	 * @returns A generator that yields values in the range.
	 */
	export function* range(
		from: number,
		to: number,
		step: number,
		maxCount = 1_000_000
	): Iter {
		if (from === to) {
			// If the range is empty
			yield from
			return
		}

		// Check if the iteration is too large, and if so, clamp the step
		if (step === 0) {
			step = Math.sign(to - from)
		}

		step = Math.sign(to - from) * Math.abs(step)

		let count = Math.abs((to - from) / step)

		if (count > maxCount) {
			step *= count / maxCount
			count = maxCount
		}

		for (let i = 0; i <= count; i++) {
			yield from + i * step
		}
	}

	/**
	 * Yield `from`, `to`, and values between them with a given `step` and `offset`. It avoids infinite loops by clamping the number of iterations.
	 * @param from The start of the range.
	 * @param to The end of the range.
	 * @param step The step size.
	 * @param offset The offset to apply to the range.
	 * @param maxCount The maximum number of values to yield.
	 */
	export function* rangeWithOffset(
		from: number,
		to: number,
		step: number,
		offset: number,
		maxCount?: number
	): Iter {
		offset = ((offset % step) + step) % step

		if (offset !== 0) {
			yield from
		}

		for (const value of range(from + offset, to, step, maxCount)) {
			yield value
		}

		if (offset !== 0) {
			yield to
		}
	}

	/**
	 * Yields tuples of values from the input generator, where each tuple contains the current and previous values.
	 * @param iter The input generator.
	 * @returns A generator that yields tuples of values.
	 */
	export function* tuple<T>(iter: Iterable<T>): Generator<[T, T]> {
		let prev: T | undefined = undefined

		for (const value of iter) {
			if (prev !== undefined) {
				yield [prev, value]
			}

			prev = value
		}
	}

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
}
