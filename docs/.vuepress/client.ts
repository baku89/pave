import {defineClientConfig} from '@vuepress/client'

import Example from '../components/Example.vue'
import Sandbox from '../components/Sandbox.vue'

export default defineClientConfig({
	enhance({app}) {
		app.component('Example', Example)
		app.component('Sandbox', Sandbox)
	},
})
