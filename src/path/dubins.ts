/**
 * Dubins paths: the shortest curves between two directed points for a vehicle that only moves
 * forward with a limited turning radius. The shortest one always is a sequence of three pieces,
 * each either a circular arc or a straight line (Dubins 1957), and each of the six possible
 * sequences has a closed form (Shkel & Lumelsky 2001).
 */
import {vec2} from 'linearly'

import type {Path} from '../index'
import type {Vertex} from './types'

/**
 * The sequence of a Dubins path. `R` turns clockwise as seen on a Y-down canvas, which is towards increasing angles, `L` turns the other way, and `S` goes straight.
 * @category Types
 */
export type DubinsType = 'LSL' | 'RSR' | 'LSR' | 'RSL' | 'RLR' | 'LRL'

/**
 * @category Options
 */
export interface DubinsOptions {
	/**
	 * Uses this sequence instead of the shortest one. It throws an error if the sequence is not possible between the two points.
	 */
	type?: DubinsType
}

const TAU = Math.PI * 2

/** A piece turning by this many radians at most is safe to be one arc command. */
const MAX_ARC = Math.PI * 0.9

const mod = (x: number) => ((x % TAU) + TAU) % TAU

/**
 * The lengths of the three pieces in radii, by the sequence named as in the literature: here
 * `P` turns towards increasing angles, and `N` towards decreasing ones.
 */
type Solver = (
	alpha: number,
	beta: number,
	d: number
) => [number, number, number] | null

const SOLVERS: Record<string, Solver> = {
	NSN(alpha, beta, d) {
		return solve(alpha, beta, d, (sa, sb, ca, cb, cab) => {
			const p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa)
			if (p2 < 0) return null
			const tmp = Math.atan2(ca - cb, d - sa + sb)
			return [mod(alpha - tmp), Math.sqrt(p2), mod(tmp - beta)]
		})
	},
	PSP(alpha, beta, d) {
		return solve(alpha, beta, d, (sa, sb, ca, cb, cab) => {
			const p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb)
			if (p2 < 0) return null
			const tmp = Math.atan2(cb - ca, d + sa - sb)
			return [mod(tmp - alpha), Math.sqrt(p2), mod(beta - tmp)]
		})
	},
	NSP(alpha, beta, d) {
		return solve(alpha, beta, d, (sa, sb, ca, cb, cab) => {
			const p2 = d * d - 2 + 2 * cab - 2 * d * (sa + sb)
			if (p2 < 0) return null
			const p = Math.sqrt(p2)
			const tmp = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p)
			return [mod(alpha - tmp), p, mod(beta - tmp)]
		})
	},
	PSN(alpha, beta, d) {
		return solve(alpha, beta, d, (sa, sb, ca, cb, cab) => {
			const p2 = d * d - 2 + 2 * cab + 2 * d * (sa + sb)
			if (p2 < 0) return null
			const p = Math.sqrt(p2)
			const tmp = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p)
			return [mod(tmp - alpha), p, mod(tmp - beta)]
		})
	},
	NPN(alpha, beta, d) {
		return solve(alpha, beta, d, (sa, sb, ca, cb, cab) => {
			const cosP = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8
			if (Math.abs(cosP) > 1) return null
			const p = mod(TAU - Math.acos(cosP))
			const t = mod(alpha - Math.atan2(ca - cb, d - sa + sb) + p / 2)
			return [t, p, mod(alpha - beta - t + p)]
		})
	},
	PNP(alpha, beta, d) {
		return solve(alpha, beta, d, (sa, sb, ca, cb, cab) => {
			const cosP = (6 - d * d + 2 * cab + 2 * d * (sb - sa)) / 8
			if (Math.abs(cosP) > 1) return null
			const p = mod(TAU - Math.acos(cosP))
			const t = mod(-alpha - Math.atan2(ca - cb, d + sa - sb) + p / 2)
			return [t, p, mod(mod(beta) - alpha - t + p)]
		})
	},
}

function solve(
	alpha: number,
	beta: number,
	_d: number,
	fn: (
		sa: number,
		sb: number,
		ca: number,
		cb: number,
		cab: number
	) => [number, number, number] | null
) {
	return fn(
		Math.sin(alpha),
		Math.sin(beta),
		Math.cos(alpha),
		Math.cos(beta),
		Math.cos(alpha - beta)
	)
}

/** On a Y-down canvas, turning towards increasing angles looks like turning right. */
const toType = (word: string) =>
	word.replace(/P/g, 'R').replace(/N/g, 'L') as DubinsType

