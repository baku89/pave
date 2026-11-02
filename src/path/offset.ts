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

import {
	completeVertexAttrs,
	interpolateValue,
	pushDownCurveAttrs,
	segmentAttrsAt,
	withCurves,
} from '../attributes'
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
	variableParallelBreaks,
	variableParallelPieces,
} from '../parallelCurve'
import {deleteAttribute, setAttribute} from './attributes'
import {unite} from './boolean'
import {planarBoolean, type PlanarCurve, type PlanarOperand} from './planar'
import type {
	AttributeDef,
	AttributeDefs,
	AttributeLike,
	Attributes,
	Vertex,
} from './types'

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

/** Where {@link offsetStroke} keeps the width it has read while working. */
const WIDTH_ATTRIBUTE = '__offsetStrokeWidth'

const TAG_OFFSET = 'offset'
const TAG_AUX = 'aux'

type ResolvedOptions = Required<OffsetOptions> & {attrDefs?: AttributeDefs}

function resolve(
	options: OffsetOptions | undefined,
	attrDefs: AttributeDefs | undefined
): ResolvedOptions {
	return {
		lineJoin: options?.lineJoin ?? 'miter',
		miterLimit: options?.miterLimit ?? 10,
		tolerance: Math.max(options?.tolerance ?? 0.05, 1e-9),
		attrDefs,
	}
}

/** A vertex with the attributes of the place on the source curve it comes from. */
function tagged<V extends Vertex>(vertex: V, attrs: Attributes | undefined): V {
	return attrs ? {...vertex, attrs} : vertex
}

/** Every vertex of a sheet comes from one place on the source, like a join at a vertex. */
function taggedSheet(
	planar: PlanarCurve | null,
	attrs: Attributes | undefined
): PlanarCurve | null {
	if (!planar || !attrs) return planar
	return {
		...planar,
		curve: {
			...planar.curve,
			vertices: planar.curve.vertices.map(v => tagged(v, attrs)),
		},
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
				tagged({command: 'L', point: seg.start}, seg.startAttrs),
				tagged({command: 'L', point: seg.point}, seg.attrs),
				tagged(
					{command: 'L', point: vec2.scaleAndAdd(seg.point, n, s)},
					seg.attrs
				),
				tagged(
					{command: 'L', point: vec2.scaleAndAdd(seg.start, n, s)},
					seg.startAttrs
				),
			],
			['source', TAG_AUX, TAG_OFFSET, TAG_AUX]
		),
	]
}

