/**
 * Editing a path one anchor at a time, the way a node tool does: reading and changing the
 * kind of a vertex, dragging its handles and its point, and inserting or deleting anchors.
 */
import {vec2} from 'linearly'

import {completeVertexAttrs, withCurves} from '../attributes'
import {Curve, type Path, Segment} from '../index'
import type {PathLocation} from '../Location'
import {normalizeIndex} from '../utils'
import {fitSingleCubic, sampleSegment} from './fitting'
import {toTime} from './location'
import type {Vertex, VertexC, VertexL} from './types'

/**
 * Which vertex of a path to edit. Negative indices count from the end, like {@link Array.at}.
 * @category Types
 */
export interface VertexAddress {
	curveIndex: number
	vertexIndex: number
}

/**
 * How the two handles of a vertex relate to each other.
 *
 * - `corner`: The handles are independent, so the path can bend there.
 * - `smooth`: The handles are opposite to each other, so the tangent is continuous.
 * - `symmetric`: The handles are opposite and of equal length.
 * @category Types
 */
export type VertexType = 'corner' | 'smooth' | 'symmetric'

/**
 * An options for {@link Path.convertVertex}
 * @category Options
 */
export interface ConvertVertexOptions {
	/**
	 * The length of both handles when converting to `symmetric`. By default, the mean of the current lengths is used.
	 */
	handleLength?: number
}

/**
 * An options for {@link Path.setHandle}
 * @category Options
 */
export interface SetHandleOptions {
	/**
	 * How the opposite handle follows: not at all, in direction only (`smooth`), or in direction and length (`symmetric`). By default, it follows the way the vertex currently is, as reported by {@link Path.vertexType}.
	 */
	link?: 'none' | VertexType
}

/**
 * An options for {@link Path.moveVertex}
 * @category Options
 */
export interface MoveVertexOptions {
	/**
	 * If true, the handles of the vertex move along with it, keeping the shape around the vertex. If false, they stay where they are.
	 * @defaultValue true
	 */
	handles?: boolean
}

/**
 * An options for {@link Path.deleteVertex}
 * @category Options
 */
export interface DeleteVertexOptions {
	/**
	 * If true, the two segments meeting at the vertex are replaced by a single cubic Bézier fitted to them, so the shape changes as little as possible. If false, the vertex is just dropped and the following segment keeps its command and handles.
	 * @defaultValue true
	 */
	preserveShape?: boolean
}

/** How closely the directions of handles must agree to count as smooth: the sine of the angle between them. */
const ANGLE_TOLERANCE = 1e-4

/** How closely the lengths of handles must agree to count as symmetric, relative to the longer one. */
const LENGTH_TOLERANCE = 1e-4

interface ResolvedVertex {
	curveIndex: number
	vertexIndex: number
	curve: Curve
	vertex: Vertex
	/** The segment ending at the vertex, if any */
	inSeg: Segment | null
	/** The segment starting at the vertex, if any */
	outSeg: Segment | null
	/** The index of the vertex that owns the outgoing segment, if any */
	nextIndex: number | null
}

function resolve(path: Path, address: VertexAddress): ResolvedVertex {
	if (path.curves.length === 0) {
		throw new Error('Cannot address a vertex of a path with no curves')
	}
	const curveIndex = normalizeIndex(address.curveIndex, path.curves.length)
	const curve = path.curves[curveIndex]
	const n = curve.vertices.length
	if (n === 0) {
		throw new Error(`Curve ${curveIndex} has no vertices`)
	}
	const vertexIndex = normalizeIndex(address.vertexIndex, n)
	const segs = Curve.segments(curve)

	let inSeg: Segment | null = null
	let outSeg: Segment | null = null
	let nextIndex: number | null = null

	if (curve.closed && n >= 2) {
		inSeg = segs[(vertexIndex - 1 + n) % n]
		outSeg = segs[vertexIndex]
		nextIndex = (vertexIndex + 1) % n
	} else if (!curve.closed) {
		if (vertexIndex > 0) inSeg = segs[vertexIndex - 1]
		if (vertexIndex < n - 1) {
			outSeg = segs[vertexIndex]
			nextIndex = vertexIndex + 1
		}
	}

	return {
		curveIndex,
		vertexIndex,
		curve,
		vertex: curve.vertices[vertexIndex],
		inSeg,
		outSeg,
		nextIndex,
	}
}

/** A non-zero direction, or null. */
function unit(v: vec2): vec2 | null {
	const len = vec2.len(v)
	return len > 0 ? vec2.scale(v, 1 / len) : null
}

