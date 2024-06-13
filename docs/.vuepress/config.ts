import {defineUserConfig} from 'vuepress'
import {path} from '@vuepress/utils'
import {defaultTheme} from '@vuepress/theme-default'
import {viteBundler} from '@vuepress/bundler-vite'
import monacoEditorPlugin, {
	type IMonacoEditorOpts,
} from 'vite-plugin-monaco-editor'

const monacoEditorPluginDefault = (monacoEditorPlugin as any).default as (
	options: IMonacoEditorOpts
) => any

export default defineUserConfig({
	title: 'Pave',
	base: '/pave/',
	alias: {
		pave: path.resolve(__dirname, '../../src'),
	},
	head: [
		['link', {rel: 'icon', href: './logo.svg'}],
		['link', {rel: 'preconnect', href: 'https://fonts.googleapis.com'}],
		[
			'link',
			{rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true},
		],
		['link', {rel: 'stylesheet', href: 'https://use.typekit.net/xhr6teg.css'}],
		[
			'link',
			{
				rel: 'stylesheet',
				href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
				crossorigin: 'anonymous',
			},
		],
		[
			'script',
			{
				src: 'https://cdn.jsdelivr.net/npm/ccapture.js-npmfixed@1.1.0/build/CCapture.all.min.js',
				crossorigin: 'anonymous',
			},
		],
	],
	theme: defaultTheme({
		navbar: [
			{
				text: 'Home',
				link: '/',
			},
			{
				text: 'Guide',
				link: '/guide',
			},
			{
				text: 'API',
				link: '/api',
			},
			{
				text: 'Sandbox',
				link: '/sandbox',
			},
		],
		logo: '/logo.svg',
		repo: 'baku89/pave',
	}),
	locales: {
		'/': {
			lang: 'English',
			title: 'Pave',
			description: 'A library for manipulating SVG/Path2D curves',
		},
		'/ja/': {
			lang: '日本語',
			title: 'Pave',
			description: 'SVG/Path2Dのパス操作に特化したライブラリ',
		},
	},
	bundler: viteBundler({
		viteOptions: {
			plugins: [
				monacoEditorPluginDefault({
					languageWorkers: ['editorWorkerService', 'typescript'],
				}),
			],
		},
	}),
	markdown: {
		//@ts-ignore
		linkify: true,
		typographer: true,
		code: {
			lineNumbers: false,
		},
	},
	extendsMarkdown: md => {
		const defaultRender = md.renderer.rules.fence!

		md.renderer.rules.fence = (tokens, idx, options, env, self) => {
			const token = tokens[idx]
			if (token.tag === 'code' && token.info === 'js:pave') {
				const code = md.utils.escapeHtml(token.content)
				return `<Example code="${code}"></Example>`
			}
			return defaultRender(tokens, idx, options, env, self)
		}
	},
})
