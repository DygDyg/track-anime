using System.Runtime.InteropServices;

namespace TrackAnime;

internal sealed class KeepAwakeService : IDisposable
{
    private IntPtr _handle = IntPtr.Zero;

    public void SetEnabled(bool enabled)
    {
        if (enabled)
        {
            if (_handle != IntPtr.Zero) return;
            _handle = NativeMethods.PowerCreateRequest(new NativeMethods.ReasonContext
            {
                Version = NativeMethods.PowerRequestContextVersion,
                Flags = NativeMethods.PowerRequestContextSimpleString,
                SimpleReasonString = "Track Anime playback",
            });
            if (_handle != IntPtr.Zero)
            {
                NativeMethods.PowerSetRequest(_handle, NativeMethods.PowerRequestDisplayRequired);
            }
            return;
        }

        Clear();
    }

    private void Clear()
    {
        if (_handle == IntPtr.Zero) return;
        NativeMethods.PowerClearRequest(_handle, NativeMethods.PowerRequestDisplayRequired);
        NativeMethods.CloseHandle(_handle);
        _handle = IntPtr.Zero;
    }

    public void Dispose() => Clear();

    private static class NativeMethods
    {
        public const uint PowerRequestContextVersion = 0;
        public const uint PowerRequestContextSimpleString = 0x1;
        public const int PowerRequestDisplayRequired = 0;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct ReasonContext
        {
            public uint Version;
            public uint Flags;
            [MarshalAs(UnmanagedType.LPWStr)]
            public string SimpleReasonString;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        public static extern IntPtr PowerCreateRequest(ref ReasonContext context);

        // Overload for by-value marshaling convenience
        public static IntPtr PowerCreateRequest(ReasonContext context) => PowerCreateRequest(ref context);

        [DllImport("kernel32.dll")]
        public static extern bool PowerSetRequest(IntPtr powerRequest, int requestType);

        [DllImport("kernel32.dll")]
        public static extern bool PowerClearRequest(IntPtr powerRequest, int requestType);

        [DllImport("kernel32.dll")]
        public static extern bool CloseHandle(IntPtr handle);
    }
}
