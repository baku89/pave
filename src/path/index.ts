/**
 * The members of the {@link Path} namespace.
 */
export {
	attribute,
	attributeNames,
	setAttribute,
	deleteAttribute,
	renameAttribute,
	defineAttribute,
} from './attributes'
export {unite, subtract, intersect, exclude} from './boolean'
export {toPath2D, drawToCanvas, drawToP5} from './canvas'
export {displace} from './displace'
export type {DisplaceContext, DisplaceOptions} from './displace'
export {dubins, dubinsTypes} from './dubins'
export type {DubinsOptions, DubinsType} from './dubins'
export {fromSegment, merge} from './compound'
export {wave, twirl, bulge} from './distortions'
export {
	moveTo,
	addVertex,
	lineTo,
	cubicBezierTo,
	quadraticBezierTo,
	arcTo,
	close,
	reduce,
	pen,
	Pen,
} from './drawAppend'
export {
	toTime,
	unlinearSegmentIndex,
	point,
	derivative,
	tangent,
	normal,
	orientation,
} from './location'
export {length, bounds, area, segmentCount, segments, segment} from './metrics'
export {reflect, mirror} from './mirror'
export {
	spawnVertex,
	spawnCurve,
	spawn,
	transform,
	reverse,
	trim,
	unarc,
	toCubicBezier,
	toC,
	join,
	flatten,
	subdivide,
	subdiv,
	split,
	distort,
	chamfer,
	zigzag,
	cutCorners,
	cornerCubic,
	cornerShape,
	fillet,
} from './modifiers'
export {offset, offsetStroke} from './offset'
export {toPaperPath, fromPaperPath} from './paper'
export {
	empty,
	rectangle,
	rect,
	rectFromCenter,
	roundRect,
	circle,
	semicircle,
	infiniteLine,
	halfLine,
	circleFromPoints,
	ellipse,
	arc,
	arcByPoints,
	arcByPointsTangent,
	arcByPointsAngle,
	fan,
	line,
	dot,
	polyline,
	polygon,
	regularPolygon,
	ngon,
	star,
	capsule,
	grid,
	cubicBezier,
	quadraticBezier,
	nBezier,
	formula,
} from './primitives'
export {spiral, clothoid} from './spirals'
export type {ClothoidOptions, SpiralOptions} from './spirals'
export {superellipse} from './superellipse'
export type {SuperellipseOptions} from './superellipse'
export {fromSVGString, fromD, toSVGString, toD, fromSVG} from './svg'
export type {WaveOptions, RadialDistortOptions} from './distortions'
export type {PathCloseOptions, ReduceOptions} from './drawAppend'
export type {MirrorAxis} from './mirror'
export type {
	Corner,
	CornerCubicOptions,
	CornerOptions,
	CornerShapeOptions,
	DistortOptions,
	ReverseOptions,
	SpawnOptions,
	ZigzagOptions,
} from './modifiers'
export type {OffsetOptions, OffsetStrokeOptions} from './offset'
export type {
	ArcOptions,
	CircleFromPointsOptions,
	FormulaOptions,
} from './primitives'
export type {SetAttributeOptions} from './attributes'
export {arcify} from './arcify'
export type {ArcifyOptions} from './arcify'
export {dash} from './dash'
export type {DashOptions} from './dash'
export {
	convexHull,
	orientedBounds,
	supportPoint,
	tangentsAlong,
	tangentsFrom,
} from './hull'
export type {
	ConvexHullOptions,
	OrientedRect,
	PathPoint,
	TangentHit,
	TangentsOptions,
} from './hull'
export {
	align,
	blend,
	blendSeries,
	distribute,
	fitInto,
	repeatAlong,
	rotate,
	scale,
	translate,
} from './layout'
export type {
	AlignMode,
	AlignOptions,
	DistributeOptions,
	FitIntoOptions,
	RepeatAlongOptions,
} from './layout'
export {
	centroid,
	contains,
	hitTest,
	intersections,
	nearest,
	selfIntersections,
} from './queries'
export type {
	ContainsOptions,
	FillRule,
	HitTestOptions,
	HitTestResult,
	IntersectionsOptions,
	NearestPoint,
	PathIntersection,
} from './queries'
export {raycast} from './raycast'
export type {RaycastOptions, RayHit} from './raycast'
export {shadow, shadowFrom} from './shadow'
export {
	breakApart,
	cleanup,
	connect,
	normalizeWinding,
	orient,
	setStart,
} from './structure'
export type {
	CleanupOptions,
	ConnectOptions,
	NormalizeWindingOptions,
} from './structure'
export {fit, simplify, smooth, spline} from './fitting'
export type {
	FitOptions,
	SimplifyOptions,
	SmoothOptions,
	SplineOptions,
} from './fitting'
export {
	convertVertex,
	deleteVertex,
	insertVertex,
	moveVertex,
	setHandle,
	vertexType,
} from './vertexEdit'
export type {
	ConvertVertexOptions,
	DeleteVertexOptions,
	MoveVertexOptions,
	SetHandleOptions,
	VertexAddress,
	VertexType,
} from './vertexEdit'
