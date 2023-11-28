import {mat2d, vec2} from 'linearly'

import {toFixedSimple} from './utils'

// Line commands
export type CommandM = ['M', end: vec2]
export type CommandL = ['L', end: vec2]
export type CommandH = ['H', end: number]
export type CommandV = ['V', end: number]

// Curve commands
export type CommandC = ['C', control1: vec2, control2: vec2, end: vec2]
export type CommandS = ['S', control2: vec2, end: vec2]
export type CommandQ = ['Q', control: vec2, end: vec2]
export type CommandT = ['T', end: vec2]
export type CommandZ = ['Z']

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
