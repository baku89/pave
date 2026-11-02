import {
	interpolateValue,
	lookupAttr,
	omit,
	resolveAttribute,
	withCurves,
} from '../attributes'
import {type Curve, type Path} from '../index'
import type {PathLocation} from '../Location'
import {toTime} from './location'
import type {
	AttributeDef,
	AttributeLevel,
	AttributeLike,
	Attributes,
	AttributeValue,
	CurveContext,
	Vertex,
} from './types'

function withValue(
	attrs: Attributes | undefined,
	name: string,
	value: AttributeValue | undefined
): Attributes | undefined {
	if (value === undefined) return attrs
	return {...attrs, [name]: value}
}

function withoutName(
	attrs: Attributes | undefined,
	name: string
): Attributes | undefined {
	if (!attrs || !(name in attrs)) return attrs
	const rest = omit(attrs, name)
	return Object.keys(rest).length > 0 ? rest : undefined
}

/** A copy of the object with `attrs` set, or without the field at all when there is nothing. */
function setAttrs<T extends {attrs?: Attributes}>(
	object: T,
	attrs: Attributes | undefined
): T {
	if (object.attrs === attrs) return object
	const rest = omit(object, 'attrs')
	return (attrs ? {...rest, attrs} : rest) as T
}

/**
 * Reads the attribute at the location. It is looked up on the vertices, the curve, the path and in the definition in this order, and is interpolated between the two ends of the segment by time.
 * @param path The path to read
 * @param name The name of the attribute
 * @param location The location on the path
 * @returns The value, or `undefined` if it is not set anywhere
 * @category Attributes
 */
export function attribute(
	path: Path,
	name: string,
	location: PathLocation
): AttributeValue | undefined {
	const {curveIndex, segmentIndex, time} = toTime(path, location)
	const curve = path.curves[curveIndex]
	const count = curve.vertices.length

	const startVertex = curve.vertices[segmentIndex]
	const endVertex = curve.vertices[(segmentIndex + 1) % count]

	return interpolateValue(
		lookupAttr(path, curve, startVertex, name),
		lookupAttr(path, curve, endVertex, name),
		time,
		path.attrDefs?.[name]
	)
}

/**
 * Lists the names of the attributes set on any level or defined in the path.
 * @category Attributes
 */
export function attributeNames(path: Path): string[] {
	const names = new Set<string>([
		...Object.keys(path.attrDefs ?? {}),
		...Object.keys(path.attrs ?? {}),
	])
	for (const curve of path.curves) {
		for (const name of Object.keys(curve.attrs ?? {})) names.add(name)
		for (const {attrs} of curve.vertices) {
			for (const name of Object.keys(attrs ?? {})) names.add(name)
		}
	}
	return [...names]
}

/**
 * @category Options
 */
export type SetAttributeOptions =
	| {
			/**
			 * The level to write to. The value is passed the vertex, the curve or the path accordingly if it is a function.
			 * @defaultValue 'vertex'
			 */
			level?: 'vertex'
			/** Only writes to the vertices this selects; the others keep their values. */
			group?: AttributeLike<boolean>
	  }
	| {level: 'curve'; group?: undefined}
	| {level: 'path'; group?: undefined}

/**
 * Sets an attribute. A group is just a boolean attribute, so this also makes one.
 * @param path The base path
 * @param name The name of the attribute
 * @param value The value, the name of another attribute to copy, or a function to compute it
 * @param options The options
 * @returns The new path
 * @category Attributes
 * @example
 * ```js:pave
 * const p = Path.subdivide(Path.line([10, 50], [90, 50]), 8)
 * const q = Path.setAttribute(p, 'width', v => v.point[0] / 8)
 * stroke(Path.offsetStroke(q, 'width'), 'tomato')
 * ```
 */
