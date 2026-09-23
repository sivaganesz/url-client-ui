/**
 * Stroke icons on a 24px grid, coloured by `currentColor` so Tailwind text
 * utilities drive them. Sized 16px unless a caller passes `size`.
 */
export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </Svg>
)

export const IconAnalytics = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 21h18" />
    <path d="M7 21v-8" />
    <path d="M12 21V6" />
    <path d="M17 21v-5" />
  </Svg>
)

export const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
  </Svg>
)

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </Svg>
)

export const IconAgent = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
  </Svg>
)

export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
  </Svg>
)

export const IconHash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />
  </Svg>
)

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Svg>
)

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
)

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
)

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18l6-6-6-6" />
  </Svg>
)

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
  </Svg>
)

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconMore = ({ size = 16, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <circle cx="12" cy="5" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="19" r="1.6" />
  </svg>
)

export const IconPlay = ({ size = 16, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <path d="M8 5v14l11-7z" />
  </svg>
)

export const IconPause = ({ size = 16, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
)

export const IconStar = ({ size = 16, filled = false, ...rest }: IconProps & { filled?: boolean }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </svg>
)

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

/** The same eye, struck through: what is shown now will be hidden again. */
export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.6" />
    <path d="M6.2 7.8A17 17 0 0 0 2 12s3.6 6 10 6a9.6 9.6 0 0 0 4.3-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="M3 3l18 18" />
  </Svg>
)

export const IconInbound = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 7L7 17M7 17h7M7 17v-7" />
  </Svg>
)

export const IconOutbound = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17L17 7M17 7h-7M17 7v7" />
  </Svg>
)

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
)

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M2 7l10 6 10-6" />
  </Svg>
)

export const IconSms = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
)

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z" />
  </Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
)

export const IconLines = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

/** Two sheets, one behind the other — the copy-to-clipboard convention. */
export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Svg>
)

export const IconNote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3h9l5 5v13H5z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </Svg>
)

export const IconEdit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z" />
  </Svg>
)

export const IconTrend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 21h18" />
    <path d="M4 16l5-5 4 3 6-7" />
  </Svg>
)

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Svg>
)

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.01" />
  </Svg>
)

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 4v5h-5" />
  </Svg>
)

export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Svg>
)

export const IconRows = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M3 9.5h18M3 14.5h18M8.5 9.5v10" />
  </Svg>
)

export const IconPower = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v9" />
    <path d="M7.4 6.4a7.5 7.5 0 1 0 9.2 0" />
  </Svg>
)

/** Sentiment, drawn rather than emoji — the console has no other emoji, and
    their rendering varies by platform in a way tone colours don't. */
export const IconMood = ({ mood = 'neutral', size = 16, ...rest }: IconProps & { mood?: 'positive' | 'neutral' | 'negative' }) => (
  <Svg size={size} {...rest}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 10v.01M15 10v.01" />
    {mood === 'positive' ? (
      <path d="M8.5 14a4.5 4.5 0 0 0 7 0" />
    ) : mood === 'negative' ? (
      <path d="M8.5 15.5a4.5 4.5 0 0 1 7 0" />
    ) : (
      <path d="M9 14.5h6" />
    )}
  </Svg>
)

export const IconFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-2 3.5L16 11H5" />
  </Svg>
)

export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 7l10 10M17 7L7 17" />
  </Svg>
)

export const IconSystem = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l9 9-9 9-9-9z" />
  </Svg>
)

export const IconCredit = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M14.8 9.4a3.4 3.4 0 1 0 0 5.2" />
  </Svg>
)

export const IconMicOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 9v3a3 3 0 0 0 4.6 2.5M15 12V6a3 3 0 0 0-5.9-.7" />
    <path d="M5 11a7 7 0 0 0 10.3 6.2M19 11a7 7 0 0 1-.6 2.8" />
    <path d="M12 19v2" />
    <path d="M4 3l16 18" />
  </Svg>
)

export const IconPhoneDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 13.5a12 12 0 0 1 17 0" />
    <path d="M7 12.2v2.6a1.5 1.5 0 0 1-1.6 1.5l-1.5-.1A1.5 1.5 0 0 1 2.6 14l.9-.5M17 12.2v2.6a1.5 1.5 0 0 0 1.6 1.5l1.5-.1A1.5 1.5 0 0 0 21.4 14l-.9-.5" />
  </Svg>
)

/** Channel name -> icon, so every surface labels a channel the same way. */
export const channelIcon: Record<string, React.ComponentType<IconProps>> = {
  WhatsApp: IconChat,
  Phone: IconPhone,
  Email: IconMail,
  SMS: IconSms,
  Web: IconGlobe,
  // A web chat that moved to voice — still the widget, now spoken.
  'Web voice': IconPhone,
}
