import {scalar} from 'linearly'

export type Iter = Generator<number>

export namespace Iter {
	/**
	 * Iterates over a range between `from` and `to` with a given `step`, while avoiding infinite loops.
	 */
	export function* range(
		from: number,
		to: number,
		step: number,
		maxCount = 100_000_000
	): Iter {
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

	export interface ResampleOptions {
		step?: number
		align?: 'uniform' | 'start' | 'center' | 'end'
		count?: number
	}

	export function* resample(
		from: number,
		to: number,
		{step, align = 'start', count}: ResampleOptions = {}
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

		if (from !== fromOffset) {
			yield fromOffset
		}

		for (let i = 1; i <= count; i++) {
			yield fromOffset + i * step
		}

		if (from === to || fromOffset + count * step !== to) {
			yield to
		}
	}
}
