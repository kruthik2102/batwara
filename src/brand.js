// The Batwara mark: a coin split in two. Shared by the in-app icon and the Android launcher icons.

export const GLYPH = (scale = 1, gap = 26, c1 = '#FFFFFF', c2 = 'rgba(255,255,255,0.62)') => {
  const r = 280 * scale;
  const g = gap * scale;
  return `<g transform="rotate(-32 512 512)">
    <path d="M512 ${512 - r} A${r} ${r} 0 0 0 512 ${512 + r} Z" transform="translate(${-g} 0)" fill="${c1}"/>
    <path d="M512 ${512 - r} A${r} ${r} 0 0 1 512 ${512 + r} Z" transform="translate(${g} 0)" fill="${c2}"/>
  </g>`;
};

export const BACKGROUND = `<defs>
    <linearGradient id="bw-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#807DF7"/>
      <stop offset="1" stop-color="#4642CC"/>
    </linearGradient>
    <radialGradient id="bw-hi" cx="0.28" cy="0.12" r="0.9">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.28"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

export function iconSvg({ rounded = true, glyphScale = 1, background = true } = {}) {
  const bg = background
    ? `${BACKGROUND}<rect width="1024" height="1024" rx="${rounded ? 232 : 0}" fill="url(#bw-bg)"/><rect width="1024" height="1024" rx="${rounded ? 232 : 0}" fill="url(#bw-hi)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${bg}${GLYPH(glyphScale)}</svg>`;
}
