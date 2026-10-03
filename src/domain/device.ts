/** A friendly name for this device, from the user agent (SPEC Phone and PC). */
export function detectDeviceName(userAgent: string, maxTouchPoints = 0): string {
  const ua = userAgent;
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux PC";
  return "device";
}
