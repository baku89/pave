/**
 * Offsetting and stroking built on the planar boolean engine.
 *
 * The region within distance `d` of a curve is the union of per-segment "sheets" (the area
 * swept by the normal segment of length `d`), plus join wedges at the vertices where the
 * parallel curves diverge, plus caps at open ends. Each sheet is a closed curve whose
 * boundary consists of the source segment, two normals and the raw parallel curve; where
 * the parallel curve folds (offset larger than the radius of curvature) the sheet is cut
 * along the evolute into two consistently oriented sheets. The boolean engine then unites
 * the sheets (and, for closed paths, the enclosed region) and keeps only the boundary.
 *
 * Lines and circular arcs are offset exactly (`A` commands are preserved); cubic Béziers
 * and elliptic arcs are approximated by fitted cubics within `tolerance`.
 */
import {scalar, vec2} from 'linearly'

import {Arc, CubicBezier, Curve, type Path, Segment} from '../index'
import {
	arcVertex,
	circularParallelRadius,
	cross2,
	curvatureExtrema,
	evoluteDirectionSign,
	evoluteParametric,
	fitVertices,
	hermiteParallelVertices,
	parallelParametric,
	reverseParametric,
	splitForParallel,
	unitNormalAt,
	unitTangentAt,
} from '../parallelCurve'
import {unite} from './boolean'
import {planarBoolean, type PlanarCurve, type PlanarOperand} from './planar'
import type {Vertex} from './types'

/**
 * @category Options
 */
export interface OffsetOptions {
	/**
	 * The join style at the vertices where the offset curves diverge
	 * @defaultValue 'miter'
	 */
	lineJoin?: CanvasLineJoin
	/**
	 * The limit for miter style, as the ratio of the miter length to the offset distance
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/miterLimit
	 * @defaultValue 10
	 */
	miterLimit?: number
	/**
	 * The maximum deviation allowed when approximating offset cubic Béziers and elliptic arcs
	 * @defaultValue 0.05
	 */
	tolerance?: number
}

/**
 * @category Options
 */
export interface OffsetStrokeOptions extends OffsetOptions {
	/**
	 * The cap style at the ends of open curves
	 * @defaultValue 'butt'
	 */
	lineCap?: CanvasLineCap
}

/**
 * A fitted parallel curve must stay on its side of the source, or the sheet between them
 * inverts. So the fitting tolerance never exceeds this fraction of the offset distance.
 */
const FIT_TOLERANCE_RATIO = 1 / 4

/**
 * The boolean engine snaps points and probes both sides of edges at distances proportional
 * to its tolerance, which therefore has to be far below the thickness of the sheets.
 */
const ENGINE_TOLERANCE_RATIO = 1 / 50

/** Offsets below this fraction of the extent of the path cannot be told from zero. */
const NEGLIGIBLE_RELATIVE_OFFSET = 1e-7

function sheetTolerance(s: number, tolerance: number): number {
	return Math.min(tolerance, Math.abs(s) * FIT_TOLERANCE_RATIO)
}

const TAG_OFFSET = 'offset'
const TAG_AUX = 'aux'

type ResolvedOptions = Required<OffsetOptions>

function resolve(options?: OffsetOptions): ResolvedOptions {
	return {
		lineJoin: options?.lineJoin ?? 'miter',
		miterLimit: options?.miterLimit ?? 10,
		tolerance: Math.max(options?.tolerance ?? 0.05, 1e-9),
	}
}

function segmentVertex(seg: Segment): Vertex {
	return {command: seg.command, args: seg.args, point: seg.point} as Vertex
}

function sheet(vertices: Vertex[], tags: string[]): PlanarCurve {
	return {curve: {vertices, closed: true}, tags}
}

function lineSheet(seg: Segment, s: number): PlanarCurve[] {
	const n = unitNormalAt(seg, 0)
	return [
		sheet(
			[
				{command: 'L', point: seg.start},
				{command: 'L', point: seg.point},
				{command: 'L', point: vec2.scaleAndAdd(seg.point, n, s)},
				{command: 'L', point: vec2.scaleAndAdd(seg.start, n, s)},
			],
			['source', TAG_AUX, TAG_OFFSET, TAG_AUX]
		),
	]
}