/**
 * The equivalent cubic handles of a segment: its own for a cubic, otherwise a Hermite estimate from the derivatives at both ends (exactly a third of a line).
 */
function cubicHandlesOf(seg: Segment): [vec2, vec2] {
	if (seg.command === 'C') return [seg.args[0], seg.args[1]]
	return [
		vec2.scaleAndAdd(seg.start, Segment.derivative(seg, {time: 0}), 1 / 3),
		vec2.scaleAndAdd(seg.point, Segment.derivative(seg, {time: 1}), -1 / 3),
	]
}

/** The direction in which the segment arrives at its end. */
function arrivingDirection(seg: Segment): vec2 | null {
	if (seg.command === 'C') {
		return (
			unit(vec2.sub(seg.point, seg.args[1])) ??
			unit(vec2.sub(seg.point, seg.args[0])) ??
			unit(vec2.sub(seg.point, seg.start))
		)
	}
	return unit(Segment.derivative(seg, {time: 1}))
}

/** The direction in which the segment leaves its start. */
function leavingDirection(seg: Segment): vec2 | null {
	if (seg.command === 'C') {
		return (
			unit(vec2.sub(seg.args[0], seg.start)) ??
			unit(vec2.sub(seg.args[1], seg.start)) ??
			unit(vec2.sub(seg.point, seg.start))
		)
	}
	return unit(Segment.derivative(seg, {time: 0}))
}

/**
 * Tells how the handles of a vertex relate: `'symmetric'` when they are opposite and of equal length, `'smooth'` when they are only opposite, and `'corner'` otherwise. For a line or an arc, the handle is the one of the equivalent cubic Bézier: a third of a line, or a Hermite estimate of an arc. An end of an open curve, having a single handle, is always a corner.
 * @param path The path
 * @param address The vertex to inspect
 * @returns The type of the vertex
 * @category Properties
 */
export function vertexType(path: Path, address: VertexAddress): VertexType {
	const {vertex, inSeg, outSeg} = resolve(path, address)
	if (!inSeg || !outSeg) return 'corner'

	const dIn = arrivingDirection(inSeg)
	const dOut = leavingDirection(outSeg)
	if (!dIn || !dOut) return 'corner'

	const sin = dIn[0] * dOut[1] - dIn[1] * dOut[0]
	if (Math.abs(sin) > ANGLE_TOLERANCE || vec2.dot(dIn, dOut) <= 0) {
		return 'corner'
	}

	const lIn = vec2.distance(vertex.point, cubicHandlesOf(inSeg)[1])
	const lOut = vec2.distance(vertex.point, cubicHandlesOf(outSeg)[0])
	const scale = Math.max(lIn, lOut)

	return Math.abs(lIn - lOut) <= LENGTH_TOLERANCE * Math.max(1, scale)
		? 'symmetric'
		: 'smooth'
}

/**
 * The curve with the in-handle and/or the out-handle of a vertex set to absolute positions. The segments touched become cubic Béziers, with their far handles kept, or taken from the equivalent cubic for lines and arcs.
 */
function withHandles(
	resolved: ResolvedVertex,
	inHandle: vec2 | null,
	outHandle: vec2 | null
): Curve {
	const {curve, vertexIndex, inSeg, outSeg, nextIndex} = resolved
	const vertices = [...curve.vertices]

	if (inHandle && inSeg) {
		const [control1] = cubicHandlesOf(inSeg)
		const v = vertices[vertexIndex]
		const vertex: VertexC = {
			point: v.point,
			command: 'C',
			args: [control1, inHandle],
		}
		vertices[vertexIndex] = v.attrs ? {...vertex, attrs: v.attrs} : vertex
	}

	if (outHandle && outSeg && nextIndex !== null) {
		const [, control2] = cubicHandlesOf(outSeg)
		const v = vertices[nextIndex]
		const vertex: VertexC = {
			point: v.point,
			command: 'C',
			args: [outHandle, control2],
		}
		vertices[nextIndex] = v.attrs ? {...vertex, attrs: v.attrs} : vertex
	}

	return {...curve, vertices}
}

function replaceCurve(path: Path, curveIndex: number, curve: Curve): Path {
	const curves = [...path.curves]
	curves[curveIndex] = curve
	return withCurves(path, curves)
}

