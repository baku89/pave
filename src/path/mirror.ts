/**
 * Symmetrization by mirrors: one axis, the mirrors of a kaleidoscope, or those of a tiling.
 *
 * The walls are straight lines whose kept sides meet in a convex domain. Each curve is cut
 * where it crosses a wall, everything outside the domain is dropped, and each remaining chain
 * is unfolded: an image of it under a product of reflections, reversed if that product flips,
 * is joined at a wall with its image across that wall. No boolean operation is involved. An
 * image and its neighbour across a wall meet the wall from both sides, and a reversed
 * reflection has its left side where the original has it, so the result has exactly the
 * jumps in winding number of the source seen through the folding of the plane onto the
 * domain. Winding numbers therefore come out as that of the source at the folded point: holes
 * stay holes, for both fill rules and even for self-intersecting input.
 *
 * A finite part of a tiling has an edge, across which there is nothing to join with. What is
 * inside the source there is closed along that edge, for it to be filled as it should be.
 */
import {Line as AxisLine, type Rect} from 'geome'
import {mat2d, scalar, vec2} from 'linearly'

import {completeVertexAttrs, segmentToVertex, withCurves} from '../attributes'
import {Arc, Curve, type Path, Segment, type SegmentC} from '../index'
import {solveCubic} from '../numeric'
import {transform} from './modifiers'
import {windingNumber} from './planar'
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

/** As many images of a tile as there can be, the nearest first, so as to always come to an end. */
const MAX_IMAGES = 10000

/** How far from what a tile has to have an angle can be, in degrees, and still be taken for it. */
const CELL_ANGLE_TOLERANCE = 1

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

/** A mirror, whose kept side is the one its normal points to. */
interface Wall {
	line: AxisLine
	distance: (p: vec2) => number
	reflection: mat2d
}

