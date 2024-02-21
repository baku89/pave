<script lang="ts" setup>
import {throttledWatch, useCssVar, useElementSize} from '@vueuse/core'
import {computed, onMounted, ref, watch} from 'vue'

import {createDrawFunction, setupEvalContextCreator} from './createDrawFunction'

const props = withDefaults(
	defineProps<{
		code: string
		time: number
	}>(),
	{time: 0}
)

const canvas = ref<null | HTMLCanvasElement>(null)
const context = ref<null | CanvasRenderingContext2D>(null)

const {width: canvasWidth, height: canvasHeight} = useElementSize(canvas)

onMounted(async () => {
	context.value = canvas.value?.getContext('2d') ?? null

	const createDrawContext = await setupEvalContextCreator(useCssVar('--c-text'))

	const evalContext = computed(() => {
		if (!context.value) return {}

		const ctx = context.value

		return createDrawContext(ctx)
	})

	const evalFn = ref<((time: number) => void) | null>(null)

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

<template>
	<canvas ref="canvas" class="PaveRenderer" />
</template>

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
