declare module 'safer-eval' {
	function saferEval(code: string, context?: object): void
	export = saferEval
}

declare module '*?raw' {
	const content: string
	export default content
}
