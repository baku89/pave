import {Curve} from './Curve'
import {Path} from './Path'

export type CurveGroup =
	| number
	| number[]
	| Set<number>
	| ((curve: Curve, index: number) => boolean)

export namespace CurveGroup {
	export function getMatcher(
		group: CurveGroup,
		path: Path
	): (curve: Curve, index: number) => boolean {
		if (typeof group === 'function') {
			return group
		}

		if (typeof group === 'number') {
			group = [group]
		} else if (group instanceof Set) {
			group = [...group]
		}

		group = group.map(i => (i >= 0 ? i : path.curves.length - i))
		const indices = new Set(group)

		return (_: Curve, index: number): boolean => {
			return indices.has(index)
		}
	}
}
