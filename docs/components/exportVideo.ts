import {useCssVar} from '@vueuse/core'
import LightTheme from 'monaco-themes/themes/Clouds.json'
import saferEval from 'safer-eval'

import {createDrawFunction, setupEvalContextCreator} from './createDrawFunction'

export async function exportVideo(code: string, onlyCanvas = false) {
	// eslint-disable-next-line no-console
	console.info('Start rendering video onlyCanvas:', onlyCanvas)

	const now = new Date()
	const defaultBasename: string | null =
		[now.getFullYear(), now.getMonth() + 1, now.getDate()]
			.map(n => n.toString().padStart(2, '0'))
			.join('-') +
		'_' +
		[now.getHours(), now.getMinutes()]
			.map(n => n.toString().padStart(2, '0'))
			.join('-')

	const promptResult = prompt('Export settings', defaultBasename + ':2')

	if (!promptResult) {
		return
	}

	// Parse prompt result
	const [basename, durationStr] = promptResult.split(':')
	const filename = `Pave_${basename}.webm`
	const duration = parseFloat(durationStr)
	const frameCount = 50 * duration

	// Load dependencies
	const monaco = await import('monaco-editor')
	const {default: domtoimage} = await import('dom-to-image-more')

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

	const setupEvalContext = await setupEvalContextCreator(useCssVar('--c-text'))
	const evalContext = setupEvalContext(ctx)

	const evalFn = createDrawFunction(ctx, evalContext, code)!

	// Setup CanvasCapture
	const videoCanvas = document.createElement('canvas')
	videoCanvas.width = 1920
	videoCanvas.height = 1080
	document.body.append(videoCanvas)

	const videoContext = videoCanvas.getContext('2d')!

	const frames: string[] = []

	for (let i = 0; i < frameCount; i++) {
		const time = i / frameCount

		evalFn(time)

		if (!onlyCanvas) {
			videoContext.clearRect(0, 0, 1920, 1080)
			videoContext.fillStyle = 'white'
			videoContext.fillRect(0, 0, 1920, 1080)
			videoContext.fillStyle = 'black'

			const codeImg = await renderCode(code, time)

			const codeWidth = 1920 - 1080 - 40
			const codeHeight = codeImg.height * (codeWidth / codeImg.width)
			videoContext.drawImage(
				codeImg,
				1080,
				(1080 - codeHeight) / 2,
				codeWidth,
				codeHeight
			)

			const canvasTop = 40
			const canvasBottom = 1080 - 40
			const canvasLeft = 40
			const canvasRight = 1040

			videoContext.strokeStyle = '#ccc'
			videoContext.beginPath()
			for (let i = 0; i <= 10; i++) {
				videoContext.moveTo(canvasLeft + i * 100, canvasTop)
				videoContext.lineTo(canvasLeft + i * 100, canvasBottom)
				videoContext.moveTo(canvasLeft, canvasTop + i * 100)
				videoContext.lineTo(canvasRight, canvasTop + i * 100)
			}
			videoContext.stroke()

			videoContext.drawImage(canvas, 40, 40, 1000, 1000)
		}

		const frame = await new Promise<string>((resolve, reject) => {
			const targetCanvas = onlyCanvas ? canvas : videoCanvas
			targetCanvas.toBlob(blob => {
				if (blob) {
					resolve(URL.createObjectURL(blob))
				} else {
					reject('No blob')
				}
			}, 'image/png')
		})
		frames.push(frame)

		// eslint-disable-next-line no-console
		console.info('Rendering...', i)
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
				videoCanvas.width = img.width
				videoCanvas.height = img.height
				videoContext.fillStyle = 'white'
				videoContext.fillRect(0, 0, img.width, img.height)
				videoContext.drawImage(img, 0, 0)
				capturer.capture(videoCanvas)
				resolve(null)
			}
		})

		// eslint-disable-next-line no-console
		console.info('Encoding...', frames.indexOf(frame))
	}

	capturer.stop()

	capturer.save(blob => {
		const a = document.createElement('a')
		a.href = URL.createObjectURL(blob)
		a.download = filename
		a.click()
	})

	async function renderCode(
		code: string,
		time: number
	): Promise<HTMLImageElement> {
		for (const m of code.matchAll(/\/\*([0-9]?)\*\/(.*?)\/\*\*\//gm)) {
			const precision = parseInt(m[1] || '2')
			const expr = m[2]
			const evaluated = saferEval(`(() => ${expr})()`, {
				...evalContext,
				time,
			}) as unknown

			let replaced: string = ''

			if (typeof evaluated === 'number') {
				replaced = evaluated.toFixed(precision)
			} else if (typeof evaluated === 'object' && evaluated !== null) {
				replaced =
					'{' +
					Object.entries(evaluated)
						.map(([k, v]) => {
							if (typeof v === 'number') {
								v = v.toFixed(precision)
							} else {
								v = JSON.stringify(v)
							}
							return `${k}: ${v}`
						})
						.join(', ') +
					'}'
			} else {
				replaced = evaluated + ''
			}

			code = code.replace(m[0], replaced)
		}

		code = code.replaceAll(
			/([^a-zA-Z0-9{])time([^a-zA-Z0-9]?)/g,
			`$1${time.toFixed(2)}$2`
		)

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
