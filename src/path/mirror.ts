/**
 * Mirror symmetrization across a straight axis.
 *
 * Each curve is cut where it crosses the axis, everything off the kept side is dropped, and
 * every remaining chain is joined with its reversed reflection at the axis. No boolean
 * operation is involved: a chain and its reversed reflection have the same orientation as
 * the source, and a ray parallel to the axis meets only kept chains, so the winding number
 * of the result equals that of the source at every point on the kept side. Holes therefore
 * stay holes, for both fill rules and even for self-intersecting input.
 */
import {Line as AxisLine} from 'geome'
import {scalar, vec2} from 'linearly'

import {completeVertexAttrs, segmentToVertex, withCurves} from '../attributes'
import {Arc, Curve, type Path, Segment, type SegmentC} from '../index'
import {solveCubic} from '../numeric'
import {transform} from './modifiers'
import type {AttributeDefs, Vertex} from './types'

/**
 * The axis of a reflection. Either a directed line of geome, or two distinct points on the line. Two points `[p1, p2]` give the line whose normal is the direction from `p1` to `p2` rotated by +90° (x+ towards y+).
 * @category Types
 */
export type MirrorAxis = AxisLine | readonly [vec2, vec2]

/** Parameters shorter than this at a segment end are regarded as the end itself. */
const TIME_EPSILON = 1e-9

/** Tolerance for "on the axis", relative to the magnitude of the coordinates. */
const RELATIVE_EPSILON = 1e-9

function toLine(axis: MirrorAxis): AxisLine {
	if ('theta' in axis) return axis

	const line = AxisLine.fromPoints(axis[0], axis[1])
	if (!line) {
		throw new Error('The mirror axis needs two distinct points')
	}
	return line
}

/** Signed distance from the axis; positive on the side its normal points to. */
function signedDistanceFn(line: AxisLine) {
	const [nx, ny] = vec2.dir(line.theta)
	return (p: vec2) => nx * p[0] + ny * p[1] - line.offset
}

/**
 * Parameters in (0, 1) where the segment may cross the axis, ascending. Tangent contacts can
 * be included; the classification in {@link splitBySide} merges them away.
 */
function crossingTimes(
	seg: Segment,
	distance: (p: vec2) => number,
	line: AxisLine,
	epsilon: number
): number[] {
	if (seg.command === 'L') {
		const d0 = distance(seg.start)
		const d1 = distance(seg.point)
		return Math.abs(d0) > epsilon && Math.abs(d1) > epsilon && d0 * d1 < 0
			? [d0 / (d0 - d1)]
			: []
	}

	if (seg.command === 'C') {
		return cubicCrossingTimes(seg, distance, epsilon)
	}

	// x(θ) = center + X cos θ + Y sin θ, so that the distance is C + P cos θ + Q sin θ
	const {center, radii, angles, xAxisRotation} =
		Arc.toCenterParameterization(seg)
	const [nx, ny] = vec2.dir(line.theta)
	const c = scalar.cos(xAxisRotation)
	const s = scalar.sin(xAxisRotation)
	const P = radii[0] * (nx * c + ny * s)
	const Q = radii[1] * (ny * c - nx * s)
	const C = distance(center)
	const amplitude = Math.hypot(P, Q)

	if (Math.abs(C) > amplitude + epsilon || amplitude <= epsilon) return []

	const phi = scalar.deg(Math.atan2(Q, P))
	const delta = scalar.deg(Math.acos(scalar.clamp(-C / amplitude, -1, 1)))
	const [a0, a1] = angles

	const times: number[] = []
	for (const theta of [phi - delta, phi + delta]) {
		// The swept range can start anywhere, so try every turn that may fall inside it
		const turn = Math.round((a0 - theta) / 360)
		for (let k = turn - 1; k <= turn + 1; k++) {
			times.push((theta + 360 * k - a0) / (a1 - a0))
		}
	}
	return times.sort((a, b) => a - b)
}

