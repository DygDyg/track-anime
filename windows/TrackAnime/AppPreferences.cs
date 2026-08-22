using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TrackAnime;

public sealed class AppPreferences
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly string _path;
    private PrefData _data;

    public AppPreferences()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TrackAnime");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "preferences.json");
        _data = Load();
    }

    public string? LastSessionHost
    {
        get => _data.LastSessionHost;
        set { _data.LastSessionHost = value; Save(); }
    }

    public ProxyMode ProxyMode
    {
        get => _data.ProxyMode;
        set { _data.ProxyMode = value; Save(); }
    }

    public string ProxyHost
    {
        get => _data.ProxyHost ?? "";
        set { _data.ProxyHost = value; Save(); }
    }

    public int ProxyPort
    {
        get => _data.ProxyPort;
        set { _data.ProxyPort = value; Save(); }
    }

    public string ProxyUsername
    {
        get => _data.ProxyUsername ?? "";
        set { _data.ProxyUsername = value; Save(); }
    }

    public string ProxyPassword
    {
        get => _data.ProxyPassword ?? "";
        set { _data.ProxyPassword = value; Save(); }
    }

    public void SaveProxy(ProxySettings settings)
    {
        _data.ProxyMode = settings.Mode;
        _data.ProxyHost = settings.Host;
        _data.ProxyPort = settings.Port;
        _data.ProxyUsername = settings.Username;
        _data.ProxyPassword = settings.Password;
        Save();
    }

    private PrefData Load()
    {
        try
        {
            if (!File.Exists(_path)) return new PrefData();
            var json = File.ReadAllText(_path);
            return JsonSerializer.Deserialize<PrefData>(json, JsonOptions) ?? new PrefData();
        }
        catch
        {
            return new PrefData();
        }
    }

    private void Save()
    {
        try
        {
            File.WriteAllText(_path, JsonSerializer.Serialize(_data, JsonOptions));
        }
        catch
        {
            // Local prefs must never crash the shell.
        }
    }

    private sealed class PrefData
    {
        public string? LastSessionHost { get; set; }
        public ProxyMode ProxyMode { get; set; } = ProxyMode.Server;
        public string? ProxyHost { get; set; }
        public int ProxyPort { get; set; }
        public string? ProxyUsername { get; set; }
        public string? ProxyPassword { get; set; }
    }
}
