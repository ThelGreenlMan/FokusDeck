import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </IconBase>
  );
}

export function CardsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5" y="4" width="14" height="16" rx="2.5" />
      <path d="M8 8h8M8 12h5" />
      <path d="M3 7.5v9A2.5 2.5 0 0 0 5.5 19" />
    </IconBase>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m4 10 8-6 8 6" />
      <path d="M6.5 9v10h11V9M10 19v-5h4v5" />
    </IconBase>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9 7 8 5-8 5V7Z" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 7v10M15 7v10" strokeWidth="2.4" />
    </IconBase>
  );
}

export function ResetIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5.8 8.8A7 7 0 1 1 5 14" />
      <path d="M5.8 4.8v4h4" />
    </IconBase>
  );
}

export function SkipIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m7 7 7 5-7 5V7Z" />
      <path d="M17 7v10" />
    </IconBase>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9 4 6 2-1 4 3 3-5 1-3 6-.5-6L4 11l4-2 1-5Z" />
    </IconBase>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" />
    </IconBase>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9 6 6 6-6 6" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5 12 4 4L19 6" />
    </IconBase>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </IconBase>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" />
    </IconBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.6l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7L10.8 2h-3l-.7 2.4a7 7 0 0 0-1.7.7l-1.9-.9-2.1 2.1.9 1.9a7 7 0 0 0-.7 1.6l-2 .7v3l2 .7a7 7 0 0 0 .7 1.6l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.7.7l.7 2.4h3l.7-2.4a7 7 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .7-1.6l2-.7Z" transform="translate(1.7 0) scale(.86)" />
    </IconBase>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3.5 7.5h6l2-2h9v13h-17v-11Z" />
      <path d="M3.5 9.5h17" />
    </IconBase>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M19 8a7 7 0 0 0-12-2L5 8" />
      <path d="M5 4v4h4M5 16a7 7 0 0 0 12 2l2-2" />
      <path d="M19 20v-4h-4" />
    </IconBase>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 5h5v5M19 5l-8 8" />
      <path d="M17 13v5H6V7h5" />
    </IconBase>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m10 13 4-4" />
      <path d="M7.5 15.5 6 17a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0" />
      <path d="m16.5 8.5 1.5-1.5a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0" />
    </IconBase>
  );
}

export function LoadIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 18h14" />
    </IconBase>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 4h12l2 2v14H5V4Z" />
      <path d="M8 4v5h8V4M8 20v-6h8v6" />
    </IconBase>
  );
}