function circularArcSheets(seg: Segment, s: number): PlanarCurve[] {
	const {
		center,
		radii: [r],
		angles: [a0, a1],
	} = Arc.toCenterParameterization(seg as Segment<Vertex & {command: 'A'}>)
	const rp = circularParallelRadius(seg as never, s)
	const tiny = 1e-9 * Math.max(r, Math.abs(s))

	const source: Vertex[] = [
		{command: 'L', point: seg.start},
		segmentVertex(seg),
	]

	if (rp > tiny) {
		return [
			sheet(
				[
					...source,
					{
						command: 'L',
						point: vec2.scaleAndAdd(center, vec2.direction(a1), rp),
					},
					arcVertex(center, rp, a1, a0),
				],
				['source', TAG_AUX, TAG_OFFSET, TAG_AUX]
			),
		]
	}

	const sector = sheet(
		[...source, {command: 'L', point: center}],
		['source', TAG_AUX, TAG_AUX]
	)

	if (rp >= -tiny) {
		return [sector]
	}

	const ri = -rp
	return [
		sector,
		sheet(
			[
				{command: 'L', point: center},
				{
					command: 'L',
					point: vec2.scaleAndAdd(center, vec2.direction(a0 + 180), ri),
				},
				arcVertex(center, ri, a0 + 180, a1 + 180),
			],
			[TAG_AUX, 'inverted', TAG_AUX]
		),
	]
}

function trimOrSelf(seg: Segment, t0: number, t1: number): Segment {
	return t0 === 0 && t1 === 1 ? seg : Segment.trim(seg, {time: t0}, {time: t1})
}

function curvedSheets(
	seg: Segment,
	s: number,
	userTolerance: number
): PlanarCurve[] {
	const tolerance = sheetTolerance(s, userTolerance)
	const out: PlanarCurve[] = []

	for (const piece of splitForParallel(seg, s)) {
		const par = parallelParametric(seg, s, piece.sign)

		if (piece.sign === 1) {
			const src = trimOrSelf(seg, piece.t0, piece.t1)
			const q1 = par.point(piece.t1)
			const parallel =
				tolerance < userTolerance
					? hermiteParallelVertices(seg, s, piece.t1, piece.t0, tolerance)
					: fitVertices(reverseParametric(par), -piece.t1, -piece.t0, tolerance)
			out.push(
				sheet(
					[
						{command: 'L', point: src.start},
						segmentVertex(src),
						{command: 'L', point: q1},
						...parallel,
					],
					['source', TAG_AUX, ...parallel.map(() => TAG_OFFSET), TAG_AUX]
				)
			)
			continue
		}

		// Inverted: cut along the evolute into the near sheet (source → evolute) and the far
		// sheet (evolute → inverted parallel). Split at curvature extrema (evolute cusps).
		const stops = [
			piece.t0,
			...curvatureExtrema(seg, piece.t0, piece.t1),
			piece.t1,
		]
		for (let i = 0; i + 1 < stops.length; i++) {
			const u0 = stops[i]
			const u1 = stops[i + 1]
			if (u1 - u0 < 1e-9) continue

			const src = trimOrSelf(seg, u0, u1)
			const ev = evoluteParametric(seg, evoluteDirectionSign(seg, u0, u1))
			const e0 = ev.point(u0)
			const e1 = ev.point(u1)
			const evolute = fitVertices(ev, u0, u1, tolerance)
			const evoluteBack = Segment.reverseVertexChain(e0, evolute)
			const q1 = par.point(u1)
			const inverted = fitVertices(reverseParametric(par), -u1, -u0, tolerance)

			out.push(
				sheet(
					[
						{command: 'L', point: src.start},
						segmentVertex(src),
						{command: 'L', point: e1},
						...evoluteBack,
					],
					['source', TAG_AUX, ...evoluteBack.map(() => TAG_AUX), TAG_AUX]
				),
				sheet(
					[
						{command: 'L', point: e0},
						...evolute,
						{command: 'L', point: q1},
						...inverted,
					],
					[
						...evolute.map(() => TAG_AUX),
						TAG_AUX,
						...inverted.map(() => 'inverted'),
						TAG_AUX,
					]
				)
			)
		}
	}

	return out
}

/** Sheets swept by the normal of length `s` along one segment. */
function segmentSheets(
	seg: Segment,
	s: number,
	tolerance: number
): PlanarCurve[] {
	if (seg.command === 'L' || Segment.isStraight(seg)) {
		return lineSheet(seg, s)
	}
	if (seg.command === 'A' && Arc.isCircular(seg)) {
		return circularArcSheets(seg, s)
	}
	return curvedSheets(seg, s, tolerance)
}

/**
 * Join wedge at the vertex between `prev` and `next` on the `s` side, or `null` where the
 * parallel curves overlap instead of diverging.
 */
