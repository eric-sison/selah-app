import { afterEach, describe, expect, it, vi } from "vitest"
import { shuffleArray } from "@/utils/shuffle"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("shuffleArray", () => {
  it("returns an empty array unchanged", () => {
    expect(shuffleArray([])).toEqual([])
  })

  it("returns a single-element array unchanged", () => {
    expect(shuffleArray([1])).toEqual([1])
  })

  it("returns an array with the same length and elements, regardless of order", () => {
    const input = [1, 2, 3, 4, 5]
    const result = shuffleArray(input)

    expect(result).toHaveLength(input.length)
    expect([...result].sort()).toEqual([...input].sort())
  })

  it("does not mutate the original array", () => {
    const input = [1, 2, 3, 4, 5]
    const copy = [...input]

    shuffleArray(input)

    expect(input).toEqual(copy)
  })

  it("produces the expected permutation for a deterministic random sequence", () => {
    // Forcing Math.random to always return 0 makes every swap target index
    // 0 (j = floor(0 * (i+1)) = 0), so the algorithm's output is fully
    // deterministic - a precise correctness check beyond just "same
    // elements, some order".
    vi.spyOn(Math, "random").mockReturnValue(0)

    // i=4: swap(4,0) -> [5,2,3,4,1]
    // i=3: swap(3,0) -> [4,2,3,5,1]
    // i=2: swap(2,0) -> [3,2,4,5,1]
    // i=1: swap(1,0) -> [2,3,4,5,1]
    expect(shuffleArray([1, 2, 3, 4, 5])).toEqual([2, 3, 4, 5, 1])
  })
})
