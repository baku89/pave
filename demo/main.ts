import {mat2d, scalar, vec2} from 'linearly'
import {Path} from 'pathed'
import saferEval from 'safer-eval'

import Examples from './examples'

// Setup canvas and drawing context
const canvas = document.getElementById('canvas') as HTMLCanvasElement
const context = canvas.getContext('2d')!

function fitCanvas() {
	const {width, height} = canvas.getBoundingClientRect()
	const dpi = window.devicePixelRatio
	canvas.width = width * dpi
	canvas.height = height * dpi
	const scale = (width * dpi) / 100
	context.resetTransform()
	context.transform(...mat2d.fromScaling([scale, scale]))
}

window.addEventListener('resize', () => {
	fitCanvas()
	runCode()
})

const code =
	localStorage.getItem('com.baku89.pathed.code') || Examples.get('Primitives')

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

const stroke = (path: Path, color = '#000', lineWidth = 1) => {
	context.strokeStyle = color || '#000'
	context.lineCap = 'round'
	context.lineWidth = lineWidth
	context.stroke(Path.toPath2D(path))
}

let lastCode = code
const runCode = (code = lastCode) => {
	context.clearRect(0, 0, canvas.width, canvas.height)

	lastCode = code
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
}

fitCanvas()
runCode(code)
