<div align="center">
<h1>Pave</h1>

<a href="https://baku89.github.io/pave/">Demo</a> ⌇ <a href="https://baku89.com/pave/">API</a> ⌇ <a href="https://github.com/sponsors/baku89">Become a Sponsor</a>

<p>
  <a href="https://www.npmjs.org/package/pave">
    <img src="https://img.shields.io/npm/v/pave.svg?style=flat-square" alt="npm version">
  </a>
  <a href="http://spdx.org/licenses/MIT">
    <img src="https://img.shields.io/npm/l/pave.svg?style=flat-square" alt="npm license">
  </a>
  <img src="https://github.com/baku89/pave/actions/workflows/ci.yml/badge.svg" alt="CI test result" />
</p>

</div>

Pave is a low-level toolkit for manipulating SVG/Path2D paths, which includes creating primitives, calculating positions/normals/tangents, offsetting, and resampling paths. All functions are provided in a functional programming manner, and the path data is represented as a plain object with immutability.

Currently, the library heavily depends on [Bazier.js](https://pomax.github.io/bezierjs) by [Pomax](https://github.com/Pomax) and [Paper.js](http://paperjs.org) by [Jürg Lehni
](https://github.com/lehni) -- or it might be said that this library is a thin wrapper for them to provide FP-oriented interfaces. Although I'm going to rewrite the whole library with zero dependencies for performance and file size, please consider sponsoring them if you think it'd be useful.

## Development

```
git clone https://github.com/baku89/pave
cd pave
yarn install
yarn test --watch
```

## License

This repository is published under an MIT License. See the included [LICENSE file](./LICENSE).
