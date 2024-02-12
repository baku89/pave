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
import {useCssVar} from '@vueuse/core'
import {mat2d, scalar, vec2} from 'linearly'
import {type Path} from 'pave'
import saferEval from 'safer-eval'
import {onMounted, ref, watch, watchEffect} from 'vue'

import Editor from './Editor.vue'

const props = defineProps<{
	code: string
}>()

const editingCode = ref(props.code)
watchEffect(() => {
	editingCode.value = props.code
})

const canvas = ref<null | HTMLCanvasElement>(null)
const context = ref<null | CanvasRenderingContext2D>(null)

const brandColor = useCssVar('--c-brand')

onMounted(async () => {
	context.value = canvas.value?.getContext('2d') ?? null

	const {Path, Arc, Bezier} = await import('pave')
	watch(
		() => [editingCode.value, canvas.value, context.value] as const,
		([code, canvas, context]) => {
			if (!canvas || !context) return

			const stroke = (path: Path, color = '', lineWidth = 1) => {
				context.strokeStyle = color || brandColor.value
				context.lineCap = 'round'
				context.lineWidth = lineWidth
				context.stroke(Path.toPath2D(path))
			}

			const fill = (path: Path, color = '') => {
				context.fillStyle = color || brandColor.value
				context.stroke(Path.toPath2D(path))
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
					Bezier,
					scalar,
					vec2,
					mat2d,
					stroke,
					fill,
				})
			} catch (e) {
				// eslint-disable-next-line no-console
				console.error(e)
			}
		},
		{immediate: true}
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
