---
home: true
tagline: A library for manipulating SVG/Path2D curves.
---

Pathed is a low-level toolkit for manipulating SVG/Path2D paths, which includes creating primitives, calculating positions/normals/tangents, offsetting, and resampling paths. All functions are provided in a functional programming manner, and the path data is represented as a plain object with immutability.

Currently, the library heavily depends on [Bazier.js](https://pomax.github.io/bezierjs) by [Pomax](https://github.com/Pomax) and [Paper.js](http://paperjs.org) by [Jürg Lehni
](https://github.com/lehni) -- or it might be said that this library is a thin wrapper for them to provide FP-oriented interfaces. Although I'm going to rewrite the whole library with zero dependencies for performance and file size, please consider sponsoring them if you think it'd be useful.

## API

See the full documentation on [API](./api)

- [Path](./api/modules/Path): The basic module for manipulating paths.
- [Bezier](./api/modules/Bezier): The cubic bezier functions which wraps Bezier.js.
- [BBox](./api/modules/BBox): The functions for handling bounding boxes.
- [Type Aliases](./api#type-aliases)

## Getting Started

### Installation

```sh:no-line-numbers
yarn add pathed
```

```js:no-line-numbers
import {Path} from 'pathed'

const circle = Path.circle([0, 0], 100)

// For SVG's path element
const d = Path.toSVG(circle)
svgPathElement.setAttribute('d', d)

// For Canvas API
const path2d = Path.toPath2D(circle)
context.stroke(path2d)
```

### Example

::: tip
All code blocks in this documentation are editable and you can try out with Pathed.
:::

@[code js:pathed](./examples/primitives.js)
