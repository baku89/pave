declare module 'safer-eval' {
	function saferEval(code: string, context?: object): void
	export = saferEval
}
