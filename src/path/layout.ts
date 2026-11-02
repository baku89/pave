import {Rect} from 'geome'
import {mat2d, scalar, vec2} from 'linearly'

import {interpolateAttrs, mergeAttrDefs} from '../attributes'
import {Curve, type Path, Segment} from '../index'
import {merge} from './compound'
import {orientation, point} from './location'
import {bounds, length} from './metrics'
import {toCubicBezier, transform} from './modifiers'
import type {AttributeDefs, Attributes, Vertex} from './types'

/**
 * How {@link Path.align} lines the paths up
 * @category Options
 */
export type AlignMode =
	| 'left'
	| 'centerX'
	| 'right'
	| 'top'
	| 'centerY'
	| 'bottom'
	| 'center'

/**
 * An options for {@link Path.align}
 * @category Options
 */
export interface AlignOptions {
	/**
	 * The rect to align the paths to. `'selection'` is the union of the bounds of all the paths.
	 * @default 'selection'
	 */
	to?: Rect | 'selection'
}

/**
 * An options for {@link Path.distribute}
 * @category Options
 */
export interface DistributeOptions {
	/**
	 * `centers`: the centers of the bounds are evenly spaced. `gaps`: the gaps between the bounds are equal.
	 * @default 'centers'
	 */
	mode?: 'centers' | 'gaps'
	/**
	 * The extent the paths are spread over, along the axis: the first path in order starts at its beginning and the last ends at its end. By default, it is what the paths already span, so the two extremes stay where they are.
	 */
	within?: Rect
}

/**
 * An options for {@link Path.fitInto}
 * @category Options
 */
export interface FitIntoOptions {
	/**
	 * `contain`: scaled uniformly to fit inside the rect. `cover`: scaled uniformly to fill the rect. `stretch`: scaled on each axis to match the rect exactly.
	 * @default 'contain'
	 */
	mode?: 'contain' | 'cover' | 'stretch'
	/**
	 * Where the bounds sit in the rect when there is room left, as a fraction of the room on each axis: `[0, 0]` for the top-left corner, `[1, 1]` for the bottom-right.
	 * @default [0.5, 0.5]
	 */
	align?: vec2
}

/**
 * An options for {@link Path.repeatAlong}
 * @category Options
 */
export interface RepeatAlongOptions {
	/**
	 * The number of the copies. Ignored when `spacing` is given.
	 * @default 10
	 */
	count?: number
	/**
	 * The arc length between the copies. When given, as many copies as fit are placed.
	 */
	spacing?: number
	/**
	 * If true, the copies are rotated to the tangent of the path, with their x axis along it
	 * @default true
	 */
	rotate?: boolean
	/**
	 * How the copies sit along the length. `uniform`: evenly spread with both ends included. `start`, `center`, `end`: the length is divided into `count` cells and the copies sit at the start, the center, or the end of each. With `spacing`, the run of the copies is placed at the start, the center, or the end of the length, or stretched over it for `uniform`.
	 * @default 'uniform'
	 */
	align?: 'start' | 'center' | 'end' | 'uniform'
	/**
	 * The arc length added to the position of every copy. The positions wrap around a path of a single closed curve, and are clamped to the ends otherwise.
	 * @default 0
	 */
	offset?: number
}

/**
 * Moves the path by the given delta.
 * @param path The path to move
 * @param delta The translation
 * @returns The moved path
 * @category Modifiers
 */
export function translate(path: Path, delta: vec2): Path {
	return transform(path, mat2d.fromTranslation(delta))
}

/**
 * Rotates the path around the pivot. A positive angle rotates clockwise on the screen in the y-down coordinates of SVG and canvas.
 * @param path The path to rotate
 * @param degrees The angle in degrees
 * @param pivot The center of the rotation, which is the center of the bounds by default
 * @returns The rotated path
 * @category Modifiers
 */
export function rotate(path: Path, degrees: number, pivot?: vec2): Path {
	if (path.curves.length === 0) return path
	return transform(
		path,
		mat2d.fromRotation(degrees, pivot ?? Rect.center(bounds(path)))
	)
}

