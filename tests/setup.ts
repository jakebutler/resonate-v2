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

// Node's own webcrypto backs globalThis.crypto here (jsdom 28 provides no
// WebCrypto, so vitest leaves the Node global in place). But bytes produced by
// vite-processed code run against jsdom realm globals — convex-test's
// `new Blob(...)`, `Uint8Array.from(...)` in lib helpers — and WebCrypto's
// WebIDL BufferSource check is realm-sensitive: Node's subtle rejects any
// ArrayBuffer whose realm isn't its own (seen as the digest failures in the
// campaign fixture harness, convex-test's blobSha, and the visual runtime
// suites). Patch Node's SubtleCrypto.prototype.digest to bridge realms by
// copying the input through Node's Buffer (brand-checked, realm-agnostic)
// before the original digest runs — same algorithm, same bytes.
// Prototype patching (rather than vi.stubGlobal on `crypto`) is deliberate:
// suites call vi.unstubAllGlobals() in afterEach, which would restore the
// original crypto and re-break every digest-dependent test after them.
import { webcrypto } from 'node:crypto'

function toNodeBufferSource(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data
  const view = data as { buffer?: { byteLength?: unknown }; byteOffset?: number; byteLength?: number }
  if (view && typeof view === 'object' && 'buffer' in view && typeof view.buffer?.byteLength === 'number') {
    // TypedArray or DataView from any realm.
    return Buffer.from(view.buffer as unknown as ArrayBuffer, view.byteOffset ?? 0, view.byteLength ?? 0)
  }
  // Plain ArrayBuffer from any realm.
  return Buffer.from(data as ArrayBuffer)
}

type SubtleDigest = (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>
const subtlePrototype = Object.getPrototypeOf(webcrypto.subtle) as { digest: SubtleDigest }
const originalDigest = subtlePrototype.digest
subtlePrototype.digest = function digest(algorithm, data) {
  return originalDigest.call(this, algorithm, toNodeBufferSource(data))
}


vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
vi.stubGlobal('alert', vi.fn())
