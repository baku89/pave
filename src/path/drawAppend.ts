import {vec2} from 'linearly'

import {Curve} from '../Curve'
import {CurveGroup} from '../CurveGroup'
import type {Path} from '../Path'
import type {Vertex} from './types'

/**
 * An options for {@link Path.close}
 * @category Options
 */
export type PathCloseOptions = {
	/**
	 * If true, deletes overwrapped first and last vertices.
	 * @default true
	 */
	fuse?: boolean
	/**
	 * Specifies which curves to close. Default is the last curve.
	 * @default -1
	 */
	group?: CurveGroup
}

/**
 * An options for {@link Path.reduce}
 * @category Options
 */
export type ReduceOptions = Curve.ReduceOptions & {
	/**
	 * If true, removes the curves with zero length
	 * @default true
	 */
	removeEmptyCurves?: boolean
}

export function moveTo(path: Path, point: vec2): Path {
	return {
		curves: [
			...path.curves,
			{
				vertices: [{point, command: 'L'}],
				closed: false,
			},
		],
	}
}

/**
 * Appends the given command to the end of the path.
 * @param path The base path
 * @param vertex The vertex to append
 * @returns The newely created path
 * @category Draw Functions
 */
export function addVertex(path: Path, vertex: Vertex): Path {
	const lastCurve = path.curves.at(-1)

	if (lastCurve) {
		return {
			curves: [
				...path.curves.slice(0, -1),
				{
					vertices: [...lastCurve.vertices, vertex],
					closed: lastCurve.closed,
				},
			],
		}
	} else {
		return {
			curves: [
				{
					vertices: [vertex],
					closed: false,
				},
			],
		}
	}
}

/**
 * Returns the new path with the new L (line-to) command at the end.
 * @param path The base path
 * @param point The point to draw a line to
 * @returns The newely created path
 * @category Draw Functions
 */
export function lineTo(path: Path, point: vec2): Path {
	return addVertex(path, {point, command: 'L'})
}

/**
 * Returns the new path with the new C (cubic Bézier curve) command at the end.
 * @param path The base path
 * @param control1 The first control point
 * @param control2 The second control point
 * @param point The end point
 * @returns The newely created path
 * @category Draw Functions
 */
export function cubicBezierTo(
	path: Path,
	control1: vec2,
	control2: vec2,
	point: vec2
): Path {
	return addVertex(path, {
		point,
		command: 'C',
		args: [control1, control2],
	})
}

/**
 * Returns the new path with the new Q (quadratic Bézier curve) command at the end.
 * @param path The base path
 * @param control The control point
 * @param point The end point
 * @returns The newely created path
 * @category Draw Functions
 */
export function quadraticBezierTo(
	path: Path,
	control: vec2,
	point: vec2
): Path {
	const lastPoint = path.curves.at(-1)?.vertices.at(-1)?.point

	if (!lastPoint) {
		throw new Error('The path is empty')
	}

	const control1 = vec2.lerp(lastPoint, control, 2 / 3)
	const control2 = vec2.lerp(point, control, 2 / 3)

	return addVertex(path, {
		point,
		command: 'C',
		args: [control1, control2],
	})
}

/**
 * Returns the new path with the new A (arc) command at the end.
 * @param path The base path
 * @param radii The radii of the ellipse used to draw the arc
 * @param xAxisRotation The rotation angle of the ellipse's x-axis relative to the x-axis of the current coordinate system, expressed in degrees
 * @param largeArcFlag The large arc flag. If true, then draw the arc spanning greather than 180 degrees. Otherwise, draw the arc spanning less than 180 degrees.
 * @param sweepFlag The sweep flag. If true, then draw the arc in a "positive-angle" direction in the current coordinate system. Otherwise, draw it in a "negative-angle" direction.
 * @param point The end point of the arc
 * @returns The newely created path
 * @category Draw Functions
 */
