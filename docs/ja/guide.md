# ガイド

## インストール

```sh
npm i @baku89/pave
```

## 使い方

### 簡単な例

ESモジュールをサポートしているため、import文を使って読み込むことが出来ます。`Path`や`CubicBeizer`などのシンボルは、型としても、あるいはその型に関連した関数から成るモジュール（名前空間）としても利用できます。

```ts
import {Path} from '@baku89/pave'

const rect: Path = Path.rect([0, 0], [10, 10])

Path.toSVGString(rect) // => 'M0,0 L10,0 L10,10 L0,10 Z'
```

### イミュータブルなデータ

Paveは関数型プログラミング志向のライブラリであり、全てのデータはプレーンかつイミュータブルです。パスの長さやバウンディングボックスといったパスに付随する情報は、パスデータ自体のプロパティとしてアクセスするのではなく、以下のように関数を用いて取得します。

```ts
const length = Path.length(rect)
const bounds = Path.bounds(rect)
const normal = Path.normalAtTime(rect, 0.5)
```

これらの戻り値は適切にキャッシュ（メモ化）するため、同じパスに対して何度も呼び出しても全ての計算が再実行されることはありません。しかし、パスデータに対して破壊的な変更を加えた後にこれらの関数を呼び出すと、正しい結果が得られないことがあります。

このため、パスデータを変更したり、パスに新しい頂点を付け足すというような、手続き的な処理を行いたい場合、以下の3つの方法のいずれかをとることになります。

