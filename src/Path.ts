import type {Curve} from './Curve'
import type {Vertex, VertexA, VertexC, VertexL} from './path/types'

export type {
	CommandArgsA,
	CommandArgsC,
	Vertex,
	VertexA,
	VertexC,
	VertexL,
	SVGCommand,
} from './path/types'

/**
 * A path that consists of multiple curves.
 *
 * Values are immutable: do not mutate `curves`, nested curves, or vertices in place. {@link Path} helpers may memoize by reference.
 * @category Types
 */
export type Path<V extends Vertex = Vertex> = {
	readonly curves: Curve<V>[]
}

/**
 * A path that only consists of line (`L`) commands, which is a simple polygon or polyline.
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#Line_commands
 **/
export type PathL = Path<VertexL>

/**
 * A path that only consists of cubic Bézier curve (`C`) commands.
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 **/
export type PathC = Path<VertexC>

/**
 * A path that only consists of arc (`A`) commands.
 * @category Types
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#curve_commands
 **/
export type PathA = Path<VertexA>

/**
 * A path that does not contain any {@link VertexA}. It can be obtained by {@link Path.unarc}, while approximating arcs to cubic Bézier curves. In some non-affine transformations such as {@link Path.distort} and {@link Path.offset}, all arcs are internally converted to this type of path.
 * @category Types
 */
export type UnarcPath = Path<VertexL | VertexC>

import * as PBoolean from './path/boolean'
import * as PCanvas from './path/canvas'
import * as PCompound from './path/compound'
import type {
	PathCloseOptions as NT_PathCloseOptions,
	ReduceOptions as NT_ReduceOptions,
} from './path/drawAppend'
import * as PDraw from './path/drawAppend'
import * as PLocation from './path/location'
import * as PMetrics from './path/metrics'
import type {
	DistortOptions as NT_DistortOptions,
	OffsetOptions as NT_OffsetOptions,
	OffsetStrokeOptions as NT_OffsetStrokeOptions,
	ReverseOptions as NT_ReverseOptions,
	SpawnOptions as NT_SpawnOptions,
} from './path/modifiers'
import * as PModifiers from './path/modifiers'
import * as PPaper from './path/paper'
import type {
	ArcOptions as NT_ArcOptions,
	CircleFromPointsOptions as NT_CircleFromPointsOptions,
	FormulaOptions as NT_FormulaOptions,
} from './path/primitives'
import * as PPrimitives from './path/primitives'
import * as PSvg from './path/svg'

/**
 * Functions for manipulating paths represented as {@link Path}.
 *
 * For creating new paths, see [Primitives](#primitives). Getting intrinsic properties of paths, see [Properties](#properties).
 * Manipulating existing paths, such as transforming, styling, deforming, etc., see [Modifiers](#modifiers).
 *
 * Inputs are never mutated; returned paths are new objects unless noted otherwise.
 *
 * @category Modules
 */
export namespace Path {
	export type ArcOptions = NT_ArcOptions
	export type CircleFromPointsOptions = NT_CircleFromPointsOptions
	export type DistortOptions = NT_DistortOptions
	export type FormulaOptions = NT_FormulaOptions
	export type OffsetOptions = NT_OffsetOptions
	export type OffsetStrokeOptions = NT_OffsetStrokeOptions
	export type PathCloseOptions = NT_PathCloseOptions
	export type ReduceOptions = NT_ReduceOptions
	export type ReverseOptions = NT_ReverseOptions
	export type SpawnOptions = NT_SpawnOptions

	export const empty = PPrimitives.empty
	export const rectangle = PPrimitives.rectangle
	export const rect = PPrimitives.rect
	export const rectFromCenter = PPrimitives.rectFromCenter
	export const roundRect = PPrimitives.roundRect
	export const circle = PPrimitives.circle
	export const semicircle = PPrimitives.semicircle
	export const infiniteLine = PPrimitives.infiniteLine
	export const halfLine = PPrimitives.halfLine
	export const circleFromPoints = PPrimitives.circleFromPoints
	export const ellipse = PPrimitives.ellipse
	export const arc = PPrimitives.arc
	export const arcByPoints = PPrimitives.arcByPoints
	export const arcByPointsTangent = PPrimitives.arcByPointsTangent
	export const arcByPointsAngle = PPrimitives.arcByPointsAngle
	export const fan = PPrimitives.fan
	export const line = PPrimitives.line
	export const dot = PPrimitives.dot
	export const polyline = PPrimitives.polyline
	export const polygon = PPrimitives.polygon
	export const regularPolygon = PPrimitives.regularPolygon
	export const ngon = PPrimitives.ngon
	export const grid = PPrimitives.grid
	export const cubicBezier = PPrimitives.cubicBezier
	export const quadraticBezier = PPrimitives.quadraticBezier
	export const nBezier = PPrimitives.nBezier
	export const formula = PPrimitives.formula

	export const fromSegment = PCompound.fromSegment
	export const merge = PCompound.merge

	export const length = PMetrics.length
	export const bounds = PMetrics.bounds
	export const area = PMetrics.area
	export const segmentCount = PMetrics.segmentCount
	export const segments = PMetrics.segments
	export const segment = PMetrics.segment

	export const toTime = PLocation.toTime
	export const unlinearSegmentIndex = PLocation.unlinearSegmentIndex
	export const point = PLocation.point
	export const derivative = PLocation.derivative
	export const tangent = PLocation.tangent
	export const normal = PLocation.normal
	export const orientation = PLocation.orientation

	export const spawnVertex = PModifiers.spawnVertex
	export const spawnCurve = PModifiers.spawnCurve
	export const spawn = PModifiers.spawn
	export const transform = PModifiers.transform
	export const reverse = PModifiers.reverse
	export const trim = PModifiers.trim
	export const unarc = PModifiers.unarc
	export const toCubicBezier = PModifiers.toCubicBezier
	export const toC = PModifiers.toC
	export const offset = PModifiers.offset
	export const offsetStroke = PModifiers.offsetStroke
	export const join = PModifiers.join
	export const flatten = PModifiers.flatten
	export const subdivide = PModifiers.subdivide
	export const subdiv = PModifiers.subdiv
	export const split = PModifiers.split
	export const distort = PModifiers.distort
	export const chamfer = PModifiers.chamfer
	export const fillet = PModifiers.fillet

	export const unite = PBoolean.unite
	export const subtract = PBoolean.subtract

	export const fromSVGString = PSvg.fromSVGString
	export const fromD = PSvg.fromD
	export const toSVGString = PSvg.toSVGString
	export const toD = PSvg.toD
	export const fromSVG = PSvg.fromSVG

	export const toPath2D = PCanvas.toPath2D
	export const drawToCanvas = PCanvas.drawToCanvas
	export const drawToP5 = PCanvas.drawToP5

	export const toPaperPath = PPaper.toPaperPath
	export const fromPaperPath = PPaper.fromPaperPath

	export const moveTo = PDraw.moveTo
	export const addVertex = PDraw.addVertex
	export const lineTo = PDraw.lineTo
	export const cubicBezierTo = PDraw.cubicBezierTo
	export const quadraticBezierTo = PDraw.quadraticBezierTo
	export const arcTo = PDraw.arcTo
	export const close = PDraw.close
	export const reduce = PDraw.reduce
	export const pen = PDraw.pen
	export const Pen = PDraw.Pen
}
