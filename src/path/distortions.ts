/**
 * Ready-made distortions built on {@link distort}. Each one is a smooth point map
 * `(p: vec2) => vec2` applied through `Path.distort`, so they share its options.
 */
import {mat2d, vec2} from 'linearly'

import {type Path} from '../index'
import {distort, type DistortOptions} from './modifiers'

/**
 * @category Options
 */
export interface WaveOptions extends DistortOptions {
	/**
	 * Shifts the wave along its direction, in degrees (`360` = one full cycle)
	 * @default 0
	 */
	phase?: number
	/**
	 * Rotates the wave direction in the plane, in degrees
	 * @default 0
	 */
	angle?: number
	/**
	 * Where the wave is measured from: the point it turns around by `angle`, and where its phase is `phase`. Moving this along with the path moves the wave with it.
	 * @default [0, 0]
	 */
	origin?: vec2
}

/**
 * @category Options
 */
export interface RadialDistortOptions extends DistortOptions {
	/**
	 * Falloff from the center: receives `1` at the center and `0` at the radius, returns the strength multiplier.
	 * @default t => t (linear)
	 */
	ramp?: (t: number) => number
}

/**
 * Pushes points side-to-side in a sine pattern: travel along one axis in the plane, offset along the perpendicular.
 * @param path The path to distort
 * @param amplitude How far points move perpendicular to the wave direction
 * @param wavelength Distance along the wave for one full cycle (non-zero)
 * @returns The newly created path
 * @category Modifiers
 *
 * @example
 * ```js:pave
 * const p = Path.line([10, 50], [90, 50])
 * stroke(p, 'skyblue')
 *
 * stroke(Path.wave(p, 6, 24), 'coral')
 * stroke(Path.wave(p, 6, 24, {phase: 180}), 'plum')
 * ```
 */
export function wave(
	path: Path,
	amplitude: number,
	wavelength: number,
	{
		phase = 0,
		angle = 0,
		origin = vec2.zero,
		...distortOptions
	}: WaveOptions = {}
): Path {
	const xform = mat2d.rotation(angle, origin)
	const invXform = mat2d.invert(xform) ?? mat2d.id

	return distort(
		path,
		p => {
			const local = vec2.transformMat2d(p, invXform)
			const theta =
				((local[0] - origin[0]) / wavelength + phase / 360) * 2 * Math.PI
			const warped = vec2.add(local, [0, Math.sin(theta) * amplitude])

			return vec2.transformMat2d(warped, xform)
		},
		distortOptions
	)
}

/**
 * Spins the plane around `center`: full rotation at the center, none past `radius`, blended in between.
 * Points outside the radius are left as-is.
 * @param path The path to distort
 * @param center Pivot of the rotation
 * @param radius Outside this distance from `center`, the distortion does nothing
 * @param angle Rotation at the center, in degrees (scaled by `ramp` toward the edge)
 * @returns The newly created path
 * @category Modifiers
 *
 * @example
 * ```js:pave
 * const p = Path.rectangle([20, 20], [80, 80])
 * stroke(p, 'skyblue')
 *
 * stroke(Path.twirl(p, [50, 50], 40, 180), 'coral')
 * ```
 */
export function twirl(
	path: Path,
	center: vec2,
	radius: number,
	angle: number,
	{ramp = t => t, ...distortOptions}: RadialDistortOptions = {}
): Path {
	return distort(
		path,
		p => {
			const t = 1 - vec2.distance(center, p) / radius

			if (t <= 0) return p

			return vec2.transformMat2d(p, mat2d.rotation(ramp(t) * angle, center))
		},
		distortOptions
	)
}

/**
 * Spherize-style radial stretch from `center`: strongest at the center, fading to none at `radius`.
 * Points beyond `radius` are unchanged.
 * @param path The path to distort
 * @param center Origin of the radial stretch
 * @param radius Outside this distance from `center`, the distortion does nothing
 * @param strength Scale added along each ray from `center` at full falloff (`0` = identity). Positive pushes outward, negative pinches inward.
 * @returns The newly created path
 * @category Modifiers
 *
 * @example
 * ```js:pave
 * const p = Path.rectangle([20, 20], [80, 80])
 * stroke(p, 'skyblue')
 *
 * stroke(Path.bulge(p, [50, 50], 50, 0.5), 'coral')
 * stroke(Path.bulge(p, [50, 50], 50, -0.5), 'plum')
 * ```
 */
export function bulge(
	path: Path,
	center: vec2,
	radius: number,
	strength: number,
	{ramp = t => t, ...distortOptions}: RadialDistortOptions = {}
): Path {
	return distort(
		path,
		p => {
			const d = vec2.distance(center, p)
			const t = 1 - d / radius

			if (t <= 0 || d < 1e-15) return p

			return vec2.lerp(center, p, 1 + strength * ramp(t))
		},
		distortOptions
	)
}
