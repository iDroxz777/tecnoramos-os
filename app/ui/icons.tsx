const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

const paths = {
  home: "M4 10.5 12 4l8 6.5V20H4z M10 20v-5h4v5",
  history: `M4.5 12a7.5 7.5 0 1 0 2.2-5.3 M4.5 4.5v3.2h3.2 M12 8.2V12l2.6 1.6`,
  plus: "M12 5v14 M5 12h14",
  store: "M4 10.5V20h16v-9.5 M3 6.5 4.5 4h15L21 6.5c0 2-1.4 3.5-3 3.5s-3-1.5-3-3.5c0 2-1.4 3.5-3 3.5S9 8.5 9 6.5C9 8.5 7.6 10 6 10S3 8.5 3 6.5z M10 20v-5h4v5",
  chart: "M4 20h16 M7 16.5V11 M12 16.5V6 M17 16.5v-3.5",
  sliders: `M4 7h9 M17 7h3 M4 17h3 M11 17h9 ${circle(15, 7, 2)} ${circle(9, 17, 2)}`,
  search: `${circle(11, 11, 6.5)} M20 20l-4.4-4.4`,
  chevronRight: "M9.5 6l6 6-6 6",
  chevronLeft: "M14.5 6l-6 6 6 6",
  close: "M6.5 6.5l11 11 M17.5 6.5l-11 11",
  check: "M5 12.5 9.5 17 19 7.5",
  file: "M7 3.5h7l4.5 4.5v12.5H7z M14 3.5V8h4.5 M9.8 13h5.4 M9.8 16.5h3.6",
  share: "M12 3.5v11 M8 7.5l4-4 4 4 M5.5 12.5v7h13v-7",
  chat: "M20 11.6a8 8 0 0 1-11.7 7.1L4 20l1.3-4A8 8 0 1 1 20 11.6z",
  edit: "M4.5 19.5h4l10-10-4-4-10 10z M13 7l4 4",
  trash: "M5 7h14 M9.5 7V4.5h5V7 M7 7l.9 12.5h8.2L17 7 M10.3 10.5v6 M13.7 10.5v6",
  restore: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3 M4.5 4.5v3.2h3.2",
  cloud: "M7 18.5h10a4 4 0 0 0 .4-8 5.8 5.8 0 0 0-11.1 1.7A3.2 3.2 0 0 0 7 18.5z",
  cloudCheck: "M7 18.5h10a4 4 0 0 0 .4-8 5.8 5.8 0 0 0-11.1 1.7A3.2 3.2 0 0 0 7 18.5z M9.6 14.2l1.8 1.8 3.4-3.4",
  cloudOff: "M7 18.5h10a4 4 0 0 0 .4-8 5.8 5.8 0 0 0-11.1 1.7A3.2 3.2 0 0 0 7 18.5z M4 4l16 16",
  sync: "M19.5 11A7.5 7.5 0 0 0 6.4 7 M4.5 13a7.5 7.5 0 0 0 13.1 4 M6 3.5V7h3.5 M18 20.5V17h-3.5",
  calendar: "M4.5 6h15v14h-15z M4.5 10h15 M8.5 3.5v4 M15.5 3.5v4",
  user: `${circle(12, 8, 3.8)} M4.5 20c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5`,
  users: `${circle(9, 8.5, 3.3)} M3.5 19.5c1.1-3 3.2-4.6 5.5-4.6s4.4 1.6 5.5 4.6 M15.5 5.5a3.2 3.2 0 0 1 0 6.2 M17.5 14.6c1.4.6 2.4 2.1 3 4.4`,
  logout: "M10 4.5H5.5v15H10 M14.5 8l4 4-4 4 M18.5 12H9.5",
  wrench: "M14.6 4.2a4.6 4.6 0 0 0-4.4 6.1L4.5 16l3.5 3.5 5.7-5.7a4.6 4.6 0 0 0 6.1-4.4l-2.8 2.8-3-.8-.8-3z",
  alert: "M12 4.5 20.5 19.5h-17z M12 10v4 M12 16.8v.2",
  message: "M4.5 5.5h15v10.5H10l-5.5 4z",
  box: "M4.5 8 12 4.5 19.5 8v8L12 19.5 4.5 16z M4.5 8 12 11.5 19.5 8 M12 11.5v8",
  note: "M6.5 4h11v16h-11z M9.5 8.5h5 M9.5 12h5 M9.5 15.5h3",
  pen: "M14.5 5l4.5 4.5L10 18.5H5.5V14z M4 21h16",
  clock: `${circle(12, 12, 8)} M12 8v4.2l2.8 1.8`,
  download: "M12 4v11 M8 11l4 4 4-4 M5 19.5h14",
  clipboard: "M9 4.5h6v3H9z M7.5 6H5.5v14h13V6h-2 M9 12h6 M9 15.5h4",
  arrowRight: "M5 12h14 M13 6l6 6-6 6",
  more: `${circle(6, 12, 1.2)} ${circle(12, 12, 1.2)} ${circle(18, 12, 1.2)}`,
  phone: "M8 3.5h8v17H8z M11 17.5h2",
  layers: "M12 4.5 20 9l-8 4.5L4 9z M4 13l8 4.5 8-4.5",
  filter: "M4.5 6h15 M7.5 12h9 M10.5 18h3",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
