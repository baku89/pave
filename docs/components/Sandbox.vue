<script lang="ts" setup>
import {useLocalStorage} from '@vueuse/core'

import Example from './Example.vue'

const DefaultCode = `const path = {
	curves: [
		{
			vertices: [
				{point: [10, 50], command: ['L']},
				{point: [90, 50], command: ['C', [34, 100], [75, 0]]},
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
</script>

<template>
	<div class="Sandbox">
		<Example v-model:code="code" class="example" />
	</div>
</template>

<style scoped lang="stylus">
.Sandbox {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 100%;
	margin-top: 2rem;
	margin-bottom: 2rem;
}

.example {
	width: 100%;
	height: 100%;
}
</style>
