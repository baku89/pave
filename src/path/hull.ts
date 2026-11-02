import {Rect} from 'geome'
import {scalar, vec2} from 'linearly'

import {segmentToVertex} from '../attributes'
import {type Path, Segment, type Vertex} from '../index'
import type {TimePathLocation} from '../Location'
import {windingNumber} from './planar'

/**
 * A point on a path, with where it lies.
 * @category Types
 */
export interface PathPoint {
	point: vec2
	location: Required<TimePathLocation>
}

/**
 * A point where a line touches the path.
 * @category Types
 */
export interface TangentHit extends PathPoint {
	/** The direction of the touching line. */
	tangent: vec2
	/**
	 * On which side of the directed tangent line the path lies near the point: `left` is the side of {@link Path.normal} of `tangent`. `cross` when the line crosses the path there, as at an inflection.
	 */
	side: 'left' | 'right' | 'cross'
}

/**
 * The options for {@link Path.tangentsAlong} and {@link Path.tangentsFrom}.
 * @category Options
 */
export interface TangentsOptions {
	/**
	 * When true, only the two tangents that bound the whole path are returned: the silhouette seen from the light. Otherwise every local tangent is returned.
	 * @default false
	 */
	extreme?: boolean
}

/**
 * The options for {@link Path.convexHull}.
 * @category Options
 */
export interface ConvexHullOptions {
	/**
	 * The number of directions the hull is swept with. The switches between segments are refined by bisection afterwards, so this only has to be fine enough to notice every segment on the hull.
	 * @default 720
	 */
	steps?: number
}

/**
 * A rectangle of any rotation.
 * @category Types
 */
export interface OrientedRect {
	center: vec2
	size: vec2
	/** The rotation of the rectangle in degrees */
	rotation: number
	/** The four corners, in order around the rectangle */
	corners: [vec2, vec2, vec2, vec2]
}

const cross = (a: vec2, b: vec2) => a[0] * b[1] - a[1] * b[0]

/** A segment of the path with its indices. */
interface IndexedSegment {
	seg: Segment
	curveIndex: number
	segmentIndex: number
	/** True when the segment ends at the first vertex of its curve */
	closing: boolean
}

function indexedSegments(path: Path): IndexedSegment[] {
	const out: IndexedSegment[] = []
	path.curves.forEach((curve, curveIndex) => {
		const segs = segmentsOf(curve)
		segs.forEach((seg, segmentIndex) => {
			out.push({
				seg,
				curveIndex,
				segmentIndex,
				closing: curve.closed && segmentIndex === segs.length - 1,
			})
		})
	})
	return out
}

function segmentsOf(curve: Path['curves'][number]): Segment[] {
	const segs: Segment[] = []
	const {vertices, closed} = curve
	for (let i = 1; i < vertices.length; i++) {
		segs.push({...vertices[i], start: vertices[i - 1].point} as Segment)
	}
	if (closed && vertices.length > 1) {
		segs.push({...vertices[0], start: vertices.at(-1)!.point} as Segment)
	}
	return segs
}

function locationOf(
	{curveIndex, segmentIndex}: IndexedSegment,
	time: number
): Required<TimePathLocation> {
	return {time, curveIndex, segmentIndex}
}

/**
 * On which side of the line through `point` along `direction` the path lies, judging by samples slightly before and after the location.
 */
function sideAt(
	segs: IndexedSegment[],
	index: number,
	time: number,
	direction: vec2
): TangentHit['side'] {
	const {seg} = segs[index]
	const point = Segment.point(seg, {time})
	const h = 1e-3

	const sample = (t: number): vec2 => {
		if (t < 0) {
			const prev = neighbor(segs, index, -1)
			return prev
				? Segment.point(prev.seg, {time: 1 + t})
				: Segment.point(seg, {time: 0})
		}
		if (t > 1) {
			const next = neighbor(segs, index, 1)
			return next
				? Segment.point(next.seg, {time: t - 1})
				: Segment.point(seg, {time: 1})
		}
		return Segment.point(seg, {time: t})
	}

	const before = cross(direction, vec2.sub(sample(time - h), point))
	const after = cross(direction, vec2.sub(sample(time + h), point))
	const eps =
		1e-12 * Math.max(1, vec2.len(direction)) * Math.max(1, vec2.len(point))

	if (before > eps && after > eps) return 'left'
	if (before < -eps && after < -eps) return 'right'
	if (Math.abs(before) <= eps)
		return after > 0 ? 'left' : after < 0 ? 'right' : 'cross'
	if (Math.abs(after) <= eps) return before > 0 ? 'left' : 'right'
	return 'cross'
}

