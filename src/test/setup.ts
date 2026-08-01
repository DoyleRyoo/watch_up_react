import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { useAuthStore } from '../stores/authStore'
afterEach(() => { cleanup(); useAuthStore.getState().reset() })
