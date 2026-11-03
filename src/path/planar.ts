/**
 * Planar boolean engine shared by {@link Path.unite}/{@link Path.subtract}/… and
 * {@link Path.offset}/{@link Path.offsetStroke}.
 *
 * Every operand is a set of closed curves (`L`/`C`/`A` segments). The engine
 *
 * 1. splits all segments at their mutual intersections (and cubic self-intersections),
 * 2. snaps the split points to shared nodes,
 * 3. classifies each resulting edge by evaluating the winding numbers of every operand
 *    at two probe points just left and right of the edge's midpoint, and keeps the edge
 *    only when `inside(windings)` differs between the two sides,
 * 4. orients kept edges so the inside is on the `+normal` side and links them into
 *    closed loops (or open chains filtered by tag).
 *
 * Winding numbers are computed exactly as swept angles with bounding-box recursion, so
 * no ray-casting degeneracies arise. Arcs stay arcs throughout.
 */
import {Rect} from 'geome'
import {vec2} from 'linearly'

import {interpolateAttrs} from '../attributes'
import {Arc, CubicBezier, Curve, type Path, Segment} from '../index'
import {cross2, unitNormalAt, unitTangentAt} from '../parallelCurve'
import {rangeBounds} from '../segmentBounds'
import {intersectSegments} from './intersections'
import type {AttributeDefs, Attributes, Vertex} from './types'

/** A closed curve with an optional label per segment (in {@link Curve.segments} order). */
export interface PlanarCurve {
	curve: Curve
	tags?: readonly string[]
}

/** A boolean operand: a region defined by the non-zero winding of its curves. */
export interface PlanarOperand {
	curves: PlanarCurve[]
}

export interface PlanarOptions {
	/**
	 * Whether a point with the given per-operand winding numbers is inside the result. The
	 * array is reused between the calls, so it must not be kept. As it can be long and is
	 * mostly zeros, the number of non-zero values comes along.
	 */
	inside: (windings: number[], nonZeroCount: number) => boolean
	/**
	 * `closed`: link boundary edges into closed loops.
	 * `open`: keep only edges carrying `tag` and link them into open chains.
	 */
	assemble: 'closed' | 'open'
	tag?: string
	/**
	 * Upper bound of the distance at which points are regarded as the same. It must be well
	 * below the smallest feature of the operands, or thin operands collapse. By default it
	 * only depends on the extent of the operands.
	 */
	tolerance?: number
	/** How the attributes of the operands are interpolated */
	attrDefs?: AttributeDefs
}

interface SourceSegment {
	seg: Segment
	bounds: Rect
	operand: number
	tag?: string
	splits: {t: number; node: number}[]
}

interface Edge {
	seg: Segment
	from: number
	to: number
	tag?: string
}

/** Hash of a grid cell. Cells may collide, as the points found are checked by distance. */
function cellKey(cx: number, cy: number): number {
	return (cx * 73856093) ^ (cy * 19349663)
}

/** Tolerance-based point registry on a uniform grid. */
class NodeStore {
	points: vec2[] = []
	#cells = new Map<number, number[]>()
	#cell: number

	constructor(private tolerance: number) {
		this.#cell = tolerance * 2
	}

	add(p: vec2): number {
		const cx = Math.floor(p[0] / this.#cell)
		const cy = Math.floor(p[1] / this.#cell)
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const ids = this.#cells.get(cellKey(cx + dx, cy + dy))
				if (!ids) continue
				for (const id of ids) {
					if (vec2.distance(this.points[id], p) <= this.tolerance) {
						return id
					}
				}
			}
		}
		const id = this.points.length
		this.points.push(p)
		const key = cellKey(cx, cy)
		const list = this.#cells.get(key)
		if (list) list.push(id)
		else this.#cells.set(key, [id])
		return id
	}
}

function chordAngle(start: vec2, end: vec2, q: vec2): number {
	const ax = start[0] - q[0]
	const ay = start[1] - q[1]
	const bx = end[0] - q[0]
	const by = end[1] - q[1]
	return Math.atan2(ax * by - ay * bx, ax * bx + ay * by)
}

/** Distance regarded as zero, relative to the extent of the operands. */
const RELATIVE_TOLERANCE = 1e-6

/** The finest {@link PlanarOptions.tolerance} that floating point can resolve reliably. */
const MIN_RELATIVE_TOLERANCE = 1e-11

const SWEPT_MAX_DEPTH = 60

/**
 * Angle swept by `seg` on [t0, t1] as seen from `q` (exact up to floating point). Pieces
 * are bounded by {@link rangeBounds} on the original segment, which stays numerically
 * stable however small the piece gets.
 */
