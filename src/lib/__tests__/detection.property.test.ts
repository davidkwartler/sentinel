import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { computeSimilarity } from '../detection'

// Property-based checks: fast-check generates hundreds of component sets,
// including empty, whitespace-only and oddly cased strings, and shrinks any
// failure to the smallest input that breaks the rule.

const component = fc.option(fc.string({ maxLength: 24 }), { nil: null })
const components = fc.record(
  { os: component, browser: component, screenRes: component, timezone: component },
  { requiredKeys: [] },
)

describe('computeSimilarity properties', () => {
  it('is a multiple of 0.25 between 0 and 1', () => {
    fc.assert(
      fc.property(components, components, (a, b) => {
        const score = computeSimilarity(a, b)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
        expect(score * 4).toBeCloseTo(Math.round(score * 4))
      }),
    )
  })

  it('is symmetric', () => {
    fc.assert(
      fc.property(components, components, (a, b) => {
        expect(computeSimilarity(a, b)).toBeCloseTo(computeSimilarity(b, a))
      }),
    )
  })

  it('scores a fingerprint as identical to itself', () => {
    fc.assert(
      fc.property(components, (a) => {
        expect(computeSimilarity(a, a)).toBeCloseTo(1)
      }),
    )
  })

  it('ignores case and surrounding whitespace', () => {
    fc.assert(
      fc.property(components, (a) => {
        const noisy = Object.fromEntries(
          Object.entries(a).map(([k, v]) => [k, v == null ? v : `  ${v.toUpperCase()}\t`]),
        )
        expect(computeSimilarity(a, noisy)).toBeCloseTo(computeSimilarity(a, a))
      }),
    )
  })
})