/** The segment before or after the given one along its curve, wrapping on closed curves. */
function neighbor(
	segs: IndexedSegment[],
	index: number,
	offset: -1 | 1
): IndexedSegment | null {
	const self = segs[index]
	const other = segs[index + offset]
	if (other && other.curveIndex === self.curveIndex) return other

	// Wrap around a closed curve
	const curve = segs.filter(s => s.curveIndex === self.curveIndex)
	if (!curve.at(-1)!.closing) return null
	return offset === 1 ? curve[0] : curve.at(-1)!
}

/**
 * The tangent hits at the vertices: a line through a corner along `direction` touches the path when both neighbouring tangents point to the same side of it.
 */
function cornerHits(
	segs: IndexedSegment[],
	directionAt: (point: vec2) => vec2
): TangentHit[] {
	const hits: TangentHit[] = []

	segs.forEach((cur, index) => {
		const next = neighbor(segs, index, 1)
		if (!next) return

		const point = cur.seg.point
		const direction = directionAt(point)
		const tIn = Segment.tangent(cur.seg, {time: 1})
		const tOut = Segment.tangent(next.seg, {time: 0})
		const a = cross(direction, vec2.neg(tIn))
		const b = cross(direction, tOut)
		const eps = 1e-9 * vec2.len(direction)

		let side: TangentHit['side'] | null = null
		if (a > eps && b > eps) side = 'left'
		else if (a < -eps && b < -eps) side = 'right'
		else if (Math.abs(a) <= eps && Math.abs(b) <= eps) {
			// Smooth vertex whose tangent is the direction itself
			side = sideAt(segs, index, 1, direction)
		} else if (Math.abs(a) <= eps || Math.abs(b) <= eps) {
			// One of the neighbours runs along the line, the other leaves it to one side
			side = a + b > 0 ? 'left' : 'right'
		}

		if (side) {
			hits.push({
				point,
				location: locationOf(cur, 1),
				tangent: vec2.normalize(direction),
				side,
			})
		}
	})

	return hits
}

function sortHits<T extends PathPoint>(hits: T[]): T[] {
	return hits.sort(
		(a, b) =>
			a.location.curveIndex - b.location.curveIndex ||
			a.location.segmentIndex - b.location.segmentIndex ||
			a.location.time - b.location.time
	)
}

/**
 * The point of the path farthest along `direction`: the support point of the path in that direction. Ties are broken by the first found.
 * @param path The path to query
 * @param direction The direction to measure along. Its length does not matter.
 * @returns The farthest point, or null for an empty path
 * @category Properties
 */
export function supportPoint(path: Path, direction: vec2): PathPoint | null {
	const perp = vec2.rotate(direction, 90)
	let best: PathPoint | null = null
	let bestValue = -Infinity

	for (const indexed of indexedSegments(path)) {
		const {seg} = indexed
		const times = [0, 1, ...Segment.tangentTimes(seg, perp)]
		for (const time of times) {
			const point = Segment.point(seg, {time})
			const value = vec2.dot(point, direction)
			if (value > bestValue) {
				bestValue = value
				best = {point, location: locationOf(indexed, time)}
			}
		}
	}

	return best
}

/**
 * Where lines parallel to `direction` touch the path. With `extreme`, only the two lines that enclose the whole path are returned, which is the silhouette of the path under a parallel light along `direction`.
 * @param path The path to query
 * @param direction The direction of the tangent lines
 * @param options The options
 * @returns The tangent hits, ordered along the path
 * @category Properties
 */
