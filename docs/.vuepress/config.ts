import palettePlugin from '@vuepress/plugin-palette'
import {defineUserConfig, defaultTheme} from 'vuepress'
import {path} from '@vuepress/utils'

module.exports = defineUserConfig({
	title: 'Pathed',
	base: '/pathed/',
	alias: {
		pathed: path.resolve(__dirname, '../../src'),
	},
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
	theme: defaultTheme({
		navbar: [
			{
				text: 'Home',
				link: '/',
			},
			{
				text: 'API',
				link: '/api',
			},
			{
				text: 'Github',
				link: 'https://github.com/baku89/pathed',
			},
		],
	}),
	plugins: [palettePlugin({preset: 'sass'})],
	markdown: {
		linkify: true,
		typographer: true,
	},
	extendsMarkdown: md => {
		const defaultRender = md.renderer.rules.fence!

		md.renderer.rules.fence = (tokens, idx, options, env, self) => {
			const token = tokens[idx]
			if (token.tag === 'code' && token.info === 'js:pathed') {
				const code = md.utils.escapeHtml(token.content)
				return `<Example code="${code}"></Example>`
			}
			return defaultRender(tokens, idx, options, env, self)
		}
	},
})
