import { iconSvg } from '../brand.js';

const src = 'data:image/svg+xml;utf8,' + encodeURIComponent(iconSvg());

export function AppIcon({ size = 64, class: cls = '' }) {
  return <img class={cls} src={src} width={size} height={size} alt="" style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${Math.round(size * 0.226)}px` }} />;
}
