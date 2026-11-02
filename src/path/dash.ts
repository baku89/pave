import {scalar} from 'linearly'

import {completeVertexAttrs, withCurves} from '../attributes'
import {Curve, type Path} from '../index'
import type {AttributeDefs} from './types'

/**
 * An options for {@link Path.dash}
 * @category Options
 */
export interface DashOptions {
	/**
	 * The distance into the pattern at which each curve starts, like `stroke-dashoffset` of SVG. A negative value shifts the pattern the other way.
	 * @default 0
	 */
	offset?: number
}

/**
 * Cuts the path into dashes, with the semantics of `stroke-dasharray` of SVG: the pattern is a sequence of alternating on and off lengths along the arc length, repeated as far as each curve goes. An odd number of lengths is repeated to make it even. A pattern that is empty or adds up to zero leaves the path as it is.
 *
 * Every curve starts the pattern afresh at its first vertex. On a closed curve, the dash running over the seam between the last and the first vertex is joined into one, and a curve shorter than its first dash stays closed. The dashes are open curves, keeping the attributes of the ranges they were cut from.
 * @param path The path to dash
 * @param pattern The lengths of the dashes and the gaps between them, which must not be negative
 * @param options The options
 * @returns The path consists of the dashes
 * @category Modifiers
 * @example
 * ```js:pave
 * const c = Path.circle([50, 50], 40)
 * stroke(Path.dash(c, [10, 5]))
 * ```
 */
export function dash(
	path: Path,
	pattern: readonly number[],
	{offset = 0}: DashOptions = {}
): Path {
	if (pattern.some(x => !(x >= 0))) {
		throw new Error('Dash pattern must not contain negative values')
	}

	const lengths = pattern.length % 2 === 1 ? [...pattern, ...pattern] : pattern
	const period = lengths.reduce((sum, x) => sum + x, 0)

	if (lengths.length === 0 || period <= 0) return path

	path = completeVertexAttrs(path)

	return withCurves(
		path,
		path.curves.flatMap(curve =>
			dashCurve(curve, lengths, period, offset, path.attrDefs)
		)
	)
}

function dashCurve(
	curve: Curve,
	lengths: readonly number[],
	period: number,
	offset: number,
	attrDefs?: AttributeDefs
): Curve[] {
	if (curve.vertices.length === 0) return []

	const total = Curve.length(curve)

	// Where in the pattern the curve starts
	let index = 0
	let into = scalar.mod(offset, period)
	while (into > 0 && into >= lengths[index]) {
		into -= lengths[index]
		index = (index + 1) % lengths.length
	}

	if (total <= 0) {
		// Nothing to cut: the curve stays as a whole when it starts on a dash
		return index % 2 === 0 ? [curve] : []
	}

	// The ranges of the dashes in arc length
	const ranges: [from: number, to: number][] = []
	let cursor = 0
	let remaining = lengths[index] - into

	while (cursor < total) {
		const end = Math.min(cursor + remaining, total)
		if (index % 2 === 0) {
			ranges.push([cursor, end])
		}
		cursor = end
		index = (index + 1) % lengths.length
		remaining = lengths[index]
	}

	if (ranges.length === 0) return []

	const wholeCurve =
		ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === total

	if (wholeCurve) return [curve]

	const dashes = ranges.map(([from, to]) =>
		Curve.trim(curve, {offset: from}, {offset: to}, attrDefs)
	)

	// Join the dash over the seam of a closed curve with the one at its start
	if (
		curve.closed &&
		dashes.length >= 2 &&
		ranges[0][0] === 0 &&
		ranges[ranges.length - 1][1] === total
	) {
		const first = dashes.shift()!
		const last = dashes.pop()!
		dashes.push({
			...last,
			vertices: [...last.vertices, ...first.vertices.slice(1)],
		})
	}

	return dashes
}
