<script lang="ts" setup>
import {useLocalStorage, useMagicKeys, useRafFn, whenever} from '@vueuse/core'
import {ref, watch} from 'vue'

import Editor from './Editor.vue'
import PaveRenderer from './PaveRenderer.vue'

const DefaultCode = `const path = {
	curves: [
		{
			vertices: [
				{point: [10, 50], command: 'L'},
				{point: [90, 50], command: 'C', args: [[34, 100], [75, 0]]},
			],
			closed: false,
		},
	],
}
stroke(path, 'plum')

// You can create a path by primitive functions.
const c = Path.circle([50, 50], 40)
stroke(c, 'PaleGreen', 1)

const r = Path.rectangle([10, 10], [50, 50])
stroke(r, 'PowderBlue')

const t = Path.regularPolygon([50, 50], 30, 5)
stroke(t, 'MediumSlateBlue')

const o = Path.offset(t, 10, {lineJoin: 'round'})
stroke(o, 'gold')`

const code = useLocalStorage('com.baku89.pave.playground.code', DefaultCode, {})

if (code.value === '') {
	code.value = DefaultCode
}

const currentURL = new URL(location.href)
const query = Object.fromEntries(currentURL.searchParams.entries())

if ('src' in query) {
	code.value = ''
	;(async () => {
		const res = await fetch(query.src)
		code.value = await res.text()
		currentURL.searchParams.delete('src')
		location.href = currentURL.toString()
	})()
}

const time = ref(0)
const playing = ref(false)

function onInput(event: Event) {
	time.value = parseFloat((event.target as HTMLInputElement).value)
}

function togglePlay() {
	playing.value = !playing.value
}

const {pause, resume} = useRafFn(
	() => {
		const duration = 2
		const dt = 1 / 60 / duration

		time.value = (time.value + dt) % 1
	},
	{immediate: false}
)

watch(
	playing,
	playing => {
		if (playing) {
			resume()
		} else {
			pause()
		}
	},
	{flush: 'sync'}
)

const keys = useMagicKeys()

whenever(keys.cmd_control_e, async () => {
	const {exportVideo} = await import('./exportVideo')
	exportVideo(code.value, true)
})

whenever(keys.shift_cmd_e, async () => {
	const {exportVideo} = await import('./exportVideo')
	exportVideo(code.value)
})
</script>

<template>
	<ClientOnly>
		<div class="Sandbox">
			<Editor v-model:code="code" class="editor" :autoHeight="true" />
			<PaveRenderer :code="code" class="renderer" :time="time" />
		</div>
		<div class="control">
			<label class="label">time</label>
			<button class="play" @click="togglePlay">
				<span class="material-symbols-outlined"> play_circle </span>
			</button>
			<input
				class="slider"
				type="range"
				min="0"
				max="1"
				step=".001"
				:value="time"
				@input="onInput"
			/>
			<span class="value">{{ time.toFixed(2) }}</span>
		</div>
	</ClientOnly>
</template>

<style lang="stylus">
.Sandbox
	--w 'max(400px, min(100vw, calc(100vw - 800px)))' % null

	margin-top: 2rem;
	margin-bottom: 2rem;
	border 1px solid var(--c-border-dark)
	padding 1em
	border-radius var(--border-radius)
	display grid
	grid-template-columns 1fr var(--w)
	overflow hidden
	gap 1em 0

	@media (max-width: 800px)
		grid-template-columns 1fr

	@media (max-width: 419px)
		margin 0.85rem -1.5rem
		border-radius 0
		border-width 1px 0

.example
	width: 100%;
	height: 100%;

.renderer
	width var(--w)
	aspect-ratio 1
	margin 0 auto

	@media (max-width: 800px)
		width 100%

.control
	display grid
	grid-template-columns min-content min-content 1fr min-content
	align-items center

.play
	appearance none
	border 0
	background none
	outline none

	.material-symbols-outlined
		font-size 3em

.value
	width 3.2em
	text-align right
	// font-family var(--font-family-code)
	font-variant-numeric tabular-nums

.slider
	width 100%
	height 2em
	accent-color black
	outline none
	appearance none

	&::-webkit-slider-runnable-track
		height: 2rem
		border 1px solid currentColor
		border-radius 1rem

	&::-webkit-slider-thumb
		appearance none
		-webkit-appearance none
		background-color currentColor
		height calc(2rem - 2px)
		width calc(2rem - 2px)
		border-radius 100%
</style>