/**
 * Scales the path around the pivot.
 * @param path The path to scale
 * @param factor The scaling factor, either uniform or per axis
 * @param pivot The center of the scaling, which is the center of the bounds by default
 * @returns The scaled path
 * @category Modifiers
 */
export function scale(path: Path, factor: number | vec2, pivot?: vec2): Path {
	if (path.curves.length === 0) return path
	return transform(
		path,
		mat2d.fromScaling(factor, pivot ?? Rect.center(bounds(path)))
	)
}

/**
 * Lines the paths up by their bounds, like the Align panel of Illustrator. Paths without curves are left as they are.
 * @param paths The paths to align
 * @param mode Which edge or center of the bounds to line up
 * @param options The options
 * @returns The aligned paths, in the same order
 * @category Utilities
 * @example
 * ```js:pave
 * const paths = [Path.circle([30, 30], 20), Path.rect([50, 60], [90, 80])]
 * for (const p of Path.align(paths, 'centerX')) stroke(p)
 * ```
 */
export function align(
	paths: Path[],
	mode: AlignMode,
	{to = 'selection'}: AlignOptions = {}
): Path[] {
	const rects = paths.map(path =>
		path.curves.length > 0 ? bounds(path) : null
	)
	const present = rects.filter((rect): rect is Rect => rect !== null)

	if (present.length === 0) return paths.slice()

	const ref = to === 'selection' ? Rect.unite(...present) : to

	return paths.map((path, i) => {
		const rect = rects[i]
		if (!rect) return path

		const delta: [number, number] = [0, 0]

		switch (mode) {
			case 'left':
				delta[0] = ref[0][0] - rect[0][0]
				break
			case 'right':
				delta[0] = ref[1][0] - rect[1][0]
				break
			case 'top':
				delta[1] = ref[0][1] - rect[0][1]
				break
			case 'bottom':
				delta[1] = ref[1][1] - rect[1][1]
				break
			case 'centerX':
				delta[0] = Rect.center(ref)[0] - Rect.center(rect)[0]
				break
			case 'centerY':
				delta[1] = Rect.center(ref)[1] - Rect.center(rect)[1]
				break
			case 'center': {
				const [cx, cy] = Rect.center(ref)
				const [px, py] = Rect.center(rect)
				delta[0] = cx - px
				delta[1] = cy - py
				break
			}
		}

		return delta[0] === 0 && delta[1] === 0 ? path : translate(path, delta)
	})
}

/**
 * Spreads the paths evenly along an axis, like the Distribute commands of Illustrator. The paths are ordered by the centers of their bounds along the axis, and the first and the last stay where they are unless `within` says otherwise. Paths without curves are left as they are.
 * @param paths The paths to distribute
 * @param axis The axis along which to distribute
 * @param options The options
 * @returns The distributed paths, in the same order
 * @category Utilities
 */
export function distribute(
	paths: Path[],
	axis: 'x' | 'y',
	{mode = 'centers', within}: DistributeOptions = {}
): Path[] {
	const a = axis === 'x' ? 0 : 1

	const items = paths.flatMap((path, index) =>
		path.curves.length > 0 ? [{index, rect: bounds(path)}] : []
	)
	items.sort((p, q) => Rect.center(p.rect)[a] - Rect.center(q.rect)[a])

	const out = paths.slice()
	if (items.length < 2) return out

	const first = items[0].rect
	const last = items[items.length - 1].rect
	const from = within ? within[0][a] : first[0][a]
	const to = within ? within[1][a] : last[1][a]

	const targets: number[] = []

	if (mode === 'centers') {
		const start = from + Rect.size(first)[a] / 2
		const end = to - Rect.size(last)[a] / 2
		const step = (end - start) / (items.length - 1)
		for (const [i, {rect}] of items.entries()) {
			targets.push(start + step * i - Rect.size(rect)[a] / 2)
		}
	} else {
		const sizes = items.map(({rect}) => Rect.size(rect)[a])
		const gap =
			(to - from - sizes.reduce((sum, s) => sum + s, 0)) / (items.length - 1)
		let cursor = from
		for (const size of sizes) {
			targets.push(cursor)
			cursor += size + gap
		}
	}

	for (const [i, {index, rect}] of items.entries()) {
		const d = targets[i] - rect[0][a]
		if (d === 0) continue
		const delta: [number, number] = [0, 0]
		delta[a] = d
		out[index] = translate(paths[index], delta)
	}

	return out
}

