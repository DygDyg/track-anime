using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Windows;

namespace TrackAnime;

internal sealed class UpdateManager
{
    private const string ManifestPath = "/downloads/TrackAnimeWindows.json";
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private bool _checkInProgress;
    private bool _updateDialogShown;

    public async Task CheckForUpdateAsync(Uri? loadedUri, Window owner)
    {
        if (_checkInProgress || _updateDialogShown || loadedUri is not { Scheme: "https" }) return;
        if (string.IsNullOrEmpty(loadedUri.Host)) return;
        _checkInProgress = true;
        try
        {
            var manifestUri = new UriBuilder("https", loadedUri.Host) { Path = ManifestPath }.Uri;
            using var response = await _http.GetAsync(manifestUri).ConfigureAwait(true);
            if (!response.IsSuccessStatusCode) return;
            var json = await response.Content.ReadAsStringAsync().ConfigureAwait(true);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("versionCode", out var versionEl) || !versionEl.TryGetInt64(out var available))
            {
                return;
            }
            if (available <= CurrentVersionCode()) return;

            var versionName = root.GetProperty("versionName").GetString() ?? available.ToString();
            var exeUrl = root.GetProperty("exeUrl").GetString()
                ?? throw new InvalidOperationException("exeUrl missing");
            var sha256 = (root.GetProperty("sha256").GetString() ?? "").ToLowerInvariant();
            if (sha256.Length != 64 || sha256.Any(c => c is not (>= '0' and <= '9' or >= 'a' and <= 'f')))
            {
                throw new InvalidOperationException("Invalid checksum");
            }
            if (!exeUrl.StartsWith('/')) throw new InvalidOperationException("exeUrl must be absolute path");

            var resolved = new UriBuilder("https", manifestUri.Host) { Path = exeUrl }.Uri;
            if (!string.Equals(resolved.Host, manifestUri.Host, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("exe host mismatch");
            }

            _updateDialogShown = true;
            var result = MessageBox.Show(
                owner,
                $"Доступна версия {versionName}. Скачать и открыть установщик?",
                "Доступно обновление",
                MessageBoxButton.YesNo,
                MessageBoxImage.Information);
            if (result == MessageBoxResult.Yes)
            {
                await DownloadAndOpenAsync(resolved, sha256).ConfigureAwait(true);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Update check skipped: " + ex.Message);
        }
        finally
        {
            _checkInProgress = false;
        }
    }

    private static long CurrentVersionCode()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        if (version is null) return 1;
        // major*10000 + minor*100 + build  → 1.0.0 => 10000
        return version.Major * 10000L + version.Minor * 100L + Math.Max(version.Build, 0);
    }

    private async Task DownloadAndOpenAsync(Uri exeUri, string expectedSha256)
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TrackAnime",
            "updates");
        Directory.CreateDirectory(dir);
        var target = Path.Combine(dir, "TrackAnime-update.exe");
        var partial = target + ".part";

        await using (var remote = await _http.GetStreamAsync(exeUri).ConfigureAwait(true))
        await using (var local = File.Create(partial))
        {
            await remote.CopyToAsync(local).ConfigureAwait(true);
        }

        await using (var stream = File.OpenRead(partial))
        {
            var hash = Convert.ToHexString(await SHA256.HashDataAsync(stream).ConfigureAwait(true)).ToLowerInvariant();
            if (!string.Equals(hash, expectedSha256, StringComparison.Ordinal))
            {
                File.Delete(partial);
                throw new InvalidOperationException("Checksum mismatch");
            }
        }

        if (File.Exists(target)) File.Delete(target);
        File.Move(partial, target);
        Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
    }

    public void Dispose() => _http.Dispose();
}
