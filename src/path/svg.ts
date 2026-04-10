import {vec2} from 'linearly'
import svgpath from 'svgpath'

import {CubicBezier} from '../CubicBezier'
import {Curve} from '../Curve'
import type {Path} from '../Path'
import {toFixedSimple} from '../utils'
import {Pen} from './drawAppend'
import type {CommandArgsA, CommandArgsC} from './types'
import type {SVGCommand} from './types'

/**
 * Parses the given d attribute of an SVG path and creates a new path. Internally uses [svgpath](https://github.com/fontello/svgpath) library.
 * @param d The d attribute of an SVG path
 * @returns The newly created path
 * @category Converters
 */
export function fromSVGString(d: string): Path {
	const pen = new Pen()

	svgpath(d)
		.unshort()
		.abs()
		.iterate(seg => {
			switch (seg[0]) {
				case 'M':
					pen.M([seg[1], seg[2]])
					break
				case 'L':
					pen.L([seg[1], seg[2]])
					break
				case 'C':
					pen.C([seg[1], seg[2]], [seg[3], seg[4]], [seg[5], seg[6]])
					break
				case 'Q':
					pen.Q([seg[1], seg[2]], [seg[3], seg[4]])
					break
				case 'A': {
					const [, rx, ry, xAxisRotation, largeArcFlag, sweepFlag, x, y] = seg
					pen.A([rx, ry], xAxisRotation, !!largeArcFlag, !!sweepFlag, [x, y])
					break
				}
				case 'Z':
					pen.Z()
					break
				default:
					throw new Error(`Unexpected command: ${seg[0]}`)
			}
		})

	return pen.get()
}

/**
 * Alias for {@link fromSVGString}
 * @category Aliases
 */
export const fromD = fromSVGString

/**
 * Converts the given path to a string that can be used as the d attribute of an SVG path element.
 * @param path The path to convert
 * @returns The string for the d attribute of the SVG path element
 * @category Converters
 */
export function toSVGString(path: Path): string {
	return path.curves
		.flatMap(curve => {
			const strs = curve.vertices.map(({point, command, args}, i) => {
				if (i === 0) {
					return `M ${vec2ToString(point)}`
				} else if (command === 'L') {
					return `L ${vec2ToString(point)}`
				} else if (command === 'C') {
					return commandCToString(point, args)
				} else if (command === 'A') {
					return commandAToString(point, args)
				}
			})

			if (curve.closed) {
				const firstVertex = curve.vertices.at(0)

				if (firstVertex && firstVertex.command !== 'L') {
					if (firstVertex.command === 'C') {
						strs.push(commandCToString(firstVertex.point, firstVertex.args))
					} else if (firstVertex.command === 'A') {
						strs.push(commandAToString(firstVertex.point, firstVertex.args))
					}
				}

				strs.push('Z')
			}

			return strs
		})
		.join(' ')

	function vec2ToString(v: vec2): string {
		return `${v[0]},${v[1]}`
	}

	function commandCToString(point: vec2, command: CommandArgsC) {
		const c1 = vec2ToString(command[0])
		const c2 = vec2ToString(command[1])
		const p = vec2ToString(point)
		return `C ${c1} ${c2} ${p}`
	}

	function commandAToString(point: vec2, command: CommandArgsA) {
		const radii = vec2ToString(command[0])
		const xAxisRotation = toFixedSimple(command[1])
		const largeArc = command[2] ? '1' : '0'
		const sweep = command[3] ? '1' : '0'
		const p = vec2ToString(point)
		return `A ${radii} ${xAxisRotation} ${largeArc} ${sweep} ${p}`
	}
}

/**
 * Alias for {@link toSVGString}
 * @category Aliases
 */
export const toD = toSVGString

/**
 * Converts an array of SVG commands to a {@link Path}.
 * @param commands The array of SVG commands
 * @returns The newly created path
 * @category Converters
 */
