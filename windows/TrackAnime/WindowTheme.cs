using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace TrackAnime;

internal static class WindowTheme
{
    private const int DwmwaUseImmersiveDarkMode = 20;
    private const int DwmwaUseImmersiveDarkModeBefore20H1 = 19;
    private const int DwmwaBorderColor = 34;
    private const int DwmwaCaptionColor = 35;
    private const int DwmwaTextColor = 36;
    private const uint DwmwaColorNone = 0xFFFFFFFE;

    public static void Apply(Window window, SiteThemeSnapshot theme)
    {
        if (window is null) return;
        void ApplyNow()
        {
            var hwnd = new WindowInteropHelper(window).Handle;
            if (hwnd == IntPtr.Zero)
            {
                window.SourceInitialized += (_, _) => Apply(window, theme);
                return;
            }

            var dark = theme.IsDark;
            var useDark = dark ? 1 : 0;
            _ = DwmSetWindowAttribute(hwnd, DwmwaUseImmersiveDarkMode, ref useDark, sizeof(int));
            _ = DwmSetWindowAttribute(hwnd, DwmwaUseImmersiveDarkModeBefore20H1, ref useDark, sizeof(int));

            // COLORREF is 0x00BBGGRR
            var caption = ToColorRef(theme.Caption);
            var text = ToColorRef(theme.CaptionText);
            var border = ToColorRef(theme.Border);
            _ = DwmSetWindowAttribute(hwnd, DwmwaCaptionColor, ref caption, sizeof(uint));
            _ = DwmSetWindowAttribute(hwnd, DwmwaTextColor, ref text, sizeof(uint));
            _ = DwmSetWindowAttribute(hwnd, DwmwaBorderColor, ref border, sizeof(uint));
        }

        if (window.Dispatcher.CheckAccess()) ApplyNow();
        else window.Dispatcher.Invoke(ApplyNow);
    }

    public static void ClearCustomColors(Window window)
    {
        var hwnd = new WindowInteropHelper(window).Handle;
        if (hwnd == IntPtr.Zero) return;
        var none = DwmwaColorNone;
        _ = DwmSetWindowAttribute(hwnd, DwmwaCaptionColor, ref none, sizeof(uint));
        _ = DwmSetWindowAttribute(hwnd, DwmwaTextColor, ref none, sizeof(uint));
        _ = DwmSetWindowAttribute(hwnd, DwmwaBorderColor, ref none, sizeof(uint));
    }

    private static uint ToColorRef(Color color) =>
        (uint)(color.R | (color.G << 8) | (color.B << 16));

    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref uint value, int size);
}

public readonly record struct SiteThemeSnapshot(bool IsDark, Color Caption, Color CaptionText, Color Border, Color Accent)
{
    public static SiteThemeSnapshot Dark { get; } = new(
        true,
        Color.FromRgb(0x0C, 0x0E, 0x14),
        Color.FromRgb(0xEE, 0xF0, 0xF4),
        Color.FromRgb(0x25, 0x2B, 0x3B),
        Color.FromRgb(0x6C, 0x8C, 0xFF));

    public static SiteThemeSnapshot Light { get; } = new(
        false,
        Color.FromRgb(0xF3, 0xF5, 0xFA),
        Color.FromRgb(0x12, 0x18, 0x26),
        Color.FromRgb(0xDC, 0xE3, 0xEF),
        Color.FromRgb(0x4A, 0x6C, 0xF7));

    public static SiteThemeSnapshot FromSite(string? theme, string? accentPreset)
    {
        var dark = !string.Equals(theme, "light", StringComparison.OrdinalIgnoreCase);
        var baseTheme = dark ? Dark : Light;
        var accent = ResolveAccent(dark, accentPreset);
        return baseTheme with { Accent = accent, Border = accent };
    }

    private static Color ResolveAccent(bool dark, string? preset) => preset?.ToLowerInvariant() switch
    {
        "purple" => Color.FromRgb(0x9C, 0x6C, 0xFF),
        "green" => Color.FromRgb(0x34, 0xD3, 0x99),
        "rose" => Color.FromRgb(0xFB, 0x71, 0x85),
        "amber" => Color.FromRgb(0xFB, 0xBF, 0x24),
        _ => dark ? Color.FromRgb(0x6C, 0x8C, 0xFF) : Color.FromRgb(0x4A, 0x6C, 0xF7),
    };
}
