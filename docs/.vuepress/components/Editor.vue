<template>
	<MonacoEditor
		class="Editor"
		ref="monaco"
		:theme="theme"
		:value="code"
		@update:value="emit('update:code', $event)"
		@editorWillMount="onEditorWillMount"
		:options="options"
		:style="{height: height + 'px'}"
	/>
</template>

<script lang="ts" setup>
import {ref, defineAsyncComponent} from 'vue'
import {type editor} from 'monaco-editor'
import {whenever} from '@vueuse/core'
import Tomorrow from 'monaco-themes/themes/Tomorrow.json'
import TomorrowNight from 'monaco-themes/themes/Tomorrow-Night.json'
import {useMutationObserver} from '@vueuse/core'

defineProps<{
	code: string
}>()

const emit = defineEmits<{
	'update:code': [code: string]
}>()

const MonacoEditor = defineAsyncComponent(() => import('monaco-editor-vue3'))

const monaco = ref<null | {editor: editor.IStandaloneCodeEditor}>(null)
const height = ref(0)

whenever(monaco, monaco => {
	monaco.editor.onDidContentSizeChange(() => {
		height.value = monaco.editor.getContentHeight()
	})
})

const theme = ref<'Tomorrow' | 'TomorrowNight'>(
	document.documentElement.classList.contains('dark')
		? 'TomorrowNight'
		: 'Tomorrow'
)

useMutationObserver(
	document.documentElement,
	m => {
		console.log(m)
		theme.value = document.documentElement.classList.contains('dark')
			? 'TomorrowNight'
			: 'Tomorrow'
	},
	{attributeFilter: ['class']}
)

const options = {
	language: 'javascript',
	'bracketPairColorization.enabled': false,
	fontLigatures: true,
	fontFamily: 'Fira Code',
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
		horizontalSliderSize: 2,
		useShadows: false,
		verticalSliderSize: 2,
		verticalScrollbarSize: 2,
	},
	tabSize: 2,
}

function onEditorWillMount(monaco: typeof import('monaco-editor')) {
	monaco.editor.defineTheme('Tomorrow', Tomorrow as any)
	monaco.editor.defineTheme('TomorrowNight', TomorrowNight as any)
}
</script>
