using System.Windows;

namespace TrackAnime;

public partial class App : Application
{
    private MainWindow? _main;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ShutdownMode = ShutdownMode.OnMainWindowClose;
        _main = new MainWindow();
        MainWindow = _main;
        _main.Show();

        foreach (var arg in e.Args)
        {
            if (Uri.TryCreate(arg, UriKind.Absolute, out var uri)
                && (string.Equals(uri.Scheme, "trackanime", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(uri.Scheme, "taproxy", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase)))
            {
                _main.HandleExternalUri(uri);
                break;
            }
        }
    }
}