/**
 * Changes how the handles of a vertex relate, keeping the anchor in place. Converting to `smooth` turns both handles onto their average direction, keeping each length; `symmetric` additionally gives both the same length, the mean of the two unless `handleLength` is given. Lines and arcs next to the vertex become cubic Béziers. Converting to `corner` changes nothing, since any pair of handles is a valid corner; drag one with {@link Path.setHandle} to bend it. An end of an open curve is left as it is.
 * @param path The path
 * @param address The vertex to convert
 * @param type The type to convert the vertex into
 * @param options The options
 * @returns The path with the vertex converted
 * @category Modifiers
 */
export function convertVertex(
	path: Path,
	address: VertexAddress,
	type: VertexType,
	{handleLength}: ConvertVertexOptions = {}
): Path {
	if (type === 'corner') return path

	const resolved = resolve(path, address)
	const {vertex, inSeg, outSeg, curveIndex} = resolved
	if (!inSeg || !outSeg) return path

	const p = vertex.point
	const [, hIn] = cubicHandlesOf(inSeg)
	const [hOut] = cubicHandlesOf(outSeg)
	const lIn = vec2.distance(p, hIn)
	const lOut = vec2.distance(p, hOut)

	// The average direction of travel through the vertex
	const dIn = unit(vec2.sub(p, hIn)) ?? arrivingDirection(inSeg)
	const dOut = unit(vec2.sub(hOut, p)) ?? leavingDirection(outSeg)
	const dir = (dIn && dOut ? unit(vec2.add(dIn, dOut)) : null) ?? dOut ?? dIn
	if (!dir) return path

	let lengthIn = lIn
	let lengthOut = lOut
	if (type === 'symmetric') {
		lengthIn = lengthOut = handleLength ?? (lIn + lOut) / 2
	}

	const curve = withHandles(
		resolved,
		vec2.scaleAndAdd(p, dir, -lengthIn),
		vec2.scaleAndAdd(p, dir, lengthOut)
	)
	return replaceCurve(path, curveIndex, curve)
}

/**
 * Moves one handle of a vertex to an absolute position, like dragging it with a node tool. Depending on `link`, the opposite handle turns to stay opposite (`smooth`), also matches the length (`symmetric`), or stays put (`none`); by default it follows the way the vertex currently is. The segment the handle belongs to becomes a cubic Bézier if it is a line or an arc. Nothing happens when there is no segment on that side of the vertex.
 * @param path The path
 * @param address The vertex whose handle to move
 * @param side `in` for the handle of the segment arriving at the vertex, `out` for the one leaving it
 * @param handle The new absolute position of the handle
 * @param options The options
 * @returns The path with the handle moved
 * @category Modifiers
 */
export function setHandle(
	path: Path,
	address: VertexAddress,
	side: 'in' | 'out',
	handle: vec2,
	{link}: SetHandleOptions = {}
): Path {
	const resolved = resolve(path, address)
	const {vertex, inSeg, outSeg, curveIndex} = resolved

	const seg = side === 'in' ? inSeg : outSeg
	if (!seg) return path

	const oppositeSeg = side === 'in' ? outSeg : inSeg
	const mode = link ?? vertexType(path, address)

	let opposite: vec2 | null = null

	if (mode !== 'none' && mode !== 'corner' && oppositeSeg) {
		const p = vertex.point
		const dir = unit(vec2.sub(handle, p))
		if (dir) {
			const current =
				side === 'in'
					? cubicHandlesOf(oppositeSeg)[0]
					: cubicHandlesOf(oppositeSeg)[1]
			const length =
				mode === 'symmetric'
					? vec2.distance(handle, p)
					: vec2.distance(current, p)
			opposite = vec2.scaleAndAdd(p, dir, -length)
		}
	}

	const curve =
		side === 'in'
			? withHandles(resolved, handle, opposite)
			: withHandles(resolved, opposite, handle)

	return replaceCurve(path, curveIndex, curve)
}

/**
 * Moves the anchor of a vertex to a new position. Its handles move along by default, so the segments around it keep their shape; with `handles: false` the handles stay in place and only the anchor moves.
 * @param path The path
 * @param address The vertex to move
 * @param point The new position of the anchor
 * @param options The options
 * @returns The path with the vertex moved
 * @category Modifiers
 */
