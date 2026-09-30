import '@testing-library/jest-dom'
import { vi } from 'vitest' // explicit import — don't rely on globals: true in vitest.config.ts

// Ordinary offline tests opt in explicitly; server code has no test-mode admission bypass.
process.env.EDITORIAL_VISUALS_ENABLED = '1'

// Mock browser APIs not available in jsdom
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  })
}

vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
vi.stubGlobal('alert', vi.fn())
