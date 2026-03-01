import { vi, beforeEach } from 'vitest'
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '@/generated/prisma/client'

vi.mock('@/lib/db', () => ({
  prisma: mockDeep<PrismaClient>(),
}))

import { prisma } from '@/lib/db'

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>

beforeEach(() => {
  mockReset(prismaMock)
})
