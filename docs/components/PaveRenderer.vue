<script lang="ts" setup>
import {
	throttledWatch,
	useCssVar,
	useElementSize,
	useMouseInElement,
} from '@vueuse/core'
import {computed, onMounted, ref, watch} from 'vue'

import {createDrawFunction, setupEvalContextCreator} from './createDrawFunction'
import {vec2} from 'linearly'

const props = withDefaults(
	defineProps<{
		code: string
		time: number
	}>(),
	{time: 0}
)

const canvas = ref<null | HTMLCanvasElement>(null)
const context = ref<null | CanvasRenderingContext2D>(null)

const {x: mouseX, y: mouseY} = useMouseInElement(canvas, {
	target: canvas,
	type: e => {
		const el = e.target as HTMLElement
		return [
			((e.pageX - el.offsetLeft) / el.offsetWidth) * 100,
			((e.pageY - el.offsetTop) / el.offsetHeight) * 100,
		]
	},
	initialValue: {x: 50, y: 50},
})

const mouse = computed<vec2>(() => [mouseX.value, mouseY.value])

const {width: canvasWidth, height: canvasHeight} = useElementSize(canvas)

onMounted(async () => {
	context.value = canvas.value?.getContext('2d') ?? null

	const createDrawContext = await setupEvalContextCreator(
		useCssVar('--vp-c-text')
	)

	const evalContext = computed(() => {
		if (!context.value) return {}

		const ctx = context.value

		return createDrawContext(ctx)
	})

	const evalFn = ref<((arg: {time: number; mouse: vec2}) => void) | null>(null)

	throttledWatch(
		() =>
			[
				props.code,
				context.value,
				evalContext.value,
				canvasWidth.value,
				canvasHeight.value,
			] as const,
		([code, context, evalContext]) => {
			if (!context) return

			evalFn.value = createDrawFunction(context, evalContext, code)
		},
		{immediate: true, throttle: 100}
	)

	watch(
		() => [props.time, mouse.value, evalFn.value] as const,
		([time, mouse, evalFn]) => {
			if (!evalFn) return

			try {
				evalFn({time, mouse})
			} catch (e) {
				// eslint-disable-next-line no-console
				console.error(e)
			}
		},
		{immediate: true, flush: 'sync'}
	)
})
</script>

<template>
	<canvas ref="canvas" class="PaveRenderer" />
</template>

<style lang="stylus" scoped>
.PaveRenderer
	border-color var(--vp-c-bg-alt)
	background var(--vp-c-bg)
	border-style solid
	border-width 1px 1px 0 0
	background-image: linear-gradient(0deg, var(--vp-c-bg-alt) 1px, transparent 1px),
		linear-gradient(90deg, var(--vp-c-bg-alt) 1px, transparent 1px);
	background-size: 10% 10%;
</style>
