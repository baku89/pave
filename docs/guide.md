# Guide

## Installation

```sh
npm i @baku89/pave
```

## Basic usage

### Simple Example

As it supports ES modules, you can load it using the import statement. Symbols such as `Path` or `CubicBezier` can be used both as types and as modules (namespaces) consisting of functions related to those types.

```ts
import {Path} from '@baku89/pave'

const circle = Path.circle([0, 0], 100)

// For SVG's path element
const d = Path.toSVG(circle)
svgPathElement.setAttribute('d', d)

// For Canvas API
const path2d = Path.toPath2D(circle)
context.stroke(path2d)
```

### Immutability

Pave is functional programming-oriented library and all data is plain and immutable. Information associated with a path, such as the length of the path or its bounding box, is obtained using functions instead of accessing it as a property of the path data itself.

```ts
const length = Path.length(rect)
const bounds = Path.bounds(rect)
const normal = Path.normalAtTime(rect, 0.5)
```

These functions are appropriately memoized, so even if called multiple times for the same path, not all calculations are re-executed. However, if you make destructive changes to the path data and then call these functions, you may not get the correct results.

Therefore, when you want to perform procedural operations such as modifying path data or adding new vertices to the path, you will take one of the following three methods:

1. Use utility functions that always generate new path data (such as [`Path.moveTo`](./api/modules/Path.html#moveto) and [`Path.lineTo`](./api/modules/Path.html#lineto) similar to the Canvas API)
2. Use [Path.pen](./api/modules/Path.html#pen) to draw path data in order of vertices
3. Use a library for manipulating immutable data structures such as [immer](https://immerjs.github.io/immer/)

```ts
// 1. Use utility functions
let p = Path.moveTo(Path.empty, [10, 10])
p = Path.lineTo(p, [20, 20])
p = Path.cubicBezierTo(p, [80, 30], [0, 40], [50, 50])
p = Path.closePath(p)

// 2. Use Path.pen()
const p = Path.pen()
	.moveTo([10, 10])
	.lineTo([20, 20])
	.cubicBezierTo([80, 30], [0, 40], [50, 50])
	.close()
	.get()

// 3. Example using immer
import {produce} from 'immer'

const pathA = Path.arc([50, 50], 40, 0, 90)
const pathB = produce(pathA, draft => {
	draft.curves[0].closed = true
})
```

Or use a library for manipulating immutable data structures such as [immer](https://immerjs.github.io/immer/):

```ts
import {produce} from 'immer'

const pathA = Path.arc([50, 50], 40, 0, 180)
const pathB = produce(pathA, draft => {
	draft.curves[0].closed = true
})
```

### Vector and Transform

In Pave, vectors and matrices are represented as plain 1D arrays of numbers. For example, a position is `[x, y]`, and a 2D affine transformation is `[a, b, c, d, tx, ty]`. These data can be manipulated using libraries such as [Linearly](https://baku89.github.io/linearly) or [gl-matrix](https://glmatrix.net/), but the latter allows mutable value changes, so it is recommended to use Linearly, which is designed to work with immutable data like Pave.

### Angle

In Pave, **angles are represented in degrees**. JavaScript's standard `Math` and `Canvas2DRenderingContext` use radians, so if you need to use those functions, convert them to radians by using utilities like Linearly's `rad` function. Note that angles in Linearly are also represented in degrees, so calculations in degrees are possible, such as `scalar.cos(90) === 0`.

```ts
import {vec2, mat2d} from 'linearly'

const c = Path.ellipse(vec2.zero, vec2.of(20, 30))
const t = Path.transform(c, mat2d.fromTranslation([50, 50]))
```

## Path Data Structure

In Pave, the representation of paths is not a sequence of drawing commands against a stateful context like the SVG 'd' attribute or Canvas API, but always based on vertices. This means there are no operations like `moveTo` (the `M` command in SVG) or closePath (the `Z` in SVG); paths are always composed of a list of **tuples of vertex positions and interpolation commands from the last vertex**.

Also, the path data structure has the following hierarchy, similar to how in 3D data, meshes consist of collections of polygons, and polygons are formed from collections of vertices.

<img class='diagram' src='./path_structure.svg' alt='Path Structure' />

- [**Path**](./api/interfaces/Path): A single Curve or a compound path composed of multiple Curves. It is the most common type to represent shapes in Pave.
- [**Curve**](./api/interfaces/Curve): Represents a open or closed single stroke.
- [**Vertex**](./api/#vertex): Each vertex that makes up the stroke, which consists of end point, command type, and argments for the interpolation.
- [**Command**](./api#command): Arguments of interpolation commands excluding the end point.

If you are familiar with TypeScript, it might be easier to understand by looking at the type definitions.

```ts
type Path = {paths: Curves[]; fillRule: 'nonzero' | 'evenodd'}
type Curve = {vertices: Vertex[]; closed: boolean}

type Vertex = VertexL | VertexC | VertexA
type VertexL = {point: vec2; command: 'L'}
type VertexC = {
	point: vec2
	command: 'C'
	args: [control1: vec2, control2: vec2]
}
type VertexA = {
	point: vec2
	command: 'A'
	args: [radii: vec2, xRot: vec2, largeArc: boolean, sweep: boolean]
}
```

In addition to the above hierarchy, there is also a type called **[Segment](./api/interfaces/Segment)**, which is a cut-out part of a Curve corresponding to a single command. Unlike Vertex, it includes the start position of interpolation.

```ts
type Segment = Vertex & {start: vec2}
```
