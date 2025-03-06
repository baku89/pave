import * as Linearly from 'linearly'
import {mat2d, vec2} from 'linearly'
import {Path} from 'pave'
import saferEval from 'safer-eval'
import {Ref} from 'vue'

export async function setupEvalContextCreator(defaultColor: Ref<string>) {
	const Pave = await import('pave')

	const {Path, Curve} = Pave

	return (ctx: CanvasRenderingContext2D) => {
		const stroke = (path: Path, color = '', lineWidth = 1) => {
			ctx.fillStyle = 'none'
			ctx.strokeStyle = color || defaultColor.value
			ctx.lineCap = 'round'
			ctx.lineJoin = 'round'
			ctx.lineWidth = lineWidth
			Path.drawToCanvas(path, ctx)
			ctx.stroke()
		}

		const fill = (path: Path, color = '') => {
			ctx.strokeStyle = 'none'
			ctx.fillStyle = color || defaultColor.value
			Path.drawToCanvas(path, ctx)
			ctx.fill()
		}

		const dot = (point: vec2, color = '', size = 3) => {
			ctx.strokeStyle = 'none'
			ctx.fillStyle = color || defaultColor.value
			Path.drawToCanvas(Path.circle(point, size / 2), ctx)
			ctx.fill()
		}

		const debug = (path: Path, color = '', scale = 1) => {
			const lineWidth = 1 * scale
			const vertexSize = 3 * scale

			ctx.fillStyle = color || defaultColor.value

			ctx.strokeStyle = color || defaultColor.value
			ctx.lineCap = 'round'
			ctx.lineJoin = 'round'
			ctx.lineWidth = lineWidth

			for (const curve of path.curves) {
				let isFirstVertex = true
				for (const {start, point, command, args} of Curve.segments(curve)) {
					ctx.lineWidth = lineWidth

					// Draw the first vertex
					if (isFirstVertex) {
						Path.drawToCanvas(Path.circle(start, vertexSize), ctx)
						ctx.stroke()
						isFirstVertex = false
					}

					if (command === 'L') {
						Path.drawToCanvas(Path.line(start, point), ctx)
					} else if (command === 'C') {
						const [control1, control2] = args

						// Draw handles
						ctx.setLineDash([4, 2].map(x => x * scale))
						Path.drawToCanvas(Path.line(start, control1), ctx)
						ctx.stroke()
						Path.drawToCanvas(Path.line(point, control2), ctx)
						ctx.stroke()
						ctx.setLineDash([])

						Path.drawToCanvas(Path.circle(control1, 1 * scale), ctx)
						ctx.fill()
						Path.drawToCanvas(Path.circle(control2, 1 * scale), ctx)
						ctx.fill()

						const bezier = Path.cubicBezier(start, control1, control2, point)
						Path.drawToCanvas(bezier, ctx)
					} else if (command === 'A') {
						let arc = Path.moveTo(Path.empty, start)
						arc = Path.arcTo(arc, ...args, point)
						Path.drawToCanvas(arc, ctx)
					}
					ctx.lineWidth = lineWidth
					ctx.stroke()

					ctx.lineWidth = vertexSize
					Path.drawToCanvas(Path.dot(point), ctx)
					ctx.stroke()

					ctx.font = `${7 * scale}px "IBM Plex Mono"`
					ctx.fillText(command, ...vec2.add(point, [1, -1]))
				}
			}
		}

		const text = (
			text: string,
			position: vec2 = [0, 0],
			color = '',
			size = 4
		) => {
			ctx.fillStyle = color || defaultColor.value
			ctx.font = `${size}px "IBM Plex Mono"`
			ctx.fillText(text, ...position)
		}

		return {
			...Pave.Path,
			...Pave,
			...Linearly.scalar,
			...Linearly,
			stroke,
			fill,
			dot,
			debug,
			text,
		}
	}
}

export function createDrawFunction(
	canvasContext: CanvasRenderingContext2D,
	evalContext: Record<string, unknown>,
	code: string
) {
	const dpi = window.devicePixelRatio
	const canvas = canvasContext.canvas
	const {width, height} = canvas.getBoundingClientRect()
	canvas.width = width * dpi
	canvas.height = height * dpi
	const scale = (width * dpi) / 100

	try {
		const draw = saferEval(
			`({time, mouse}) => {\n${code}\n}`,
			evalContext
		) as unknown as (arg: {time: number; mouse: vec2}) => void

		return (arg: {time: number; mouse: vec2}) => {
			canvasContext.clearRect(0, 0, canvas.width, canvas.height)
			canvasContext.resetTransform()
			canvasContext.transform(...mat2d.fromScaling([scale, scale]))
			draw(arg)
		}
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error(e)
		return null
		e
	}
}