1. 常に新しいパスデータを生成するユーティリティ関数（Canvas APIと同様の[`Path.moveTo`](../api/modules/Path.html#moveto)や[`Path.lineTo`](../api/modules/Path.html#lineto)など）を使う
2. [Path.pen](../api/modules/Path.html#pen)を使って、パスデータを生成する
3. [immer](https://immerjs.github.io/immer/)のようなイミュータブルなデータ構造を操作するためのライブラリを使う

```ts
// 1. ユーティリティ関数を使う
let p = Path.moveTo(Path.empty, [10, 10])
p = Path.lineTo(p, [20, 20])
p = Path.cubicBezierTo(p, [80, 30], [0, 40], [50, 50])
p = Path.closePath(p)

// 2. Path.penを使う
const p = Path.pen()
	.moveTo([10, 10])
	.lineTo([20, 20])
	.cubicBezierTo([80, 30], [0, 40], [50, 50])
	.close()
	.get()

// 3. immerを使った例
import {produce} from 'immer'

const pathA = Path.arc([50, 50], 40, 0, 90)
const pathB = produce(pathA, draft => {
	draft.curves[0].closed = true
})
```

### ベクトル、トランスフォーム

ベクトルや行列は、1次元の配列として表現されています。例えば、位置は`[x, y]`、2次元のアフィン変換は`[a, b, c, d, tx, ty]`といったようにです。これらのデータの操作は、[Linearly](https://baku89.github.io/linearly)や[gl-matrix](https://glmatrix.net/) などのライブラリを用いて操作することが出来ますが、後者はミュータブルな値の変更を許容するため、Paveと同様にイミュータブルなデータを前提として設計されたLinearlyとの併用をおすすめします。

```ts
import {vec2, mat2d} from 'linearly'

const c = Path.ellipse(vec2.zero, vec2.of(20, 30))
const t = Path.transform(c, mat2d.fromTranslation([50, 50]))
```

### 角度

Paveでは、**角度は度数法で表現されます**。JavaScriptの標準の`Math`や`Canvas2DRenderingContext`などではラジアン法が用いられているため、ラジアン法との変換が必要な場合、Linearlyの`rad`関数などを用いて変換してください。なお、Linearlyにおける角度も度数法で表現されるため、`scalar.cos(90) === 0`のように度数法での計算が可能です。

### 各種データとの相互変換

SVGのd属性やCanvas APIのPath2Dといった他のパスデータとの相互変換もサポートされています。

```ts
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

### パスの階層構造

Paveにおけるパスの表現は、SVGのd属性やCanvas APIのような、状態を持つキャンバスに対する描画コマンドの連続ではなく、常に頂点をベースとしています。つまり、`moveTo`（SVGにおける`M`コマンド）や `closePath` （SVGにおける `Z`）のような操作は存在せず、パスは常に**頂点の位置と最後の頂点からの補間コマンドの組**のリストで構成されます。

また、パスのデータ構造は以下のような階層を成しています。ちょうど3DCGデータにおいて、頂点の集まりからポリゴンが、ポリゴンの集まりからメッシュが形作られるのとも似ています。

<img class='diagram' src='../path_structure.svg' alt='パス構造の図解' />

- [**Path**](./api/interfaces/Path): 単一のCurve、もしくは複数のCurveから成る複合パスを表します。Paveにおける最も一般的な型です。
- [**Curve**](./api/interfaces/Curve): 単一の開いた、または閉じたストロークを表現します。
- [**Vertex**](./api/#vertex): ストロークを構成する各頂点です。終了点とコマンドの種類、残りのコマンド引数からなります。
- [**Command**](./api#command): 終了点を除く補間コマンドの引数です。

::: tip
各Curveの最初の頂点の補間コマンドは、閉じている合は最後の頂点から最初の頂点への補間コマンドとして、開いたカーブの場合単に無視されます。
:::

TypeScriptに慣れている方は、型定義を見てもらう方が分かりやすいでしょう。

```ts
type Path = {paths: Curves[]; fillRule: 'nonzero' | 'evenodd'}
type Curve = {vertices: Vertex[]; closed: boolean}

type Vertex = VertexL | VertexC | VertexA
type VertexL = {point: vec2; command: 'L'}
type VertexC = {
	point: vec2
	command: 'C'
	args: [control1: vec2, control2: vec2]
}
type VertexA = {
	point: vec2
	command: 'A'
	args: [radii: vec2, xRot: vec2, largeArc: boolean, sweep: boolean]
}
```

::: tip
Paveは`L`（直線）、`C`（3次ベジェ曲線）、`A`（楕円弧）の3つの補間コマンドのみを内部表現として用います。SVGの`Q`（2次ベジェ曲線）などその他のコマンドは、これらの3つのいずれかに正確に変換されます。
:::

::: tip
`C`コマンドの制御点は、開始点・終了点からの相対的な位置ではなく、絶対位置で表されます。
:::

### セグメント

また、上記の階層とは別に、Curveのうち単一のコマンドに対応する部分を切り取った[Segment](./api/interfaces/Segment)という型も存在します。Vertexに加えて、開始点の情報を含みます。

```ts
type Segment = Vertex & {start: vec2}
```

### パス上の位置表現

セグメント上の特定の位置を表すために、次の3つの表現を用いることができます。

- **Unit**: セグメント上の開始点と終了点に対する相対的な位置。Paveにおけるデフォルト表現です。`[0, 1]`の範囲をとります。
- **Offset**: 開始点からの距離による表現。`0`は開始点、セグメントの長さが終了点に対応します。
- **Time**: セグメントに用いられる数理曲線の媒介変数による表現。`[0, 1]`の範囲をとります。残りの2つの位置表現と異なり、timeは3次ベジェ補間や楕円弧において、セグメント上で等間隔に分布しない場合があることに注意してください。

```ts
type UnitSegmentLocation = number | {unit: number}
type OffsetSegmentLocation = {offset: number}
type TimeSegmentLocation = {time: number}

type SegmentLocation =
	| UnitSegmentLocation
	| OffsetSegmentLocation
	| TimeSegmentLocation
```

CurveやPathなど、複数のセグメントからなる曲線上の位置を表すには、上記の表現に加えて、頂点やカーブのインデックスを指定することが出来ます。もし指定されない場合、unitにおいては全体の曲線長に対する`[0, 1]`の範囲をとる相対的な位置として、timeにおいては、`[0, 1]`をセグメントの個数で等分した媒介変数の値として扱われます。（2つのセグメントからなるパスを例に挙げると、`{time: 0.25}`は1番目のセグメントにおける`{time: 0.5}`に対応します）

```ts
type UnitPathLocation =
	| number
	| {
			unit: number
			vertexIndex?: number
			curveIndex?: number
	  }

type OffsetPathLocation = {
	offset: number
	vertexIndex?: number
	curveIndex?: number
}

type TimePathLocation = {
	time: number
	vertexIndex?: number
	curveIndex?: number
}

type PathLocation = UnitPathLocation | OffsetPathLocation | TimePathLocation
```

:::tip
範囲外の値を指定した場合、自動的にクランプされます。ただし、位置が`-最大値 <= x  < 0`の範囲で負の値を取る場合、該当するカーブの終点を基準にその絶対値だけオフセットした位置について取得されます。これは[`Array.at()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/at)の挙動とも似ています。
:::

また、位置表現があるセグメントの終点とも後続のセグメントの始点とも解釈されるような場合は、セグメントの始点の方が優先されます。例えば、2つの分離した直線から成るパスにおいて、`{time: 0.5}`は1番目の直線の終点と2番目の直線の始点の両方を指す可能性がありますが、このルールにより2番目の直線の始点が優先されます。もし1番目の直線の終点を指したい場合は、`{time: 1, curveIndex: 0}`のように明示する必要があります。

## 設計思想

Paveの特色は、描画コマンドを逐次的に実行することでパスを描画するのではなく、静的なデータとしてのパスに対して操作をフィルターのように適用していく設計にあります。また、SVGやCanvas API、p5.js、Paper.jsなど外部のグラフィック描画環境においてパス操作に関するユーティリティとして使用されることを想定しているため、ステージマネージャーや描画機能は無く、またパスがベクターグラフィックなのか、レーザーカット用の輪郭データを表すのか、色空間がRRGなのかCMYKなのかといった解釈についても関知しません。

ここで一度、グラフィックライブラリの設計における大きな3つのアプローチを挙げてみます。

- **描画コマンド型**: Canvas API、PostScript、Design By Numbers、Processing、openFrameworks
- **ステージツリー型**: Flash (ActionScript)、THREE.js、Paper.js, Pixi.js
- **関数型**: Virtual DOM、Houdini/TouchDesigner、Cavalry、**Pave**

クリエイティブ・コーディングにおいては描画コマンド型のアプローチが一般的です。「何かを描く手順」をコードとして記述するという点で、プログラミングによるお絵かきとして直感的でもあります。しかしこのアプローチは、すでに表示されているグラフィックに対してインタラクションや変更を行う際に、`upate()`関数などにおいて一から全てを再描画する必要があるため、インタラクティブコンテンツやGUIの構築にはあまり適していません。

ステージツリー型は、画面に表示されているオブジェクトをツリー構造として管理し、多くの場合イベント・ドリブン型のAPIを提供します。ゲームやWeb開発などでは最もポピュラーなアプローチです。しかし、グラフィック操作とオブジェクト管理、そして描画機能が密結合しており、その環境以外での再利用が難しいこと、またオブジェクトに対して子要素の追加や削除といった命令的な操作を中心とするため、オブジェクト志向型ではあるものの、描画コマンド型と同様に逐次的に実行される手続きを意識する必要があります。

関数型は、データとしてのグラフィックに対して、フィルターとしての関数を繰り返し適用したり合成し、最終的に必要なグラフィックを得るというアプローチです。3DCGやCADにおけるプロシージャル・モデリング（例: Houdini、TouchDesigner、Fusion 360）や、ノードベースのコンポジットツール（Nuke、Fusion）、あるいはReactなどのUIライブラリにおけるコンポーネントのレンダリングは、この考え方に近いといえます。命令的な操作を中心としたプログラムは、デザイナーの手に変わってプログラムが何かを描くための指示書のように感じられ、デザインツールにおけるキャンバス上に配置されたオブジェクトを直接編集するユーザー体験からは程遠いところがあります。一方、関数型的に書かれたコードは、「そのグラフィックがどのような構造をしているか」を宣言的に記述することができるため、デザイナーにとってはより直感的であり、日々のデザインの延長として漸次的にプログラミング性を取り入れることに繋がります。また、関数型の利点として、コードの再利用性が高く、また、コードのテストやデバッグが容易であることも、関数型のアプローチの利点として挙げられます。

以下はPaveのコードの例ですが、SVGのようなある種のマークアップ言語のように読み下すことができます。

```ts
Path.transform(
	Path.trim(
		Path.circle([50, 50], 30), // 円
		0.1,
		-0.1
	), // 前後10%を切りとる
	mat2d.rotation(45)
) // 45度回転を適用
```

このあとちゃんと書く

- Glispで書いたコードを元に作られた。Glispで実現したい「関数型的、かつ 日々のチマチマしたデザインにプログラミング的な性質を漸次的（progressive）に混ぜ込むことができる」世界観を実現するための基盤ライブラリの一つ。
- Paveはパスの処理に特化しているが、SVGのようなスタイルも行える、スーパーセットとしての描画ライブラリを別で作る予定。
- 関数型のAPIは、クラスベースでメゾッドチェーンを用いるよりも、記述が冗長になりがちでネストも深くなる傾向があるが、現在策定中の[Pipe Operator](https://github.com/tc39/proposal-pipeline-operator)が使えるようになったら有用性がより今後高まっていく。上記のコードはこんな感じに書き換えられる。

```ts
Path.circle([50, 50], 50)
	|> Path.trim(%, 0.1, -0.1)
	|> Path.transform(%, mat2d.rotation(45))
```
