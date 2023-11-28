import {vec2} from 'linearly'
import {Path} from 'pathed'

export function drawPath(path: Path, context: CanvasRenderingContext2D) {
	context.beginPath()

	let prev: vec2 | undefined
	let prevControl: vec2 | undefined

	for (const seg of path) {
		switch (seg[0]) {
			case 'M':
				context.moveTo(...seg[1])
				prev = seg[1]
				break
			case 'L':
				context.lineTo(...seg[1])
				prev = seg[1]
				break
			case 'H':
				context.lineTo(seg[1], prev![1])
				prev = [seg[1], prev![1]]
				break
			case 'V':
				context.lineTo(prev![0], seg[1])
				prev = [prev![0], seg[1]]
				break
			case 'C':
				context.bezierCurveTo(...seg[1], ...seg[2], ...seg[3])
				prevControl = seg[2]
				prev = seg[3]
				break
			case 'S': {
				const control1 = vec2.add(seg[1], vec2.sub(seg[1], prevControl!))
				context.bezierCurveTo(...control1, ...seg[1], ...seg[2])
				prevControl = seg[1]
				prev = seg[2]
				break
			}
			case 'Q':
				context.quadraticCurveTo(...seg[1], ...seg[2])
				prevControl = seg[1]
				prev = seg[2]
				break
			case 'T': {
				const control = vec2.add(seg[1], vec2.sub(seg[1], prevControl!))
				context.quadraticCurveTo(...control, ...seg[1])
				prevControl = seg[1]
				prev = seg[1]
				break
			}
			case 'A': {
				const [, [rx, ry], xAxisRotation, , sweepFlag, end] = seg

				if (xAxisRotation !== 0) throw new Error('Not implemented')

				const startAngle = 0
				const endAngle = Math.PI * 2

				context.ellipse(
					prev![0],
					prev![1],
					rx,
					ry,
					xAxisRotation,
					startAngle,
					endAngle,
					!sweepFlag
				)
				prev = end
				break
			}
			case 'Z':
				context.closePath()
				break
		}
	}
}
