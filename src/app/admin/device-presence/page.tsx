import { DevicePresenceSettingsPanel } from "@/components/admin/DevicePresenceSettingsPanel";
import {
  MAX_DEVICE_PRESENCE_TTL_HOURS,
  MIN_DEVICE_PRESENCE_TTL_HOURS,
  getDevicePresenceSettingsDto,
} from "@/lib/admin/device-presence-settings";

export const dynamic = "force-dynamic";

export default async function AdminDevicePresencePage() {
  const settings = await getDevicePresenceSettingsDto();

  return (
    <DevicePresenceSettingsPanel
      initialSettings={settings}
      minTtlHours={MIN_DEVICE_PRESENCE_TTL_HOURS}
      maxTtlHours={MAX_DEVICE_PRESENCE_TTL_HOURS}
    />
  );
}
