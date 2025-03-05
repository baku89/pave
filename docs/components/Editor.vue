<template>
	<div class="Editor" :style="autoHeight ? {minHeight: height + 'px'} : {}">
		<MonacoEditor
			ref="monaco"
			:theme="theme"
			:value="code"
			:options="options"
			@update:value="emit('update:code', $event)"
			@editorWillMount="onEditorWillMount"
		/>
	</div>
</template>

<script lang="ts" setup>
import {whenever} from '@vueuse/core'
import {useMutationObserver} from '@vueuse/core'
import {type editor} from 'monaco-editor'
import DarkTheme from 'monaco-themes/themes/Clouds Midnight.json'
import LightTheme from 'monaco-themes/themes/Clouds.json'
import {defineAsyncComponent, ref} from 'vue'

defineProps<{
	code: string
	autoHeight?: boolean
}>()

const emit = defineEmits<{
	'update:code': [code: string]
}>()

DarkTheme.rules[1].foreground = '777777'

const MonacoEditor = defineAsyncComponent(() => import('monaco-editor-vue3'))

const monaco = ref<null | {editor: editor.IStandaloneCodeEditor}>(null)
const height = ref(0)

whenever(monaco, monaco => {
	monaco.editor.onDidContentSizeChange(() => {
		height.value = monaco.editor.getContentHeight()
	})
})

const theme = ref<'LightTheme' | 'DarkTheme'>(
	document.documentElement.dataset.theme === 'dark' ? 'DarkTheme' : 'LightTheme'
)

useMutationObserver(
	document.documentElement,
	() => {
		theme.value =
			document.documentElement.dataset.theme === 'dark'
				? 'DarkTheme'
				: 'LightTheme'
	},
	{attributeFilter: ['dataset']}
)

const options = {
	language: 'javascript',
	'bracketPairColorization.enabled': false,
	fontLigatures: true,
	fontFamily: 'IBM Plex Mono',
	folding: false,
	lineNumbers: 'off',
	lineDecorationsWidth: 0,
	lineNumbersMinChars: 0,
	minimap: {
		enabled: false,
	},
	overviewRulerLanes: 0,
	renderIndentGuides: false,
	renderLineHighlight: 'none',
	scrollBeyondLastLine: false,
	automaticLayout: true,
	scrollbar: {
		vertical: 'hidden',
		handleMouseWheel: false,
	},
	tabSize: 2,
	wordWrap: 'on',
}

function onEditorWillMount(monaco: typeof import('monaco-editor')) {
	monaco.editor.defineTheme('LightTheme', LightTheme as any)
	monaco.editor.defineTheme('DarkTheme', DarkTheme as any)
}
</script>

<style lang="stylus">

.Editor
	position relative

.monaco-editor-vue3
	position absolute
	inset 0

.monaco-editor
	outline none !important

.monaco-editor, .monaco-editor-background,
.monaco-editor .inputarea.ime-input
	background transparent !important
</style>
