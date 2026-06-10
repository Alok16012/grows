// Growus design tokens — derived from the web brand (green accent #1A9E6E)
// and the Employee App UI reference (deep corporate navy headers, soft tinted
// tiles, clean white cards). One source of truth for the whole app so every
// screen stays consistent and "pro grade".

export const colors = {
  // Brand
  navy: "#16335B",
  navyDark: "#0F2747",
  navyTint: "#1E406E",
  brand: "#1A9E6E", // Growus green (logo + web accent)
  brandDark: "#0D6B4A",
  brandTint: "#E7F6EF",

  // Surfaces
  bg: "#EEF1F5",
  surface: "#FFFFFF",
  surfaceAlt: "#F7F9FC",

  // Text
  text: "#19212E",
  textSecondary: "#5B6573",
  textMuted: "#9AA3B2",
  onNavy: "#FFFFFF",
  onNavyMuted: "#B9C6DC",

  // Lines
  border: "#E6E9EF",
  borderStrong: "#D4DAE3",

  // Status
  success: "#1A9E6E",
  successTint: "#E7F6EF",
  warning: "#D9870B",
  warningTint: "#FDF3DD",
  danger: "#E0413B",
  dangerTint: "#FCEBEA",
  info: "#2563EB",
  infoTint: "#E5EFFB",
  purple: "#7C3AED",
  purpleTint: "#EFE7FB",

  white: "#FFFFFF",
  black: "#000000",
  shadow: "#0B1B33",
} as const;

// Tinted tile palette for the quick-action grid (icon color + soft background)
export const tiles = {
  green: { fg: colors.brand, bg: colors.brandTint },
  amber: { fg: colors.warning, bg: colors.warningTint },
  blue: { fg: colors.info, bg: colors.infoTint },
  purple: { fg: colors.purple, bg: colors.purpleTint },
  navy: { fg: colors.navy, bg: "#E6ECF5" },
  red: { fg: colors.danger, bg: colors.dangerTint },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const font = {
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 26,
    xxxl: 34,
  },
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
} as const;

export const shadow = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  raised: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  header: {
    shadowColor: colors.navyDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
} as const;

export const gradients = {
  navy: [colors.navyTint, colors.navyDark] as const,
  brand: [colors.brand, colors.brandDark] as const,
  salary: ["#2E6FC7", "#1B4C92"] as const,
};
