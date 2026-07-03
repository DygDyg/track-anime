#!/usr/bin/env tsx
/**
 * Генерация VAPID-ключей для Web Push.
 * Запуск: npm run notifications:generate-vapid
 */
import { generateVapidKeyPair } from "@/lib/notifications/vapid-keys";

const keys = generateVapidKeyPair();

console.log("Добавьте в .env:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:you@example.com");
