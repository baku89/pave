---
home: true
heroImage: /logo.svg
heroHeight: 160
actionText: Get Started →
actions:
  - text: Get Started
    link: /guide
  - text: Sandbox
    link: /sandbox
    type: secondary
  - text: API
    link: /api/
    type: secondary
features:
  - title: Functional Programming
    details: All APIs are provided in a functional programming manner, making it easy to compose and transform paths.
  - title: Environment Agnostic
    details: Works with any JavaScript environment - Canvas API, SVG, p5.js, Paper.js, etc.
  - title: Powerful Features
    details: Create primitives, calculate positions/normals/tangents, offset paths, resample curves, and more.
---

<div class="badges">
	<p>
		<a href="https://www.npmjs.org/package/pave">
			<img src="https://img.shields.io/npm/v/pave.svg?style=flat-square" alt="npm version">
		</a>
		&nbsp;
		<a href="http://spdx.org/licenses/MIT">
			<img src="https://img.shields.io/npm/l/pave.svg?style=flat-square" alt="npm license">
		</a>
		&nbsp;
		<img src="https://github.com/baku89/pave/actions/workflows/ci.yml/badge.svg" alt="CI test result" />
	</p>
</div>

```js:pave
const path = Path.fromSVG([
	'M', [10, 50],
	'C', [34, 100], [75, 0], [90, 50],
])
stroke(path, 'plum')

const c = Path.circle([50, 50], 40)
stroke(c, 'PaleGreen', 1)

const r = Path.rectangle([10, 10], [50, 50])
stroke(r, 'PowderBlue')

const t = Path.regularPolygon([50, 50], 30, 5)
stroke(t, 'MediumSlateBlue')
```

Pave is a environment-agnostic toolkit specialized for manipulating SVG/Path2D curves, which includes creating primitives, calculating positions/normals/tangents, offsetting, and resampling paths. All of the API are provided in a functional programming manner, and the path data is represented as an immutable plain object.

To try out the library, visit the [Sandbox](./sandbox).

::: tip
All code blocks with viewer on the right are editable so you can try out the Pave library right here in the documentation.
:::

## API

See the full documentation on [API](./api/).

- [Path](./api/namespaces/Path): The core module for manipulating paths.
- Comamnds
  - [Arc](./api/namespaces/Arc): The arc (`A`) commands functions.
  - [CubicBezier](./api/namespaces/CubicBezier): The cubic Bezier (`C`) commands functions.
  - [Line](./api/namespaces/Line): The line-to (`L`) commands functions.
- Geometries
  - [Circle](./api/namespaces/Circle): The functions for handling circles.
  - [Rect](./api/namespaces/Rect): The functions for handling rects.
- [Distort](./api/namespaces/Distort): The functions for handling distortions.
- [Type Aliases](./api/#types)
