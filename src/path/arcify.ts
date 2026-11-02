import {vec2} from 'linearly'

import {
	CubicBezier,
	type Path,
	Segment,
	type SegmentA,
	type SegmentC,
	type SegmentL,
} from '../index'
import {spawnVertex} from './modifiers'
import type {VertexA, VertexL} from './types'

/**
 * An options for {@link Path.arcify}
 * @category Options
 */
export interface ArcifyOptions {
	/**
	 * The maximum deviation allowed between the arcified path and the original, in the same unit as the coordinates.
	 * @default 0.05
	 */
	tolerance?: number
}

/** How many times a cubic may be halved while the biarc does not fit. */
const MAX_DEPTH = 12

/** An arc counts as a line when it stays within this fraction of the tolerance of its chord. */
const STRAIGHT_RATIO = 0.05

/** The number of parameter values at which the deviation of a biarc is measured. */
const SAMPLES = 16

const TAU = Math.PI * 2

interface LinePiece {
	seg: SegmentL
}

/** A circular arc with the center parameterization needed to measure distances to it. */
interface ArcPiece {
	seg: SegmentA
	center: vec2
	radius: number
	/** The angle of the start point around the center, in radians */
	startAngle: number
	/** The angle swept from the start to the end along the sweep direction, in radians within [0, 2π) */
	sweptAngle: number
	/** 1 when the angle increases from the start to the end (the sweep flag is set), -1 otherwise */
	dir: 1 | -1
}

type Piece = LinePiece | ArcPiece

function isArcPiece(piece: Piece): piece is ArcPiece {
	return piece.seg.command === 'A'
}

/**
 * Converts the cubic Bézier curves in the path to circular arcs. Each cubic is approximated by biarcs (pairs of tangent-continuous circular arcs) so that it stays within `tolerance` of the original, subdividing where a single biarc is not enough. Cubics and arcs that are straight within the tolerance become lines. Line and arc commands are kept as they are.
 * @param path The path to convert
 * @param options The options
 * @returns The new path that only consists of lines and arcs
 * @category Converters
 * @example
 * ```js:pave
 * const p = Path.cubicBezier([10, 90], [20, 10], [80, 10], [90, 90])
 * stroke(p, 'skyblue', 5)
 * const pa = Path.arcify(p)
 * stroke(pa, 'tomato')
 * ```
 */
export function arcify(
	path: Path,
	options: ArcifyOptions = {}
): Path<VertexL | VertexA> {
	const tolerance = Math.max(options.tolerance ?? 0.05, 0)

	return spawnVertex(path, (seg, segmentIndex): (VertexL | VertexA)[] => {
		if (seg.command !== 'C') {
			return [seg]
		}

		if (segmentIndex === -1) {
			// The pseudo-segment that leads to the first vertex of an open curve;
			// only its point is used
			return [{command: 'L', point: seg.point}]
		}

		if (Segment.isZero(seg)) {
			return []
		}

		const vertices: (VertexL | VertexA)[] = Segment.isStraight(seg, tolerance)
			? [{command: 'L', point: seg.point}]
			: fitCubic(seg, tolerance).map(toVertex)

		if (vertices.length === 0) {
			return []
		}

		// Keep the attributes of the original vertex on the last one
		const last = vertices[vertices.length - 1]
		vertices[vertices.length - 1] = {
			...last,
			point: seg.point,
			...(seg.attrs ? {attrs: seg.attrs} : {}),
		} as VertexL | VertexA

		return vertices
	})
}

/**
 * Approximates the whole cubic by lines and arcs. The curve is first cut at its inflection points and cusps, as a biarc cannot change its turning direction, and each monotone piece is then fitted recursively.
 */
function fitCubic(bezier: SegmentC, tolerance: number): Piece[] {
	const breaks = [
		...CubicBezier.inflectionTimes(bezier),
		...CubicBezier.cuspTimes(bezier),
	]
		.filter(t => t > 1e-6 && t < 1 - 1e-6)
		.sort((a, b) => a - b)
		.filter((t, i, ts) => i === 0 || t - ts[i - 1] > 1e-6)

	const times = [0, ...breaks, 1]
	const pieces: Piece[] = []

	for (let i = 0; i + 1 < times.length; i++) {
		fitRange(bezier, times[i], times[i + 1], tolerance, 0, pieces)
	}

	return pieces.filter(piece => !vec2.approx(piece.seg.start, piece.seg.point))
}