function circularArcSheets(
	seg: Segment,
	s: number,
	attrDefs?: AttributeDefs
): PlanarCurve[] {
	const middle = segmentAttrsAt(seg, 0.5, attrDefs)
	const {
		center,
		radii: [r],
		angles: [a0, a1],
	} = Arc.toCenterParameterization(seg as Segment<Vertex & {command: 'A'}>)
	const rp = circularParallelRadius(seg as never, s)
	const tiny = 1e-9 * Math.max(r, Math.abs(s))

	const source: Vertex[] = [
		tagged({command: 'L', point: seg.start}, seg.startAttrs),
		tagged(segmentVertex(seg), seg.attrs),
	]

	if (rp > tiny) {
		return [
			sheet(
				[
					...source,
					tagged(
						{
							command: 'L',
							point: vec2.scaleAndAdd(center, vec2.direction(a1), rp),
						},
						seg.attrs
					),
					tagged(arcVertex(center, rp, a1, a0), seg.startAttrs),
				],
				['source', TAG_AUX, TAG_OFFSET, TAG_AUX]
			),
		]
	}

	const sector = sheet(
		[...source, tagged({command: 'L', point: center}, middle)],
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
				tagged({command: 'L', point: center}, middle),
				tagged(
					{
						command: 'L',
						point: vec2.scaleAndAdd(center, vec2.direction(a0 + 180), ri),
					},
					seg.startAttrs
				),
				tagged(arcVertex(center, ri, a0 + 180, a1 + 180), seg.attrs),
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
	userTolerance: number,
	attrDefs?: AttributeDefs
): PlanarCurve[] {
	const tolerance = sheetTolerance(s, userTolerance)
	const out: PlanarCurve[] = []
	const at = (t: number) => segmentAttrsAt(seg, t, attrDefs)
	const atReversed = (u: number) => at(-u)

	for (const piece of splitForParallel(seg, s)) {
		const par = parallelParametric(seg, s, piece.sign)

		if (piece.sign === 1) {
			const src = trimOrSelf(seg, piece.t0, piece.t1)
			const q1 = par.point(piece.t1)
			const parallel =
				tolerance < userTolerance
					? hermiteParallelVertices(seg, s, piece.t1, piece.t0, tolerance, at)
					: fitVertices(
							reverseParametric(par),
							-piece.t1,
							-piece.t0,
							tolerance,
							atReversed
						)
			out.push(
				sheet(
					[
						tagged({command: 'L', point: src.start}, at(piece.t0)),
						tagged(segmentVertex(src), at(piece.t1)),
						tagged({command: 'L', point: q1}, at(piece.t1)),
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
			const evolute = fitVertices(ev, u0, u1, tolerance, at)
			const evoluteBack = Segment.reverseVertexChain(e0, evolute, at(u0))
			const q1 = par.point(u1)
			const inverted = fitVertices(
				reverseParametric(par),
				-u1,
				-u0,
				tolerance,
				atReversed
			)

			out.push(
				sheet(
					[
						tagged({command: 'L', point: src.start}, at(u0)),
						tagged(segmentVertex(src), at(u1)),
						tagged({command: 'L', point: e1}, at(u1)),
						...evoluteBack,
					],
					['source', TAG_AUX, ...evoluteBack.map(() => TAG_AUX), TAG_AUX]
				),
				sheet(
					[
						tagged({command: 'L', point: e0}, at(u0)),
						...evolute,
						tagged({command: 'L', point: q1}, at(u1)),
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
	tolerance: number,
	attrDefs?: AttributeDefs
): PlanarCurve[] {
	if (seg.command === 'L' || Segment.isStraight(seg)) {
		return lineSheet(seg, s)
	}
	if (seg.command === 'A' && Arc.isCircular(seg)) {
		return circularArcSheets(seg, s, attrDefs)
	}
	return curvedSheets(seg, s, tolerance, attrDefs)
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
		out.push(...segmentSheets(seg, s, options.tolerance, options.attrDefs))
		const next =
			i + 1 < segs.length ? segs[i + 1] : curve.closed ? segs[0] : null
		if (next) {
			const join = taggedSheet(joinSheet(seg, next, s, options), seg.attrs)
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
 * Straight lines and circular arcs are offset exactly, so `A` commands are preserved; cubic Béziers and elliptic arcs are approximated by cubic Béziers within `options.tolerance`. Attributes follow the place on the source curve, and values on curves move down to the vertices.
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
	const {attrDefs} = path
	const opts = resolve(options, attrDefs)
	const curves: Curve[] = []
	const engineTolerance = Math.abs(offset) * ENGINE_TOLERANCE_RATIO
	const complete = completeVertexAttrs(path)

	if (isNegligibleOffset(path, offset)) {
		offset = 0
	}

	// A single vertex is enough for a closed curve: a cubic can leave and return to it
	const closedCurves = complete.curves.filter(
		c => c.closed && cleanSegments(c).length > 0
	)
	const openCurves = complete.curves.filter(
		c => !c.closed && c.vertices.length >= 2
	)

	if (closedCurves.length > 0) {
		// Normalize: no self-intersections, inside on the +normal side
		const region = unite([
			attrDefs ? {curves: closedCurves, attrDefs} : {curves: closedCurves},
		])

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
				attrDefs,
			})
			curves.push(...result.curves)
		}
	}

	for (const curve of openCurves) {
		if (offset === 0) {
			curves.push(curve)
			continue
		}
		const result = planarBoolean(
			asOperands(curveSheets(pushDownCurveAttrs(curve), offset, opts)),
			{
				inside: anyInside,
				assemble: 'open',
				tag: TAG_OFFSET,
				tolerance: engineTolerance,
				attrDefs,
			}
		)
		curves.push(...result.curves)
	}

	return withCurves(path, curves)
}

/**
 * Creates the outline of a stroke along the given path.
 *
 * Straight lines and circular arcs are offset exactly, so `A` commands are preserved; cubic Béziers and elliptic arcs are approximated by cubic Béziers within `options.tolerance`.
 * @param path The path to stroke
 * @param width The width of stroke. It can vary along the path, as the name of an attribute or a function of the vertex: the width is read at the vertices and interpolated along the segments. A path whose curves each have one width keeps its `A` commands.
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
	width: AttributeLike<number>,
	options?: OffsetStrokeOptions
): Path {
	const opts = resolve(options, path.attrDefs)
	const lineCap = options?.lineCap ?? 'butt'

	// Reading the width as a vertex attribute lets it follow any cut of the segments
	const readsWidth = typeof width !== 'number'
	const widthDef =
		typeof width === 'string' ? path.attrDefs?.[width] : undefined
	const complete = completeVertexAttrs(path)
	const withWidth = readsWidth
		? setAttribute(complete, WIDTH_ATTRIBUTE, width)
		: complete
	const halfWidthAt = (vertex: Vertex) => {
		const value = readsWidth ? vertex.attrs?.[WIDTH_ATTRIBUTE] : width
		return typeof value === 'number' ? Math.abs(value) / 2 : 0
	}

	const sheets: PlanarCurve[] = []
	let smallest = Infinity

	for (const source of withWidth.curves) {
		const curve = pushDownCurveAttrs(source)
		const segs = cleanSegments(curve)
		if (segs.length === 0) continue

		const halves = curve.vertices.map(halfWidthAt)
		const d = halves[0]
		const uniform = halves.every(h => h === d)

		for (const h of halves) if (h > 0) smallest = Math.min(smallest, h)

		if (uniform) {
			if (d === 0) continue
			sheets.push(
				...curveSheets(curve, d, opts),
				...curveSheets(curve, -d, opts)
			)
		} else {
			sheets.push(
				...variableCurveSheets(curve, 1, opts, widthDef),
				...variableCurveSheets(curve, -1, opts, widthDef)
			)
		}

		if (!curve.closed) {
			const first = segs[0]
			const last = segs[segs.length - 1]
			const startHalf = halfWidthAt(curve.vertices[0])
			const endHalf = halfWidthAt(curve.vertices[curve.vertices.length - 1])
			const startCap =
				startHalf > 0
					? taggedSheet(
							capSheet(
								first.start,
								vec2.negate(unitTangentAt(first, 0)),
								startHalf,
								lineCap
							),
							curve.vertices[0].attrs
						)
					: null
			const endCap =
				endHalf > 0
					? taggedSheet(
							capSheet(last.point, unitTangentAt(last, 1), endHalf, lineCap),
							curve.vertices[curve.vertices.length - 1].attrs
						)
					: null
			if (startCap) sheets.push(startCap)
			if (endCap) sheets.push(endCap)
		}
	}

	if (sheets.length === 0) {
		return withCurves(path, [])
	}

	const {curves} = planarBoolean(asOperands(sheets), {
		inside: anyInside,
		assemble: 'closed',
		tolerance: smallest * ENGINE_TOLERANCE_RATIO,
		attrDefs: path.attrDefs,
	})

	const result = withCurves<Path>(path, curves)
	return readsWidth
		? deleteAttribute(result, WIDTH_ATTRIBUTE, {level: 'vertex'})
		: result
}

/** The sheets of one side of a curve whose stroke width changes along the way. */
function variableCurveSheets(
	curve: Curve,
	side: 1 | -1,
	options: ResolvedOptions,
	widthDef?: AttributeDef
): PlanarCurve[] {
	const segs = cleanSegments(curve)
	const out: PlanarCurve[] = []

	const distanceOf = (seg: Segment) => (t: number) => {
		const width = interpolateValue(
			seg.startAttrs?.[WIDTH_ATTRIBUTE],
			seg.attrs?.[WIDTH_ATTRIBUTE],
			t,
			widthDef
		)
		return (side * Math.abs(typeof width === 'number' ? width : 0)) / 2
	}

	segs.forEach((seg, i) => {
		const s = distanceOf(seg)
		const thickest = Math.max(Math.abs(s(0)), Math.abs(s(0.5)), Math.abs(s(1)))
		if (thickest > 0) {
			const tolerance = sheetTolerance(thickest, options.tolerance)
			const breaks = variableParallelBreaks(seg, s)

			for (let b = 0; b + 1 < breaks.length; b++) {
				// Reversed so that each sheet runs along the segment and back. Every piece makes
				// its own sheet: being separate operands, a fold cannot cancel out the others.
				const pieces = variableParallelPieces(
					seg,
					s,
					breaks[b + 1],
					breaks[b],
					tolerance
				)
				for (const {from, to, vertex} of pieces) {
					const piece = trimOrSelf(seg, to, from)
					const q1 = vec2.scaleAndAdd(
						piece.point,
						unitNormalAt(seg, from),
						s(from)
					)
					const atFrom = segmentAttrsAt(seg, from, options.attrDefs)
					const atTo = segmentAttrsAt(seg, to, options.attrDefs)
					out.push({
						curve: {
							vertices: [
								tagged({command: 'L', point: piece.start}, atTo),
								tagged(segmentVertex(piece), atFrom),
								tagged({command: 'L', point: q1}, atFrom),
								tagged(vertex, atTo),
							],
							closed: true,
						},
					})
				}
			}
		}

		const next =
			i + 1 < segs.length ? segs[i + 1] : curve.closed ? segs[0] : null
		const distance = s(1)
		if (next && distance !== 0) {
			const join = taggedSheet(
				joinSheet(seg, next, distance, options),
				seg.attrs
			)
			if (join) out.push(join)
		}
	})

	return out
}
