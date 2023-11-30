<template>
	<div class="Example">
		<ClientOnly>
			<Editor v-model:code="editingCode" />
		</ClientOnly>
		<div class="canvas-wrapper">
			<canvas class="canvas" ref="canvas" />
		</div>
	</div>
</template>

<script lang="ts" setup>
import {ref, onMounted, watch, watchEffect} from 'vue'
import {mat2d, scalar, vec2} from 'linearly'
import {type Path} from '../../../src'
import saferEval from 'safer-eval'
import Editor from './Editor.vue'

const props = defineProps<{
	code: string
}>()

const emit = defineEmits<{
	'update:code': [code: string]
}>()

const editingCode = ref(props.code)
watchEffect(() => {
	editingCode.value = props.code
})

const canvas = ref<null | HTMLCanvasElement>(null)
const context = ref<null | CanvasRenderingContext2D>(null)

onMounted(async () => {
	context.value = canvas.value?.getContext('2d') ?? null

	const {Path} = await import('../../../src')

	watch(
		() => [editingCode.value, canvas.value, context.value] as const,
		([code, canvas, context]) => {
			if (!canvas || !context) return

			const stroke = (path: Path, color = '#000', lineWidth = 1) => {
				context.strokeStyle = color || '#000'
				context.lineCap = 'round'
				context.lineWidth = lineWidth
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
					scalar,
					vec2,
					mat2d,
					stroke,
				})
			} catch (e) {
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
	border-radius 6px
	font-family var(--font-family-code)

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
