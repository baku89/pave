<div align="center">
<h1>Pathed</h1>

<a href="https://baku89.github.io/pathed/">Demo</a> ⌇ <a href="https://baku89.github.io/pathed/docs/">API</a> ⌇ <a href="https://github.com/sponsors/baku89">Become a Sponsor</a>

<p>
  <a href="https://www.npmjs.org/package/pathed">
    <img src="https://img.shields.io/npm/v/pathed.svg?style=flat-square" alt="npm version">
  </a>
  <a href="http://spdx.org/licenses/MIT">
    <img src="https://img.shields.io/npm/l/pathed.svg?style=flat-square" alt="npm license">
  </a>
  <img src="https://github.com/baku89/pathed/actions/workflows/ci.yml/badge.svg" alt="CI test result" />
</p>

</div>

Pathed is a low-level toolkit for manipulating SVG/Path2D paths, which includes creating primitives, calculating positions/normals/tangents, offsetting, and resampling paths. All functions are provided in a functional programming manner, and the path data is represented as a plain object with immutability.

Currently, the library heavily depends on [Bazier.js](https://pomax.github.io/bezierjs) by [@Pomax](https://github.com/Pomax) and [Paper.js](http://paperjs.org) by [Jürg Lehni
](https://github.com/lehni) -- or it might be said that this library is a thin wrapper for them to provide FP-oriented interfaces. Although I'm going to rewrite the whole library with zero dependencies for performance and file size, please consider sponsoring them if you think it'd be useful.

```ts
import {Path} from 'pathed'
import {mat2d} from 'linearly'

const path: Path = [
	['M', [0, 0]],
	['C', [0, 100], [100, 100], [100, 0]],
	['L', [100, 100]],
	['L', [0, 100]],
	['Z'],
]

// All property functions for paths will be memoized. Thus, the path is immutable.
Path.length(path)
Path.bound(path)
Path.area(path)
Path.tangentAtT(path, 0.5)

// Creating paths by primitive functions
const circle = Path.circle([100, 100], 50)
const rect = Path.rectangle([0, 0], [100, 100])

// Manipulating and combining paths
const transformedCircle = Path.transform(circle, mat2d.fromScaling([1, 0.5]))
const offsetRect = Path.offset(rect, 100, {joinCap: 'square'})
Path.join(path, offsetRect)

// As the path data is immutable, you cannot modify the content of paths (Not using Object.freeze, but it'll be warned in TypeScript). Use the mutation functions shown below instead.
const path2 = Path.moveTo(path, [0, 200])
const path3 = Path.lineTo(path2, [100, 200])

path.setAttribute('d', Path.toSVG(path3)) // "M 0,0 C 0,100, 100,100..."
ctx.stroke(Path.toPath2D(path3))
```

## Development

```
git clone https://github.com/baku89/pathed
cd pathed
yarn install
yarn test --watch
```

## License

This repository is published under an MIT License. See the included [LICENSE file](./LICENSE).
