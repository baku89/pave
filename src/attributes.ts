/**
 * The core of per-vertex, per-curve and per-path attributes: how a value is interpolated, and
 * how it is looked up through the levels. The public functions are in `path/attributes`.
 */
import type {Curve, Path, Segment} from './index'
import type {
	AttributeDef,
	AttributeDefs,
	AttributeInterpolation,
	AttributeLike,
	Attributes,
	AttributeValue,
	Vertex,
	VertexContext,
} from './path/types'

/** A shallow copy without the given keys. */
export function omit<T extends object>(object: T, ...keys: string[]): T {
	const out = {...object} as Record<string, unknown>
	for (const key of keys) delete out[key]
	return out as T
}

const toLinear = (c: number) =>
	c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

const toGamma = (c: number) =>
	c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055

function srgbToOklab(rgb: readonly number[]): [number, number, number] {
	const r = toLinear(rgb[0])
	const g = toLinear(rgb[1])
	const b = toLinear(rgb[2])

	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}

function oklabToSrgb([L, a, b]: readonly number[]): [number, number, number] {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

	return [
		toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	]
}

const isNumbers = (v: unknown): v is readonly number[] =>
	Array.isArray(v) && v.every(x => typeof x === 'number')

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function linear(a: AttributeValue, b: AttributeValue, t: number) {
	if (typeof a === 'number' && typeof b === 'number') {
		return lerp(a, b, t)
	}
	if (isNumbers(a) && isNumbers(b) && a.length === b.length) {
		return a.map((x, i) => lerp(x, b[i], t))
	}
	return t < 1 ? a : b
}

function oklab(a: AttributeValue, b: AttributeValue, t: number) {
	if (!isNumbers(a) || !isNumbers(b) || a.length !== b.length || a.length < 3) {
		return linear(a, b, t)
	}
	const labA = srgbToOklab(a)
	const labB = srgbToOklab(b)
	const rgb = oklabToSrgb(labA.map((x, i) => lerp(x, labB[i], t)))
	// Anything after RGB, such as alpha, is not part of the color space
	return [...rgb, ...a.slice(3).map((x, i) => lerp(x, b[i + 3], t))]
}

const BUILT_IN_INTERPOLATIONS = {
	linear,
	oklab,
	step: (a: AttributeValue, b: AttributeValue, t: number) => (t < 1 ? a : b),
	and: (a: AttributeValue, b: AttributeValue, t: number) =>
		t <= 0 ? a : t >= 1 ? b : Boolean(a) && Boolean(b),
}

function interpolationOf(
	value: AttributeValue,
	interpolate: AttributeInterpolation | undefined
) {
	if (typeof interpolate === 'function') return interpolate
	if (interpolate) return BUILT_IN_INTERPOLATIONS[interpolate]
	if (typeof value === 'boolean') return BUILT_IN_INTERPOLATIONS.and
	return typeof value === 'number' || isNumbers(value)
		? BUILT_IN_INTERPOLATIONS.linear
		: BUILT_IN_INTERPOLATIONS.step
}

function sameValue(a: AttributeValue, b: AttributeValue): boolean {
	if (a === b) return true
	return (
		isNumbers(a) &&
		isNumbers(b) &&
		a.length === b.length &&
		a.every((x, i) => x === b[i])
	)
}

/**
 * The value between `a` and `b` at `t`. When only one of them exists, it is used as it is.
 */
export function interpolateValue(
	a: AttributeValue | undefined,
	b: AttributeValue | undefined,
	t: number,
	def?: AttributeDef
): AttributeValue | undefined {
	if (a === undefined) return b
	if (b === undefined) return a
	if (t <= 0) return a
	if (t >= 1) return b
	if (sameValue(a, b)) return a
	return interpolationOf(a, def?.interpolate)(a, b, t)
}

/** {@link interpolateValue} for every attribute of the two vertices. */
export function interpolateAttrs(
	a: Attributes | undefined,
	b: Attributes | undefined,
	t: number,
	defs?: AttributeDefs
): Attributes | undefined {
	if (!a) return b
	if (!b) return a

	const out: Record<string, AttributeValue> = {}
	for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
		out[name] = interpolateValue(a[name], b[name], t, defs?.[name])!
	}
	return out
}

