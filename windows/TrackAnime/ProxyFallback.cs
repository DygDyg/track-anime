using System.IO;
using System.Text;

namespace TrackAnime;

public enum ProxyMode
{
    None,
    Server,
    Manual,
}

public sealed record ProxySettings(ProxyMode Mode, string Host, int Port, string Username, string Password);

internal sealed class ProxyDeepLinkResult
{
    public ProxySettings? Settings { get; init; }
    public string? Error { get; init; }
    public bool IsOk => Settings is not null && Error is null;
}

internal static class ProxyFallback
{
    public static ProxySettings Resolve(AppPreferences preferences, LocalProperties local)
    {
        return preferences.ProxyMode switch
        {
            ProxyMode.Manual => new ProxySettings(
                ProxyMode.Manual,
                preferences.ProxyHost.Trim(),
                preferences.ProxyPort,
                preferences.ProxyUsername,
                preferences.ProxyPassword),
            ProxyMode.Server => new ProxySettings(
                ProxyMode.Server,
                local.ProxyHost,
                local.ProxyPort,
                local.ProxyUsername,
                local.ProxyPassword),
            _ => new ProxySettings(ProxyMode.None, "", 0, "", ""),
        };
    }

    public static bool IsConfigured(ProxySettings settings) =>
        settings.Mode != ProxyMode.None
        && !string.IsNullOrWhiteSpace(settings.Host)
        && settings.Port is > 0 and <= 65535;

    public static string? BuildBrowserArguments(ProxySettings settings)
    {
        if (!IsConfigured(settings)) return null;
        return $"--proxy-server=http://{settings.Host}:{settings.Port}";
    }

    public static ProxyDeepLinkResult ParseDeepLink(Uri uri)
    {
        if (!string.Equals(uri.Scheme, "taproxy", StringComparison.OrdinalIgnoreCase))
        {
            return new ProxyDeepLinkResult { Error = "Неверная ссылка прокси." };
        }

        var host = uri.Host;
        if (string.IsNullOrWhiteSpace(host))
        {
            return new ProxyDeepLinkResult { Error = "Укажите адрес прокси в ссылке." };
        }

        var hostLower = host.ToLowerInvariant();
        if (hostLower is "clear" or "none" or "off" or "disable")
        {
            return new ProxyDeepLinkResult { Settings = new ProxySettings(ProxyMode.None, "", 0, "", "") };
        }
        if (hostLower is "server" or "default")
        {
            return new ProxyDeepLinkResult { Settings = new ProxySettings(ProxyMode.Server, "", 0, "", "") };
        }

        var port = uri.Port;
        if (port < 0)
        {
            var portQuery = FirstQuery(uri, "port");
            if (portQuery is not null && int.TryParse(portQuery.Trim(), out var parsed))
            {
                port = parsed;
            }
        }
        if (port is < 1 or > 65535)
        {
            return new ProxyDeepLinkResult { Error = "Укажите порт прокси от 1 до 65535." };
        }

        var username = "";
        var password = "";
        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            var separator = uri.UserInfo.IndexOf(':');
            if (separator < 0)
            {
                username = Uri.UnescapeDataString(uri.UserInfo);
            }
            else
            {
                username = Uri.UnescapeDataString(uri.UserInfo[..separator]);
                password = Uri.UnescapeDataString(uri.UserInfo[(separator + 1)..]);
            }
        }
        var queryUser = FirstQuery(uri, "user", "username");
        var queryPass = FirstQuery(uri, "pass", "password");
        if (queryUser is not null) username = queryUser;
        if (queryPass is not null) password = queryPass;

        return new ProxyDeepLinkResult
        {
            Settings = new ProxySettings(ProxyMode.Manual, host.Trim(), port, username, password),
        };
    }

    public static string? BuildDeepLink(string host, int port, string username, string password)
    {
        var trimmedHost = host.Trim();
        if (string.IsNullOrEmpty(trimmedHost) || port is < 1 or > 65535) return null;
        var user = username.Trim();
        var pass = password ?? "";
        if (!string.IsNullOrEmpty(user) || !string.IsNullOrEmpty(pass))
        {
            return $"taproxy://{Uri.EscapeDataString(user)}:{Uri.EscapeDataString(pass)}@{trimmedHost}:{port}";
        }
        return $"taproxy://{trimmedHost}:{port}";
    }

    private static string? FirstQuery(Uri uri, params string[] keys)
    {
        var query = uri.Query;
        if (string.IsNullOrEmpty(query)) return null;
        var parts = query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries);
        foreach (var key in keys)
        {
            foreach (var part in parts)
            {
                var eq = part.IndexOf('=');
                var name = eq < 0 ? part : part[..eq];
                if (!string.Equals(Uri.UnescapeDataString(name), key, StringComparison.OrdinalIgnoreCase)) continue;
                return eq < 0 ? "" : Uri.UnescapeDataString(part[(eq + 1)..]);
            }
        }
        return null;
    }
}

public sealed class LocalProperties
{
    public string ProxyHost { get; private set; } = "";
    public int ProxyPort { get; private set; }
    public string ProxyUsername { get; private set; } = "";
    public string ProxyPassword { get; private set; } = "";

    public static LocalProperties Load()
    {
        var result = new LocalProperties();
        foreach (var candidate in CandidatePaths())
        {
            if (!File.Exists(candidate)) continue;
            try
            {
                foreach (var rawLine in File.ReadAllLines(candidate, Encoding.UTF8))
                {
                    var line = rawLine.Trim();
                    if (line.Length == 0 || line.StartsWith('#') || line.StartsWith('!')) continue;
                    var eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    var key = line[..eq].Trim();
                    var value = line[(eq + 1)..].Trim();
                    switch (key)
                    {
                        case "trackAnimeProxyHost":
                            result.ProxyHost = value;
                            break;
                        case "trackAnimeProxyPort" when int.TryParse(value, out var port):
                            result.ProxyPort = port;
                            break;
                        case "trackAnimeProxyUsername":
                            result.ProxyUsername = value;
                            break;
                        case "trackAnimeProxyPassword":
                            result.ProxyPassword = value;
                            break;
                    }
                }
                break;
            }
            catch
            {
                // Ignore unreadable local.properties.
            }
        }
        return result;
    }

    private static IEnumerable<string> CandidatePaths()
    {
        var baseDir = AppContext.BaseDirectory;
        yield return Path.Combine(baseDir, "local.properties");
        yield return Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "local.properties"));
        yield return Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "local.properties"));
        yield return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "local.properties");
    }
}