function toWall(axis: MirrorAxis): Wall {
	const line = toLine(axis)
	return {
		line,
		distance: signedDistanceFn(line),
		reflection: AxisLine.reflectionMatrix(line),
	}
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
 * Cuts the segment where it crosses a wall into pieces that are entirely kept or dropped.
 * Adjacent pieces of the same kind are merged. Pieces on a wall itself count as dropped.
 */
function splitByWalls(
	seg: Segment,
	walls: readonly Wall[],
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

	const crossings = walls
		.flatMap(({distance, line}) => crossingTimes(seg, distance, line, epsilon))
		.filter(t => t > TIME_EPSILON && t < 1 - TIME_EPSILON)
		.sort((a, b) => a - b)

	// Where two walls meet, a segment going through there crosses both at the same time
	const times = [0]
	for (const t of crossings) {
		if (t - times[times.length - 1] > TIME_EPSILON) times.push(t)
	}
	times.push(1)

	const spans: {from: number; to: number; keep: boolean}[] = []
	for (let i = 0; i + 1 < times.length; i++) {
		const from = times[i]
		const to = times[i + 1]
		const mid = Segment.point(seg, {time: (from + to) / 2})
		const keep = walls.every(({distance}) => distance(mid) > epsilon)

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

/** A part of a curve inside the domain. Its first vertex says only where it starts. */
interface Chain {
	vertices: Vertex[]
	/** The wall each end is on, to be joined across, or -1 for one that is free. */
	start: number
	end: number
}

/**
 * The parts of a curve inside the domain, or 'whole' for a closed curve that is all inside.
 * An end on a wall is projected onto it, for its images on both sides to meet exactly.
 */
function chainsOf(
	curve: Curve,
	walls: readonly Wall[],
	epsilon: number,
	attrDefs?: AttributeDefs
): 'whole' | Chain[] {
	let pieces = Curve.segments(curve)
		.filter(seg => !Segment.isZero(seg))
		.flatMap(seg => splitByWalls(seg, walls, epsilon, attrDefs))

	if (curve.closed) {
		if (pieces.every(piece => piece.keep)) {
			return pieces.length > 0 ? 'whole' : []
		}

		// Start right after a dropped piece, so that no chain wraps around the seam
		const firstDropped = pieces.findIndex(piece => !piece.keep)
		pieces = [...pieces.slice(firstDropped), ...pieces.slice(0, firstDropped)]
	}

	// A cut is on whichever wall is nearest, and any end may happen to be on one
	const wallAt = (p: vec2, cut: boolean): number => {
		let nearest = -1
		let nearestDistance = Infinity
		walls.forEach(({distance}, i) => {
			const d = Math.abs(distance(p))
			if (d < nearestDistance) {
				nearest = i
				nearestDistance = d
			}
		})
		return cut || nearestDistance <= epsilon ? nearest : -1
	}

	const chains: Chain[] = []
	let run: Segment[] = []
	let cutAtStart = false

	const flush = (cutAtEnd: boolean) => {
		if (run.length === 0) return

		const start = wallAt(run[0].start, cutAtStart)
		const end = wallAt(run[run.length - 1].point, cutAtEnd)
		const {startAttrs} = run[0]

		const vertices: Vertex[] = [
			{
				command: 'L',
				point:
					start >= 0
						? AxisLine.closest(walls[start].line, run[0].start)
						: run[0].start,
				...(startAttrs ? {attrs: startAttrs} : {}),
			},
			...run.map(segmentToVertex),
		]
		if (end >= 0) {
			const last = vertices[vertices.length - 1]
			vertices[vertices.length - 1] = {
				...last,
				point: AxisLine.closest(walls[end].line, last.point),
			}
		}

		chains.push({vertices, start, end})
		run = []
	}

	pieces.forEach((piece, i) => {
		if (piece.keep) {
			if (run.length === 0) cutAtStart = i > 0
			run.push(piece.seg)
		} else {
			flush(true)
		}
	})
	flush(curve.closed)

	return chains
}

/** The products of reflections to take images by, with which is across each wall from which. */
interface Unfolding {
	images: mat2d[]
	/** The index of the image across each wall from each image, or -1 if it is not among them. */
	across: number[][]
}

/**
 * Generates the images from the identity across the walls, for as long as `within` admits
 * them, and leaves those that `kept` admits. Images are told apart by where they take `probe`,
 * a point strictly inside the domain: the nearest two can be is across the wall nearest to it,
 * however far they have come by products that each add a little error. Comparing the matrices
 * by rounding them would tell an image from itself wherever that error crosses a rounding
 * boundary, and the images across a wall would then not be across it from each other.
 */
function unfoldingOf(
	walls: readonly Wall[],
	probe: vec2,
	within: (image: mat2d) => boolean = () => true,
	kept: (image: mat2d) => boolean = () => true
): Unfolding {
	const tolerance =
		Math.min(...walls.map(({distance}) => Math.abs(distance(probe)))) / 2
	const bucketSize = tolerance * 2

	const images: mat2d[] = [mat2d.ident]
	const places: vec2[] = [probe]
	const buckets = new Map<string, number[]>()
	const bucketAt = ([x, y]: vec2, dx = 0, dy = 0) =>
		`${Math.floor(x / bucketSize) + dx},${Math.floor(y / bucketSize) + dy}`
	buckets.set(bucketAt(probe), [0])

	const indexAt = (place: vec2): number => {
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				for (const i of buckets.get(bucketAt(place, dx, dy)) ?? []) {
					if (vec2.dist(places[i], place) <= tolerance) return i
				}
			}
		}
		return -1
	}

	const neighbours: number[][] = []
	for (let i = 0; i < images.length; i++) {
		neighbours.push(
			walls.map(({reflection}) => {
				const image = mat2d.mul(images[i], reflection)
				const place = vec2.transformMat2d(probe, image)
				const found = indexAt(place)
				if (found >= 0 || images.length >= MAX_IMAGES || !within(image)) {
					return found
				}
				const key = bucketAt(place)
				buckets.set(key, [...(buckets.get(key) ?? []), images.length])
				images.push(image)
				places.push(place)
				return images.length - 1
			})
		)
	}

	const keptIndices: number[] = []
	const keptImages: mat2d[] = []
	images.forEach((image, i) => {
		keptIndices[i] = kept(image) ? keptImages.push(image) - 1 : -1
	})

	return {
		images: keptImages,
		// Going across a wall and back comes to where it started, or it is not across it
		across: images.flatMap((_, i) =>
			keptIndices[i] < 0
				? []
				: [
						neighbours[i].map((j, wall) =>
							j >= 0 && neighbours[j]?.[wall] === i ? keptIndices[j] : -1
						),
					]
		),
	}
}

const flips = ([a, b, c, d]: mat2d) => a * d - b * c < 0

function imageOf(curve: Curve, image: mat2d): Curve {
	if (image === mat2d.ident) return curve
	const moved = transform({curves: [curve]}, image).curves[0]
	return flips(image) ? Curve.reverse(moved) : moved
}

/** Where an unfolded chain ends at the edge of the images taken, in terms of the source. */
interface EdgeEnd {
	image: number
	wall: number
	point: vec2
}

/**
 * Joins the images of a chain, each with its neighbours across the walls its ends are on. The
 * images run through as a line or a loop, as each has at most those two neighbours.
 */
function unfoldChain(
	chain: Chain,
	{images, across}: Unfolding,
	attrs: Curve['attrs']
): {curve: Curve; ends: EdgeEnd[]}[] {
	const halfCurve: Curve = {vertices: chain.vertices, closed: false}
	const sourcePoints = [chain.vertices[0].point, chain.vertices.at(-1)!.point]

	// An image that flips runs through the chain from its end
	const entry = (i: number) => (flips(images[i]) ? chain.end : chain.start)
	const exit = (i: number) => (flips(images[i]) ? chain.start : chain.end)
	const entryPoint = (i: number) => sourcePoints[flips(images[i]) ? 1 : 0]
	const exitPoint = (i: number) => sourcePoints[flips(images[i]) ? 0 : 1]
	const step = (i: number, wall: number) => (wall < 0 ? -1 : across[i][wall])

	const visited = images.map(() => false)
	const out: {curve: Curve; ends: EdgeEnd[]}[] = []

	images.forEach((_, from) => {
		if (visited[from]) return

		let first = from
		for (let steps = 0; steps < images.length; steps++) {
			const previous = step(first, entry(first))
			if (previous < 0 || previous === from) break
			first = previous
		}

		const run: number[] = []
		let at = first
		do {
			visited[at] = true
			run.push(at)
			at = step(at, exit(at))
		} while (at >= 0 && !visited[at])

		const closed = at === first
		const vertices = run.flatMap((i, n) => {
			const {vertices} = imageOf(halfCurve, images[i])
			return n === 0 ? vertices : vertices.slice(1)
		})

		const curve: Curve = closed
			? {
					vertices: [
						...vertices.slice(1, -1),
						{...vertices[vertices.length - 1], point: vertices[0].point},
					],
					closed: true,
				}
			: {vertices, closed: false}

		const last = run[run.length - 1]
		const ends: EdgeEnd[] = closed
			? []
			: [
					{image: first, wall: entry(first), point: entryPoint(first)},
					{image: last, wall: exit(last), point: exitPoint(last)},
				].filter(({wall}) => wall >= 0)

		out.push({curve: attrs ? {...curve, attrs} : curve, ends})
	})

	return out
}

/**
 * Closes what is inside the source along the edge of the images taken, where the walls of the
 * domain `cell` have nothing across them. The stretches of that edge between the ends in
 * `open` go as many times as the winding number there says, and the ends of the curves and
 * of those stretches then meet in pairs, as the jumps in winding number balance out at each.
 */
function closeAlongEdge(
	open: {curve: Curve; ends: EdgeEnd[]}[],
	sources: Curve[],
	cell: readonly vec2[],
	walls: readonly Wall[],
	{images, across}: Unfolding
): Curve[] {
	const scale = cellScale(cell)
	const keyOf = ([x, y]: vec2) =>
		`${Math.round((x / scale) * 1e6)},${Math.round((y / scale) * 1e6)}`

	const endsOnEdge = new Map<string, vec2[]>()
	for (const {ends} of open) {
		for (const {image, wall, point} of ends) {
			const key = `${image}:${wall}`
			endsOnEdge.set(key, [...(endsOnEdge.get(key) ?? []), point])
		}
	}

	interface Stretch {
		from: string
		to: string
		start: vec2
		vertices: Vertex[]
		attrs?: Curve['attrs']
	}
	const stretches: Stretch[] = open.map(({curve}) => ({
		from: keyOf(curve.vertices[0].point),
		to: keyOf(curve.vertices[curve.vertices.length - 1].point),
		start: curve.vertices[0].point,
		vertices: curve.vertices.slice(1),
		...(curve.attrs ? {attrs: curve.attrs} : {}),
	}))

	images.forEach((image, i) => {
		walls.forEach(({line}, w) => {
			if (across[i][w] >= 0) return

			const a = cell[w]
			const b = cell[(w + 1) % cell.length]
			const along = vec2.sub(b, a)
			const lengthSq = vec2.dot(along, along)

			const times = [
				0,
				...(endsOnEdge.get(`${i}:${w}`) ?? []).map(p =>
					scalar.clamp(vec2.dot(vec2.sub(p, a), along) / lengthSq, 0, 1)
				),
				1,
			].sort((s, t) => s - t)

			for (let n = 0; n + 1 < times.length; n++) {
				const [t0, t1] = [times[n], times[n + 1]]
				if (t1 - t0 < TIME_EPSILON) continue

				// Just inside of the wall, since a source can have an edge lying on it
				const inside = vec2.scaleAndAdd(
					vec2.lerp(a, b, (t0 + t1) / 2),
					vec2.dir(line.theta),
					scale * 1e-6
				)
				const winding = windingNumber(sources, inside)
				if (winding === 0) continue

				const p0 = vec2.transformMat2d(vec2.lerp(a, b, t0), image)
				const p1 = vec2.transformMat2d(vec2.lerp(a, b, t1), image)

				// The cell goes around anticlockwise, and so one that flips the other way
				const [start, end] = winding > 0 !== flips(image) ? [p0, p1] : [p1, p0]

				for (let copy = 0; copy < Math.abs(winding); copy++) {
					stretches.push({
						from: keyOf(start),
						to: keyOf(end),
						start,
						vertices: [{command: 'L', point: end}],
					})
				}
			}
		})
	})

	const leaving = new Map<string, Stretch[]>()
	for (const stretch of stretches) {
		const list = leaving.get(stretch.from)
		if (list) list.push(stretch)
		else leaving.set(stretch.from, [stretch])
	}

	const used = new Set<Stretch>()
	const curves: Curve[] = []

	for (const first of stretches) {
		if (used.has(first)) continue

		used.add(first)
		const vertices = [...first.vertices]
		let at = first.to
		while (at !== first.from) {
			const next = leaving.get(at)?.find(stretch => !used.has(stretch))
			if (!next) break
			used.add(next)
			vertices.push(...next.vertices)
			at = next.to
		}

		const attrs = first.attrs ? {attrs: first.attrs} : {}
		curves.push(
			at === first.from
				? {vertices, closed: true, ...attrs}
				: {
						vertices: [{command: 'L', point: first.start}, ...vertices],
						closed: false,
						...attrs,
					}
		)
	}

	return curves
}

/** Unfolds the part of the path inside the walls by the given images. */
function unfold(
	path: Path,
	walls: readonly Wall[],
	unfolding: Unfolding,
	cell?: readonly vec2[]
): Path {
	let magnitude = 0
	for (const {line} of walls) {
		magnitude = Math.max(magnitude, Math.abs(line.offset))
	}
	for (const curve of path.curves) {
		for (const {point} of curve.vertices) {
			magnitude = Math.max(magnitude, Math.abs(point[0]), Math.abs(point[1]))
		}
	}
	const epsilon = magnitude * RELATIVE_EPSILON

	const complete = completeVertexAttrs(path)

	const curves: Curve[] = []
	const open: {curve: Curve; ends: EdgeEnd[]}[] = []

	for (const curve of complete.curves) {
		const chains = chainsOf(curve, walls, epsilon, path.attrDefs)

		if (chains === 'whole') {
			curves.push(...unfolding.images.map(image => imageOf(curve, image)))
			continue
		}

		for (const chain of chains) {
			for (const unfolded of unfoldChain(chain, unfolding, curve.attrs)) {
				// Only what has an inside has any reason to be closed along the edge
				if (curve.closed && unfolded.ends.length > 0) {
					open.push(unfolded)
				} else {
					curves.push(unfolded.curve)
				}
			}
		}
	}

	if (cell && unfolding.across.some(walls => walls.includes(-1))) {
		curves.push(
			...closeAlongEdge(
				open,
				complete.curves.filter(curve => curve.closed),
				cell,
				walls,
				unfolding
			)
		)
	}

	return withCurves(path, curves)
}

/** The shortest side of a cell, which tells its images apart. */
function cellScale(cell: readonly vec2[]) {
	return Math.min(
		...cell.map((p, i) => vec2.dist(p, cell[(i + 1) % cell.length]))
	)
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
	const walls = [toWall(axis)]
	const {line} = walls[0]
	const probe = vec2.scale(vec2.dir(line.theta), line.offset + 1)
	return unfold(path, walls, unfoldingOf(walls, probe))
}

/**
 * Makes the path look as it does in a kaleidoscope: what is in the wedge of `180 / count` degrees from `angle` around the center is reflected back and forth around it, between `count` mirrors going through the center. The rest of the path is dropped.
 *
 * Curves are cut where they cross a mirror and joined with their reflections there, as with {@link mirror}. Lines, cubic Béziers and arcs all stay as they are, and holes stay holes.
 * @param path The path to reflect
 * @param center Where the mirrors meet
 * @param count How many mirrors there are, which makes twice as many wedges. One is the same as {@link mirror}.
 * @param angle The direction of the first mirror, in degrees
 * @returns The symmetric path. It is empty when nothing lies in the wedge.
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.ngon([65, 50], 25, 5)
 * stroke(p, 'skyblue')
 * stroke(Path.kaleidoscope(p, [50, 50], 3), 'tomato')
 * ```
 */
export function kaleidoscope(
	path: Path,
	center: vec2,
	count: number,
	angle = 0
): Path {
	const mirrors = Math.max(1, Math.round(count))
	const first = vec2.add(center, vec2.dir(angle))
	const second = vec2.add(center, vec2.dir(angle + 180 / mirrors))

	// With a single mirror, the far side of the wedge is that same mirror
	const walls =
		mirrors === 1
			? [toWall([center, first])]
			: [toWall([center, first]), toWall([second, center])]

	const probe = vec2.add(center, vec2.dir(angle + 90 / mirrors))
	return unfold(path, walls, unfoldingOf(walls, probe))
}

/**
 * What a tile has to be for its reflections to go around each corner and come back to it: a
 * rectangle, or a triangle with angles of 60, 60, 60, or 45, 45, 90, or 30, 60, 90. Goes
 * anticlockwise, with the angles exactly what they are nearly.
 */
function regularCell(points: readonly vec2[]): vec2[] {
	const cell = [...points]
	if (cell.length > 1 && vec2.dist(cell[0], cell[cell.length - 1]) === 0) {
		cell.pop()
	}

	const invalid = () =>
		new Error(
			'A tile needs to be a rectangle, or a triangle of 60-60-60, 45-45-90 or 30-60-90 degrees'
		)

	if (cell.length !== 3 && cell.length !== 4) throw invalid()

	const area = cell.reduce((sum, [x, y], i) => {
		const [nx, ny] = cell[(i + 1) % cell.length]
		return sum + x * ny - nx * y
	}, 0)
	if (area === 0 || !Number.isFinite(area)) throw invalid()
	if (area < 0) cell.reverse()

	const cornerAngle = (i: number) => {
		const p = cell[i]
		const u = vec2.sub(cell[(i + 1) % cell.length], p)
		const v = vec2.sub(cell[(i + cell.length - 1) % cell.length], p)
		return scalar.deg(
			Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])
		)
	}

	const [a, b] = cell
	const along = vec2.sub(b, a)
	const across: vec2 = [-along[1], along[0]]

	if (cell.length === 4) {
		if (
			cell.some((_, i) => Math.abs(cornerAngle(i) - 90) > CELL_ANGLE_TOLERANCE)
		) {
			throw invalid()
		}
		const height = vec2.dot(vec2.sub(cell[3], a), across) / vec2.sqrLen(along)
		const up = vec2.scale(across, height)
		return [a, b, vec2.add(b, up), vec2.add(a, up)]
	}

	const divisors = cell.map((_, i) => Math.round(180 / cornerAngle(i)))
	const fits =
		divisors.every(
			(m, i) =>
				m >= 2 && Math.abs(180 / m - cornerAngle(i)) <= CELL_ANGLE_TOLERANCE
		) && Math.abs(divisors.reduce((sum, m) => sum + 1 / m, 0) - 1) < 1e-9
	if (!fits) throw invalid()

	// Going by the angles at the first two corners, from the side between them
	const [atA, atB] = [180 / divisors[0], 180 / divisors[1]]
	const lengthFromA =
		(vec2.len(along) * scalar.sin(atB)) / scalar.sin(180 - atA - atB)
	return [
		a,
		b,
		vec2.add(
			a,
			vec2.scale(vec2.rotate(along, atA), lengthFromA / vec2.len(along))
		),
	]
}

