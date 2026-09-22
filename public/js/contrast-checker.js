'use strict';

window.ContrastChecker = (() => {
  function normalizeHex(value) {
    const hex = String(value || '').trim().replace('#', '');

    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex
        .split('')
        .map((character) => character + character)
        .join('')}`.toUpperCase();
    }

    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `#${hex}`.toUpperCase();
    }

    throw new TypeError(`無效的 HEX 顏色：${value}`);
  }

  function hexToRgb(value) {
    const hex = normalizeHex(value);

    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    };
  }

  function linearize(channel) {
    const value = channel / 255;

    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  }

  function relativeLuminance(value) {
    const { r, g, b } = hexToRgb(value);

    return (
      0.2126 * linearize(r) +
      0.7152 * linearize(g) +
      0.0722 * linearize(b)
    );
  }

  function contrastRatio(foreground, background) {
    const foregroundLuminance = relativeLuminance(foreground);
    const backgroundLuminance = relativeLuminance(background);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);

    return (lighter + 0.05) / (darker + 0.05);
  }

  function evaluate(foreground, background) {
    const ratio = contrastRatio(foreground, background);

    return {
      foreground: normalizeHex(foreground),
      background: normalizeHex(background),
      ratio: Number(ratio.toFixed(2)),
      normalTextAA: ratio >= 4.5,
      normalTextAAA: ratio >= 7,
      largeTextAA: ratio >= 3,
      largeTextAAA: ratio >= 4.5,
      nonTextAA: ratio >= 3,
    };
  }

  function chooseReadableText(background) {
    const blackRatio = contrastRatio('#000000', background);
    const whiteRatio = contrastRatio('#FFFFFF', background);

    return whiteRatio >= blackRatio ? '#FFFFFF' : '#000000';
  }

  return {
    normalizeHex,
    relativeLuminance,
    contrastRatio,
    evaluate,
    chooseReadableText,
  };
})();