/**
 * Scales and moves the path so that its bounds fit into the rect, like the `object-fit` property of CSS. A path with no extent on an axis is only scaled by the other.
 * @param path The path to fit
 * @param rect The rect to fit the path into
 * @param options The options
 * @returns The fitted path
 * @category Modifiers
 * @example
 * ```js:pave
 * const frame = Path.rect([10, 20], [90, 80])
 * stroke(frame, 'skyblue')
 * stroke(Path.fitInto(Path.circle([0, 0], 1), [[10, 20], [90, 80]]))
 * ```
 */
export function fitInto(
	path: Path,
	rect: Rect,
	{mode = 'contain', align = [0.5, 0.5]}: FitIntoOptions = {}
): Path {
	if (path.curves.length === 0) return path

	const b = bounds(path)
	const [bw, bh] = Rect.size(b)
	const [rw, rh] = Rect.size(rect)

	const sx = bw > 0 ? rw / bw : null
	const sy = bh > 0 ? rh / bh : null

	let scaleX: number
	let scaleY: number

	if (mode === 'stretch') {
		scaleX = sx ?? sy ?? 1
		scaleY = sy ?? sx ?? 1
	} else {
		const candidates = [sx, sy].filter((s): s is number => s !== null)
		const uniform =
			candidates.length === 0
				? 1
				: mode === 'contain'
					? Math.min(...candidates)
					: Math.max(...candidates)
		scaleX = uniform
		scaleY = uniform
	}

	const left = rect[0][0] + (rw - bw * scaleX) * align[0]
	const top = rect[0][1] + (rh - bh * scaleY) * align[1]

	return transform(path, [
		scaleX,
		0,
		0,
		scaleY,
		left - b[0][0] * scaleX,
		top - b[0][1] * scaleY,
	])
}

/**
 * Interpolates between two paths, like the Blend tool of Illustrator. Both are converted to cubic Béziers and given the same structure: curves are paired by index, a curve without a partner blends to a copy of itself collapsed to the center of its bounds, and the curve of a pair with fewer segments has its segments subdivided (exactly, without changing its shape) until the counts match. Every point and handle is then interpolated linearly, as are the attributes.
 *
 * A pair of an open and a closed curve is closed when `t` is nearer to the closed one.
 * @param a The path at `t = 0`
 * @param b The path at `t = 1`
 * @param t The interpolation factor, which may be outside `[0, 1]`
 * @returns The interpolated path
 * @category Utilities
 * @example
 * ```js:pave
 * const a = Path.circle([30, 50], 20)
 * const b = Path.rect([60, 30], [90, 70])
 * stroke(a, 'skyblue')
 * stroke(b, 'skyblue')
 * stroke(Path.blend(a, b, 0.5))
 * ```
 */
export function blend(a: Path, b: Path, t: number): Path {
	return blendPrepared(prepareBlend(a, b), t)
}

/**
 * The intermediate steps of {@link Path.blend}, what the Blend tool of Illustrator draws between two paths.
 * @param a The path at the start
 * @param b The path at the end
 * @param count The number of the steps between the two paths, excluding them
 * @returns The steps, from the one nearest to `a` to the one nearest to `b`
 * @category Utilities
 */
export function blendSeries(a: Path, b: Path, count: number): Path[] {
	const prepared = prepareBlend(a, b)
	return Array.from({length: Math.max(0, Math.floor(count))}, (_, i) =>
		blendPrepared(prepared, (i + 1) / (count + 1))
	)
}

