function boundedDimension(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function region(x, y, width, height) {
  return {x, y, width, height};
}

/** Calculate the fixed shell and flexible transcript/composer regions. */
export function computeLayout({width, height, composerLines = 1} = {}) {
  const screenWidth = boundedDimension(width);
  const screenHeight = boundedDimension(height);
  const tooSmall = screenWidth < 40 || screenHeight < 12;
  if (tooSmall) {
    if (screenHeight === 1) {
      return {width: screenWidth, height: screenHeight, tooSmall,
        header: null, message: region(1, 1, screenWidth, 1), footer: null};
    }
    return {width: screenWidth, height: screenHeight, tooSmall,
      header: region(1, 1, screenWidth, Math.min(1, screenHeight)),
      message: region(1, 2, screenWidth, Math.max(0, screenHeight - 2)),
      footer: region(1, screenHeight, screenWidth, 1)};
  }

  const requestedComposerLines = Number.isFinite(composerLines) ? Math.ceil(composerLines) : 1;
  const composerHeight = Math.max(1, Math.min(requestedComposerLines, 4, screenHeight - 9));
  const historyHeight = screenHeight - composerHeight - 4;
  const historyY = 2;
  const historySeparatorY = historyY + historyHeight;
  const composerY = historySeparatorY + 1;
  const composerSeparatorY = composerY + composerHeight;
  const footerY = composerSeparatorY + 1;
  return {width: screenWidth, height: screenHeight, tooSmall: false,
    header: region(1, 1, screenWidth, 1),
    history: region(1, historyY, screenWidth, historyHeight),
    historySeparator: region(1, historySeparatorY, screenWidth, 1),
    composer: region(1, composerY, screenWidth, composerHeight),
    composerSeparator: region(1, composerSeparatorY, screenWidth, 1),
    footer: region(1, footerY, screenWidth, 1)};
}
