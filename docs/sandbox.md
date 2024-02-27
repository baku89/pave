---
lang: en-US
title: Sandbox
sidebar: false
pageClass: sandbox
---

# Sandbox

<Sandbox />

The range of canvas is fixed to the size `[100, 100]`.

The variables shown below are also available:

```ts
import * from '@baku89/pave/Path'
import * from 'linearly/scalar'

import * from '@baku89/pave'
import * from 'linearly'

// The 2D context of the canvas
context: CanvasRenderingContext2D

// Current time ranging from 0 to 1
time: number

// Shorhands for drawing functions
stroke: (path: Path, color = accentCoor, width = 1) => void
fill: (path: Path, color = accentColor) => void
dot: (point: vec2, color = accentColor, size = 3) => void

// This is the debug function to inspect path commands
debug: (path: Path, color = accentColor) => void
```
