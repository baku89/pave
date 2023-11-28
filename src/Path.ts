import {mat2d, vec2} from 'linearly'

import {Bezier} from './Bezier'
import {toFixedSimple} from './utils'

// Line commands
export type CommandM = readonly ['M', end: vec2]
export type CommandL = readonly ['L', end: vec2]
export type CommandH = readonly ['H', end: number]
export type CommandV = readonly ['V', end: number]

// Curve commands
export type CommandC = readonly ['C', control1: vec2, control2: vec2, end: vec2]
export type CommandS = readonly ['S', control2: vec2, end: vec2]
export type CommandQ = readonly ['Q', control: vec2, end: vec2]
export type CommandT = readonly ['T', end: vec2]
export type CommandZ = readonly ['Z']

// Arc commands
export type CommandA = [
	'A',
	r: vec2,
	rotation: number,
	largeArc: boolean,
	sweep: boolean,
	end: vec2,
]

export type Command =
	| CommandM
	| CommandL
	| CommandH
	| CommandV
	| CommandC
	| CommandS
	| CommandQ
	| CommandT
	| CommandZ
	| CommandA

export type Path = Command[]

export namespace Path {
	export function transform(path: Path, matrix: mat2d): Path {
		return path.map(([command, ...points]) => {
			switch (command) {
				case 'M':
				case 'L':
				case 'Q':
				case 'T':
				case 'C':
				case 'S':
					return [
						command,
						...(points as vec2[]).map(p => vec2.transformMat2d(p, matrix)),
					]
				case 'H':
					return [
						command,
						vec2.transformMat2d([points[0] as number, 0], matrix)[0],
					]
				case 'V':
					return [
						command,
						vec2.transformMat2d([0, points[0] as number], matrix)[0],
					]
				case 'A':
					throw new Error('Not implemented')
				case 'Z':
					return ['Z']
			}
		}) as Path
	}

	export function length(path: Path) {
		let length = 0
		let start: vec2 | undefined
		let prevControl: vec2 | undefined
		let prev: vec2 | undefined
		for (const seg of path) {
			switch (seg[0]) {
				case 'M':
					start = prev = seg[1]
					break
				case 'L':
					length += vec2.distance(prev!, seg[1])
					prev = seg[1]
					break
				case 'H':
					length += Math.abs(seg[1] - prev![0])
					prev = [seg[1], prev![0]]
					break
				case 'V':
					length += Math.abs(seg[1] - prev![1])
					prev = [prev![0], seg[1]]
					break
				case 'C': {
					const bezier: Bezier = [prev!, seg[1], seg[2], seg[3]]
					length += Bezier.length(bezier)
					prevControl = seg[2]
					prev = seg[3]
					break
				}
				case 'S': {
					const control1 = vec2.add(seg[1], vec2.sub(seg[1], prevControl!))
					const bezier: Bezier = [prev!, control1, seg[1], seg[2]]
					length += Bezier.length(bezier)
					prevControl = seg[1]
					prev = seg[2]
					break
				}
				case 'Q': {
					const bezier = Bezier.fromQuadraticBezier([prev!, seg[1], seg[2]])
					length += Bezier.length(bezier)
					prevControl = seg[1]
					prev = seg[2]
					break
				}
				case 'T': {
					const control = vec2.add(seg[1], vec2.sub(seg[1], prevControl!))
					const bezier = Bezier.fromQuadraticBezier([prev!, control, seg[1]])
					length += Bezier.length(bezier)
					prevControl = seg[1]
					prev = seg[1]
					break
				}
				case 'A':
					throw new Error('Not implemented')
				case 'Z':
					length += vec2.distance(prev!, start!)
					break
			}
		}

		return length
	}

	/**
	 * Creates a rectangle pat hfrom the given two points.
	 * @param start The first point defining the rectangle
	 * @param end The second point defining the rectangle
	 * @returns The newly created path
	 * @category Primitives
	 */
	export function rectangle(start: vec2, end: vec2): Path {
		return [
			['M', start],
			['L', [end[0], start[1]]],
			['L', end],
			['L', [start[0], end[1]]],
			['Z'],
		]
	}

	/**
	 * Creates a circle path from the given center and radius.
	 * @param center The center of the circle
	 * @param radius The radius of the circle
	 * @returns The newly created path
	 */
	export function circle(center: vec2, radius: number): Path {
		return ellipse(center, [radius, radius])
	}

	/**
	 * Creates an ellipse path from the given center and radius.
	 * @param center The center of the ellipse
	 * @param radius The radius of the ellipse
	 * @returns The newly created path
	 */
	export function ellipse(center: vec2, radius: vec2): Path {
		return [
			['M', [center[0] + radius[0], center[1]]],
			['A', radius, 0, false, true, [center[0] - radius[0], center[1]]],
			['A', radius, 0, false, true, [center[0] + radius[0], center[1]]],
			['Z'],
		]
	}

	/**
	 * Creates a linear path from two points describing a line.
	 * @param start The line's starting point
	 * @param end The line's ending point
	 * @returns The newly created path
	 */
	export function line(start: vec2, end: vec2): Path {
		return [
			['M', start],
			['L', end],
		]
	}

	/**
	 * Creates a closed polyline from the given points.
	 * @param points The points describing the polygon
	 * @returns The newly created path
	 */
	export function polygon(...points: vec2[]): Path {
		return [
			['M', points[0]],
			...points.slice(1).map(p => ['L', p] as const),
			['Z'],
		]
	}

	/**
	 * Creates a regular polygon. The first vertex will be placed at the +X axis relative to the center.
	 * @param center The center of the polygon
	 * @param radius The radius of the circumcircle of the polygon
	 * @param sides The number o sides of the polygon
	 * @returns The newly created path
	 */
	export function regularPolygon(
		center: vec2,
		radius: number,
		sides: number
	): Path {
		const angleStep = (2 * Math.PI) / sides
		const points: vec2[] = []

		for (let i = 0; i < sides; i++) {
			const p = vec2.add(center, vec2.rotate([radius, 0], angleStep * i))
			points.push(p)
		}

		return polygon(...points)
	}

	export function toSVG(path: Path, fractionDigits = 2): string {
		return path
			.map(([command, ...ps]) => {
				const strs = ps.map(p => {
					if (typeof p === 'number') {
						return toFixedSimple(p, fractionDigits)
					} else if (typeof p === 'boolean') {
						return p ? '1' : '0'
					} else {
						const x = toFixedSimple(p[0], fractionDigits)
						const y = toFixedSimple(p[1], fractionDigits)
						return `${x},${y}`
					}
				})

				return [command, ...strs].join(' ')
			})
			.join(' ')
	}
}
