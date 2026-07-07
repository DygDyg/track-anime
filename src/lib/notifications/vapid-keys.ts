import webpush from "web-push";

export function generateVapidKeyPair(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}
