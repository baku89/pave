declare module 'safer-eval' {
	function saferEval(code: string, context?: object): void
	export = saferEval
}

declare module '*?raw' {
	const content: string
	export default content
}

declare module '*.vue' {
	import {DefineComponent} from 'vue'
	const component: DefineComponent<{}, {}, any>
	export default component
}
