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
