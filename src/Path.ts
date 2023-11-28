import {vec2} from 'linearly'

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

export namespace Path {}
