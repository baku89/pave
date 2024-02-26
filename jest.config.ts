import type {Config} from '@jest/types'

const config: Config.InitialOptions = {
	silent: false,
	preset: 'ts-jest',
	passWithNoTests: true,
	testEnvironment: 'jest-environment-jsdom',
	maxWorkers: 1,
	projects: [
		{
			testMatch: ['<rootDir>/src/**/*.test.ts'],
			transform: {
				'^.+\\.(t|j)s$': 'ts-jest',
			},
		},
		{
			displayName: 'lint',
			runner: 'jest-runner-eslint',
			testMatch: ['<rootDir>/src/**/*.ts'],
			transform: {
				'^.+\\.(t|j)s$': 'ts-jest',
			},
		},
	],
}

export default config
