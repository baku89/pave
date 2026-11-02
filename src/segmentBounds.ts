/**
 * Numerically stable bounding boxes of sub-ranges of a segment, without re-deriving an
 * SVG arc from a tiny chord (which loses the center). Used by the planar boolean engine
 * for subdivision-based intersection and winding computation.
 */
import {Rect} from 'geome'
import {mat2d, scalar, vec2} from 'linearly'

import {Arc, CubicBezier, type Segment} from './index'

function arcRangeBounds(
	seg: Segment & {command: 'A'},
	t0: number,
	t1: number
): Rect {
	const {center, radii, angles, xAxisRotation} =
		Arc.toCenterParameterization(seg)
	const xform = mat2d.trs(center, xAxisRotation, radii)
	const rMax = Math.max(radii[0], radii[1])
	const at = (t: number) =>
		vec2.transformMat2d(
			vec2.direction(scalar.lerp(angles[0], angles[1], t)),
			xform
		)

	const totalDeg = Math.abs(angles[1] - angles[0]) * (t1 - t0)
	const pieces = Math.max(1, Math.ceil(totalDeg / 90))
	let rect: Rect | null = null

	for (let i = 0; i < pieces; i++) {
		const u0 = t0 + ((t1 - t0) * i) / pieces
		const u1 = t0 + ((t1 - t0) * (i + 1)) / pieces
		const pa = at(u0)
		const pb = at(u1)
		// Sagitta bound: a ≤ 90° piece stays within r·Δ²/8 of its chord
		const delta = scalar.rad(totalDeg / pieces)
		const pad = (rMax * delta * delta) / 8
		const piece: Rect = [
			[Math.min(pa[0], pb[0]) - pad, Math.min(pa[1], pb[1]) - pad],
			[Math.max(pa[0], pb[0]) + pad, Math.max(pa[1], pb[1]) + pad],
		]
		rect = rect ? Rect.unite(rect, piece) : piece
	}

	return rect!
}

/**
 * Bounding box of the part of `seg` on the time range [t0, t1].
 */
export function rangeBounds(seg: Segment, t0: number, t1: number): Rect {
	if (seg.command === 'L') {
		return Rect.fromPoints(
			vec2.lerp(seg.start, seg.point, t0),
			vec2.lerp(seg.start, seg.point, t1)
		)
	}
	if (seg.command === 'C') {
		return CubicBezier.bounds(CubicBezier.trim(seg, {time: t0}, {time: t1}))
	}
	if (Arc.isStraight(seg)) {
		// Must shrink with the range, or a recursive subdivision around it never ends
		return Rect.fromPoints(
			Arc.point(seg, {time: t0}),
			Arc.point(seg, {time: t1})
		)
	}
	return arcRangeBounds(seg, t0, t1)
}
