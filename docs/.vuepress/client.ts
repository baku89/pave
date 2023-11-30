import {defineClientConfig} from '@vuepress/client'
import Example from '../components/Example.vue'

export default defineClientConfig({
	enhance({app}) {
		app.component('Example', Example)
	},
})