function sweptAngle(seg: Segment, q: vec2, t0 = 0, t1 = 1, depth = 0): number {
	if (seg.command === 'L') {
		return chordAngle(seg.start, seg.point, q)
	}
	const pa = Segment.point(seg, {time: t0})
	const pb = Segment.point(seg, {time: t1})
	const [[x0, y0], [x1, y1]] = rangeBounds(seg, t0, t1)
	const pad = 1e-12 * Math.max(x1 - x0, y1 - y0, 1)
	if (
		!(
			q[0] >= x0 - pad &&
			q[0] <= x1 + pad &&
			q[1] >= y0 - pad &&
			q[1] <= y1 + pad
		) ||
		depth >= SWEPT_MAX_DEPTH ||
		t1 - t0 < 1e-12
	) {
		return chordAngle(pa, pb, q)
	}
	const tm = (t0 + t1) / 2
	return (
		sweptAngle(seg, q, t0, tm, depth + 1) +
		sweptAngle(seg, q, tm, t1, depth + 1)
	)
}

/**
 * A run of consecutive segments of a curve. Seen from outside its box the run subtends less
 * than a half turn, so the angle it sweeps is the angle of the chord between its ends.
 */
interface WindingNode {
	start: vec2
	end: vec2
	box: Rect
	seg?: Segment
	left?: WindingNode
	right?: WindingNode
}

function windingTree(
	segs: Segment[],
	bounds: Rect[],
	lo: number,
	hi: number
): WindingNode {
	if (hi - lo === 1) {
		return {
			start: segs[lo].start,
			end: segs[lo].point,
			box: bounds[lo],
			seg: segs[lo],
		}
	}
	const mid = (lo + hi) >> 1
	const left = windingTree(segs, bounds, lo, mid)
	const right = windingTree(segs, bounds, mid, hi)
	return {
		start: left.start,
		end: right.end,
		box: Rect.unite(left.box, right.box),
		left,
		right,
	}
}

function sweptAngleOfTree(n: WindingNode, q: vec2): number {
	const [[x0, y0], [x1, y1]] = n.box
	const pad = 1e-12 * Math.max(x1 - x0, y1 - y0, 1)
	if (
		q[0] < x0 - pad ||
		q[0] > x1 + pad ||
		q[1] < y0 - pad ||
		q[1] > y1 + pad
	) {
		return chordAngle(n.start, n.end, q)
	}
	return n.seg
		? sweptAngle(n.seg, q)
		: sweptAngleOfTree(n.left!, q) + sweptAngleOfTree(n.right!, q)
}

/**
 * Static tree of boxes, to find those around a point or a box. An offset can have thousands
 * of operands, as it makes one per sheet.
 */
interface BoxNode {
	box: Rect
	item?: number
	left?: BoxNode
	right?: BoxNode
}

function boxTree(items: {box: Rect; item: number}[]): BoxNode | null {
	if (items.length === 0) return null
	if (items.length === 1) return items[0]
	let box = items[0].box
	for (const it of items) box = Rect.unite(box, it.box)
	const axis = box[1][0] - box[0][0] > box[1][1] - box[0][1] ? 0 : 1
	const sorted = items
		.slice()
		.sort(
			(a, b) =>
				a.box[0][axis] + a.box[1][axis] - b.box[0][axis] - b.box[1][axis]
		)
	const mid = sorted.length >> 1
	return {
		box,
		left: boxTree(sorted.slice(0, mid))!,
		right: boxTree(sorted.slice(mid))!,
	}
}

function visitBoxes(
	n: BoxNode | null,
	query: Rect,
	visit: (item: number) => void
) {
	if (!n) return
	const [[x0, y0], [x1, y1]] = n.box
	const [[qx0, qy0], [qx1, qy1]] = query
	if (qx1 < x0 || qx0 > x1 || qy1 < y0 || qy0 > y1) return
	if (n.item !== undefined) visit(n.item)
	else {
		visitBoxes(n.left!, query, visit)
		visitBoxes(n.right!, query, visit)
	}
}

/**
 * Whether the segment fits within `tolerance` of its start. Unlike {@link Segment.isZero},
 * whose threshold is absolute, this keeps the short edges of thin sheets: losing one would
 * break the winding numbers.
 */
function hasNoExtent(seg: Segment, tolerance: number): boolean {
	const near = (p: vec2) => vec2.distance(seg.start, p) <= tolerance
	if (!near(seg.point)) return false
	return seg.command !== 'C' || (near(seg.args[0]) && near(seg.args[1]))
}

