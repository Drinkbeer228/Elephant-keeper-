// Линейные иконки интерфейса (SVG, 24×24, обводка currentColor)

const wrap = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  logo: wrap('<path d="M5 16c-1.5-1-2-3-1.5-5C4.5 7 8 5 12 5c4.5 0 8 3 8 7 0 2-1 3.5-2.5 4.2"/><path d="M17.5 16.2c-.3 2.1-1.4 3.3-3 3.3"/><path d="M8 14v4M12 14v4"/><circle cx="15.5" cy="9.5" r=".6" fill="currentColor"/>'),
  sun: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: wrap('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  journal: wrap('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>'),
  sound: wrap('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  mute: wrap('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  menu: wrap('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  pause: wrap('<path d="M9 5v14M15 5v14"/>'),
  play: wrap('<path d="M7 5l12 7-12 7z"/>'),
  map: wrap('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  target: wrap('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  hand: wrap('<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 5 14.5V12a1.5 1.5 0 0 1 3 0"/>'),
  drop: wrap('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
  hay: wrap('<rect x="3" y="8" width="18" height="9" rx="2"/><path d="M8 8v9M16 8v9"/>'),
  door: wrap('<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M14 12h.01"/>'),
  house: wrap('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  heart: wrap('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
  zzz: wrap('<path d="M5 6h6L5 14h6M14 12h5l-5 6h5"/>'),
  alert: wrap('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'),
  temp: wrap('<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>'),
  run: wrap('<circle cx="14" cy="4.5" r="1.6"/><path d="M9 21l2.5-6 3 2.5V22M7 12l3-3.5 4 1 2.5 3 2.5.5"/>'),
  drop2: wrap('<path d="M6 19h12M8 15l4 4 4-4M12 5v14"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  minus: wrap('<path d="M5 12h14"/>'),
  dots: wrap('<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>'),
  clock: wrap('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>'),
  knife: wrap('<path d="M4 20L15 9l2 2-9 9z"/><path d="M15 9l3-3a2 2 0 0 1 2.8 2.8L18 11.6"/>'),
};

export type IconName = keyof typeof ICON;