/** Merges the definitions of paths; when a name is defined twice, the former one wins. */
export function mergeAttrDefs(paths: Path[]): AttributeDefs | undefined {
	const defined = paths.flatMap(path => path.attrDefs ?? [])
	return defined.length > 0
		? Object.assign({}, ...defined.reverse())
		: undefined
}

/** A path with new curves, keeping what belongs to the whole path. */
export function withCurves<P extends Path>(path: Path, curves: Curve[]): P {
	const out: {curves: Curve[]; attrs?: Attributes; attrDefs?: AttributeDefs} = {
		curves,
	}
	if (path.attrs) out.attrs = path.attrs
	if (path.attrDefs) out.attrDefs = path.attrDefs
	return out as P
}

/** The attributes of a segment at the given time. */
export function segmentAttrsAt(
	seg: Segment,
	time: number,
	defs?: AttributeDefs
): Attributes | undefined {
	return interpolateAttrs(seg.startAttrs, seg.attrs, time, defs)
}

/** Gives a new segment the attributes of the range of `seg` it was made from. */
export function withSegmentAttrs<S extends Segment>(
	piece: S,
	seg: Segment,
	from: number,
	to: number,
	defs?: AttributeDefs
): S {
	if (!seg.attrs && !seg.startAttrs) return piece

	const rest = omit(piece, 'attrs', 'startAttrs')
	const startAttrs = segmentAttrsAt(seg, from, defs)
	const attrs = segmentAttrsAt(seg, to, defs)
	return {
		...rest,
		...(startAttrs ? {startAttrs} : {}),
		...(attrs ? {attrs} : {}),
	} as S
}

/** A vertex of the segment's end, without the fields only segments have. */
export function segmentToVertex(seg: Segment): Vertex {
	return omit(seg, 'start', 'startAttrs') as Vertex
}

/** Reads through the levels: the vertex, its curve, the path, then the default. */
export function lookupAttr(
	path: Path,
	curve: Curve | undefined,
	vertex: Vertex | undefined,
	name: string
): AttributeValue | undefined {
	return (
		vertex?.attrs?.[name] ??
		curve?.attrs?.[name] ??
		path.attrs?.[name] ??
		path.attrDefs?.[name]?.default
	)
}

/**
 * Turns anything attribute-like into the function to read it at a vertex.
 */
export function resolveAttribute<T extends AttributeValue>(
	like: AttributeLike<T>,
	path: Path
): (vertex: Vertex, context: VertexContext) => T | undefined {
	if (typeof like === 'function') {
		return like as (vertex: Vertex, context: VertexContext) => T
	}
	if (typeof like === 'string') {
		return (vertex, {curve}) => lookupAttr(path, curve, vertex, like) as T
	}
	return () => like as T
}

/** Puts the attributes of the path on the curve, unless it has its own. */
export function pushDownPathAttrs(path: Path, curve: Curve): Curve {
	if (!path.attrs) return curve
	return {...curve, attrs: {...path.attrs, ...curve.attrs}}
}

/** Puts the attributes of the curve on its vertices, unless they have their own. */
export function pushDownCurveAttrs(curve: Curve): Curve {
	if (!curve.attrs) return curve
	return {
		vertices: curve.vertices.map(
			v => ({...v, attrs: {...curve.attrs, ...v.attrs}}) as Vertex
		),
		closed: curve.closed,
	}
}

/**
 * Fills in the attributes some vertices of a curve have and others do not, by what they would
 * read from the upper levels. Without this, interpolating towards such a vertex would not
 * agree with what can be read at it.
 */
export function completeVertexAttrs<P extends Path>(path: P): P {
	let changed = false

	const curves = path.curves.map(curve => {
		const names = new Set<string>()
		for (const {attrs} of curve.vertices) {
			if (attrs) for (const name of Object.keys(attrs)) names.add(name)
		}
		if (names.size === 0) return curve

		const vertices = curve.vertices.map(vertex => {
			let attrs: Record<string, AttributeValue> | undefined
			for (const name of names) {
				if (vertex.attrs?.[name] !== undefined) continue
				const value = lookupAttr(path, curve, undefined, name)
				if (value !== undefined) {
					attrs ??= {...vertex.attrs}
					attrs[name] = value
				}
			}
			return attrs ? ({...vertex, attrs} as Vertex) : vertex
		})
		if (vertices.every((v, i) => v === curve.vertices[i])) return curve

		changed = true
		return {...curve, vertices}
	})

	return changed ? withCurves<P>(path, curves as Curve[]) : path
}
