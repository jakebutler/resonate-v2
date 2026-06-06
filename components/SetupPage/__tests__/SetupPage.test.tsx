import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useQuery, useMutation } from 'convex/react'
import { SetupPage } from '@/components/SetupPage/SetupPage'

const mockPush = vi.fn()

vi.mock('convex/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }))
vi.mock('@/convex/_generated/api', () => ({
  api: { settings: { get: 'settings:get', upsert: 'settings:upsert' } }
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

describe('SetupPage', () => {
  const mockUpsert = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useQuery).mockReturnValue(undefined)
    vi.mocked(useMutation).mockReturnValue(mockUpsert)
  })

  it('renders blog toggle on by default', () => {
    render(<SetupPage />)
    const switches = screen.getAllByRole('switch')
    // Blog toggle is first and defaults to true
    expect(switches[0]).toHaveAttribute('aria-checked', 'true')
  })

  it('Continue button calls upsert then navigates', async () => {
    render(<SetupPage />)
    const continueBtn = screen.getByRole('button', { name: /continue/i })
    await userEvent.click(continueBtn)
    await vi.waitFor(() => expect(mockUpsert).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'))
  })
})
