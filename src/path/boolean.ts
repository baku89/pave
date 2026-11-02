import {type Path} from '../index'
import {planarBoolean, type PlanarOperand} from './planar'

function toOperand(path: Path): PlanarOperand {
	return {curves: path.curves.map(curve => ({curve}))}
}

/**
 * Unites the given paths (non-zero winding). Passing a single path removes its self-intersections and normalizes the orientation of its curves.
 * @param paths The paths to unite
 * @returns The resulting path
 * @category Boolean Operations
 * @example
 * ```js:pave
 * const a = Path.circle([40, 50], 30)
 * const b = Path.rect([40, 30], [90, 70])
 * stroke(a, 'skyblue')
 * stroke(b, 'skyblue')
 * stroke(Path.unite([a, b]), 'tomato')
 * ```
 */
export function unite(paths: Path[]): Path {
	return planarBoolean(paths.map(toOperand), {
		inside: w => w.some(x => x !== 0),
		assemble: 'closed',
	})
}

/**
 * Subtracts the tools from the subject.
 * @param subject The target path to be subtracted
 * @param tools The paths to subtract
 * @returns The resulting path
 * @category Boolean Operations
 * @example
 * ```js:pave
 * const a = Path.circle([40, 50], 30)
 * const b = Path.rect([40, 30], [90, 70])
 * stroke(a, 'skyblue')
 * stroke(b, 'skyblue')
 * stroke(Path.subtract(a, [b]), 'tomato')
 * ```
 */
export function subtract(subject: Path, tools: Path[]): Path {
	return planarBoolean([subject, ...tools].map(toOperand), {
		inside: w => w[0] !== 0 && w.slice(1).every(x => x === 0),
		assemble: 'closed',
	})
}

/**
 * Intersects the given paths, keeping only the region inside all of them.
 * @param paths The paths to intersect
 * @returns The resulting path
 * @category Boolean Operations
 * @example
 * ```js:pave
 * const a = Path.circle([40, 50], 30)
 * const b = Path.rect([40, 30], [90, 70])
 * stroke(a, 'skyblue')
 * stroke(b, 'skyblue')
 * stroke(Path.intersect([a, b]), 'tomato')
 * ```
 */
export function intersect(paths: Path[]): Path {
	if (paths.length === 0) return {curves: []}
	return planarBoolean(paths.map(toOperand), {
		inside: w => w.every(x => x !== 0),
		assemble: 'closed',
	})
}

/**
 * Excludes the overlapping regions, keeping the region inside an odd number of paths (XOR).
 * @param paths The paths to exclude
 * @returns The resulting path
 * @category Boolean Operations
 * @example
 * ```js:pave
 * const a = Path.circle([40, 50], 30)
 * const b = Path.rect([40, 30], [90, 70])
 * stroke(a, 'skyblue')
 * stroke(b, 'skyblue')
 * stroke(Path.exclude([a, b]), 'tomato')
 * ```
 */
export function exclude(paths: Path[]): Path {
	return planarBoolean(paths.map(toOperand), {
		inside: w => w.filter(x => x !== 0).length % 2 === 1,
		assemble: 'closed',
	})
}
