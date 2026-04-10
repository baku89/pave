import {mat2d, vec2} from 'linearly'

/**
 * Factories for distortion callbacks `(p: vec2) => mat2d` used with {@link Path.distort}.
 * Each callback tells {@link Path.distort} where segment endpoints should land and how
 * nearby control handles should tilt so curves follow the warp instead of shearing oddly.
 *
 * @category Modules
 */
export namespace Distort {
	/**
	 * Turn "move each point here" into a callback {@link Path.distort} understands.
	 * Nearby samples (step `0.01`) infer how the warp stretches and turns locally so handles stay plausible. Very sharp or jumpy maps may look wrong.
	 *
	 * @param map - For any point, returns its image after your warp.
	 * @returns A distortion callback.
	 *
	 * @example
	 * ```js:pave
	 * const p = Path.line([10, 55], [90, 55])
	 * stroke(p, '#ccc')
	 *
	 * const warped = Path.distort(
	 *   p,
	 *   Distort.fromPointMap(q => vec2.add(q, [0, 8 * Math.sin(q[0] * 0.15)])),
	 *   {subdivide: 10}
	 * )
	 * stroke(warped, 'coral')
	 * ```
	 */
	export function fromPointMap(map: (p: vec2) => vec2): (p: vec2) => mat2d {
		const delta = 0.01

		return (p: vec2) => {
			const pt = map(p)
			const deltaX = map(vec2.add(p, [delta, 0]))
			const deltaY = map(vec2.add(p, [0, delta]))

			const axisX = vec2.scale(vec2.sub(deltaX, pt), 1 / delta)
			const axisY = vec2.scale(vec2.sub(deltaY, pt), 1 / delta)

			return [...axisX, ...axisY, ...pt]
		}
	}

	/**
	 * Push points side-to-side in a sine pattern: travel along one axis in the plane, offset along the perpendicular.
	 *
	 * @param amplitude - How far points move perpendicular to the wave direction.
	 * @param width - Distance along the wave for one full cycle (non-zero).
	 * @param phase - Shifts the wave along its direction, in degrees.
	 * @param angle - Rotates the wave direction in the plane, in degrees.
	 * @param origin - A reference point on the wave axis (with `angle`, fixes the frame).
	 *
	 * @example
	 * ```js:pave
	 * const p = Path.line([10, 50], [90, 50])
	 * stroke(p, 'skyblue')
	 *
	 * const wavy = Path.distort(p, Distort.wave(6, 24, 0, 0), {subdivide: 10})
	 * stroke(wavy, 'coral')
	 * ```
	 */
	export function wave(
		amplitude: number,
		width: number,
		phase = 0,
		angle = 0,
		origin = vec2.zero
	): (p: vec2) => mat2d {
		const xform = mat2d.rotation(angle, origin)
		const invXform = mat2d.invert(xform) ?? mat2d.id

		return fromPointMap((p: vec2) => {
			const pLocal = vec2.transformMat2d(p, invXform)

			const theta = (pLocal[0] / width + phase / 360) * 2 * Math.PI

			const yOffset = Math.sin(theta) * amplitude

			const pDistortedLocal = vec2.add(pLocal, [0, yOffset])
			const pDistorted = vec2.transformMat2d(pDistortedLocal, xform)

			return pDistorted
		})
	}

	/**
	 * Spin the plane around `center`: full effect at the center, none past `radius`, blended in between.
	 * Points outside the radius are left as-is.
	 *
	 * @param center - Pivot for the rotation.
	 * @param radius - Outside this distance from `center`, the warp does nothing.
	 * @param angle - Largest rotation at the center, in degrees (scaled by `ramp` toward the edge).
	 * @param ramp - Optional curve on the falloff from center (`1` at center, `0` at `radius`); default is straight-line falloff.
	 *
	 * @example
	 * ```js:pave
	 * const p = Path.rectangle([20, 20], [80, 80])
	 * stroke(p, 'skyblue')
	 *
	 * const twirled = Path.distort(p, Distort.twirl([50, 50], 40, 180), {subdivide: 6})
	 * stroke(twirled, 'coral')
	 * ```
	 */
	export function twirl(
		center: vec2,
		radius: number,
		angle: number,
		ramp: (t: number) => number = t => t
	): (p: vec2) => mat2d {
		return fromPointMap((p: vec2) => {
			const dist = vec2.distance(center, p)

			if (dist > radius) {
				return p
			}

			const theta = ramp(1 - dist / radius) * angle
			const xform = mat2d.rotation(theta, center)

			return vec2.transformMat2d(p, xform)
		})
	}

	/**
	 * Spherize-style radial stretch from `center`: strongest at the center, fading to none at `radius`.
	 * Points beyond `radius` are unchanged.
	 *
	 * @param center - Origin of the radial warp.
	 * @param radius - Outside this distance from `center`, the warp does nothing.
	 * @param strength - Scale added along each ray from `center` at full falloff (`0` = identity). Positive pushes outward, negative pinches inward.
	 * @param ramp - Falloff from center (`1` at center, `0` at `radius`); default is linear.
	 *
	 * @example
	 * ```js:pave
	 * const p = Path.rectangle([20, 20], [80, 80])
	 * stroke(p, 'skyblue')
	 *
	 * const bulged = Path.distort(p, Distort.bulge([50, 50], 50, 0.5))
	 * stroke(bulged, 'coral')
	 * ```
	 */
	export function bulge(
		center: vec2,
		radius: number,
		strength: number,
		ramp: (t: number) => number = t => t
	): (p: vec2) => mat2d {
		return fromPointMap((p: vec2) => {
			const d = vec2.distance(center, p)

			if (d > radius || d < 1e-15) {
				return p
			}

			const t = ramp(1 - d / radius)
			const scale = 1 + strength * t
			const v = vec2.sub(p, center)

			return vec2.add(center, vec2.scale(v, scale))
		})
	}
}
