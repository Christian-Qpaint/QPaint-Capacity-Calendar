// Per-crew color identity for the Resource Schedule Calendar. A team's own `color` (set via Setup
// or directly on the Calendar) always wins; teams that haven't been assigned one yet get a stable
// default from this palette, keyed off their id, so the calendar never renders unstyled/gray bars.

const DEFAULT_PALETTE = [
  '#F0997B', // terracotta
  '#5DCAA5', // teal
  '#EF9F27', // amber
  '#AFA9EC', // violet
  '#ED93B1', // pink
  '#6FB2EE', // blue
  '#9BCB6B', // green
  '#E2A8E0', // orchid
  '#F2C14E', // gold
  '#7FD1C6', // aqua
]

function hashString(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  }
  return hash
}

export function defaultColorForTeam(teamId: string): string {
  return DEFAULT_PALETTE[hashString(teamId) % DEFAULT_PALETTE.length]
}

/** Perceived-brightness check (YIQ) to pick readable black/white text on an arbitrary bg color. */
function readableTextColor(hexBg: string): string {
  const { r, g, b } = hexToRgb(hexBg)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? '#08060d' : '#ffffff'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return { r: 0, g: 0, b: 0 }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (n: number) =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function getTeamColors(team: { id: string; color?: string }): { bg: string; text: string } {
  const bg = team.color || defaultColorForTeam(team.id)
  return { bg, text: readableTextColor(bg) }
}

/** A subtle two-stop gradient built from the team's own color — lighter top-left to a richer,
 * slightly deeper version of the same hue bottom-right, rather than a flat fill. */
export function getTeamGradient(team: { id: string; color?: string }): { gradient: string; text: string } {
  const bg = team.color || defaultColorForTeam(team.id)
  const { r, g, b } = hexToRgb(bg)
  const { h, s, l } = rgbToHsl(r, g, b)
  const lightStop = hslToHex(h, clamp(s - 4, 0, 100), clamp(l + 10, 0, 92))
  const darkStop = hslToHex(h, clamp(s + 6, 0, 100), clamp(l - 12, 8, 100))
  return {
    gradient: `linear-gradient(135deg, ${lightStop} 0%, ${darkStop} 100%)`,
    text: readableTextColor(hslToHex(h, s, l)),
  }
}

export const TEAM_COLOR_PALETTE = DEFAULT_PALETTE