export function setAttribute(
	path: Path,
	name: string,
	value: AttributeLike<AttributeValue>,
	options?: {level?: 'vertex'; group?: AttributeLike<boolean>}
): Path
export function setAttribute(
	path: Path,
	name: string,
	value:
		| AttributeValue
		| ((curve: Curve, context: CurveContext) => AttributeValue),
	options: {level: 'curve'}
): Path
export function setAttribute(
	path: Path,
	name: string,
	value: AttributeValue | ((path: Path) => AttributeValue),
	options: {level: 'path'}
): Path
export function setAttribute(
	path: Path,
	name: string,
	value: unknown,
	options: SetAttributeOptions = {}
): Path {
	if (options.level === 'path') {
		const v =
			typeof value === 'function'
				? (value as (path: Path) => AttributeValue)(path)
				: typeof value === 'string'
					? lookupAttr(path, undefined, undefined, value)
					: (value as AttributeValue)
		return setAttrs(path, withValue(path.attrs, name, v))
	}

	if (options.level === 'curve') {
		return withCurves(
			path,
			path.curves.map((curve, index) => {
				const v =
					typeof value === 'function'
						? (value as (c: Curve, x: CurveContext) => AttributeValue)(curve, {
								index,
								path,
							})
						: typeof value === 'string'
							? lookupAttr(path, curve, undefined, value)
							: (value as AttributeValue)
				return setAttrs(curve, withValue(curve.attrs, name, v))
			})
		)
	}

	const read = resolveAttribute(value as AttributeLike<AttributeValue>, path)
	const selected =
		options.group === undefined ? null : resolveAttribute(options.group, path)

	return withCurves(
		path,
		path.curves.map((curve, curveIndex) => ({
			...curve,
			vertices: curve.vertices.map((vertex, index) => {
				const context = {index, curve, curveIndex, path}
				if (selected && !selected(vertex, context)) return vertex
				return setAttrs<Vertex>(
					vertex,
					withValue(vertex.attrs, name, read(vertex, context))
				)
			}),
		}))
	)
}

/**
 * Removes an attribute.
 * @param path The base path
 * @param name The name of the attribute
 * @param options `level` limits the removal to one level, so that the values on the upper levels can be read again. Without it, the definition is removed as well.
 * @returns The new path
 * @category Attributes
 */
export function deleteAttribute(
	path: Path,
	name: string,
	{level}: {level?: AttributeLevel} = {}
): Path {
	const curves = path.curves.map(curve => {
		const c =
			!level || level === 'curve'
				? setAttrs(curve, withoutName(curve.attrs, name))
				: curve
		if (level && level !== 'vertex') return c
		return {
			...c,
			vertices: c.vertices.map(v =>
				setAttrs<Vertex>(v, withoutName(v.attrs, name))
			),
		}
	})

	const out = withCurves<Path>(path, curves)
	const kept =
		!level || level === 'path'
			? setAttrs(out, withoutName(out.attrs, name))
			: out
	if (level || !kept.attrDefs || !(name in kept.attrDefs)) return kept

	const rest = omit(kept, 'attrDefs')
	const defs = omit(kept.attrDefs, name)
	return Object.keys(defs).length > 0 ? {...rest, attrDefs: defs} : rest
}

/**
 * Renames an attribute on all the levels and in the definitions.
 * @category Attributes
 */
export function renameAttribute(path: Path, from: string, to: string): Path {
	if (from === to) return path

	const rename = (attrs: Attributes | undefined) =>
		attrs && from in attrs
			? withValue(withoutName(attrs, from), to, attrs[from])
			: attrs

	const out = withCurves<Path>(
		path,
		path.curves.map(curve => ({
			...setAttrs(curve, rename(curve.attrs)),
			vertices: curve.vertices.map(v => setAttrs<Vertex>(v, rename(v.attrs))),
		}))
	)
	const renamed = setAttrs(out, rename(out.attrs))
	if (!renamed.attrDefs || !(from in renamed.attrDefs)) return renamed

	const {[from]: def, ...defs} = renamed.attrDefs
	return {...renamed, attrDefs: {...defs, [to]: def}}
}

/**
 * Defines the default value and the interpolation of an attribute. This is optional: without a definition there is no default, and numbers are interpolated linearly, booleans by `and`, and anything else by `step`.
 * @category Attributes
 */
export function defineAttribute(
	path: Path,
	name: string,
	def: AttributeDef
): Path {
	return {...path, attrDefs: {...path.attrDefs, [name]: def}}
}
