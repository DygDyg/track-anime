/** URL для iframe Kodik (//kodikplayer.com/... → https:) */
export function toKodikPlayerEmbedUrl(link: string): string {
  if (link.startsWith("//")) return `https:${link}`;
  return link;
}