export function fromSVG(commands: SVGCommand[]): Path {
	const paths: Curve[] = []

	let firstPoint: vec2 | undefined
	let prevPoint: vec2 | undefined
	let prevControl: vec2 | undefined

	let currentPath: Curve | undefined

	for (let i = 0; i < commands.length; i++) {
		let code = commands[i]

		if (typeof code !== 'string') {
			throw new Error('Invalid command')
		}

		const isRelative = code.toLowerCase() === code
		code = code.toUpperCase() as SVGCommand

		if (code === 'M') {
			if (currentPath) {
				paths.push(currentPath)
			}

			let point = commands[++i]

			if (!isVec2(point)) {
				throw new Error('Invalid command M')
			}

			if (isRelative) {
				if (!prevPoint) {
					throw new Error('Relative command is used without a previous point')
				}
				point = vec2.add(prevPoint, point)
			}

			currentPath = {vertices: [{point, command: 'L'}], closed: false}
			firstPoint = prevPoint = point
			continue
		}

		if (!currentPath) {
			throw new Error('The path is not started')
		}

		if (code === 'L') {
			let point = commands[++i]

			if (!isVec2(point)) {
				throw new Error('Invalid command L')
			}

			if (isRelative) {
				if (!prevPoint) {
					throw new Error('Relative command is used without a previous point')
				}
				point = vec2.add(prevPoint, point)
			}

			currentPath.vertices.push({point, command: 'L'})

			prevPoint = point
			prevControl = undefined
		} else if (code === 'H') {
			const x = commands[++i]

			if (typeof x !== 'number' || !prevPoint) {
				throw new Error('Invalid command H')
			}

			let point: vec2 = [x, prevPoint[1]]

			if (isRelative) {
				if (!prevPoint) {
					throw new Error('Relative command is used without a previous point')
				}
				point = [point[0] + prevPoint[0], point[1]]
			}

			currentPath.vertices.push({point, command: 'L'})

			prevPoint = point
			prevControl = undefined
		} else if (code === 'V') {
			const y = commands[++i]

			if (typeof y !== 'number' || !prevPoint) {
				throw new Error('Invalid command V')
			}

			let point: vec2 = [prevPoint[0], y]

			if (isRelative) {
				if (!prevPoint) {
					throw new Error('Relative command is used without a previous point')
				}
				point = [point[0], point[1] + prevPoint[1]]
			}

			currentPath.vertices.push({point, command: 'L'})

			prevPoint = point
			prevControl = undefined
		} else if (code === 'Q') {
			let control = commands[++i]
			let point = commands[++i]

			if (!isVec2(control) || !isVec2(point) || !prevPoint) {
				throw new Error('Invalid command Q')
			}

			if (isRelative) {
				if (!prevPoint) {
					throw new Error('Relative command is used without a previous point')
				}
				control = vec2.add(prevPoint, control)
				point = vec2.add(prevPoint, point)
			}

			const {command, args} = CubicBezier.fromQuadraticBezier(
				prevPoint,
				control,
				point
			)

			currentPath.vertices.push({point, command, args})

			prevPoint = point
			prevControl = undefined
		} else if (code === 'T') {
			let point = commands[++i]

			if (!isVec2(point) || !prevPoint || !prevControl) {
				throw new Error('Invalid command T')
			}

			if (isRelative) {
				if (!prevPoint) {
					throw new Error('Relative command is used without a previous point')
				}
				point = vec2.add(prevPoint, point)
			}

			const control = vec2.sub(prevPoint, prevControl)

			const {command, args} = CubicBezier.fromQuadraticBezier(
				prevPoint,
				control,
				point
			)

			currentPath.vertices.push({point, command, args})

			prevPoint = point
			prevControl = control
		} else if (code === 'C') {
			let control1 = commands[++i]
			let control2 = commands[++i]
			let point = commands[++i]

			if (!isVec2(control1) || !isVec2(control2) || !isVec2(point)) {
				throw new Error('Invalid command C')
			}

			if (isRelative) {
				if (!prevPoint) {
					throw new Error('Relative command is used without a previous point')
				}
				control1 = vec2.add(prevPoint, control1)
				control2 = vec2.add(prevPoint, control2)
				point = vec2.add(prevPoint, point)
			}

			currentPath.vertices.push({
				point,
				command: 'C',
				args: [control1, control2],
			})

			prevPoint = point
			prevControl = control2
		} else if (code === 'S') {
			let control2 = commands[++i]
			let point = commands[++i]

			if (!isVec2(control2) || !isVec2(point) || !prevPoint || !prevControl) {
				throw new Error('Invalid command S')
			}

			if (isRelative) {
				if (!prevPoint) {
					throw new Error('Relative command is used without a previous point')
				}
				control2 = vec2.add(prevPoint, control2)
				point = vec2.add(prevPoint, point)
			}

			const control1 = vec2.sub(prevPoint, prevControl)
			currentPath.vertices.push({
				point,
				command: 'C',
				args: [control1, control2],
			})

			prevPoint = point
			prevControl = control2
		} else if (code === 'A') {
			const radii = commands[++i]
			const xAxisRotation = commands[++i]
			const largeArc = commands[++i]
			const sweep = commands[++i]
			let point = commands[++i]

			if (
				!isVec2(radii) ||
				typeof xAxisRotation !== 'number' ||
				!isVec2(point)
			) {
				throw new Error('Invalid command A')
			}

			if (isRelative) {
				if (!prevPoint) {
					throw new Error('Relative command is used without a previous point')
				}
				point = vec2.add(prevPoint, point)
			}

			currentPath.vertices.push({
				point,
				command: 'A',
				args: [radii, xAxisRotation, !!largeArc, !!sweep],
			})

			prevPoint = point
			prevControl = undefined
		} else if (code === 'Z') {
			if (firstPoint && prevPoint && vec2.approx(firstPoint, prevPoint)) {
				currentPath.vertices[0] = currentPath.vertices.at(-1)!
				currentPath.vertices.pop()
			}

			paths.push({...currentPath, closed: true})
			currentPath = undefined
		}
	}

	if (currentPath) {
		paths.push(currentPath)
	}

	return {curves: paths}

	function isVec2(v: SVGCommand): v is vec2 {
		return Array.isArray(v)
	}
}