function cubicCrossingTimes(
	seg: SegmentC,
	distance: (p: vec2) => number,
	epsilon: number
): number[] {
	const d0 = distance(seg.start)
	const d1 = distance(seg.args[0])
	const d2 = distance(seg.args[1])
	const d3 = distance(seg.point)

	return solveCubic(
		-d0 + 3 * d1 - 3 * d2 + d3,
		3 * d0 - 6 * d1 + 3 * d2,
		3 * (d1 - d0),
		d0,
		0,
		1,
		epsilon
	)
}

/**
 * Cuts the segment at its axis crossings into pieces that are entirely kept or dropped.
 * Adjacent pieces of the same kind are merged. Pieces on the axis itself count as dropped.
 */
function splitBySide(
	seg: Segment,
	distance: (p: vec2) => number,
	line: AxisLine,
	epsilon: number,
	attrDefs?: AttributeDefs
): {seg: Segment; keep: boolean}[] {
	// A degenerate arc is drawn as a straight line
	if (seg.command === 'A' && Arc.isStraight(seg)) {
		seg = {
			command: 'L',
			start: seg.start,
			point: seg.point,
			...(seg.attrs ? {attrs: seg.attrs} : {}),
			...(seg.startAttrs ? {startAttrs: seg.startAttrs} : {}),
		}
	}

	const times = [
		0,
		...crossingTimes(seg, distance, line, epsilon).filter(
			t => t > TIME_EPSILON && t < 1 - TIME_EPSILON
		),
		1,
	]

	const spans: {from: number; to: number; keep: boolean}[] = []
	for (let i = 0; i + 1 < times.length; i++) {
		const from = times[i]
		const to = times[i + 1]
		const mid = Segment.point(seg, {time: (from + to) / 2})
		const keep = distance(mid) > epsilon

		const last = spans.at(-1)
		if (last?.keep === keep) {
			last.to = to
		} else {
			spans.push({from, to, keep})
		}
	}

	return spans.map(({from, to, keep}) => ({
		seg:
			from === 0 && to === 1
				? seg
				: ({
						...Segment.trim(seg, {time: from}, {time: to}, attrDefs),
						...(from === 0 ? {start: seg.start} : {}),
						...(to === 1 ? {point: seg.point} : {}),
					} as Segment),
		keep,
	}))
}

function mirrorCurve(
	curve: Curve,
	line: AxisLine,
	distance: (p: vec2) => number,
	reflectCurve: (curve: Curve) => Curve,
	epsilon: number,
	attrDefs?: AttributeDefs
): Curve[] {
	let pieces = Curve.segments(curve)
		.filter(seg => !Segment.isZero(seg))
		.flatMap(seg => splitBySide(seg, distance, line, epsilon, attrDefs))

	if (curve.closed) {
		if (pieces.every(piece => piece.keep)) {
			return pieces.length > 0 ? [curve, reflectCurve(curve)] : []
		}

		// Start right after a dropped piece, so that no chain wraps around the seam
		const firstDropped = pieces.findIndex(piece => !piece.keep)
		pieces = [...pieces.slice(firstDropped), ...pieces.slice(0, firstDropped)]
	}

	const curves: Curve[] = []
	let chain: Segment[] = []
	let cutAtStart = false

	const flush = (cutAtEnd: boolean) => {
		if (chain.length === 0) return

		// A chain ends on the axis at a cut, or where an open curve itself ends on it
		const startsOnAxis =
			cutAtStart || Math.abs(distance(chain[0].start)) <= epsilon
		const endsOnAxis =
			cutAtEnd || Math.abs(distance(chain.at(-1)!.point)) <= epsilon

		curves.push(
			...joinChain(chain, startsOnAxis, endsOnAxis, line, reflectCurve)
		)
		chain = []
	}

	pieces.forEach((piece, i) => {
		if (piece.keep) {
			if (chain.length === 0) cutAtStart = i > 0
			chain.push(piece.seg)
		} else {
			flush(true)
		}
	})
	flush(curve.closed)

	return curves
}

