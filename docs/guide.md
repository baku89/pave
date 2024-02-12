# Guide

## Installation

```
npm i @baku89/pave
```

## Basic usage

### Import

As it supports ES modules, you can load it using the import statement. Symbols such as `Path` or `CubicBezier` can be used both as types and as modules (namespaces) consisting of functions related to those types.

```ts
import {Path} from '@baku89/pave'

const rect: Path = Path.rect([0, 0], [100, 100])

console.log(rect)
```

### Immutability

What you need to be aware of is that Pave is functional programming-oriented and all data is plain and immutable. Information associated with a path, such as the length of the path or its bounding box, is obtained using functions instead of accessing it as a property of the path data itself.

```ts
const length = Path.length(rect)
const bounds = Path.bounds(rect)
const normal = Path.normalAtTime(rect, 0.5)
```

These functions are appropriately memoized, so even if called multiple times for the same path, not all calculations are re-executed. However, if you make destructive changes to the path data and then call these functions, you may not get the correct results.

Therefore, when modifying path data, it is recommended to use utility functions that generate new path data (such as `moveTo` or `lineTo` similar to the Canvas API):

```ts
let p = Path.moveTo(Path.empty, [10, 10])
p = Path.lineTo(p, [20, 20])
p = Path.cubicBezierTo(p, [80, 30], [0, 40], [50, 50])
p = Path.closePath(p)
```

Or use a library for manipulating immutable data structures such as [immer](https://immerjs.github.io/immer/):

```ts
import {produce} from 'immer'

const pathA = Path.arc([50, 50], 40, 0, Math.PI)
const pathB = produce(pathA, draft => {
	draft.curves[0].closed = true
})
```

## Path Data Structure

In Pave, the representation of paths is not a sequence of drawing commands against a stateful context like the SVG 'd' attribute or Canvas API, but always based on vertices. This means there are no operations like `moveTo` (the `M` command in SVG) or closePath (the `Z` in SVG); paths are always composed of a list of **tuples of vertex positions and interpolation commands from the last vertex**.

Also, the path data structure has the following hierarchy, similar to how in 3D data, meshes consist of collections of polygons, and polygons are formed from collections of vertices.

![Path Data Structure](./path_structure.svg)

- [**Path**](./api/interfaces/Path): A single Curve or a compound path composed of multiple Curves. It is the most common type to represent shapes in Pave.
- [**Curve**](./api/interfaces/Curve): Represents a single stroke. It also contains a `closed` property to specify whether the curve is open or closed.
- [**Vertex**](./api/#vertex): Each vertex that makes up the stroke. Unlike in SVG, where the end point is included at the end of the command, Vertex stores the end point in the `point` property, and rest arguments in the `command` property separately.
- [**Command**](./api#command): Arguments of interpolation commands excluding the end point.

If you are familiar with TypeScript, it might be easier to understand by looking at the type definitions.

```ts
type Path = {paths: Curves[]; fillRule: 'nonzero' | 'evenodd'}
type Curve = {vertices: Vertex[]; closed: boolean}
type Vertex = {point: vec2; command: Command}
type Command =
	| ['L']
	| ['C', control1: vec2, control2: vec2]
	| ['A', radii: vec2, xRot: vec2, largeArc: boolean, sweep: boolean]
```

In addition to the above hierarchy, there is also a type called **[Segment](./api/interfaces/Segment)**, which is a cut-out part of a Curve corresponding to a single command. Unlike Vertex, it includes information on both the starting and ending points.

```ts
type Segment = {start: vec2; end: vec2; command: Command}
```