export function tangentsAlong(
	path: Path,
	direction: vec2,
	{extreme = false}: TangentsOptions = {}
): TangentHit[] {
	const tangent = vec2.normalize(direction)

	if (extreme) {
		const perp = vec2.rotate(tangent, 90)
		const left = supportPoint(path, vec2.neg(perp))
		const right = supportPoint(path, perp)
		if (!left || !right) return []
		// The path lies away from the support direction
		return sortHits([
			{...left, tangent, side: 'left'},
			{...right, tangent, side: 'right'},
		])
	}

	const segs = indexedSegments(path)
	const hits: TangentHit[] = []

	segs.forEach((indexed, index) => {
		for (const time of Segment.tangentTimes(indexed.seg, tangent)) {
			hits.push({
				point: Segment.point(indexed.seg, {time}),
				location: locationOf(indexed, time),
				tangent,
				side: sideAt(segs, index, time, tangent),
			})
		}
	})

	hits.push(...cornerHits(segs, () => tangent))

	return sortHits(hits)
}

/**
 * Where lines through `origin` touch the path. With `extreme`, only the two lines that enclose the whole path as seen from `origin` are returned, which is the silhouette of the path under a point light at `origin`; it is empty when `origin` is inside the path.
 * @param path The path to query
 * @param origin The point the tangent lines pass through
 * @param options The options
 * @returns The tangent hits, ordered along the path. The `tangent` of each points away from `origin`.
 * @category Properties
 */
export function tangentsFrom(
	path: Path,
	origin: vec2,
	{extreme = false}: TangentsOptions = {}
): TangentHit[] {
	const segs = indexedSegments(path)
	const directionAt = (point: vec2) => vec2.sub(point, origin)
	const hits: TangentHit[] = []

	segs.forEach((indexed, index) => {
		for (const time of Segment.tangentTimesFrom(indexed.seg, origin)) {
			const point = Segment.point(indexed.seg, {time})
			const direction = directionAt(point)
			hits.push({
				point,
				location: locationOf(indexed, time),
				tangent: vec2.normalize(direction),
				side: sideAt(segs, index, time, direction),
			})
		}
	})

	hits.push(...cornerHits(segs, directionAt))

	if (!extreme) {
		return sortHits(hits)
	}

	if (windingNumber(path.curves, origin) !== 0) return []

	// Every vertex is a candidate too, so that the ends of open curves count
	const candidates: PathPoint[] = [...hits]
	segs.forEach(indexed => {
		candidates.push({
			point: indexed.seg.point,
			location: locationOf(indexed, 1),
		})
		if (indexed.segmentIndex === 0) {
			candidates.push({
				point: indexed.seg.start,
				location: locationOf(indexed, 0),
			})
		}
	})

	const reference = vec2.sub(Rect.center(boundsOf(path)), origin)
	const angleOf = ({point}: PathPoint) => {
		const v = vec2.sub(point, origin)
		return Math.atan2(cross(reference, v), vec2.dot(reference, v))
	}

	let min: PathPoint | null = null
	let max: PathPoint | null = null
	let minAngle = Infinity
	let maxAngle = -Infinity
	for (const candidate of candidates) {
		if (vec2.approx(candidate.point, origin)) continue
		const angle = angleOf(candidate)
		if (angle < minAngle) {
			minAngle = angle
			min = candidate
		}
		if (angle > maxAngle) {
			maxAngle = angle
			max = candidate
		}
	}

	if (!min || !max) return []

	return sortHits([
		{...min, tangent: vec2.normalize(directionAt(min.point)), side: 'left'},
		{...max, tangent: vec2.normalize(directionAt(max.point)), side: 'right'},
	])
}

function boundsOf(path: Path): Rect {
	const rects = indexedSegments(path).map(({seg}) => Segment.bounds(seg))
	return rects.length > 0 ? Rect.unite(...rects) : [vec2.zero, vec2.zero]
}

