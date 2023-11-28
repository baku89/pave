import {mat2d, scalar, vec2} from 'linearly'
import {debounce} from 'lodash'
import {Path} from 'pathed'
import saferEval from 'safer-eval'

import {drawPath} from './draw'
import Examples from './examples'

// Setup canvas and drawing context
const canvas = document.getElementById('canvas') as HTMLCanvasElement
const context = canvas.getContext('2d')!

window.addEventListener('resize', () => {
	const {width, height} = canvas.getBoundingClientRect()
	const dpi = window.devicePixelRatio
	canvas.width = width * dpi
	canvas.height = height * dpi
	context.resetTransform()
	context.transform(dpi, 0, 0, dpi, 0, 0)
	runCode()
})
window.dispatchEvent(new Event('resize'))

const code =
	localStorage.getItem('com.baku89.pathed.code') || Examples.get('circle')

// Setup Ace Editor
const editor = (window as any).ace.edit('editor')
const session = editor.getSession()
editor.setTheme('ace/theme/tomorrow')
editor.renderer.setShowGutter(false)
session.setOptions({
	mode: 'ace/mode/javascript',
	tabSize: 2,
})
editor.setHighlightActiveLine(false)
session.setValue(code)
editor.container.style.background = 'transparent'

// Append Options
const example = document.getElementById('example') as HTMLSelectElement

for (const name of Examples.keys()) {
	const option = document.createElement('option')
	option.text = option.value = name
	example.appendChild(option)
}

example.value = ''
for (const [name, c] of Examples.entries()) {
	if (code === c) {
		example.value = name
		break
	}
}

example.oninput = () => {
	editor.setValue(Examples.get(example.value))
	editor.clearSelection()
}

// Re-evaluate the code on change
editor.on('change', () => {
	const code = editor.getValue()

	example.value = ''
	for (const [name, c] of Examples.entries()) {
		if (code === c) {
			example.value = name
			break
		}
	}

	localStorage.setItem('com.baku89.pathed.code', code)

	runCode(code)
})

const draw = (path: Path, color = '#000', lineWidth = 5) => {
	context.strokeStyle = color
	context.lineWidth = lineWidth
	drawPath(path, context)
	context.stroke()
}

const runCode = debounce((code = '') => {
	context.clearRect(0, 0, canvas.width, canvas.height)

	saferEval(`(() => {${code}\n})()`, {
		context,
		Path,
		scalar,
		vec2,
		mat2d,
		draw,
	})
}, 10)

runCode(code)
