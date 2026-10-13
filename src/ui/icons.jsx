// Line icons drawn for Batwara on a 24-point grid (stroke 1.8, round caps), in the spirit of SF Symbols.

const S = {
  chevronLeft: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  chevronRight: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  chevronUpDown: <path d="M8.5 9.5L12 6l3.5 3.5M8.5 14.5L12 18l3.5-3.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  xmark: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  search: (<><circle cx="10.8" cy="10.8" r="6.3" /><path d="M15.6 15.6l4.4 4.4" /></>),
  person: (<><circle cx="12" cy="8.2" r="3.7" /><path d="M4.8 20c.4-4 3.4-6.4 7.2-6.4s6.8 2.4 7.2 6.4" /></>),
  people: (<><circle cx="9" cy="8.6" r="3.2" /><path d="M3 19.6c.3-3.4 2.7-5.6 6-5.6s5.7 2.2 6 5.6" /><circle cx="16.6" cy="9.4" r="2.6" /><path d="M16.8 14.2c2.4.1 4 1.9 4.2 4.6" /></>),
  clock: (<><circle cx="12" cy="12" r="8.6" /><path d="M12 7.4V12l3.1 2" /></>),
  sliders: (<><path d="M4 7h9M17.5 7H20M4 17h3.5M12 17h8" /><circle cx="15.2" cy="7" r="2.2" /><circle cx="9.7" cy="17" r="2.2" /></>),
  share: <path d="M12 3.8v11M8.2 7.6L12 3.8l3.8 3.8M8 10.6H6.6c-.9 0-1.6.7-1.6 1.6v6.2c0 .9.7 1.6 1.6 1.6h10.8c.9 0 1.6-.7 1.6-1.6v-6.2c0-.9-.7-1.6-1.6-1.6H16" />,
  tray: <path d="M12 3.8v10M8.2 10l3.8 3.8 3.8-3.8M4.5 13.5v4.9c0 .9.7 1.6 1.6 1.6h11.8c.9 0 1.6-.7 1.6-1.6v-4.9" />,
  sync: <path d="M19.4 9.2A7.8 7.8 0 0 0 5.7 7M4.6 14.8a7.8 7.8 0 0 0 13.7 2.2M19.6 4.6v4.6H15M4.4 19.4v-4.6H9" />,
  trash: <path d="M4.5 6.6h15M9.6 6.6V5c0-.8.6-1.4 1.4-1.4h2c.8 0 1.4.6 1.4 1.4v1.6M6.6 6.6l.8 12.1c.1 1 .9 1.7 1.8 1.7h5.6c.9 0 1.7-.7 1.8-1.7l.8-12.1M10.2 10.6v5.8M13.8 10.6v5.8" />,
  pencil: <path d="M4.6 19.4l.9-4.1L15.9 4.9a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.6L8.7 18.5zM13.9 6.9l3.2 3.2" />,
  ellipsis: (<><circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" /></>),
  suitcase: (<><rect x="3.8" y="7.6" width="16.4" height="12" rx="2.2" /><path d="M9 7.6V5.8c0-.6.5-1.1 1.1-1.1h3.8c.6 0 1.1.5 1.1 1.1v1.8M8 7.6v12M16 7.6v12" /></>),
  house: <path d="M4 11.2l8-6.6 8 6.6M6.2 9.6v9.1c0 .6.5 1.1 1.1 1.1h3.2v-5.2h3v5.2h3.2c.6 0 1.1-.5 1.1-1.1V9.6" />,
  heart: <path d="M12 19.6s-7.6-4.5-7.6-10.1A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.6 2.5c0 5.6-7.6 10.1-7.6 10.1z" />,
  briefcase: (<><rect x="3.6" y="7.6" width="16.8" height="12" rx="2.2" /><path d="M9 7.6V6c0-.8.6-1.4 1.4-1.4h3.2c.8 0 1.4.6 1.4 1.4v1.6M3.6 12.6h16.8M11 12.6v1.6h2v-1.6" /></>),
  list: (<><path d="M9.2 6.6h10.4M9.2 12h10.4M9.2 17.4h10.4" /><circle cx="5.2" cy="6.6" r="1.1" fill="currentColor" stroke="none" /><circle cx="5.2" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="5.2" cy="17.4" r="1.1" fill="currentColor" stroke="none" /></>),
  cart: (<><path d="M3.6 4.6h2.1l2.1 10.1c.1.5.6.9 1.1.9h8.2c.5 0 1-.3 1.1-.8l1.5-6.6H6.5" /><circle cx="9.6" cy="19.2" r="1.3" /><circle cx="16.8" cy="19.2" r="1.3" /></>),
  food: <path d="M7.2 3.6v6.8M5 3.6v4.9a2.2 2.2 0 0 0 4.4 0V3.6M7.2 10.4v10M16.8 20.4V3.6c-2.1 1.1-3.2 3.4-3.2 6.6v3.6h3.2" />,
  bed: (<><path d="M3.6 18.6V6.8M3.6 14.2h16.8v4.4M20.4 14.2v-2.4a3 3 0 0 0-3-3H11v5.4" /><circle cx="7.2" cy="11.1" r="1.8" /></>),
  car: (<><path d="M4.2 16.4v2.2M19.8 16.4v2.2M3.8 16.4h16.4v-3.9l-1.9-4.8c-.2-.5-.7-.9-1.3-.9H7c-.6 0-1.1.4-1.3.9l-1.9 4.8zM3.8 12.5h16.4" /><circle cx="7.6" cy="14.4" r=".6" fill="currentColor" /><circle cx="16.4" cy="14.4" r=".6" fill="currentColor" /></>),
  plane: <path d="M20.6 3.4L3.4 10.4l7 2.3 2.3 7zM10.4 12.7l4.4-4.4" />,
  bolt: <path d="M13.2 3.4L5.6 13.4h6.2l-1 7.2 7.6-10H12.2z" />,
  ticket: <path d="M4 8.6V7.2c0-.8.7-1.5 1.5-1.5h13c.8 0 1.5.7 1.5 1.5v1.4a2.6 2.6 0 0 0 0 5.2v1.4c0 .8-.7 1.5-1.5 1.5h-13c-.8 0-1.5-.7-1.5-1.5v-1.4a2.6 2.6 0 0 0 0-5.2zM14.4 6.2v1.6M14.4 11.2v1.6M14.4 16.2v1.6" />,
  bag: <path d="M5.4 8.4h13.2l-.9 10.7c-.1.8-.8 1.4-1.6 1.4H7.9c-.8 0-1.5-.6-1.6-1.4zM9 10.6V7a3 3 0 0 1 6 0v3.6" />,
  cross: <path d="M9.6 4.4h4.8v5.2h5.2v4.8h-5.2v5.2H9.6v-5.2H4.4V9.6h5.2z" />,
  gift: (<><rect x="4" y="8.6" width="16" height="4" rx="1" /><path d="M5.4 12.6v6.4c0 .6.5 1.1 1.1 1.1h11c.6 0 1.1-.5 1.1-1.1v-6.4M12 8.6v11.5M12 8.6C10.5 5 6.6 4.8 6.6 7c0 1.4 2.8 1.6 5.4 1.6zM12 8.6c1.5-3.6 5.4-3.8 5.4-1.6 0 1.4-2.8 1.6-5.4 1.6z" /></>),
  tag: (<><path d="M3.6 12.1V4.6c0-.6.4-1 1-1h7.5l8.3 8.3c.6.6.6 1.5 0 2.1l-6.2 6.2c-.6.6-1.5.6-2.1 0z" /><circle cx="8.2" cy="8.2" r="1.5" /></>),
  banknote: (<><rect x="3" y="6.4" width="18" height="11.2" rx="1.8" /><circle cx="12" cy="12" r="2.6" /><path d="M6.4 9.6v.01M17.6 14.4v.01" /></>),
  card: (<><rect x="3" y="5.4" width="18" height="13.2" rx="2.2" /><path d="M3 9.6h18M6.6 15h4" /></>),
  qr: (<><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2.6v2.6H14zM17.4 17.4H20V20h-2.6zM14 19.2V20M20 14v1.4" /></>),
  photo: (<><rect x="3.4" y="5" width="17.2" height="14" rx="2.2" /><circle cx="8.8" cy="9.9" r="1.6" /><path d="M3.6 16.6l4.6-4.4 3.9 3.8 3-2.9 5.3 5" /></>),
  camera: (<><path d="M4 8.6c0-.9.7-1.6 1.6-1.6h2.2l1.4-2h5.6l1.4 2h2.2c.9 0 1.6.7 1.6 1.6v8.8c0 .9-.7 1.6-1.6 1.6H5.6c-.9 0-1.6-.7-1.6-1.6z" /><circle cx="12" cy="12.6" r="3.3" /></>),
  bell: <path d="M6.4 16.4V11a5.6 5.6 0 0 1 11.2 0v5.4l1.6 2H4.8zM10 20.4a2.2 2.2 0 0 0 4 0" />,
  repeat: <path d="M4.6 11V9.6c0-1.1.9-2 2-2h12M15.6 4.6l3 3-3 3M19.4 13v1.4c0 1.1-.9 2-2 2h-12M8.4 19.4l-3-3 3-3" />,
  doc: <path d="M6.6 3.6h7l4 4v11.6c0 .9-.7 1.6-1.6 1.6H6.6c-.9 0-1.6-.7-1.6-1.6V5.2c0-.9.7-1.6 1.6-1.6zM13.6 3.6v4h4M8.6 12h6.8M8.6 15.6h4.8" />,
  chart: <path d="M4.4 20.2h15.2M7.2 16.8v-5.4M12 16.8V6.6M16.8 16.8V9.4" />,
  lock: (<><rect x="5" y="10.4" width="14" height="10" rx="2.2" /><path d="M8 10.4V8a4 4 0 0 1 8 0v2.4" /></>),
  phone: <path d="M6.7 3.8l2.2-.3c.5-.1 1 .2 1.2.7l1.1 2.8c.2.5 0 1-.3 1.3L9.4 9.7a11.4 11.4 0 0 0 4.9 4.9l1.4-1.5c.3-.3.8-.5 1.3-.3l2.8 1.1c.5.2.8.7.7 1.2l-.3 2.2c-.1.8-.8 1.4-1.6 1.4C10.4 18.7 5.3 13.6 5.3 5.4c0-.8.6-1.5 1.4-1.6z" />,
  info: (<><circle cx="12" cy="12" r="8.6" /><path d="M12 11v5.6M12 7.8v.1" /></>),
  warning: <path d="M12 4.4l8.6 15H3.4zM12 10v4.2M12 16.9v.1" />,
  arrowRight: <path d="M5 12h14M13.4 6.4L19 12l-5.6 5.6" />,
  arrowUpRight: <path d="M7.4 16.6l9.2-9.2M9 7.4h7.6V15" />,
  sparkles: <path d="M11 3.6l1.6 4.4 4.4 1.6-4.4 1.6L11 15.6l-1.6-4.4L5 9.6l4.4-1.6zM17.6 14.6l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z" />,
  shield: <path d="M12 3.6l7 2.8v5.3c0 4.2-3 7.6-7 8.7-4-1.1-7-4.5-7-8.7V6.4zM9 12l2.1 2.1L15.2 10" />,
  message: <path d="M12 4.6c4.4 0 7.8 2.9 7.8 6.6s-3.4 6.6-7.8 6.6c-.9 0-1.8-.1-2.6-.4L5.2 19.2l1-3.4c-1.2-1.2-2-2.8-2-4.6 0-3.7 3.4-6.6 7.8-6.6z" />,
  at: (<><circle cx="12" cy="12" r="3.4" /><path d="M15.4 12v1.3a2.3 2.3 0 0 0 4.6 0V12a8 8 0 1 0-3.1 6.3" /></>),
  calendar: (<><rect x="4" y="5.4" width="16" height="14.6" rx="2.2" /><path d="M4 10h16M8.4 3.6v3.6M15.6 3.6v3.6" /></>),
  note: <path d="M5 6.4h14M5 10.8h14M5 15.2h9" />,
  receipt: <path d="M6.2 3.6h11.6v16.8l-1.9-1.3-1.9 1.3-1.9-1.3-1.9 1.3-2.1-1.3-1.9 1.3zM9 8h6M9 11.6h6M9 15.2h3.6" />,
  moon: <path d="M19.2 14.6A7.6 7.6 0 0 1 9.4 4.8a7.6 7.6 0 1 0 9.8 9.8z" />,
  logout: <path d="M14.4 4.6h3c.8 0 1.6.7 1.6 1.6v11.6c0 .9-.8 1.6-1.6 1.6h-3M10 8.2L6.2 12l3.8 3.8M6.4 12h9.4" />,
  link: <path d="M10.2 13.8a3.8 3.8 0 0 0 5.4 0l3-3a3.8 3.8 0 0 0-5.4-5.4l-1 1M13.8 10.2a3.8 3.8 0 0 0-5.4 0l-3 3a3.8 3.8 0 0 0 5.4 5.4l1-1" />,
  copy: (<><rect x="8.6" y="8.6" width="11" height="11" rx="2.2" /><path d="M15.4 8.6V6c0-.8-.7-1.4-1.4-1.4H6c-.8 0-1.4.6-1.4 1.4v8c0 .8.6 1.4 1.4 1.4h2.6" /></>),
  percent: (<><path d="M6 18L18 6" /><circle cx="7.4" cy="7.4" r="2.1" /><circle cx="16.6" cy="16.6" r="2.1" /></>),
  equal: <path d="M6 9.4h12M6 14.6h12" />,
  wallet: <path d="M4.2 7.6c0-1.1.9-2 2-2h11.2v2.6M4.2 7.6v10.2c0 1.1.9 2 2 2h12.6c.6 0 1-.4 1-1V9.2c0-.6-.4-1-1-1H6.2c-1.1 0-2-.9-2-2M16.4 14h.01" />,
  rupee: <path d="M7 5h10M7 9.2h10M9.5 5c3.4 0 5 1.4 5 4.2 0 2.7-2 4.2-5.4 4.2H8l7.4 6.6" />,
  handshake: <path d="M3.4 9.6l3.4-2.4 3.2 1.4 2-1.4h4.2l4.4 2.6M20.6 9.8l-2.2 5.4-2-.4M3.4 9.6l2.4 5.6 1.6.2M7.4 15.4l2.4 2.4c.5.5 1.2.5 1.6 0M10 13.8l2.8 2.8c.5.5 1.2.5 1.6 0 .5-.5.5-1.2 0-1.6M12.4 12.6l2.6 2.6c.5.5 1.2.5 1.6 0M9.8 8.6l-1.6 1.8c-.4.5-.3 1.2.2 1.6.5.4 1.2.3 1.6-.1l1.6-1.7h2.6" />,
  gauge: <path d="M4.2 16.4a8 8 0 1 1 15.6 0M12 16l3.6-5.4" />,
  key: (<><circle cx="8" cy="15" r="3.8" /><path d="M10.8 12.4L19 4.2M15.6 7.6l2.4 2.4M17.6 5.6l1.8 1.8" /></>),
  scan: <path d="M4 8.4V6c0-1.1.9-2 2-2h2.4M15.6 4H18c1.1 0 2 .9 2 2v2.4M20 15.6V18c0 1.1-.9 2-2 2h-2.4M8.4 20H6c-1.1 0-2-.9-2-2v-2.4M4.6 12h14.8" />,
  personCircle: (<><circle cx="12" cy="12" r="8.8" /><circle cx="12" cy="10" r="3" /><path d="M6.3 18.3c1.2-2.2 3.2-3.5 5.7-3.5s4.5 1.3 5.7 3.5" /></>),
  arrowsLR: <path d="M4.4 8.4h14.2M15.4 5.2l3.2 3.2-3.2 3.2M19.6 15.6H5.4M8.6 12.4l-3.2 3.2 3.2 3.2" />,
};

export function Icon({ name, size = 22, stroke = 1.8, class: cls = '', style, title }) {
  const shape = S[name] || S.tag;
  return (
    <svg class={'icon ' + cls} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {shape}
    </svg>
  );
}

/** Filled selection mark: empty ring or filled check (like a Reminders checkbox). */
export function CheckMark({ on, size = 24 }) {
  return (
    <svg class={'checkmark' + (on ? ' is-on' : '')} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={on ? 'var(--tint)' : 'none'} stroke={on ? 'var(--tint)' : 'var(--label-3)'} stroke-width="1.6" />
      {on && <path d="M7.4 12.4l3 3 6.2-6.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />}
    </svg>
  );
}

export function MinusBadge({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="var(--red)" />
      <path d="M7.5 12h9" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
    </svg>
  );
}

export function PlusBadge({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="var(--green)" />
      <path d="M7.5 12h9M12 7.5v9" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
    </svg>
  );
}