/**
 * Joins a chain with its reversed reflection at whichever of its ends lie on the axis. Those
 * ends are projected onto the axis, so that both halves meet at exactly the same point.
 */
function joinChain(
	chain: Segment[],
	startsOnAxis: boolean,
	endsOnAxis: boolean,
	line: AxisLine,
	reflectCurve: (curve: Curve) => Curve
): Curve[] {
	const start = startsOnAxis
		? AxisLine.closest(line, chain[0].start)
		: chain[0].start

	const startAttrs = chain[0].startAttrs
	const half: Vertex[] = [
		{command: 'L', point: start, ...(startAttrs ? {attrs: startAttrs} : {})},
		...chain.map(segmentToVertex),
	]
	if (endsOnAxis) {
		half[half.length - 1] = {
			...half[half.length - 1],
			point: AxisLine.closest(line, chain.at(-1)!.point),
		}
	}

	const halfCurve: Curve = {vertices: half, closed: false}
	const copy = reflectCurve(halfCurve).vertices.slice()

	// The reversed reflection ends at the reflection of the start: weld it to the start itself
	if (startsOnAxis) {
		copy[copy.length - 1] = {...copy[copy.length - 1], point: start}
	}

	if (startsOnAxis && endsOnAxis) {
		return [{vertices: [...half.slice(1), ...copy.slice(1)], closed: true}]
	} else if (endsOnAxis) {
		return [{vertices: [...half, ...copy.slice(1)], closed: false}]
	} else if (startsOnAxis) {
		return [{vertices: [...copy, ...half.slice(1)], closed: false}]
	}
	return [halfCurve, {vertices: copy, closed: false}]
}

/**
 * Reflects the path across the axis. The orientation of the curves is flipped, as with any reflection.
 * @param path The path to reflect
 * @param axis The axis of the reflection
 * @returns The reflected path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.ngon([35, 50], 25, 5)
 * stroke(p, 'skyblue')
 * stroke(Path.reflect(p, [[50, 0], [50, 100]]), 'tomato')
 * ```
 */
export function reflect(path: Path, axis: MirrorAxis): Path {
	return transform(path, AxisLine.reflectionMatrix(toLine(axis)))
}

/**
 * Makes the path symmetric across the axis: the part on the side the axis normal points to is kept, and the other side is replaced with its reflection. Use `Line.invert` of geome to keep the opposite side.
 *
 * Curves are cut where they cross the axis, and new vertices are added there. Lines, cubic Béziers and arcs all stay as they are. The kept parts are joined with their reflections on the axis, so an open curve with both ends on the axis becomes a closed one. Closed curves keep their orientation, so holes stay holes.
 * @param path The path to symmetrize
 * @param axis The axis of symmetry
 * @returns The symmetric path. It is empty when nothing lies on the kept side.
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.subtract(Path.circle([40, 50], 30), [Path.circle([50, 50], 10)])
 * const axis = [[50, 100], [50, 0]]
 * stroke(p, 'skyblue')
 * stroke(Path.mirror(p, axis), 'tomato')
 * ```
 */
export function mirror(path: Path, axis: MirrorAxis): Path {
	const line = toLine(axis)
	const distance = signedDistanceFn(line)
	const matrix = AxisLine.reflectionMatrix(line)

	const reflectCurve = (curve: Curve) =>
		Curve.reverse(transform({curves: [curve]}, matrix).curves[0])

	let magnitude = Math.abs(line.offset)
	for (const curve of path.curves) {
		for (const {point} of curve.vertices) {
			magnitude = Math.max(magnitude, Math.abs(point[0]), Math.abs(point[1]))
		}
	}
	const epsilon = magnitude * RELATIVE_EPSILON

	const complete = completeVertexAttrs(path)

	return withCurves(
		path,
		complete.curves.flatMap(curve =>
			mirrorCurve(
				curve,
				line,
				distance,
				reflectCurve,
				epsilon,
				path.attrDefs
			).map(c => (curve.attrs ? {...c, attrs: curve.attrs} : c))
		)
	)
}
