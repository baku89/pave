import palettePlugin from '@vuepress/plugin-palette'
import {defineUserConfig, defaultTheme} from 'vuepress'
import {path} from '@vuepress/utils'

module.exports = defineUserConfig({
	title: 'Pave',
	base: '/pave/',
	alias: {
		pave: path.resolve(__dirname, '../../src'),
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
				href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500&family=Work+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500;1,600&display=swap',
			},
		],
		['link', {rel: 'icon', href: '/logo.svg'}],
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
				link: 'https://github.com/baku89/pave',
			},
		],
		logo: '/logo.svg',
	}),
	plugins: [palettePlugin({preset: 'sass'})],
	markdown: {
		//@ts-ignore
		linkify: true,
		typographer: true,
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