export function moveVertex(
	path: Path,
	address: VertexAddress,
	point: vec2,
	{handles = true}: MoveVertexOptions = {}
): Path {
	const {curve, curveIndex, vertexIndex, vertex, nextIndex} = resolve(
		path,
		address
	)
	const delta = vec2.sub(point, vertex.point)
	const vertices = [...curve.vertices]

	const moved: Vertex =
		handles && vertex.command === 'C'
			? {
					...vertex,
					point,
					args: [vertex.args[0], vec2.add(vertex.args[1], delta)],
				}
			: {...vertex, point}
	vertices[vertexIndex] = moved

	if (handles && nextIndex !== null) {
		const next = vertices[nextIndex]
		if (next.command === 'C') {
			vertices[nextIndex] = {
				...next,
				args: [vec2.add(next.args[0], delta), next.args[1]],
			}
		}
	}

	return replaceCurve(path, curveIndex, {...curve, vertices})
}

/**
 * Adds an anchor at the given location without changing the shape of the path, by dividing the segment there. When the location is already at an anchor, the path is returned as it is.
 * @param path The path
 * @param location The location to add the anchor at
 * @returns The path with one more vertex
 * @category Modifiers
 * @example
 * ```js:pave
 * const p = Path.insertVertex(Path.circle([50, 50], 40), {unit: 0.1})
 * stroke(p)
 * ```
 */
export function insertVertex(path: Path, location: PathLocation): Path {
	const complete = completeVertexAttrs(path)
	const {curveIndex, segmentIndex, segment, time} = toTime(complete, location)

	if (time <= 1e-9 || time >= 1 - 1e-9) return path

	const curve = complete.curves[curveIndex]
	const n = curve.vertices.length
	const pieces = Segment.divideAtTimes(segment, [time], complete.attrDefs)
	const endIndex = curve.closed ? (segmentIndex + 1) % n : segmentIndex + 1
	const end = curve.vertices[endIndex]
	// The end of the segment keeps what it had, with the command of the second piece
	const last = end.attrs ? {...pieces[1], attrs: end.attrs} : pieces[1]

	const vertices = [...curve.vertices]
	if (endIndex === 0) {
		// The closing segment: the new vertex goes after the last one
		vertices[0] = last
		vertices.push(pieces[0])
	} else {
		vertices.splice(endIndex, 1, pieces[0], last)
	}

	return replaceCurve(complete, curveIndex, {...curve, vertices})
}

/**
 * Removes an anchor from the path. By default the two segments meeting there are replaced by a single cubic Bézier that follows them as closely as possible, keeping the tangents at the neighbouring anchors; two lines are replaced by a line. With `preserveShape: false`, the vertex is just dropped and the following segment keeps its command and handles, so the path reshapes. Removing an end of an open curve drops it either way. A curve left with no vertices is removed from the path.
 * @param path The path
 * @param address The vertex to remove
 * @param options The options
 * @returns The path with one vertex fewer
 * @category Modifiers
 */
export function deleteVertex(
	path: Path,
	address: VertexAddress,
	{preserveShape = true}: DeleteVertexOptions = {}
): Path {
	const resolved = resolve(path, address)
	const {curve, curveIndex, vertexIndex, inSeg, outSeg, nextIndex} = resolved
	const n = curve.vertices.length

	if (n === 1) {
		const curves = path.curves.filter((_, i) => i !== curveIndex)
		return withCurves(path, curves)
	}

	const vertices = [...curve.vertices]

	if (preserveShape && inSeg && outSeg && nextIndex !== null) {
		const next = vertices[nextIndex]
		let replacement: Vertex

		if (inSeg.command === 'L' && outSeg.command === 'L') {
			const line: VertexL = {point: next.point, command: 'L'}
			replacement = next.attrs ? {...line, attrs: next.attrs} : line
		} else {
			const tan1 = leavingDirection(inSeg)
			const tan2 = arrivingDirection(outSeg)
			if (tan1 && tan2) {
				const points = [
					...sampleSegment(inSeg, 16),
					...sampleSegment(outSeg, 16).slice(1),
				]
				const args = fitSingleCubic(points, tan1, vec2.neg(tan2))
				const cubic: VertexC = {point: next.point, command: 'C', args}
				replacement = next.attrs ? {...cubic, attrs: next.attrs} : cubic
			} else {
				replacement = next
			}
		}
		vertices[nextIndex] = replacement
	}

	vertices.splice(vertexIndex, 1)

	if (!curve.closed && vertexIndex === 0 && vertices.length > 0) {
		// The new first vertex is only a move-to
		const first = vertices[0]
		const moveTo: VertexL = {point: first.point, command: 'L'}
		vertices[0] = first.attrs ? {...moveTo, attrs: first.attrs} : moveTo
	}

	return replaceCurve(path, curveIndex, {...curve, vertices})
}
