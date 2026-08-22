using System.Text.Json;
using Microsoft.Web.WebView2.Core;

namespace TrackAnime;

internal static class SiteThemeReader
{
    private const string ReadScript = """
        (function(){
          try {
            var theme = localStorage.getItem('track-anime-theme') || document.documentElement.getAttribute('data-theme') || 'dark';
            if (theme !== 'light' && theme !== 'dark') theme = 'dark';
            var accent = 'blue';
            try {
              var raw = localStorage.getItem('track-anime-site-settings');
              if (raw) {
                var s = JSON.parse(raw);
                if (s && typeof s.accentPreset === 'string') accent = s.accentPreset;
              }
            } catch (_) {}
            var attrAccent = document.documentElement.getAttribute('data-accent');
            if (attrAccent) accent = attrAccent;
            return JSON.stringify({ theme: theme, accent: accent });
          } catch (e) {
            return JSON.stringify({ theme: 'dark', accent: 'blue' });
          }
        })()
        """;

    private const string WatchScript = """
        (() => {
          if (window.__taThemeWatchInstalled) return;
          window.__taThemeWatchInstalled = true;
          const post = () => {
            try {
              var theme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('track-anime-theme') || 'dark';
              var accent = document.documentElement.getAttribute('data-accent') || 'blue';
              try {
                var raw = localStorage.getItem('track-anime-site-settings');
                if (raw) {
                  var s = JSON.parse(raw);
                  if (s && typeof s.accentPreset === 'string') accent = s.accentPreset;
                }
              } catch (_) {}
              chrome.webview.postMessage(JSON.stringify({ type: 'themeChanged', theme, accent }));
            } catch (_) {}
          };
          try {
            new MutationObserver(post).observe(document.documentElement, {
              attributes: true,
              attributeFilter: ['data-theme', 'data-accent']
            });
          } catch (_) {}
          window.addEventListener('storage', post);
          document.addEventListener('visibilitychange', () => { if (!document.hidden) post(); });
          setTimeout(post, 0);
        })();
        """;

    public static async Task<SiteThemeSnapshot> ReadAsync(CoreWebView2? core)
    {
        if (core is null) return SiteThemeSnapshot.Dark;
        try
        {
            var raw = await core.ExecuteScriptAsync(ReadScript);
            return Parse(raw);
        }
        catch
        {
            return SiteThemeSnapshot.Dark;
        }
    }

    public static SiteThemeSnapshot Parse(string? executeScriptResult)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(executeScriptResult)) return SiteThemeSnapshot.Dark;
            // ExecuteScriptAsync returns a JSON-encoded string.
            var json = JsonSerializer.Deserialize<string>(executeScriptResult) ?? executeScriptResult;
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var theme = root.TryGetProperty("theme", out var t) ? t.GetString() : "dark";
            var accent = root.TryGetProperty("accent", out var a) ? a.GetString() : "blue";
            return SiteThemeSnapshot.FromSite(theme, accent);
        }
        catch
        {
            return SiteThemeSnapshot.Dark;
        }
    }

    public static Task InstallWatcherAsync(CoreWebView2 core) =>
        core.AddScriptToExecuteOnDocumentCreatedAsync(WatchScript);
}
