import '@testing-library/jest-dom'
import { vi } from 'vitest' // explicit import — don't rely on globals: true in vitest.config.ts

// Mock browser APIs not available in jsdom
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  })
}

vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
vi.stubGlobal('alert', vi.fn())
