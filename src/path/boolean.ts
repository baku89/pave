import {
	completeVertexAttrs,
	mergeAttrDefs,
	pushDownCurveAttrs,
	pushDownPathAttrs,
	withCurves,
} from '../attributes'
import {type Path} from '../index'
import {planarBoolean, type PlanarOperand} from './planar'

/**
 * @category Options
 */
export interface BooleanOptions {
	/**
	 * Upper bound of the distance at which points are regarded as the same. It must be well below the smallest feature of the paths, or thin ones collapse. By default it only depends on their extent.
	 */
	tolerance?: number
}

function toOperand(path: Path): PlanarOperand {
	return {curves: path.curves.map(curve => ({curve}))}
}

/**
 * Runs a boolean with attributes: curves get mixed up, so what the curves hold moves down to
 * the vertices. So does what the paths hold, unless there is only one path to keep it on.
 */
function runBoolean(
	paths: Path[],
	inside: (windings: number[]) => boolean,
	{tolerance}: BooleanOptions = {}
): Path {
	const attrDefs = mergeAttrDefs(paths)
	const single = paths.length === 1

	const operands = paths.map(path =>
		toOperand({
			curves: completeVertexAttrs(path).curves.map(curve =>
				pushDownCurveAttrs(single ? curve : pushDownPathAttrs(path, curve))
			),
		})
	)

	const {curves} = planarBoolean(operands, {
		inside,
		assemble: 'closed',
		attrDefs,
		...(tolerance === undefined ? {} : {tolerance}),
	})

	return single
		? withCurves(paths[0], curves)
		: attrDefs
			? {curves, attrDefs}
			: {curves}
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
export function unite(paths: Path[], options?: BooleanOptions): Path {
	return runBoolean(paths, w => w.some(x => x !== 0), options)
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
export function subtract(
	subject: Path,
	tools: Path[],
	options?: BooleanOptions
): Path {
	return runBoolean(
		[subject, ...tools],
		w => w[0] !== 0 && w.slice(1).every(x => x === 0),
		options
	)
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
export function intersect(paths: Path[], options?: BooleanOptions): Path {
	if (paths.length === 0) return {curves: []}
	return runBoolean(paths, w => w.every(x => x !== 0), options)
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
export function exclude(paths: Path[], options?: BooleanOptions): Path {
	return runBoolean(
		paths,
		w => w.filter(x => x !== 0).length % 2 === 1,
		options
	)
}
