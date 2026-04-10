import paper from 'paper'

import type {Path} from '../Path'
import {fromPaperPath, toPaperPath} from './paper'

/**
 * Unites the given paths.
 * @param paths The paths to unite
 * @returns The resulting path
 * @category Boolean Operations
 */
export function unite(paths: Path[]): Path {
	const paperPath = paths
		.map(toPaperPath)
		.reduce(
			(merged, p) => merged.unite(p, {insert: false}) as paper.CompoundPath,
			new paper.CompoundPath({})
		)

	return fromPaperPath(paperPath)
}

/**
 * Subtracts the tools from the subject.
 * @param subject The target path to be subtracted
 * @param tools The paths to subtract
 * @returns The resulting path
 * @category Boolean Operations
 */
export function subtract(subject: Path, tools: Path[]): Path {
	// const [subject, ...tools] = paths.map(toPaperPath)

	const paperSubject = toPaperPath(subject)
	const paperTools = tools.map(toPaperPath)

	const paperPath = paperTools.reduce(
		(merged, p) => merged.subtract(p, {insert: false}) as paper.CompoundPath,
		paperSubject
	)

	return fromPaperPath(paperPath)
}