/** The support of the path in a direction, keyed so that runs of the same support can be told apart. */
interface Support {
	index: number
	time: number
	point: vec2
	/** Identifies the vertex when the support is one, otherwise the segment */
	key: string
}

/**
 * The exact convex hull of the path. Unlike the hull of the control points or of a flattened polygon, the result keeps the curved parts of the path that lie on the hull, joining them with the common tangents.
 *
 * The hull is traced by sweeping the support direction around: while the farthest point stays on one segment the hull follows that segment, and when it jumps to another segment the two support points are joined by a line.
 * @param path The path to wrap
 * @param options The options
 * @returns A closed path. An empty path for an empty input.
 * @category Properties
 */
export function convexHull(
	path: Path,
	{steps = 720}: ConvexHullOptions = {}
): Path {
	const segs = indexedSegments(path).filter(s => !Segment.isZero(s.seg))

	if (segs.length === 0) {
		const point = path.curves[0]?.vertices[0]?.point
		return point
			? {curves: [{vertices: [{point, command: 'L'}], closed: true}]}
			: {curves: []}
	}

	const support = (angle: number): Support => {
		const direction = vec2.dir(angle)
		const perp = vec2.rotate(direction, 90)
		let best = null as Support | null
		let bestValue = -Infinity

		segs.forEach(({seg, curveIndex}, index) => {
			const times = [0, 1, ...Segment.tangentTimes(seg, perp)]
			for (const time of times) {
				const point = Segment.point(seg, {time})
				const value = vec2.dot(point, direction)
				if (
					best === null ||
					value > bestValue + 1e-12 * Math.max(1, Math.abs(bestValue))
				) {
					bestValue = value
					const atVertex = time === 0 || time === 1
					best = {
						index,
						time,
						point,
						key: atVertex
							? `v${curveIndex}:${vertexId(segs, index, time)}`
							: `s${index}`,
					}
				}
			}
		})

		return best!
	}

	const samples: Support[] = []
	for (let i = 0; i < steps; i++) {
		samples.push(support((360 * i) / steps))
	}

	// Start the sweep at a change of support so that runs do not wrap
	const start = samples.findIndex((s, i) => s.key !== samples.at(i - 1)!.key)
	if (start < 0) {
		// A single support all around: the path is a point or a single closed curve segment
		const {point} = samples[0]
		return {curves: [{vertices: [{point, command: 'L'}], closed: true}]}
	}

	interface Run {
		key: string
		index: number
		from: Support
		to: Support
	}

	const runs: Run[] = []
	for (let k = 0; k < steps; k++) {
		const i = (start + k) % steps
		const s = samples[i]
		const last = runs.at(-1)
		if (last && last.key === s.key) {
			last.to = s
		} else {
			runs.push({key: s.key, index: s.index, from: s, to: s})
		}
	}
	if (runs.length > 1 && runs[0].key === runs.at(-1)!.key) {
		runs[0].from = runs.pop()!.from
	}

	// Refine the switching angles between runs
	const stepAngle = 360 / steps
	const angleOf = (s: Support) => samples.indexOf(s) * stepAngle
	for (let r = 0; r < runs.length; r++) {
		const run = runs[r]
		const next = runs[(r + 1) % runs.length]
		let lo = angleOf(run.to)
		let hi = lo + stepAngle
		let sLo = run.to
		let sHi = next.from
		for (let k = 0; k < 48; k++) {
			const mid = (lo + hi) / 2
			const s = support(mid)
			if (s.key === run.key) {
				lo = mid
				sLo = s
			} else {
				hi = mid
				if (s.key === next.key) sHi = s
			}
		}
		run.to = sLo
		next.from = sHi
	}

	const extent = Math.max(...Rect.size(boundsOf(path)), 1)
	const near = (a: vec2, b: vec2) => vec2.distance(a, b) <= 1e-6 * extent
	const snap = (t: number) => (t < 1e-5 ? 0 : t > 1 - 1e-5 ? 1 : t)

	const vertices: Vertex[] = []
	const push = (vertex: Vertex) => {
		const last = vertices.at(-1)
		if (last && near(last.point, vertex.point) && vertex.command === 'L') {
			return
		}
		vertices.push(vertex)
	}

	for (const run of runs) {
		if (run.key.startsWith('v')) {
			push({point: run.from.point, command: 'L'})
			continue
		}

		const {seg} = segs[run.index]
		const t0 = snap(run.from.time)
		const t1 = snap(run.to.time)
		if (Math.abs(t1 - t0) < 1e-9) {
			push({point: run.from.point, command: 'L'})
			continue
		}

		let piece = Segment.trim(seg, {time: t0}, {time: t1}, path.attrDefs)
		if (t0 > t1 && seg.command === 'A') {
			piece = Segment.reverse(Segment.trim(seg, {time: t1}, {time: t0}))
		}
		push({point: piece.start, command: 'L'})
		push(segmentToVertex(piece))
	}

	// A closed curve connects its last vertex back to the first with the command of the first
	const first = vertices[0]
	const last = vertices.at(-1)
	if (vertices.length > 1 && first && last && near(first.point, last.point)) {
		vertices.pop()
		if (last.command !== 'L') {
			vertices[0] = last
		}
	}

	return {curves: [{vertices, closed: true}]}
}

