import {useCssVar} from '@vueuse/core'
import LightTheme from 'monaco-themes/themes/Clouds.json'

import {createDrawFunction, setupEvalContextCreator} from './createDrawFunction'

export async function exportVideo(code: string) {
	const monaco = await import('monaco-editor')
	const {default: domtoimage} = await import('dom-to-image-more')

	code.replaceAll('\n', '<br/>')

	const codeEl = document.createElement('pre')
	codeEl.dataset.lang = 'typescript'
	codeEl.classList.add('sandbox-code')
	document.body.appendChild(codeEl)
	monaco.editor.defineTheme('LightTheme', LightTheme as any)

	const canvas = document.createElement('canvas')
	canvas.width = 1000
	canvas.height = 1000

	document.body.append(canvas)

	const ctx = canvas.getContext('2d')!

	const setupEvalContext = await setupEvalContextCreator(useCssVar('--c-brand'))
	const evalContext = setupEvalContext(ctx)

	const evalFn = createDrawFunction(ctx, evalContext, code)!

	// Setup CanvasCapture
	const videoCanvas = document.createElement('canvas')
	videoCanvas.width = 1920
	videoCanvas.height = 1080
	document.body.append(videoCanvas)

	const videoContext = videoCanvas.getContext('2d')!

	const frames: string[] = []

	for (let i = 0; i < 100; i++) {
		const time = i / 100

		evalFn(time)

		videoContext.clearRect(0, 0, 1920, 1080)
		videoContext.fillStyle = 'white'
		videoContext.fillRect(0, 0, 1920, 1080)
		videoContext.fillStyle = 'black'

		const codeImg = await renderCode(
			code.replace(
				/([^a-zA-Z0-9{])time([^a-zA-Z0-9]?)/g,
				`$1${time.toFixed(2)}$2`
			)
		)
		videoContext.drawImage(codeImg, 40, (1080 - codeImg.height) / 2)

		const canvasTop = 40
		const canvasBottom = 1080 - 40
		const canvasLeft = 880
		const canvasRight = 1920 - 40

		videoContext.strokeStyle = '#ccc'
		videoContext.beginPath()
		for (let i = 0; i <= 10; i++) {
			videoContext.moveTo(canvasLeft + i * 100, canvasTop)
			videoContext.lineTo(canvasLeft + i * 100, canvasBottom)
			videoContext.moveTo(canvasLeft, canvasTop + i * 100)
			videoContext.lineTo(canvasRight, canvasTop + i * 100)
		}
		videoContext.stroke()

		evalFn(time)
		videoContext.drawImage(canvas, 880, 40)

		const frame = videoCanvas.toDataURL('image/webp')
		frames.push(frame)
	}

	const capturer = new CCapture({
		format: 'webm',
		framerate: 50,
	})

	capturer.start()

	for await (const frame of frames) {
		const img = new Image()
		img.src = frame
		await new Promise(resolve => {
			img.onload = () => {
				videoContext.drawImage(img, 0, 0)
				capturer.capture(videoCanvas)
				resolve(null)
			}
		})
	}

	capturer.stop()

	capturer.save()

	async function renderCode(code: string): Promise<HTMLImageElement> {
		codeEl.innerHTML = code

		await monaco.editor.colorizeElement(codeEl, {
			tabSize: 2,
			theme: 'LightTheme',
		})

		const {width, height} = codeEl.getBoundingClientRect()

		const png = await domtoimage.toPng(codeEl, {
			width,
			height,
		})

		const img = new Image()
		img.src = png
		return new Promise(resolve => {
			img.onload = () => resolve(img)
		})
	}
}