/** Winding number of the closed curves around `q`. */
export function windingNumber(curves: Curve[], q: vec2): number {
	let sum = 0
	for (const curve of curves) {
		for (const seg of Curve.segments({
			vertices: curve.vertices,
			closed: true,
		})) {
			if (Segment.isZero(seg)) continue
			sum += sweptAngle(seg, q)
		}
	}
	return Math.round(sum / (2 * Math.PI))
}

/**
 * Runs the planar boolean over the operands and assembles the result.
 */
export function planarBoolean(
	operands: PlanarOperand[],
	options: PlanarOptions
): Path {
	// 1. Collect closed, non-degenerate segments
	const sources: SourceSegment[] = []
	const operandTrees: WindingNode[][] = operands.map(() => [])
	const operandBounds: (Rect | null)[] = operands.map(() => null)

	operands.forEach((op, oi) => {
		for (const {curve, tags} of op.curves) {
			const closed: Curve = {vertices: curve.vertices, closed: true}
			const runSegs: Segment[] = []
			const runBounds: Rect[] = []
			Curve.segments(closed).forEach((seg, si) => {
				if (hasNoExtent(seg, 0)) return
				const bounds = Segment.bounds(seg)
				runSegs.push(seg)
				runBounds.push(bounds)
				sources.push({seg, bounds, operand: oi, tag: tags?.[si], splits: []})
				operandBounds[oi] = operandBounds[oi]
					? Rect.unite(operandBounds[oi]!, bounds)
					: bounds
			})
			if (runSegs.length > 0) {
				operandTrees[oi].push(
					windingTree(runSegs, runBounds, 0, runSegs.length)
				)
			}
		}
	})

	if (sources.length === 0) {
		return {curves: []}
	}

	const total = Rect.unite(...sources.map(s => s.bounds))
	const [tw, th] = Rect.size(total)
	const scale = Math.max(tw, th, 1e-9)
	const tol = Math.max(
		Math.min(RELATIVE_TOLERANCE * scale, options.tolerance ?? Infinity),
		MIN_RELATIVE_TOLERANCE * scale
	)
	const nodes = new NodeStore(tol)

	const isInterior = (seg: Segment, p: vec2) =>
		vec2.distance(p, seg.start) > tol && vec2.distance(p, seg.point) > tol

	// 2. Intersections, in the order of the left sides of the boxes
	const order = sources
		.map((_, i) => i)
		.sort((a, b) => sources[a].bounds[0][0] - sources[b].bounds[0][0])
	const rank: number[] = []
	order.forEach((source, r) => (rank[source] = r))
	const sourceIndex = boxTree(sources.map((s, item) => ({box: s.bounds, item})))

	for (let ii = 0; ii < order.length; ii++) {
		const i = order[ii]
		const si = sources[i]

		// A cubic also has to be cut where it touches itself, and at its cusps, where it has
		// no normal to probe along
		const selfTimes =
			si.seg.command === 'C'
				? [
						...(CubicBezier.selfIntersectionTimes(si.seg) ?? []),
						...CubicBezier.cuspTimes(si.seg),
					]
				: []
		for (const t of selfTimes) {
			const p = Segment.point(si.seg, {time: t})
			if (isInterior(si.seg, p)) {
				si.splits.push({t, node: nodes.add(p)})
			}
		}

		const later: number[] = []
		visitBoxes(sourceIndex, Rect.offset(si.bounds, tol), j => {
			if (rank[j] > ii) later.push(rank[j])
		})
		later.sort((a, b) => a - b)

		for (const r of later) {
			const sj = sources[order[r]]
			for (const x of intersectSegments(si.seg, sj.seg, tol)) {
				const node = nodes.add(x.point)
				if (isInterior(si.seg, x.point)) si.splits.push({t: x.t1, node})
				if (isInterior(sj.seg, x.point)) sj.splits.push({t: x.t2, node})
			}
		}
	}

	// 3. Split into edges with snapped end points
	const edges: Edge[] = []
	for (const src of sources) {
		const n0 = nodes.add(src.seg.start)
		const n1 = nodes.add(src.seg.point)
		const stops = [
			{t: 0, node: n0},
			...src.splits.sort((a, b) => a.t - b.t),
			{t: 1, node: n1},
		]

		for (let i = 0; i + 1 < stops.length; i++) {
			const a = stops[i]
			const b = stops[i + 1]
			if (b.t - a.t < 1e-12) continue
			let piece = Segment.trim(
				src.seg,
				{time: a.t},
				{time: b.t},
				options.attrDefs
			)
			if (a.node === b.node && Segment.length(piece) <= 2 * tol) continue
			piece = {
				...piece,
				start: nodes.points[a.node],
				point: nodes.points[b.node],
			} as Segment
			if (hasNoExtent(piece, tol)) continue
			edges.push({seg: piece, from: a.node, to: b.node, tag: src.tag})
		}
	}

	// 4. Classify edges by probing both sides
	const operandIndex = boxTree(
		operandBounds.flatMap((b, item) =>
			b ? [{box: Rect.offset(b, tol), item}] : []
		)
	)
	const windings: number[] = operands.map(() => 0)
	const touched: number[] = []
	const insideAt = (q: vec2): boolean => {
		visitBoxes(operandIndex, [q, q], oi => {
			let sum = 0
			for (const tree of operandTrees[oi]) sum += sweptAngleOfTree(tree, q)
			const w = Math.round(sum / (2 * Math.PI))
			if (w !== 0) {
				windings[oi] = w
				touched.push(oi)
			}
		})
		const result = options.inside(windings, touched.length)
		for (const oi of touched) windings[oi] = 0
		touched.length = 0
		return result
	}

	const kept: Edge[] = []
	for (const e of edges) {
		const mid = Segment.point(e.seg, {time: 0.5})
		const n = unitNormalAt(e.seg, 0.5)
		const len = Segment.length(e.seg)
		const eps = Math.max(Math.min(0.01 * len, 10 * tol), tol)
		const inPlus = insideAt(vec2.scaleAndAdd(mid, n, eps))
		const inMinus = insideAt(vec2.scaleAndAdd(mid, n, -eps))
		if (inPlus === inMinus) continue
		kept.push(
			inPlus ? e : {...e, seg: Segment.reverse(e.seg), from: e.to, to: e.from}
		)
	}

	// 5. Dedupe coincident edges
	const byPair = new Map<string, Edge[]>()
	const unique: Edge[] = []
	for (const e of kept) {
		const key = `${e.from}>${e.to}`
		const list = byPair.get(key) ?? []
		const mid = Segment.point(e.seg, {time: 0.5})
		if (
			list.some(
				o => vec2.distance(Segment.point(o.seg, {time: 0.5}), mid) <= tol
			)
		) {
			continue
		}
		list.push(e)
		byPair.set(key, list)
		unique.push(e)
	}

	const candidates =
		options.assemble === 'open' && options.tag !== undefined
			? unique.filter(e => e.tag === options.tag)
			: unique

	return assemble(candidates, nodes.points, options.assemble, options.attrDefs)
}