function joinSheet(
	prev: Segment,
	next: Segment,
	s: number,
	{lineJoin, miterLimit}: ResolvedOptions
): PlanarCurve | null {
	const v = prev.point
	const t1 = unitTangentAt(prev, 1)
	const t2 = unitTangentAt(next, 0)
	const cr = cross2(t1, t2)
	const dot = vec2.dot(t1, t2)

	if (Math.abs(cr) < 1e-9) {
		// Smooth joint: the sheets already meet along the shared normal
		if (dot > 0) return null
	} else if (!(cr * s < 0)) {
		// The parallel curves overlap on this side; nothing to fill
		return null
	}

	const n1 = vec2.rotate90(t1)
	const n2 = vec2.rotate90(t2)
	const a = vec2.scaleAndAdd(v, n1, s)
	const b = vec2.scaleAndAdd(v, n2, s)
	const base: Vertex[] = [
		{command: 'L', point: v},
		{command: 'L', point: a},
	]

	if (lineJoin === 'round') {
		const fromDeg = vec2.angle(vec2.sub(a, v))
		const toDeg = vec2.angle(vec2.sub(b, v))
		let delta = scalar.mod(toDeg - fromDeg + 180, 360) - 180
		if (Math.abs(Math.abs(delta) - 180) < 1e-9) {
			// Half circle: go around the tip (towards the incoming direction)
			const mid = vec2.direction(fromDeg + delta / 2)
			if (vec2.dot(mid, t1) < 0) delta = -delta
		}
		// Arc regards a radius or chord this small as straight, so make that explicit
		const tip =
			scalar.approx(s, 0) || vec2.approx(a, b)
				? ({command: 'L', point: b} as const)
				: arcVertex(v, Math.abs(s), fromDeg, fromDeg + delta)
		return sheet([...base, tip], [TAG_AUX, TAG_OFFSET, TAG_AUX])
	}

	if (lineJoin === 'miter') {
		const cosHalf = Math.sqrt(Math.max(0, (1 + dot) / 2))
		if (cosHalf > 1e-9 && 1 / cosHalf <= miterLimit) {
			const m = vec2.scaleAndAdd(v, vec2.add(n1, n2), s / (1 + dot))
			return sheet(
				[...base, {command: 'L', point: m}, {command: 'L', point: b}],
				[TAG_AUX, TAG_OFFSET, TAG_OFFSET, TAG_AUX]
			)
		}
	}

	return sheet(
		[...base, {command: 'L', point: b}],
		[TAG_AUX, TAG_OFFSET, TAG_AUX]
	)
}

function capSheet(
	point: vec2,
	outward: vec2,
	d: number,
	lineCap: CanvasLineCap
): PlanarCurve | null {
	if (lineCap === 'butt') return null

	if (lineCap === 'round') {
		const args = [[d, d], 0, false, true] as const
		return sheet(
			[
				{command: 'A', args, point: vec2.scaleAndAdd(point, outward, d)},
				{command: 'A', args, point: vec2.scaleAndAdd(point, outward, -d)},
			],
			[TAG_OFFSET, TAG_OFFSET]
		)
	}

	const n = vec2.rotate90(outward)
	const a = vec2.scaleAndAdd(point, n, d)
	const b = vec2.scaleAndAdd(point, n, -d)
	return sheet(
		[
			{command: 'L', point: a},
			{command: 'L', point: vec2.scaleAndAdd(a, outward, d)},
			{command: 'L', point: vec2.scaleAndAdd(b, outward, d)},
			{command: 'L', point: b},
		],
		[TAG_OFFSET, TAG_OFFSET, TAG_OFFSET, TAG_AUX]
	)
}

/**
 * The non-degenerate segments of the curve. Cubics are cut at their cusps: a parallel curve
 * has no tangent to follow there, so the turn back is handled by a join like any corner.
 */
function cleanSegments(curve: Curve): Segment[] {
	return Curve.segments(curve)
		.filter(seg => !Segment.isZero(seg))
		.flatMap(seg => {
			const cusps = seg.command === 'C' ? CubicBezier.cuspTimes(seg) : []
			const stops = [0, ...cusps, 1]
			return cusps.length === 0
				? [seg]
				: stops
						.slice(1)
						.map((to, i) => Segment.trim(seg, {time: stops[i]}, {time: to}))
		})
}

/** All sheets (segments + joins) for one curve on the `s` side. */
export function curveSheets(
	curve: Curve,
	s: number,
	options: ResolvedOptions
): PlanarCurve[] {
	const segs = cleanSegments(curve)
	const out: PlanarCurve[] = []

	segs.forEach((seg, i) => {
		out.push(...segmentSheets(seg, s, options.tolerance))
		const next =
			i + 1 < segs.length ? segs[i + 1] : curve.closed ? segs[0] : null
		if (next) {
			const join = joinSheet(seg, next, s, options)
			if (join) out.push(join)
		}
	})

	return out
}

function asOperands(sheets: PlanarCurve[]): PlanarOperand[] {
	return sheets.map(s => ({curves: [s]}))
}

const anyInside = (w: number[]) => w.some(x => x !== 0)