/**
 * Tiles the area with the reflections of a tile back and forth across its sides, as between the mirrors of a kaleidoscope that makes a pattern go on and on. What of the path is in the tile is what is reflected, and the rest of it is dropped.
 *
 * Curves are joined with their reflections across the sides of the tile, as with {@link mirror}. On the outside of the tiles there is nothing to join with: a closed curve is closed along there, for it to be filled as it would be, and an open one is left open.
 * @param path The path to reflect
 * @param cell The corners of the tile, which is a rectangle, or a triangle of 60-60-60, 45-45-90 or 30-60-90 degrees, the only shapes with reflections that fit together. Corners within a degree of these are made exact.
 * @param area What to cover, with every reflection of the tile that overlaps it. There are at most 10000 of them, the nearest to the tile first.
 * @returns The tiled path
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.circle([20, 20], 15)
 * const cell = [[10, 10], [40, 10], [40, 30], [10, 30]]
 * stroke(Path.kaleidoscopeTile(p, cell, [[0, 0], [100, 100]]), 'tomato')
 * ```
 */
export function kaleidoscopeTile(
	path: Path,
	cell: readonly vec2[],
	area: Rect
): Path {
	const corners = regularCell(cell)
	const walls = corners.map((p, i) =>
		toWall([p, corners[(i + 1) % corners.length]])
	)

	const boundsOf = (image: mat2d): Rect => {
		const moved = corners.map(p => vec2.transformMat2d(p, image))
		return [
			[Math.min(...moved.map(p => p[0])), Math.min(...moved.map(p => p[1]))],
			[Math.max(...moved.map(p => p[0])), Math.max(...moved.map(p => p[1]))],
		]
	}
	const overlaps = ([min, max]: Rect, [otherMin, otherMax]: Rect) =>
		min[0] < otherMax[0] &&
		otherMin[0] < max[0] &&
		min[1] < otherMax[1] &&
		otherMin[1] < max[1]

	// The way to the area can go through tiles outside of it, if the tile itself is
	const [cellMin, cellMax] = boundsOf(mat2d.ident)
	const way: Rect = [
		[Math.min(cellMin[0], area[0][0]), Math.min(cellMin[1], area[0][1])],
		[Math.max(cellMax[0], area[1][0]), Math.max(cellMax[1], area[1][1])],
	]

	const middle = vec2.scale(
		corners.reduce((sum, p) => vec2.add(sum, p), [0, 0] as vec2),
		1 / corners.length
	)
	const unfolding = unfoldingOf(
		walls,
		middle,
		image => overlaps(boundsOf(image), way),
		image => overlaps(boundsOf(image), area)
	)

	return unfold(path, walls, unfolding, corners)
}
