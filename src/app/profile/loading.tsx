export default function ProfileLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4" aria-busy="true" aria-label="Загрузка профиля">
      <p className="text-sm text-muted">Переход в профиль…</p>
    </div>
  );
}
