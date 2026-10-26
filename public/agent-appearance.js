/** 부모 몸통색보다 밝은 모자 색 반환 */
export function lighterColor(color, amount = 0.58) {
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  const red = mix((color >> 16) & 0xFF);
  const green = mix((color >> 8) & 0xFF);
  const blue = mix(color & 0xFF);
  return (red << 16) | (green << 8) | blue;
}