export function arcTo(
	path: Path,
	radii: vec2,
	xAxisRotation: number,
	largeArcFlag: boolean,
	sweepFlag: boolean,
	point: vec2
): Path {
	return addVertex(path, {
		command: 'A',
		args: [radii, xAxisRotation, largeArcFlag, sweepFlag],
		point,
	})
}
export function close(
	path: Path,
	{fuse = true, group = -1}: PathCloseOptions = {}
): Path {
	const matcher = CurveGroup.getMatcher(group, path)

	return {
		curves: path.curves.map((curve, i) =>
			matcher(curve, i) ? Curve.close(curve, fuse) : curve
		),
	}
}

/**
 * Cleans up the path by removing redundant vertices and
 * @param path
 * @category Modifiers
 */
export function reduce(path: Path, options: ReduceOptions = {}): Path {
	let curves = path.curves.map(c => Curve.reduce(c, options))

	if (options.removeEmptyCurves ?? true) {
		curves = curves.filter(c => !Curve.isZero(c))
	}

	return {
		curves,
	}
}

/**
 * Creates a new {@link Path} instance to begin drawing a path.
 * @category Draw Functions
 */
export function pen(): Pen {
	return new Pen()
}

/**
 * A class for creating a path by calling draw functions, like Canvas API.
 * @category Draw Functions
 */
export class Pen {
	#curves: Curve[] = []

	current: {curve: Curve; point: vec2; lastHandle?: vec2} | undefined

	moveTo(point: vec2) {
		this.current = {
			curve: {vertices: [{point, command: 'L'}], closed: false},
			point,
		}

		this.#curves.push(this.current.curve)

		return this
	}

	M(point: vec2) {
		return this.moveTo(point)
	}

	moveBy(delta: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const point = vec2.add(this.current.point, delta)
		this.moveTo(point)

		return this
	}

	m(delta: vec2) {
		return this.moveBy(delta)
	}

	lineTo(point: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		this.current.point = point
		this.current.curve.vertices.push({command: 'L', point})

		return this
	}

	L(point: vec2) {
		return this.lineTo(point)
	}

	lineBy(delta: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const point = vec2.add(this.current.point, delta)
		this.lineTo(point)

		return this
	}

	l(delta: vec2) {
		return this.lineBy(delta)
	}

	horizTo(x: number) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const point: vec2 = [x, this.current.point[1]]
		this.lineTo(point)

