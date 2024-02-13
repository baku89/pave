---
lang: en-US
title: Sandbox
sidebar: false
---

# Sandbox

<Sandbox />

The range of canvas is fixed to the size `[100, 100]`.

The variables shown below are also available:

```ts
import {Path, Arc, Bezier} from 'pave'
import {scalar, vec2, mat2d} from 'linearly'

// The 2D context of the canvas
context: CanvasRenderingContext2D

// Shorhands for drawing functions
stroke: (path: Path, color = accentCoor, width = 1) => void
fill: (path: Path, color: string) => void

// This is the debug function to inspect path commands
debug: (path: Path, color = accentColor) => void
```
