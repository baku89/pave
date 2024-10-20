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

	/**
	 * Add a sine wave distortion to the given point.
	 * @param amplitude The amplitude of the wave.
	 * @param width The wavelength of the wave.
	 * @param phase The phase of the wave in degrees.
	 * @param angle The angle of the wave in degrees.
	 * @param origin The origin of the wave.
	 * @returns The wave distortion function.
	 */
	export function wave(
		amplitude: number,
		width: number,
		phase = 0,
		angle = 0,
		origin = vec2.zero
	): Distort {
		const xform = mat2d.rotation(angle, origin)
		const invXform = mat2d.invert(xform) ?? mat2d.id

		return fromPointTransformer((p: vec2) => {
			const pLocal = vec2.transformMat2d(p, invXform)

			const theta = (pLocal[0] / width + phase / 360) * 2 * Math.PI

			const yOffset = Math.sin(theta) * amplitude

			const pDistortedLocal = vec2.add(pLocal, [0, yOffset])
			const pDistorted = vec2.transformMat2d(pDistortedLocal, xform)

			return pDistorted
		})
	}
}
