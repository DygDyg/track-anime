using System.Runtime.InteropServices;

namespace TrackAnime;

internal static class BrightnessHelper
{
    private static double? _saved;

    public static void TrySet(double value01)
    {
        try
        {
            var level = (uint)Math.Round(Math.Max(0, Math.Min(1, value01)) * 100.0);
            foreach (var handle in EnumMonitors())
            {
                if (_saved is null && GetPhysicalMonitorBrightness(handle, out var current))
                {
                    _saved = current / 100.0;
                }
                SetPhysicalMonitorBrightness(handle, level);
            }
        }
        catch
        {
            // Optional capability.
        }
    }

    public static double? TryGet()
    {
        try
        {
            foreach (var handle in EnumMonitors())
            {
                if (GetPhysicalMonitorBrightness(handle, out var current))
                {
                    return current / 100.0;
                }
            }
        }
        catch
        {
            // ignore
        }
        return _saved;
    }

    public static void TryClear()
    {
        if (_saved is null) return;
        TrySet(_saved.Value);
        _saved = null;
    }

    private static IEnumerable<IntPtr> EnumMonitors()
    {
        var list = new List<IntPtr>();
        NativeMethods.EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero,
            (hMonitor, _, _, _) =>
            {
                if (NativeMethods.GetNumberOfPhysicalMonitorsFromHMONITOR(hMonitor, out var count) && count > 0)
                {
                    var monitors = new NativeMethods.PhysicalMonitor[count];
                    if (NativeMethods.GetPhysicalMonitorsFromHMONITOR(hMonitor, count, monitors))
                    {
                        foreach (var m in monitors) list.Add(m.Handle);
                    }
                }
                return true;
            }, IntPtr.Zero);
        return list;
    }

    private static bool GetPhysicalMonitorBrightness(IntPtr handle, out uint current)
    {
        current = 0;
        return NativeMethods.GetMonitorBrightness(handle, out _, out current, out _);
    }

    private static void SetPhysicalMonitorBrightness(IntPtr handle, uint value) =>
        NativeMethods.SetMonitorBrightness(handle, value);

    private static class NativeMethods
    {
        public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, IntPtr lprcMonitor, IntPtr dwData);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public struct PhysicalMonitor
        {
            public IntPtr Handle;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
            public string Description;
        }

        [DllImport("user32.dll")]
        public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);

        [DllImport("dxva2.dll", SetLastError = true)]
        public static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint count);

        [DllImport("dxva2.dll", SetLastError = true)]
        public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint count,
            [Out] PhysicalMonitor[] monitors);

        [DllImport("dxva2.dll", SetLastError = true)]
        public static extern bool GetMonitorBrightness(IntPtr hMonitor, out uint min, out uint current, out uint max);

        [DllImport("dxva2.dll", SetLastError = true)]
        public static extern bool SetMonitorBrightness(IntPtr hMonitor, uint brightness);
    }
}
