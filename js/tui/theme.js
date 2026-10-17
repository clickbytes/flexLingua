const palette = {
  neutral: {color: 'white'},
  muted: {color: 'brightblack'},
  accent: {color: 'cyan', bold: true},
  error: {color: 'red', bold: true},
  warning: {color: 'yellow'}
};

export function styleFor(tone = 'neutral') {
  return {...(palette[tone] ?? palette.neutral)};
}