/**
 * Fits the sub-range [t0, t1] of the cubic by a biarc, halving the range until the sampled deviation stays within the tolerance.
 */
function fitRange(
	bezier: SegmentC,
	t0: number,
	t1: number,
	tolerance: number,
	depth: number,
	out: Piece[]
) {
	const sub = CubicBezier.trim(bezier, {time: t0}, {time: t1})

	if (CubicBezier.isZero(sub)) {
		return
	}

	// Only the whole segment is tested for straightness (by the caller): testing every
	// sub-range would turn any curve into a polyline once the pieces are small enough,
	// although arcs would follow it far better within the same tolerance.

	const startTangent = polygonTangent(
		sub.start,
		sub.args[0],
		sub.args[1],
		sub.point
	)
	const endTangent = vec2.negate(
		polygonTangent(sub.point, sub.args[1], sub.args[0], sub.start)
	)

	const fitted = biarc(sub.start, startTangent, sub.point, endTangent)?.map(
		piece => straightenPiece(piece, tolerance)
	)

	if (fitted && (depth >= MAX_DEPTH || deviation(sub, fitted) <= tolerance)) {
		out.push(...fitted)
		return
	}

	if (depth >= MAX_DEPTH) {
		// No biarc could be built even for a tiny piece; a single arc is the best left
		out.push(
			straightenPiece(
				arcFromTangent(sub.start, startTangent, sub.point),
				tolerance
			)
		)
		return
	}

	const tm = (t0 + t1) / 2
	fitRange(bezier, t0, tm, tolerance, depth + 1, out)
	fitRange(bezier, tm, t1, tolerance, depth + 1, out)
}

/**
 * The unit direction from `from` towards the first of the `candidates` that differs from it. Reading the control polygon this way gives a one-sided tangent even where the derivative vanishes, such as at a cusp.
 */
function polygonTangent(from: vec2, ...candidates: vec2[]): vec2 {
	for (const c of candidates) {
		const d = vec2.sub(c, from)
		if (!vec2.approx(d, vec2.zero)) {
			return vec2.normalize(d)
		}
	}
	return [1, 0]
}

/**
 * Builds the biarc from `p0` with the unit tangent `t0` to `p1` with the unit tangent `t1`. The two arcs meet at the junction `j`, which is chosen by the equal-chord rule: the tangent polygons `p0 → p0 + d·t0 → j` and `j → p1 − d·t1 → p1` are isosceles with the same `d`, so that `j` is the midpoint of the two control points and the arcs share the work as evenly as the end conditions allow. Returns `null` when no such biarc exists, i.e. the chord opposes the tangents.
 */
function biarc(p0: vec2, t0: vec2, p1: vec2, t1: vec2): Piece[] | null {
	const v = vec2.sub(p1, p0)
	const vv = vec2.dot(v, v)
	if (vv <= 0) {
		return null
	}

	// Solving |c2 − c1| = 2d for d, where c1 = p0 + d·t0 and c2 = p1 − d·t1:
	// 2(1 − t0·t1)·d² + 2(v·(t0 + t1))·d − v·v = 0
	const a = 2 * (1 - vec2.dot(t0, t1))
	const vt = vec2.dot(v, vec2.add(t0, t1))
	// The positive root, in the form that stays stable when a → 0 (parallel tangents)
	const denom = vt + Math.sqrt(vt * vt + Math.max(a, 0) * vv)

	if (!(denom > 0)) {
		return null
	}

	const d = vv / denom
	if (!Number.isFinite(d) || d <= 0) {
		return null
	}

	const c1 = vec2.scaleAndAdd(p0, t0, d)
	const c2 = vec2.scaleAndAdd(p1, t1, -d)
	const j = vec2.lerp(c1, c2, 0.5)

	const first = arcFromTangent(p0, t0, j)
	const second = reversePiece(arcFromTangent(p1, vec2.negate(t1), j))

	return [first, second]
}

/**
 * The circular arc that leaves `start` along the unit tangent `tangent` and ends at `end`. Becomes a line when the tangent points along the chord.
 */