function sameAttrs(a: Attributes | undefined, b: Attributes | undefined) {
	return a === b || JSON.stringify(a) === JSON.stringify(b)
}

function assemble(
	edges: Edge[],
	points: vec2[],
	mode: 'closed' | 'open',
	attrDefs?: AttributeDefs
): Path {
	const outgoing = new Map<number, Edge[]>()
	const incoming = new Map<number, number>()
	for (const e of edges) {
		const list = outgoing.get(e.from)
		if (list) list.push(e)
		else outgoing.set(e.from, [e])
		incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1)
	}

	const used = new Set<Edge>()

	const pickNext = (node: number, prev: Edge | null): Edge | null => {
		const list = outgoing.get(node)
		if (!list) return null
		const free = list.filter(e => !used.has(e))
		if (free.length === 0) return null
		if (free.length === 1 || !prev) return free[0]

		// Sharpest left turn keeps the region (which is on the left) connected
		const tin = unitTangentAt(prev.seg, 1)
		let best: Edge | null = null
		let bestAngle = -Infinity
		let bestCurv = -Infinity
		for (const e of free) {
			const tout = unitTangentAt(e.seg, 0)
			const angle = Math.atan2(cross2(tin, tout), vec2.dot(tin, tout))
			const curv = Segment.curvature(e.seg, {time: 0})
			if (
				angle > bestAngle + 1e-9 ||
				(Math.abs(angle - bestAngle) <= 1e-9 && curv > bestCurv)
			) {
				best = e
				bestAngle = angle
				bestCurv = curv
			}
		}
		return best
	}

	const curves: Curve[] = []

	const walk = (start: Edge) => {
		const chain: Edge[] = [start]
		used.add(start)
		let node = start.to
		let prev: Edge = start
		while (node !== start.from) {
			const next = pickNext(node, prev)
			if (!next) break
			chain.push(next)
			used.add(next)
			node = next.to
			prev = next
		}
		const returned = node === start.from
		curves.push(
			toCurve(
				mergeChain(chain, returned),
				points,
				returned,
				mode === 'closed',
				attrDefs
			)
		)
	}

	if (mode === 'open') {
		// Start chains at nodes that are not reached by any edge first
		for (const e of edges) {
			if (used.has(e)) continue
			if ((incoming.get(e.from) ?? 0) === 0) walk(e)
		}
	}
	for (const e of edges) {
		if (!used.has(e)) walk(e)
	}

	return {curves}
}

