<script lang="ts" setup>
import {pausableWatch} from '@vueuse/core'
import {ref, watch} from 'vue'

import Editor from './Editor.vue'
import PaveRenderer from './PaveRenderer.vue'

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
</script>

<template>
	<ClientOnly>
		<div class="Example">
			<Editor v-model:code="editingCode" class="editor" :autoHeight="true" />
			<PaveRenderer :code="code" class="renderer" />
		</div>
	</ClientOnly>
</template>

<style lang="stylus" scoped>
.Example
	position relative
	border 1px solid var(--vp-c-border)
	padding 1em
	border-radius var(--border-radius)
	display grid
	grid-template-columns 1fr 200px
	overflow hidden
	gap 1em 0

	@media (max-width: 800px)
		grid-template-columns 1fr

	@media (max-width: 419px)
		margin 0.85rem -1.5rem
		border-radius 0
		border-width 1px 0

.editor
	width 100% !important

.renderer
	width 200px
	height 200px
	margin 0 auto
</style>
