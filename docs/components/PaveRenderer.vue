<template>
	<canvas ref="canvas" class="PaveRenderer" />
</template>

<script lang="ts" setup>
import {throttledWatch, useCssVar, useElementSize} from '@vueuse/core'
import {mat2d, scalar, vec2} from 'linearly'
import {type Path} from 'pave'
import saferEval from 'safer-eval'
import {computed, onMounted, ref, watch} from 'vue'

const props = withDefaults(
	defineProps<{
		code: string
		time: number
	}>(),
	{time: 0}
)

const canvas = ref<null | HTMLCanvasElement>(null)
const context = ref<null | CanvasRenderingContext2D>(null)

const brandColor = useCssVar('--c-brand')

const {width: canvasWidth, height: canvasHeight} = useElementSize(canvas)

onMounted(async () => {
	context.value = canvas.value?.getContext('2d') ?? null

	const {Path, Arc, CubicBezier, Curve} = await import('pave')

	const evalContext = computed(() => {
		if (!context.value) return

		const ctx = context.value

		const stroke = (path: Path, color = '', lineWidth = 1) => {
			ctx.fillStyle = 'none'
			ctx.strokeStyle = color || brandColor.value
			ctx.lineCap = 'round'
			ctx.lineWidth = lineWidth
			Path.drawToCanvas(path, ctx)
			ctx.stroke()
		}

		const fill = (path: Path, color = '') => {
			ctx.strokeStyle = 'none'
			ctx.fillStyle = color || brandColor.value
			Path.drawToCanvas(path, ctx)
			ctx.fill()
		}

		const dot = (point: vec2, color = '', size = 3) => {
			ctx.strokeStyle = 'none'
			ctx.fillStyle = color || brandColor.value
			Path.drawToCanvas(Path.circle(point, size / 2), ctx)
			ctx.fill()
		}

		const debug = (path: Path, color = '') => {
			const lineWidth = 0.5
			const vertexSize = 3

			ctx.fillStyle = color || brandColor.value

			ctx.strokeStyle = color || brandColor.value
			ctx.lineCap = 'round'
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
						ctx.setLineDash([2, 1])
						Path.drawToCanvas(Path.line(start, control1), ctx)
						ctx.stroke()
						Path.drawToCanvas(Path.line(point, control2), ctx)
						ctx.stroke()
						ctx.setLineDash([])

						Path.drawToCanvas(Path.circle(control1, 1), ctx)
						ctx.fill()
						Path.drawToCanvas(Path.circle(control2, 1), ctx)
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

					ctx.font = '7px "IBM Plex Mono"'
					ctx.fillText(command[0], ...vec2.add(point, [2, -2]))
				}
			}
		}

		return {
			Path,
			Arc,
			CubicBezier,
			scalar,
			vec2,
			mat2d,
			stroke,
			fill,
			dot,
			debug,
		}
	})

	const evalFn = ref<((time: number) => void) | null>(null)

	throttledWatch(
		() =>
			[
				props.code,
				canvas.value,
				context.value,
				canvasWidth.value,
				canvasHeight.value,
			] as const,
		([code, canvas, context, width, height]) => {
			if (!canvas || !context) return

			const dpi = window.devicePixelRatio
			canvas.width = width * dpi
			canvas.height = height * dpi
			const scale = (width * dpi) / 100

			try {
				const draw = saferEval(
					`(time) => {\n${code}\n}`,
					evalContext.value
				) as unknown as (time: number) => void

				evalFn.value = (time: number) => {
					context.clearRect(0, 0, canvas.width, canvas.height)
					context.resetTransform()
					context.transform(...mat2d.fromScaling([scale, scale]))
					draw(time)
				}
			} catch (e) {
				evalFn.value = null
				// eslint-disable-next-line no-console
				console.error(e)
				e
			}
		},
		{immediate: true, throttle: 100}
	)

	watch(
		() => [props.time, evalFn.value] as const,
		([time, evalFn]) => {
			if (!evalFn) return

			try {
				evalFn(time)
			} catch (e) {
				// eslint-disable-next-line no-console
				console.error(e)
			}
		},
		{immediate: true, flush: 'sync'}
	)
})
</script>

<style lang="stylus" scoped>
.PaveRenderer
	border-color var(--c-bg-light)
	background var(--c-bg)
	border-style solid
	border-width 1px 1px 0 0
	background-image: linear-gradient(0deg, var(--c-bg-light) 1px, transparent 1px),
		linear-gradient(90deg, var(--c-bg-light) 1px, transparent 1px);
	background-size: 10% 10%;
</style>
