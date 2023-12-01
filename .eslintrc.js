module.exports = {
	root: true,
	parser: 'vue-eslint-parser',
	env: {
		node: true,
	},
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:vue/vue3-recommended',
		'plugin:prettier-vue/recommended',
		'prettier',
	],
	parserOptions: {
		parser: '@typescript-eslint/parser',
		ecmaVersion: 2022,
		sourceType: 'module',
	},
	plugins: ['@typescript-eslint', 'simple-import-sort', 'unused-imports'],
	rules: {
		'no-console': 'warn',
		'no-debugger': 'warn',
		eqeqeq: 'error',
		'prefer-const': 'error',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'simple-import-sort/imports': 'error',
		'simple-import-sort/exports': 'error',
		'unused-imports/no-unused-imports-ts': 'error',
		'@typescript-eslint/no-namespace': 'off',
		'vue/no-multiple-template-root': 'off',
		'vue/multi-word-component-names': 'off',
		'vue/no-v-model-argument': 'off',
		'vue/attribute-hyphenation': 'off',
		'vue/v-on-event-hyphenation': 'off',
	},
	overrides: [
		{
			files: ['**/*.test.ts'],
			plugins: ['jest'],
		},
		{
			files: ['docs/examples/*.js'],
			globals: {
				Path: 'readonly',
				scalar: 'readonly',
				vec2: 'readonly',
				mat2d: 'readonly',
				stroke: 'readonly',
				context: 'readonly',
			},
		},
	],
}
