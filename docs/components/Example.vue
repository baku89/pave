<template>
	<div class="Example">
		<ClientOnly>
			<Editor v-model:code="editingCode" />
		</ClientOnly>
		<div class="canvas-wrapper">
			<canvas ref="canvas" class="canvas" />
		</div>
	</div>
</template>

<script lang="ts" setup>
import {pausableWatch, throttledWatch, useCssVar} from '@vueuse/core'
import {mat2d, scalar, vec2} from 'linearly'
import {type Path} from 'pave'
import saferEval from 'safer-eval'
import {onMounted, ref, watch} from 'vue'

import Editor from './Editor.vue'

const props = defineProps<{
	code: string
}>()

const emit = defineEmits<{
	'update:code': [code: string]
}>()

const editingCode = ref(props.code)

const watcher = pausableWatch(editingCode, code => {
	emit('update:code', code)
})

watch(
	() => props.code,
	code => {
		if (code === editingCode.value) return

		watcher.pause()
		editingCode.value = code
		watcher.resume()
	}
)

const canvas = ref<null | HTMLCanvasElement>(null)
const context = ref<null | CanvasRenderingContext2D>(null)

const brandColor = useCssVar('--c-brand')

onMounted(async () => {
	context.value = canvas.value?.getContext('2d') ?? null

	const {Path, Arc, CubicBezier} = await import('pave')
	throttledWatch(
		() => [editingCode.value, canvas.value, context.value] as const,
		([code, canvas, context]) => {
			if (!canvas || !context) return

			const stroke = (path: Path, color = '', lineWidth = 1) => {
				context.fillStyle = 'none'
				context.strokeStyle = color || brandColor.value
				context.lineCap = 'round'
				context.lineWidth = lineWidth
				Path.drawToCanvas(path, context)
				context.stroke()
			}

			const fill = (path: Path, color = '') => {
				context.strokeStyle = 'none'
				context.fillStyle = color || brandColor.value
				Path.drawToCanvas(path, context)
				context.fill()
			}

			const dot = (point: vec2, color = '', size = 3) => {
				context.strokeStyle = 'none'
				context.fillStyle = color || brandColor.value
				Path.drawToCanvas(Path.circle(point, size / 2), context)
				context.fill()
			}

			const debug = (path: Path, color = '') => {
				const lineWidth = 0.5
				const vertexSize = 3

				context.fillStyle = color || brandColor.value

				context.strokeStyle = color || brandColor.value
				context.lineCap = 'round'
				context.lineWidth = lineWidth

				const segmentIter = Path.iterateSegments(path)

				for (const {start, end, command, segmentIndex} of segmentIter) {
					context.lineWidth = lineWidth

					// Draw the first vertex
					if (segmentIndex === 0) {
						Path.drawToCanvas(Path.circle(start, vertexSize), context)
						context.stroke()
					}

					if (command[0] === 'L') {
						Path.drawToCanvas(Path.line(start, end), context)
					} else if (command[0] === 'C') {
						const [, control1, control2] = command

						// Draw handles
						context.setLineDash([2, 1])
						Path.drawToCanvas(Path.line(start, control1), context)
						context.stroke()
						Path.drawToCanvas(Path.line(end, control2), context)
						context.stroke()
						context.setLineDash([])

						let bezier = Path.moveTo(Path.empty, start)
						bezier = Path.cubicBezierTo(bezier, control1, control2, end)
						Path.drawToCanvas(bezier, context)
					} else if (command[0] === 'A') {
						const [, ...args] = command
						let arc = Path.moveTo(Path.empty, start)
						arc = Path.arcTo(arc, ...args, end)
						Path.drawToCanvas(arc, context)
					}
					context.lineWidth = lineWidth
					context.stroke()

					context.lineWidth = vertexSize
					Path.drawToCanvas(Path.dot(end), context)
					context.stroke()

					context.font = '7px "IBM Plex Mono"'
					context.fillText(command[0], ...vec2.add(end, [2, -2]))
				}
			}

			const {width, height} = canvas.getBoundingClientRect()
			const dpi = window.devicePixelRatio
			canvas.width = width * dpi
			canvas.height = height * dpi
			const scale = (width * dpi) / 100

			context.clearRect(0, 0, canvas.width, canvas.height)
			context.resetTransform()
			context.transform(...mat2d.fromScaling([scale, scale]))

			try {
				saferEval(`(() => {\n${code}\n})()`, {
					context,
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
				})
			} catch (e) {
				// eslint-disable-next-line no-console
				console.error(e)
			}
		},
		{immediate: true, throttle: 100}
	)
})
</script>

<style lang="stylus" scoped>
.Example
	position relative
	border 1px solid var(--c-border-dark)
	padding 1em
	border-radius var(--border-radius)
	font-family var(--font-family-code)
	min-height 200px

	@media (max-width: 419px)
		margin 0.85rem -1.5rem
		border-radius 0
		border-width 1px 0

.canvas-wrapper
	width 200px
	position absolute
	top 1em
	right 1em
	height 200px

	@media (max-width: 800px)
		position relative
		margin 0 auto 1em

.canvas
	position absolute
	inset 0
	width 100%
	height 100%
	border-color var(--c-bg-light)
	background var(--c-bg)
	border-style solid
	border-width 1px 1px 0 0
	background-image: linear-gradient(0deg, var(--c-bg-light) 1px, transparent 1px),
		linear-gradient(90deg, var(--c-bg-light) 1px, transparent 1px);
	background-size: 10% 10%;
</style>
