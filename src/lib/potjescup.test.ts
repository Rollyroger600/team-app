import { describe, it, expect } from 'vitest'
import { parsePotjescupPoints } from './potjescup'

describe('parsePotjescupPoints', () => {
  it('leest hele punten van 0 tot en met 9', () => {
    expect(parsePotjescupPoints('0')).toBe(0)
    expect(parsePotjescupPoints('3')).toBe(3)
    expect(parsePotjescupPoints('9')).toBe(9)
    expect(parsePotjescupPoints(' 4 ')).toBe(4)
  })

  // Een halve punt bestond al (van kant gewisseld); die moet ook boven de 1 kunnen.
  it('staat halve punten toe, met komma of punt', () => {
    expect(parsePotjescupPoints('2,5')).toBe(2.5)
    expect(parsePotjescupPoints('2.5')).toBe(2.5)
    expect(parsePotjescupPoints('0,5')).toBe(0.5)
  })

  // Dezelfde grens als potjescup_scores_points_check in de database.
  it('weigert wat de database ook zou weigeren', () => {
    expect(parsePotjescupPoints('10')).toBeNull()
    expect(parsePotjescupPoints('9,5')).toBeNull()
    expect(parsePotjescupPoints('-1')).toBeNull()
    expect(parsePotjescupPoints('1,3')).toBeNull()
  })

  it('weigert wat geen getal is', () => {
    expect(parsePotjescupPoints('')).toBeNull()
    expect(parsePotjescupPoints('abc')).toBeNull()
  })
})