function arcFromTangent(start: vec2, tangent: vec2, end: vec2): Piece {
	const chord = vec2.sub(end, start)
	const chordLen = vec2.len(chord)
	// Positive when the chord lies on the positive-angle side of the tangent (clockwise on screen)
	const cross = tangent[0] * chord[1] - tangent[1] * chord[0]

	if (chordLen < 1e-12 || Math.abs(cross) <= 1e-9 * chordLen) {
		return linePiece(start, end)
	}

	// The center lies on the normal of the tangent at the start, at the signed distance r
	const normal: vec2 = [-tangent[1], tangent[0]]
	const signedRadius = (chordLen * chordLen) / (2 * cross)
	const center = vec2.scaleAndAdd(start, normal, signedRadius)

	const sweep = cross > 0
	const largeArc = vec2.dot(tangent, chord) < 0

	return arcPiece(start, end, center, Math.abs(signedRadius), largeArc, sweep)
}

function linePiece(start: vec2, point: vec2): LinePiece {
	return {seg: {command: 'L', start, point}}
}

function arcPiece(
	start: vec2,
	point: vec2,
	center: vec2,
	radius: number,
	largeArc: boolean,
	sweep: boolean
): ArcPiece {
	const dir = sweep ? 1 : -1
	const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0])
	const endAngle = Math.atan2(point[1] - center[1], point[0] - center[0])
	let sweptAngle = mod(dir * (endAngle - startAngle), TAU)

	// Rounding can wrap a tiny sweep to nearly a full turn; the flag tells which is meant
	if (!largeArc && sweptAngle > Math.PI * 1.5) {
		sweptAngle = 0
	}

	return {
		seg: {
			command: 'A',
			start,
			args: [[radius, radius], 0, largeArc, sweep],
			point,
		},
		center,
		radius,
		startAngle,
		sweptAngle,
		dir,
	}
}

function reversePiece(piece: Piece): Piece {
	if (!isArcPiece(piece)) {
		return linePiece(piece.seg.point, piece.seg.start)
	}
	const {seg, center, radius} = piece
	const [, , largeArc, sweep] = seg.args
	return arcPiece(seg.point, seg.start, center, radius, largeArc, !sweep)
}

/**
 * A line in place of an arc that is straight for all practical purposes: within a small fraction of the tolerance of its chord. Arcs within the full tolerance are kept, since they are a better fit than the chord.
 */
function straightenPiece(piece: Piece, tolerance: number): Piece {
	if (
		isArcPiece(piece) &&
		Segment.isStraight(piece.seg, tolerance * STRAIGHT_RATIO)
	) {
		return linePiece(piece.seg.start, piece.seg.point)
	}
	return piece
}

/**
 * The largest distance from the cubic, sampled at uniform parameters, to the nearest of the pieces.
 */
function deviation(bezier: SegmentC, pieces: Piece[]): number {
	let max = 0
	for (let i = 1; i < SAMPLES; i++) {
		const p = CubicBezier.point(bezier, {time: i / SAMPLES})
		let nearest = Infinity
		for (const piece of pieces) {
			nearest = Math.min(nearest, distanceToPiece(piece, p))
		}
		max = Math.max(max, nearest)
	}
	return max
}

function distanceToPiece(piece: Piece, p: vec2): number {
	const {start, point} = piece.seg

	if (!isArcPiece(piece)) {
		return distanceToLine(start, point, p)
	}

	const {center, radius, startAngle, sweptAngle, dir} = piece
	const angle = Math.atan2(p[1] - center[1], p[0] - center[0])
	const swept = mod(dir * (angle - startAngle), TAU)

	if (swept <= sweptAngle) {
		return Math.abs(vec2.distance(center, p) - radius)
	}

	return Math.min(vec2.distance(p, start), vec2.distance(p, point))
}

function distanceToLine(start: vec2, end: vec2, p: vec2): number {
	const d = vec2.sub(end, start)
	const l2 = vec2.dot(d, d)
	const t =
		l2 > 0 ? Math.min(Math.max(vec2.dot(vec2.sub(p, start), d) / l2, 0), 1) : 0
	return vec2.distance(p, vec2.scaleAndAdd(start, d, t))
}

function mod(x: number, m: number): number {
	return ((x % m) + m) % m
}

function toVertex(piece: Piece): VertexL | VertexA {
	if (isArcPiece(piece)) {
		return {command: 'A', args: piece.seg.args, point: piece.seg.point}
	}
	return {command: 'L', point: piece.seg.point}
}
