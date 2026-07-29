using System;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public static class TaHttpConnect {
  const int STD_INPUT_HANDLE = -10;
  const int STD_OUTPUT_HANDLE = -11;

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr GetStdHandle(int nStdHandle);

  public static int Main(string[] args) {
    if (args.Length < 6) {
      Console.Error.WriteLine("usage: ta-http-connect.exe <proxyHost> <proxyPort> <user> <pass> <targetHost> <targetPort>");
      return 2;
    }

    string proxyHost = args[0];
    int proxyPort = int.Parse(args[1]);
    string user = args[2] ?? "";
    string pass = args[3] ?? "";
    string targetHost = args[4];
    string targetPort = args[5];

    try {
      using (var client = new TcpClient()) {
        client.NoDelay = true;
        client.Connect(proxyHost, proxyPort);
        NetworkStream net = client.GetStream();

        var sb = new StringBuilder();
        sb.Append("CONNECT ").Append(targetHost).Append(":").Append(targetPort).Append(" HTTP/1.1\r\n");
        sb.Append("Host: ").Append(targetHost).Append(":").Append(targetPort).Append("\r\n");
        sb.Append("Proxy-Connection: Keep-Alive\r\n");
        if (!string.IsNullOrEmpty(user) && user != "-") {
          string token = Convert.ToBase64String(Encoding.ASCII.GetBytes(user + ":" + (pass == "-" ? "" : pass)));
          sb.Append("Proxy-Authorization: Basic ").Append(token).Append("\r\n");
        }
        sb.Append("\r\n");

        byte[] req = Encoding.ASCII.GetBytes(sb.ToString());
        net.Write(req, 0, req.Length);
        net.Flush();

        var header = new StringBuilder();
        int b;
        while ((b = net.ReadByte()) >= 0) {
          header.Append((char)b);
          if (header.Length >= 4 && header.ToString(header.Length - 4, 4) == "\r\n\r\n") break;
          if (header.Length > 8192) throw new Exception("CONNECT response too large");
        }

        string status = header.ToString().Split(new[] { "\r\n" }, StringSplitOptions.None)[0];
        if (status.IndexOf(" 200 ") < 0) {
          Console.Error.WriteLine("Proxy CONNECT failed: " + status);
          return 1;
        }

        // Binary stdio pipes (required for OpenSSH ProxyCommand on Windows).
        var inHandle = new SafeFileHandle(GetStdHandle(STD_INPUT_HANDLE), false);
        var outHandle = new SafeFileHandle(GetStdHandle(STD_OUTPUT_HANDLE), false);
        Stream stdin = new FileStream(inHandle, FileAccess.Read);
        Stream stdout = new FileStream(outHandle, FileAccess.Write);

        var t1 = new Thread(() => Copy(stdin, net));
        var t2 = new Thread(() => Copy(net, stdout));
        t1.IsBackground = true;
        t2.IsBackground = true;
        t1.Start();
        t2.Start();
        t1.Join();
        try { net.Close(); } catch {}
        try { client.Close(); } catch {}
        t2.Join(1000);
      }
      return 0;
    } catch (Exception ex) {
      Console.Error.WriteLine("ta-http-connect: " + ex.Message);
      return 1;
    }
  }

  static void Copy(Stream input, Stream output) {
    var buffer = new byte[16384];
    try {
      int n;
      while ((n = input.Read(buffer, 0, buffer.Length)) > 0) {
        output.Write(buffer, 0, n);
        output.Flush();
      }
    } catch {}
  }
}
