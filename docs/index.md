---
home: true
tagline: A library for manipulating SVG/Path2D curves.
---

# Pathed

Pathed is a low-level toolkit for manipulating SVG/Path2D paths, which includes creating primitives, calculating positions/normals/tangents, offsetting, and resampling paths. All functions are provided in a functional programming manner, and the path data is represented as a plain object with immutability.

Currently, the library heavily depends on [Bazier.js](https://pomax.github.io/bezierjs) by [Pomax](https://github.com/Pomax) and [Paper.js](http://paperjs.org) by [Jürg Lehni
](https://github.com/lehni) -- or it might be said that this library is a thin wrapper for them to provide FP-oriented interfaces. Although I'm going to rewrite the whole library with zero dependencies for performance and file size, please consider sponsoring them if you think it'd be useful.

## API

See the full documentation on [API](./api/modules.md)

## Getting Started

### Installation

```sh:no-line-numbers
yarn add pathed
```

```js:no-line-numbers
import {Path} from 'pathed'

console.log(Path.circle([0, 0], 100))
```

### Example

::: tip
All code blocks in this documentation are editable and you can try out with Pathed.
:::

@[code js:pathed](./examples/primitives.js)
