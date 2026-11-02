import type {Curve} from './Curve'

export type CurveGroup =
	| number
	| number[]
	| Set<number>
	| ((curve: Curve, index: number) => boolean)

export * as CurveGroup from './ns/CurveGroup'
