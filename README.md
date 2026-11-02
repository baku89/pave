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

Pave is an environment-agnostic toolkit for manipulating SVG/Path2D paths: primitives, positions/normals/tangents, offsetting and stroking, boolean operations, curve fitting and simplification, node-tool style editing of anchors and handles, dashes, convex hulls, raycasts and shadows, and layout helpers such as align, blend and repeat-along. Every function is pure and the path data is an immutable plain object, so it works the same in the browser, in Node and in any renderer.

Offsetting, stroking and boolean operations are implemented natively, and circular arcs (`A` commands) are preserved through them.

## Development

```sh
git clone https://github.com/baku89/pave
cd pave
yarn install
yarn test --watch
```

## License

This repository is published under an MIT License. See the included [LICENSE file](./LICENSE).