/** Merges two consecutive edges when they continue the same line or circle. */
function mergeEdges(a: Edge, b: Edge): Edge | null {
	// Removing the vertex between them must not change what can be read along the way
	if (!sameAttrs(a.seg.startAttrs, a.seg.attrs)) return null
	if (!sameAttrs(a.seg.attrs, b.seg.startAttrs)) return null
	if (!sameAttrs(b.seg.startAttrs, b.seg.attrs)) return null

	if (a.seg.command === 'L' && b.seg.command === 'L') {
		const d1 = vec2.sub(a.seg.point, a.seg.start)
		const d2 = vec2.sub(b.seg.point, b.seg.start)
		const l1 = vec2.len(d1)
		const l2 = vec2.len(d2)
		if (l1 === 0 || l2 === 0) return null
		if (vec2.dot(d1, d2) <= 0) return null
		if (Math.abs(cross2(d1, d2)) > 1e-9 * l1 * l2) return null
		return {
			...a,
			seg: {...a.seg, command: 'L', point: b.seg.point},
			to: b.to,
		}
	}

	if (a.seg.command === 'A' && b.seg.command === 'A') {
		const pa = Arc.toCenterParameterization(a.seg)
		const pb = Arc.toCenterParameterization(b.seg)
		const r = Math.max(pa.radii[0], pa.radii[1])
		const tol = 1e-9 * Math.max(r, 1)
		if (
			pa.sweep !== pb.sweep ||
			Math.abs(pa.radii[0] - pb.radii[0]) > tol ||
			Math.abs(pa.radii[1] - pb.radii[1]) > tol ||
			Math.abs(pa.xAxisRotation - pb.xAxisRotation) > 1e-9 ||
			vec2.distance(pa.center, pb.center) > tol
		) {
			return null
		}
		const total =
			Math.abs(pa.angles[1] - pa.angles[0]) +
			Math.abs(pb.angles[1] - pb.angles[0])
		if (total >= 360 - 1e-9) return null
		const [radii, rotation] = a.seg.args
		return {
			...a,
			seg: {
				...a.seg,
				command: 'A',
				start: a.seg.start,
				args: [radii, rotation, total > 180, pa.sweep],
				point: b.seg.point,
			},
			to: b.to,
		}
	}

	return null
}

function mergeChain(chain: Edge[], closed: boolean): Edge[] {
	const out: Edge[] = []
	for (const e of chain) {
		const prev = out[out.length - 1]
		const merged = prev ? mergeEdges(prev, e) : null
		if (merged) out[out.length - 1] = merged
		else out.push(e)
	}
	while (closed && out.length > 1) {
		const merged = mergeEdges(out[out.length - 1], out[0])
		if (!merged) break
		out[out.length - 1] = merged
		out.shift()
	}
	return out
}

/**
 * `returned`: the chain ends at its start node, so the last edge becomes the closing
 * segment. `forceClose`: close an unfinished chain with a straight line.
 */
function toCurve(
	chain: Edge[],
	points: vec2[],
	returned: boolean,
	forceClose: boolean,
	attrDefs?: AttributeDefs
): Curve {
	// Where a curve hands over to another, the two values may differ: their average keeps
	// the attribute continuous. An edge with no value simply takes the other's.
	const asVertex = (e: Edge, i: number): Vertex => {
		const next =
			i + 1 < chain.length ? chain[i + 1] : returned ? chain[0] : null
		const attrs = interpolateAttrs(
			e.seg.attrs,
			next?.seg.startAttrs,
			0.5,
			attrDefs
		)
		return {
			command: e.seg.command,
			args: e.seg.args,
			point: e.seg.point,
			...(attrs ? {attrs} : {}),
		} as Vertex
	}

	const start = points[chain[0].from]
	const startAttrs = chain[0].seg.startAttrs

	if (returned) {
		const lastIndex = chain.length - 1
		const first = {
			...asVertex(chain[lastIndex], lastIndex),
			point: start,
		} as Vertex
		return {
			vertices: [first, ...chain.slice(0, -1).map(asVertex)],
			closed: true,
		}
	}

	return {
		vertices: [
			{command: 'L', point: start, ...(startAttrs ? {attrs: startAttrs} : {})},
			...chain.map(asVertex),
		],
		closed: forceClose,
	}
}
