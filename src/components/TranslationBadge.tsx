import { resolveTranslationStudioId } from "@/lib/translation-colors";

type Props = {
  name: string;
  className?: string;
};

export function TranslationBadge({ name, className = "" }: Props) {
  const studioId = resolveTranslationStudioId(name);

  if (!studioId) {
    return <span className={`text-muted ${className}`.trim()}>{name}</span>;
  }

  return (
    <span
      className={`translation-badge inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-xs font-medium ${className}`.trim()}
      data-studio={studioId}
    >
      {name}
    </span>
  );
}
