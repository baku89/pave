import palettePlugin from '@vuepress/plugin-palette'
import {defineUserConfig} from 'vuepress'

// @ts-ignore
import {typedocPlugin} from 'vuepress-plugin-typedoc/next'

module.exports = defineUserConfig({
	title: 'Pathed',
	head: [
		['link', {rel: 'preconnect', href: 'https://fonts.googleapis.com'}],
		[
			'link',
			{rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true},
		],
		[
			'link',
			{
				rel: 'stylesheet',
				href: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Inter:wght@400;600&display=swap',
			},
		],
	],
	plugins: [
		typedocPlugin({
			entryPoints: ['./src/index.ts'],
			tsconfig: './tsconfig.json',
			cleanOutputDir: true,
			hideInPageTOC: true,
			sidebar: {
				fullNames: true,
			},
		}),
		palettePlugin({preset: 'sass'}),
	],
	extendsMarkdown: md => {
		const defaultRender = md.renderer.rules.fence!

		md.renderer.rules.fence = (tokens, idx, options, env, self) => {
			const token = tokens[idx]
			if (token.tag === 'code' && token.info === 'js:pathed') {
				return `<Example code="${token.content}"></Example>`
			}
			return defaultRender(tokens, idx, options, env, self)
		}
	},
})
