export type SegmentLocation =
	| UnitSegmentLocation
	| OffsetSegmentLocation
	| TimeSegmentLocation

export type UnitSegmentLocation = number | {unit: number}
export type OffsetSegmentLocation = {offset: number}
export type TimeSegmentLocation = {time: number}

export type LocationIndices = {
	curveIndex: number
	segmentIndex: number
}

export type Location = UnitLocation | OffsetLocation | TimeLocation

export type UnitLocation = number | ({unit: number} & Partial<LocationIndices>)
export type OffsetLocation = OffsetSegmentLocation & Partial<LocationIndices>
export type TimeLocation = TimeSegmentLocation & Partial<LocationIndices>