interface BlendPair {
	a: Curve
	b: Curve
	/** Whether each was closed before being opened up to match the other */
	closedA: boolean
	closedB: boolean
}

interface PreparedBlend {
	pairs: BlendPair[]
	attrs: [Attributes | undefined, Attributes | undefined]
	attrDefs?: AttributeDefs
}

function prepareBlend(a: Path, b: Path): PreparedBlend {
	const attrDefs = mergeAttrDefs([a, b])

	const curvesA = toCubicBezier(a).curves.filter(c => c.vertices.length > 0)
	const curvesB = toCubicBezier(b).curves.filter(c => c.vertices.length > 0)

	const count = Math.max(curvesA.length, curvesB.length)
	const pairs: BlendPair[] = []

	for (let i = 0; i < count; i++) {
		let ca: Curve = curvesA[i] ?? collapse(curvesB[i])
		let cb: Curve = curvesB[i] ?? collapse(curvesA[i])
		const closedA = ca.closed
		const closedB = cb.closed

		if (closedA !== closedB) {
			ca = openUp(ca)
			cb = openUp(cb)
		}

		const segments = Math.max(Curve.segmentCount(ca), Curve.segmentCount(cb))

		pairs.push({
			a: subdivideTo(ca, segments, attrDefs),
			b: subdivideTo(cb, segments, attrDefs),
			closedA,
			closedB,
		})
	}

	return {pairs, attrs: [a.attrs, b.attrs], attrDefs}
}

function blendPrepared(
	{pairs, attrs: [attrsA, attrsB], attrDefs}: PreparedBlend,
	t: number
): Path {
	const curves = pairs.map(({a: ca, b: cb, closedA, closedB}) => {
		const vertices = ca.vertices.map((va, i): Vertex => {
			const vb = cb.vertices[i]
			const point = vec2.lerp(va.point, vb.point, t)
			const attrs = interpolateAttrs(va.attrs, vb.attrs, t, attrDefs)
			const carried = attrs ? {attrs} : {}

			if (va.command === 'C' && vb.command === 'C') {
				return {
					command: 'C',
					point,
					args: [
						vec2.lerp(va.args[0], vb.args[0], t),
						vec2.lerp(va.args[1], vb.args[1], t),
					],
					...carried,
				}
			}
			return {command: 'L', point, ...carried}
		})

		// When only one was closed, the result closes towards it. Both were opened up then,
		// so the explicit closing segment is fused back when it returns to the start.
		const closed = closedA === closedB ? closedA : t < 0.5 ? closedA : closedB
		const attrs = interpolateAttrs(ca.attrs, cb.attrs, t, attrDefs)

		const curve: Curve = {
			vertices,
			closed: false,
			...(attrs ? {attrs} : {}),
		}

		if (!closed) return curve
		return closedA === closedB ? {...curve, closed: true} : closeUp(curve)
	})

	const attrs = interpolateAttrs(attrsA, attrsB, t, attrDefs)

	return {
		curves,
		...(attrs ? {attrs} : {}),
		...(attrDefs ? {attrDefs} : {}),
	}
}

/** Closes an open curve, fusing its last vertex into the first when it returns there. */
function closeUp(curve: Curve): Curve {
	const {vertices} = curve
	const first = vertices[0]
	const last = vertices[vertices.length - 1]

	if (vertices.length < 2 || !vec2.approx(first.point, last.point)) {
		return {...curve, closed: true}
	}

	const fused = {
		...last,
		...(first.attrs ? {attrs: first.attrs} : {}),
	} as Vertex
	return {...curve, vertices: [fused, ...vertices.slice(1, -1)], closed: true}
}

/** A closed curve as an open one, ending where it started with the closing segment made explicit. */
function openUp(curve: Curve): Curve {
	if (!curve.closed) return curve

	const [first, ...rest] = curve.vertices
	const vertices: Vertex[] = [
		{
			command: 'L',
			point: first.point,
			...(first.attrs ? {attrs: first.attrs} : {}),
		},
		...rest,
		first,
	]
	return {...curve, vertices, closed: false}
}