function isNegligibleOffset(path: Path, offset: number): boolean {
	let extent = 0
	for (const curve of path.curves) {
		for (const {point} of curve.vertices) {
			extent = Math.max(extent, Math.abs(point[0]), Math.abs(point[1]))
		}
	}
	return Math.abs(offset) <= NEGLIGIBLE_RELATIVE_OFFSET * extent
}

/**
 * Creates an offset path from the given path.
 *
 * Closed curves are treated as a filled region (non-zero winding): a positive `offset` dilates it and a negative one erodes it, regardless of the curves' orientation. Open curves are offset to the side of their {@link Segment.normal} (positive) or the opposite side (negative), and the parts of the raw parallel curve that fold back are trimmed away.
 *
 * Straight lines and circular arcs are offset exactly, so `A` commands are preserved; cubic Béziers and elliptic arcs are approximated by cubic Béziers within `options.tolerance`.
 * @param path The path to offset
 * @param offset The signed offset distance
 * @param options The options
 * @returns The newly created path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.ngon([50, 50], 20, 5)
 * stroke(p, 'skyblue')
 * const po = Path.offset(p, 10, {lineJoin: 'round'})
 * stroke(po, 'tomato')
 * ```
 */
export function offset(
	path: Path,
	offset: number,
	options?: OffsetOptions
): Path {
	const opts = resolve(options)
	const curves: Curve[] = []
	const engineTolerance = Math.abs(offset) * ENGINE_TOLERANCE_RATIO

	if (isNegligibleOffset(path, offset)) {
		offset = 0
	}

	// A single vertex is enough for a closed curve: a cubic can leave and return to it
	const closedCurves = path.curves.filter(
		c => c.closed && cleanSegments(c).length > 0
	)
	const openCurves = path.curves.filter(
		c => !c.closed && c.vertices.length >= 2
	)

	if (closedCurves.length > 0) {
		// Normalize: no self-intersections, inside on the +normal side
		const region = unite([{curves: closedCurves}])

		if (offset === 0) {
			curves.push(...region.curves)
		} else if (region.curves.length > 0) {
			const sheets = region.curves.flatMap(c => curveSheets(c, -offset, opts))
			const operands: PlanarOperand[] = [
				{curves: region.curves.map(curve => ({curve}))},
				...asOperands(sheets),
			]
			const result = planarBoolean(operands, {
				inside:
					offset > 0
						? anyInside
						: w => w[0] !== 0 && w.slice(1).every(x => x === 0),
				assemble: 'closed',
				tolerance: engineTolerance,
			})
			curves.push(...result.curves)
		}
	}

	for (const curve of openCurves) {
		if (offset === 0) {
			curves.push(curve)
			continue
		}
		const result = planarBoolean(asOperands(curveSheets(curve, offset, opts)), {
			inside: anyInside,
			assemble: 'open',
			tag: TAG_OFFSET,
			tolerance: engineTolerance,
		})
		curves.push(...result.curves)
	}

	return {curves}
}

/**
 * Creates the outline of a stroke along the given path.
 *
 * Straight lines and circular arcs are offset exactly, so `A` commands are preserved; cubic Béziers and elliptic arcs are approximated by cubic Béziers within `options.tolerance`.
 * @param path The path to stroke
 * @param width The width of stroke
 * @param options The options
 * @returns The newly created path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.ngon([50, 50], 20, 5)
 * stroke(p, 'skyblue')
 * const po = Path.offsetStroke(p, 20, {lineJoin: 'round'})
 * stroke(po, 'tomato')
 * ```
 */
export function offsetStroke(
	path: Path,
	width: number,
	options?: OffsetStrokeOptions
): Path {
	const opts = resolve(options)
	const lineCap = options?.lineCap ?? 'butt'
	const d = Math.abs(width) / 2

	if (d === 0) {
		return {curves: []}
	}

	const sheets: PlanarCurve[] = []

	for (const curve of path.curves) {
		const segs = cleanSegments(curve)
		if (segs.length === 0) continue

		sheets.push(...curveSheets(curve, d, opts), ...curveSheets(curve, -d, opts))

		if (!curve.closed) {
			const first = segs[0]
			const last = segs[segs.length - 1]
			const startCap = capSheet(
				first.start,
				vec2.negate(unitTangentAt(first, 0)),
				d,
				lineCap
			)
			const endCap = capSheet(last.point, unitTangentAt(last, 1), d, lineCap)
			if (startCap) sheets.push(startCap)
			if (endCap) sheets.push(endCap)
		}
	}

	return planarBoolean(asOperands(sheets), {
		inside: anyInside,
		assemble: 'closed',
		tolerance: d * ENGINE_TOLERANCE_RATIO,
	})
}
