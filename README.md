<div align="center">

<img src="https://github.com/baku89/pave/blob/main/docs/.vuepress/public/logo.svg" width="200" />
<h1>Pave</h1>

<a href="https://baku89.github.io/pave/">Documentation</a> ⌇ <a href="https://github.com/sponsors/baku89">Become a Sponsor</a>

<p>
  <a href="https://www.npmjs.org/package/@baku89/pave">
    <img src="https://img.shields.io/npm/v/@baku89/pave.svg?style=flat" alt="npm version">
  </a>
  <a href="http://spdx.org/licenses/MIT">
    <img src="https://img.shields.io/npm/l/@baku89/pave.svg?style=flat" alt="npm license">
  </a>
  <img src="https://github.com/baku89/pave/actions/workflows/ci.yml/badge.svg" alt="CI test result" />
</p>

</div>

Pave is an environment-agnostic toolkit specialized for manipulating SVG/Path2D curves, which includes creating primitives, calculating positions/normals/tangents, offsetting, and resampling paths. All of the API are provided in a functional programming manner, and the path data is represented as an immutable plain object.

Currently, the library heavily depends on [Bazier.js](https://pomax.github.io/bezierjs) by [Pomax](https://github.com/Pomax) and [Paper.js](http://paperjs.org) by [Jürg Lehni](https://github.com/lehni) -- or it might be said that this library is a thin wrapper for them to provide FP-oriented interfaces. Although I'm going to rewrite the whole library with zero dependencies for performance and file size, please consider sponsoring them if you think it'd be useful.

## Development

```sh
git clone https://github.com/baku89/pave
cd pave
yarn install
yarn test --watch
```

## License

This repository is published under an MIT License. See the included [LICENSE file](./LICENSE).
