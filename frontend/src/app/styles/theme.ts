import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from "@mantine/core";

function mix(hex: string, target: number, amount: number): string {
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  const blend = (value: number) =>
    Math.round(value + (target - value) * amount)
      .toString(16)
      .padStart(2, "0");

  return `#${blend(channel(1))}${blend(channel(3))}${blend(channel(5))}`;
}

function ramp(base: string): MantineColorsTuple {
  return [
    mix(base, 255, 0.92),
    mix(base, 255, 0.82),
    mix(base, 255, 0.68),
    mix(base, 255, 0.5),
    mix(base, 255, 0.32),
    mix(base, 255, 0.16),
    base,
    mix(base, 0, 0.1),
    mix(base, 0, 0.2),
    mix(base, 0, 0.32),
  ];
}

export const theme = createTheme({
  primaryColor: "povOrange",
  primaryShade: 6,
  defaultRadius: 2,
  fontFamily: "Roboto, Arial, sans-serif",
  colors: {
    povOrange: ramp("#ec653b"),
    povOrange2: ramp("#ed933b"),
    povBlue: ramp("#157dbd"),
    povBlueDark: ramp("#2c66a5"),
    povDark: ramp("#2f353a"),
    povDark2: ramp("#49555d"),
    povGray: ramp("#838f97"),
    povLight: ramp("#efefef"),
    povLight2: ramp("#ebecec"),
    povLine: ramp("#b8b8b8"),
    povMaroon: ramp("#6c364b"),
    povRed: ramp("#ff0000"),
  },
});

const povVariables = {
  "--pov-section": "#dfe3e6",
  "--pov-journal-text": "#ccd7db",
  "--pov-journal-muted": "#abb6bb",
  "--pov-card-bg": "#c9ced1",
  "--pov-card-text": "#1f1f1f",
  "--pov-card-label": "#4f5051",
  "--pov-card-muted": "#707274",
  "--pov-card-border": "#aeb1b3",
  "--pov-card-bar": "#303335",
  "--pov-card-service-active": "#8e9091",
  "--pov-header-line": "#66737d",
  "--pov-header-border": "#5f696f",
  "--pov-header-muted": "#768188",
  "--pov-label": "#7a7a7a",
  "--pov-muted": "#6e6e6e",
  "--pov-chip-text": "#1b3f5e",
  "--pov-empty": "#b0b0b0",
};

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: povVariables,
  light: {},
  dark: {},
});
