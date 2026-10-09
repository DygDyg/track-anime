export const DEPLOY_DISCORD_NOTIFY_USERNAME = "Track-Amine";

export type DeployDiscordSettingsDto = {
  webhookConfigured: boolean;
  webhookUrlMasked: string | null;
  notifyStarted: boolean;
  notifyFinished: boolean;
  username: string;
  avatarUrl: string;
  updatedAt: string;
};

/** JSON for bash `notify-deploy-discord.sh` (survives app stop during rebuild). */
export type DeployDiscordNotifyFile = {
  version: 1;
  webhookUrl: string;
  notifyStarted: boolean;
  notifyFinished: boolean;
  username: string;
  avatarUrl: string;
  updatedAt: string;
};