		return this
	}

	H(x: number) {
		return this.horizTo(x)
	}

	horizBy(dx: number) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const point: vec2 = [this.current.point[0] + dx, this.current.point[1]]
		this.lineTo(point)

		return this
	}

	h(dx: number) {
		return this.horizBy(dx)
	}

	vertTo(y: number) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const point: vec2 = [this.current.point[0], y]
		this.lineTo(point)

		return this
	}

	V(y: number) {
		return this.vertTo(y)
	}

	vertBy(dy: number) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const point: vec2 = [this.current.point[0], this.current.point[1] + dy]
		this.lineTo(point)

		return this
	}

	v(dy: number) {
		return this.vertBy(dy)
	}

	quadraticCurveTo(control: vec2, point: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const {point: start} = this.current
		const control1 = vec2.lerp(start, control, 2 / 3)
		const control2 = vec2.lerp(point, control, 2 / 3)

		this.current.point = point
		this.current.lastHandle = control
		this.current.curve.vertices.push({
			command: 'C',
			point,
			args: [control1, control2],
		})

		return this
	}

	Q(control: vec2, point: vec2) {
		return this.quadraticCurveTo(control, point)
	}

	quadraticCurveBy(deltaControl: vec2, deltaPoint: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const control = vec2.add(this.current.point, deltaControl)
		const point = vec2.add(control, deltaPoint)

		this.quadraticCurveTo(control, point)

		return this
	}

	q(delta: vec2, delta2: vec2) {
		return this.quadraticCurveBy(delta, delta2)
	}

	smoothQuadraticCurveTo(point: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const control = this.current.lastHandle
			? vec2.sub(this.current.point, this.current.lastHandle)
			: this.current.point

		this.quadraticCurveTo(control, point)

		return this
	}

	T(point: vec2) {
		return this.smoothQuadraticCurveTo(point)
	}

	smoothQuadraticCurveBy(delta: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const control = this.current.lastHandle
			? vec2.sub(this.current.point, this.current.lastHandle)
			: this.current.point

		const point = vec2.add(this.current.point, delta)

		this.quadraticCurveTo(control, point)

		return this
	}

	t(delta: vec2) {
		return this.smoothQuadraticCurveBy(delta)
	}

	cubicBezierTo(control1: vec2, control2: vec2, point: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		this.current.point = point
		this.current.lastHandle = control2
		this.current.curve.vertices.push({
			command: 'C',
			point,
			args: [control1, control2],
		})

		return this
	}

	C(control1: vec2, control2: vec2, point: vec2) {
		return this.cubicBezierTo(control1, control2, point)
	}

	cubicBezierBy(deltaControl1: vec2, deltaControl2: vec2, deltaPoint: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const control1 = vec2.add(this.current.point, deltaControl1)
		const control2 = vec2.add(control1, deltaControl2)
		const point = vec2.add(control2, deltaPoint)

		this.cubicBezierTo(control1, control2, point)

		return this
	}

	c(deltaControl1: vec2, deltaControl2: vec2, deltaPoint: vec2) {
		return this.cubicBezierBy(deltaControl1, deltaControl2, deltaPoint)
	}

	smoothCubicBezierTo(control2: vec2, point: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const control1 = this.current.lastHandle
			? vec2.sub(this.current.point, this.current.lastHandle)
			: this.current.point

		this.cubicBezierTo(control1, control2, point)

		return this
	}

	S(control2: vec2, point: vec2) {
		return this.smoothCubicBezierTo(control2, point)
	}

	smoothCubicBezierBy(deltaControl2: vec2, deltaPoint: vec2) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const control1 = this.current.lastHandle
			? vec2.sub(this.current.point, this.current.lastHandle)
			: this.current.point

		const control2 = vec2.add(control1, deltaControl2)
		const point = vec2.add(control2, deltaPoint)

		this.cubicBezierTo(control1, control2, point)

		return this
	}

	s(deltaControl2: vec2, deltaPoint: vec2) {
		return this.smoothCubicBezierBy(deltaControl2, deltaPoint)
	}

	arcTo(
		radii: vec2,
		xAxisRotation: number,
		largeArcFlag: boolean,
		sweepFlag: boolean,
		point: vec2
	) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		this.current.point = point
		this.current.curve.vertices.push({
			command: 'A',
			args: [radii, xAxisRotation, largeArcFlag, sweepFlag],
			point,
		})

		return this
	}

	A(
		radii: vec2,
		xAxisRotation: number,
		largeArcFlag: boolean,
		sweepFlag: boolean,
		point: vec2
	) {
		return this.arcTo(radii, xAxisRotation, largeArcFlag, sweepFlag, point)
	}

	arcBy(
		radii: vec2,
		xAxisRotation: number,
		largeArcFlag: boolean,
		sweepFlag: boolean,
		deltaPoint: vec2
	) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const point = vec2.add(radii, deltaPoint)

		this.arcTo(radii, xAxisRotation, largeArcFlag, sweepFlag, point)

		return this
	}

	a(
		radii: vec2,
		xAxisRotation: number,
		largeArcFlag: boolean,
		sweepFlag: boolean,
		deltaPoint: vec2
	) {
		return this.arcBy(radii, xAxisRotation, largeArcFlag, sweepFlag, deltaPoint)
	}

	close(removeOverwrapped = true) {
		if (!this.current) {
			throw new Error('The pen is not moved yet')
		}

		const {curve} = this.current

		if (removeOverwrapped) {
			const first = curve.vertices.at(0)
			const last = curve.vertices.at(-1)

			if (first && last && vec2.approx(first.point, last.point)) {
				curve.vertices[0] = last
				curve.vertices.pop()
			}
		}

		;(curve as any).closed = true
		this.current = undefined

		return this
	}

	Z(removeOverwrapped = true) {
		return this.close(removeOverwrapped)
	}

	/**
	 * Returns the path drawn by the pen so far.
	 */
	get(): Path {
		if (this.current) {
			return {
				curves: [
					...this.#curves.slice(0, -1),
					{
						vertices: [...this.current.curve.vertices],
						closed: this.current.curve.closed,
					},
				],
			}
		} else {
			return {curves: [...this.#curves]}
		}
	}
}