/**
 * Creates the shortest path between two directed points with a limited turning radius, like the track of a car that cannot go backwards. It consists of arcs and at most one straight line, so it is smooth, and its curvature never exceeds `1 / radius`.
 * @param start The start point
 * @param startAngle The direction of travel at the start, in degrees
 * @param end The end point
 * @param endAngle The direction of travel at the end, in degrees
 * @param radius The minimum turning radius
 * @param options The options
 * @returns The newly created path
 * @category Primitives
 * @example
 * ```js:pave
 * const d = Path.dubins([20, 70], -90, [80, 30], 180, 15)
 * stroke(d, 'tomato')
 * ```
 */
export function dubins(
	start: vec2,
	startAngle: number,
	end: vec2,
	endAngle: number,
	radius: number,
	{type}: DubinsOptions = {}
): Path {
	if (!(radius > 0)) {
		throw new Error('The turning radius of a Dubins path must be positive')
	}

	const from = (startAngle * Math.PI) / 180
	const words = solutions(start, startAngle, end, endAngle, radius)
	const best = type ? words.find(w => w.type === type) : words[0]

	if (!best) {
		throw new Error(
			`A Dubins path of type ${type} does not exist between these points`
		)
	}

	return {
		curves: [
			{
				vertices: toVertices(start, from, end, radius, best.word, best.pieces),
				closed: false,
			},
		],
	}
}

/** All the sequences possible between the two points, the shortest first. */
function solutions(
	start: vec2,
	startAngle: number,
	end: vec2,
	endAngle: number,
	radius: number
) {
	if (!(radius > 0)) {
		throw new Error('The turning radius of a Dubins path must be positive')
	}

	// Normalized so that the start is at the origin, the end is on +X, and the radius is 1
	const delta = vec2.sub(end, start)
	const d = vec2.len(delta) / radius
	const theta = d > 0 ? Math.atan2(delta[1], delta[0]) : 0
	const alpha = mod((startAngle * Math.PI) / 180 - theta)
	const beta = mod((endAngle * Math.PI) / 180 - theta)

	return Object.keys(SOLVERS)
		.flatMap(word => {
			const pieces = SOLVERS[word](alpha, beta, d)
			if (!pieces) return []
			return [
				{
					word,
					pieces,
					type: toType(word),
					length: (pieces[0] + pieces[1] + pieces[2]) * radius,
				},
			]
		})
		.sort((a, b) => a.length - b.length)
}

/**
 * Lists the sequences of Dubins paths possible between two directed points with their lengths, the shortest first. Some sequences do not exist between close points. With this, the type chosen for one setting can be reused for another by the `type` option of {@link dubins}, for example to keep the shape from switching during an animation.
 * @param start The start point
 * @param startAngle The direction of travel at the start, in degrees
 * @param end The end point
 * @param endAngle The direction of travel at the end, in degrees
 * @param radius The minimum turning radius
 * @returns The possible types and their lengths
 * @category Utilities
 * @example
 * ```js:pave
 * const [{type}] = Path.dubinsTypes([20, 70], -90, [80, 30], 180, 15)
 * const moved = [80, 30 + 20 * Math.sin(time * 2 * Math.PI)]
 * stroke(Path.dubins([20, 70], -90, moved, 180, 15, {type}), 'tomato')
 * ```
 */
export function dubinsTypes(
	start: vec2,
	startAngle: number,
	end: vec2,
	endAngle: number,
	radius: number
): {type: DubinsType; length: number}[] {
	return solutions(start, startAngle, end, endAngle, radius).map(
		({type, length}) => ({type, length})
	)
}

function toVertices(
	start: vec2,
	heading: number,
	end: vec2,
	radius: number,
	word: string,
	pieces: [number, number, number]
): Vertex[] {
	const vertices: Vertex[] = [{command: 'L', point: start}]
	let [x, y] = start

	for (let i = 0; i < 3; i++) {
		const kind = word[i]
		const amount = pieces[i]
		if (amount < 1e-9) continue

		if (kind === 'S') {
			x += Math.cos(heading) * amount * radius
			y += Math.sin(heading) * amount * radius
			vertices.push({command: 'L', point: [x, y]})
			continue
		}

		const sign = kind === 'P' ? 1 : -1
		const steps = Math.ceil(amount / MAX_ARC)
		const step = (amount / steps) * sign
		for (let k = 0; k < steps; k++) {
			const next = heading + step
			x += sign * radius * (Math.sin(next) - Math.sin(heading))
			y += sign * radius * (Math.cos(heading) - Math.cos(next))
			heading = next
			vertices.push({
				command: 'A',
				args: [[radius, radius], 0, false, sign > 0],
				point: [x, y],
			})
		}
	}

	// Rounding errors must not leave a gap at the end
	if (vertices.length > 1) {
		const last = vertices.length - 1
		vertices[last] = {...vertices[last], point: end}
	}
	return vertices
}
