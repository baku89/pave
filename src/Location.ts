/**
 * Represents a location on a single segment
 */
export type SegmentLocation =
	| UnitSegmentLocation
	| OffsetSegmentLocation
	| TimeSegmentLocation

export type UnitSegmentLocation = number | {unit: number}
export type OffsetSegmentLocation = {offset: number}
export type TimeSegmentLocation = {time: number}

/**
 * Represents a location on a single curve
 */
export type CurveLocation =
	| UnitCurveLocation
	| OffsetCurveLocation
	| TimeCurveLocation

type CurveLocationIndices = {
	segmentIndex?: number
}

export type UnitCurveLocation = number | ({unit: number} & CurveLocationIndices)
export type OffsetCurveLocation = OffsetSegmentLocation & CurveLocationIndices
export type TimeCurveLocation = TimeSegmentLocation & CurveLocationIndices

type PathLocationIndices = {
	curveIndex?: number
	segmentIndex?: number
}

/**
 * Represents a location on a path
 */
export type PathLocation =
	| UnitPathLocation
	| OffsetPathLocation
	| TimePathLocation

export type UnitPathLocation = number | ({unit: number} & PathLocationIndices)
export type OffsetPathLocation = OffsetSegmentLocation & PathLocationIndices
export type TimePathLocation = TimeSegmentLocation & PathLocationIndices