/** A copy of the curve with every point at the center of its bounds. */
function collapse(curve: Curve): Curve {
	const center = Rect.center(Curve.bounds(curve))
	return {
		...curve,
		vertices: curve.vertices.map(
			(v): Vertex =>
				v.command === 'C'
					? {...v, point: center, args: [center, center]}
					: {command: 'L', point: center, ...(v.attrs ? {attrs: v.attrs} : {})}
		),
	}
}

/** The curve with its segments subdivided evenly until there are `count` of them. */
function subdivideTo(
	curve: Curve,
	count: number,
	attrDefs?: AttributeDefs
): Curve {
	const segs = Curve.segments(curve)
	const n = segs.length

	if (n >= count) return curve

	if (n === 0) {
		// A lone vertex: as many zero-length segments as needed, sitting on it
		const {point, attrs} = curve.vertices[0]
		const dot: Vertex = {
			command: 'C',
			point,
			args: [point, point],
			...(attrs ? {attrs} : {}),
		}
		return {
			...curve,
			vertices: [curve.vertices[0], ...Array.from({length: count}, () => dot)],
		}
	}

	const vertices: Vertex[] = curve.closed ? [] : [curve.vertices[0]]

	for (const [i, seg] of segs.entries()) {
		const pieces =
			Math.floor((count * (i + 1)) / n) - Math.floor((count * i) / n)
		const times = Array.from({length: pieces - 1}, (_, k) => (k + 1) / pieces)
		vertices.push(...Segment.divideAtTimes(seg, times, attrDefs))
	}

	if (curve.closed) {
		// The last piece ends at the first vertex, which stays the move-to
		vertices.unshift(vertices.pop()!)
	}

	return {...curve, vertices}
}

/**
 * Places copies of the stamp along the path, like a pattern brush. The origin of the stamp lands on the path, and its x axis follows the tangent unless `rotate` is false.
 * @param path The path to place the copies along
 * @param stamp The path to copy
 * @param options The options
 * @returns The copies merged into a single path
 * @category Utilities
 * @example
 * ```js:pave
 * const p = Path.circle([50, 50], 35)
 * const stamp = Path.line([0, -4], [0, 4])
 * stroke(Path.repeatAlong(p, stamp, {count: 12, align: 'start'}))
 * ```
 */
export function repeatAlong(
	path: Path,
	stamp: Path,
	{
		count = 10,
		spacing,
		rotate = true,
		align = 'uniform',
		offset = 0,
	}: RepeatAlongOptions = {}
): Path {
	if (path.curves.length === 0) return {curves: []}

	const total = length(path)
	const positions: number[] = []

	if (spacing !== undefined && spacing > 0) {
		const n = Math.floor(total / spacing + 1e-9) + 1
		const run = (n - 1) * spacing
		const step = align === 'uniform' && n > 1 ? total / (n - 1) : spacing
		const start =
			align === 'end' ? total - run : align === 'center' ? (total - run) / 2 : 0
		for (let i = 0; i < n; i++) positions.push(start + step * i)
	} else {
		count = Math.max(0, Math.floor(count))
		if (align === 'uniform') {
			const step = count > 1 ? total / (count - 1) : 0
			for (let i = 0; i < count; i++) positions.push(step * i)
		} else {
			const cell = count > 0 ? total / count : 0
			const at = align === 'start' ? 0 : align === 'center' ? 0.5 : 1
			for (let i = 0; i < count; i++) positions.push(cell * (i + at))
		}
	}

	const wraps = path.curves.length === 1 && path.curves[0].closed && total > 0

	const copies = positions.map(position => {
		const at = position + offset
		const arc = wraps ? scalar.mod(at, total) : scalar.clamp(at, 0, total)
		const loc = {offset: arc}

		const matrix = rotate
			? orientation(path, loc)
			: mat2d.fromTranslation(point(path, loc))

		return transform(stamp, matrix)
	})

	return merge(copies)
}
