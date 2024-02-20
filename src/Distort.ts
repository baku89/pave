import {mat2d, vec2} from 'linearly'

type Distort = (p: vec2) => mat2d

export namespace Distort {
	export function fromPointTransformer(fn: (p: vec2) => vec2): Distort {
		const delta = 0.01

		return (p: vec2) => {
			const pt = fn(p)
			const deltaX = fn(vec2.add(p, [delta, 0]))
			const deltaY = fn(vec2.add(p, [0, delta]))

			const axisX = vec2.scale(vec2.sub(deltaX, pt), 1 / delta)
			const axisY = vec2.scale(vec2.sub(deltaY, pt), 1 / delta)

			return [...axisX, ...axisY, ...pt]
		}
	}
}
