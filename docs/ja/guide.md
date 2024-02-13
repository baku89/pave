# ガイド

## インストール

```sh:no-line-numbers
npm i @baku89/pave
```

## 使い方

### インポート

ESモジュールをサポートしているため、import文を使って読み込むことが出来ます。`Path`や`CubicBeizer`などのシンボルは、型としても、あるいはその型に関連した関数から成るモジュール（名前空間）としても利用できます。

```ts:no-line-numbers
import {Path} from '@baku89/pave'

const rect: Path = Path.rect([0, 0], [10, 10])

Path.toSVGString(rect) // => 'M0,0 L10,0 L10,10 L0,10 Z'
```

### イミュータブルなデータ

気をつけてほしいのは、Paveは関数型プログラミング志向であり、全てのデータはプレーンかつイミュータブルであるということです。パスの長さやバウンディングボックスといったパスに付随する情報は、パスデータ自体のプロパティとしてアクセスする代わりに関数を用いて取得します。

```ts:no-line-numbers
const length = Path.length(rect)
const bounds = Path.bounds(rect)
const normal = Path.normalAtTime(rect, 0.5)
```

これらの関数は適切にキャッシュ（メモ化）するため、同じパスに対して何度も呼び出しても全ての計算が再実行されることはありません。しかし、パスデータに対して破壊的な変更を加えた後にこれらの関数を呼び出すと、正しい結果が得られないことがあります。

このため、パスデータを変更する際には、常に新しいパスデータを生成するユーティリティ関数（Canvas APIと同様の`moveTo`や`lineTo`など）を使うか:

```ts:no-line-numbers
let p = Path.moveTo(Path.empty, [10, 10])
p = Path.lineTo(p, [20, 20])
p = Path.cubicBezierTo(p, [80, 30], [0, 40], [50, 50])
p = Path.closePath(p)
```

あるいは、[immer](https://immerjs.github.io/immer/)のようなイミュータブルなデータ構造を操作するためのライブラリを使うことをお勧めします:

```ts:no-line-numbers
import {produce} from 'immer'

const pathA = Path.arc([50, 50], 40, 0, Math.PI)
const pathB = produce(pathA, draft => {
	draft.curves[0].closed = true
})
```

### 各種データとの相互変換

PaveはSVGのd属性やCanvas APIのPath2Dといった他のパスデータとの相互変換をサポートしています。

```ts:no-line-numbers
// 他のパス表現からPathへ
Path.fromSVGString('M10,50 C34,100 75,0 90,50')
Path.fromSVG(['M', [10, 50], 'L', [90, 50], 'Z'])

// Pathから他のパス表現へ
Path.toSVGString(line) // => 'M0,0 L100,100'
Path.toSVG(line) // => ['M', [0, 0], 'L', [100, 100]]
Path.toPath2D(line) // => an instance of Path2D

// 直接Canvas APIに描画
Path.drawToCanvas(line, canvasContext)
canvasContext.stroke()
```

## パスのデータ構造

Paveにおけるパスの表現は、SVGのd属性やCanvas APIのような、状態を持つキャンバスに対する描画コマンドの連続ではなく、常に頂点をベースとしています。つまり、`moveTo`（SVGにおける`M`コマンド）や `closePath` （SVGにおける `Z`）のような操作は存在せず、パスは常に**頂点の位置と最後の頂点からの補間コマンドの組**のリストで構成されます。

また、パスのデータ構造は以下のような階層を成しています。ちょうど3DCGデータにおいて、頂点の集まりからポリゴンが、ポリゴンの集まりからメッシュが形作られるのとも似ています。

<img class='diagram' src='../path_structure.svg' alt='パス構造の図解' />

- [**Path**](./api/interfaces/Path): 単一のCurve、もしくは複数のCurveから成る複合パスを表します。Paveにおける最も一般的な型です。
- [**Curve**](./api/interfaces/Curve): 単一のストロークを表現します。`closed`プロパティで、カーブが開いているか閉じているかを指定することができます。
- [**Vertex**](./api/#vertex): ストロークを構成する各頂点です。SVG等ではコマンドの末尾に終了点が含まれていますが、Vertexは終了点を`point`プロパティ、それ以外のパラメーターを`command`プロパティとして区別します。
- [**Command**](./api#command): 終了点を除く補間コマンドの引数。

TypeScriptに慣れている方は、型定義を見てもらう方が分かりやすいでしょう。

```ts:no-line-numbers
type Path = {paths: Curves[]; fillRule: 'nonzero' | 'evenodd'}
type Curve = {vertices: Vertex[]; closed: boolean}
type Vertex = {point: vec2; command: Command}
type Command =
	| ['L']
	| ['C', control1: vec2, control2: vec2]
	| ['A', radii: vec2, xRot: vec2, largeArc: boolean, sweep: boolean]
```

また、上記の階層とは別に、Curveのうち単一のコマンドに対応する部分を切り取った[Segment](./api/interfaces/Segment)という型も存在します。Vertexと異なり、開始点と終了点の両方の情報も含みます。

```ts:no-line-numbers
type Segment = {start: vec2; end: vec2; command: Command}
```
