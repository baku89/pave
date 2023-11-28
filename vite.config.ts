import {resolve} from 'path'
import {fileURLToPath} from 'url'
import {defineConfig} from 'vite'
import eslint from 'vite-plugin-eslint'

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		root: 'demo',
		base: './',
		build: {
			outDir: resolve(__dirname, 'static'),
		},
		plugins: [eslint()],
		resolve: {
			alias: [
				{
					find: 'pathed',
					replacement: fileURLToPath(new URL('./src', import.meta.url)),
				},
			],
		},
	}
})