/** A stable id for the vertex at the given end of a segment. */
function vertexId(segs: IndexedSegment[], index: number, time: number) {
	const self = segs[index]
	if (time === 0) {
		const prev = neighbor(segs, index, -1)
		return prev ? `${prev.segmentIndex}e` : `${self.segmentIndex}s`
	}
	return `${self.segmentIndex}e`
}

/**
 * The smallest rectangle of any rotation that contains the path, found by rotating calipers over the flattened convex hull.
 * @param path The path to bound
 * @param tolerance How finely curved parts of the hull are flattened
 * @returns The rectangle, or null for an empty path
 * @category Properties
 */
export function orientedBounds(
	path: Path,
	tolerance = 0.05
): OrientedRect | null {
	const hull = convexHull(path)
	const curve = hull.curves[0]
	if (!curve || curve.vertices.length === 0) return null

	const points: vec2[] = []
	for (const seg of segmentsOf(curve)) {
		if (seg.command === 'L' || Segment.isStraight(seg, tolerance)) {
			points.push(seg.start)
			continue
		}
		const n = Math.max(
			2,
			Math.ceil(Segment.length(seg) / Math.max(tolerance, 1e-6) / 4)
		)
		for (let i = 0; i < n; i++) {
			points.push(Segment.point(seg, {time: i / n}))
		}
	}
	if (points.length === 0) points.push(curve.vertices[0].point)

	let best = null as OrientedRect | null
	let bestArea = Infinity

	const consider = (rotation: number) => {
		const inv = vec2.dir(-rotation)
		let minX = Infinity
		let minY = Infinity
		let maxX = -Infinity
		let maxY = -Infinity
		for (const p of points) {
			const x = p[0] * inv[0] - p[1] * inv[1]
			const y = p[0] * inv[1] + p[1] * inv[0]
			minX = Math.min(minX, x)
			maxX = Math.max(maxX, x)
			minY = Math.min(minY, y)
			maxY = Math.max(maxY, y)
		}
		const size: vec2 = [maxX - minX, maxY - minY]
		const area = size[0] * size[1]
		if (area < bestArea - 1e-12) {
			bestArea = area
			const local = (x: number, y: number): vec2 =>
				vec2.rotate([x, y], rotation)
			best = {
				center: local((minX + maxX) / 2, (minY + maxY) / 2),
				size,
				rotation: scalar.mod(rotation, 180),
				corners: [
					local(minX, minY),
					local(maxX, minY),
					local(maxX, maxY),
					local(minX, maxY),
				],
			}
		}
	}

	if (points.length === 1) {
		consider(0)
	} else {
		for (let i = 0; i < points.length; i++) {
			const edge = vec2.sub(points[(i + 1) % points.length], points[i])
			if (vec2.len(edge) < 1e-12) continue
			consider(vec2.angle(edge))
		}
	}

	return best
}
