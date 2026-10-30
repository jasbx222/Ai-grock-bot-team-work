import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'local_server.dart';
import 'main.dart';

/// Optional: point the in-page chat and status at a real backend later.
/// Leave null to keep the demo mode (replies are labelled «ردّ تجريبي»).
const String? kChatEndpoint = null;
const String? kStatusUrl = null;

class OfficePage extends StatefulWidget {
  const OfficePage({super.key});

  @override
  State<OfficePage> createState() => _OfficePageState();
}

class _OfficePageState extends State<OfficePage> {
  final _server = LocalAssetServer();
  WebViewController? _controller;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      final port = await _server.start();
      final config = <String>[
        if (kChatEndpoint != null) "chatEndpoint:'$kChatEndpoint'",
        if (kStatusUrl != null) "statusUrl:'$kStatusUrl'",
      ].join(',');
      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(OfficeColors.night)
        ..addJavaScriptChannel('FlutterBridge', onMessageReceived: (m) => debugPrint('web: ${m.message}'))
        ..setNavigationDelegate(NavigationDelegate(
          onPageStarted: (_) {
            if (config.isNotEmpty) {
              _controller?.runJavaScript('window.AGENT_OFFICE_CONFIG={$config};');
            }
          },
          onPageFinished: (_) => setState(() => _loading = false),
          onWebResourceError: (e) {
            if (e.isForMainFrame ?? true) setState(() => _error = e.description);
          },
        ))
        ..loadRequest(Uri.parse('http://127.0.0.1:$port/index.html'));
      setState(() => _controller = controller);
    } catch (e) {
      setState(() => _error = '$e');
    }
  }

  @override
  void dispose() {
    _server.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Stack(children: [
          if (_controller != null) WebViewWidget(controller: _controller!),
          if (_loading && _error == null) const _Splash(),
          if (_error != null) _ErrorView(message: _error!, onRetry: () {
            setState(() { _error = null; _loading = true; });
            _controller?.reload();
          }),
        ]),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: RadialGradient(colors: [Color(0xFF5A3A26), Color(0xFF2B1F18)], radius: 1.1),
      ),
      alignment: Alignment.center,
      child: const Column(mainAxisSize: MainAxisSize.min, children: [
        Text('☕', style: TextStyle(fontSize: 48)),
        SizedBox(height: 12),
        Text('مكتب الوكلاء', style: TextStyle(color: OfficeColors.cream, fontSize: 24, fontWeight: FontWeight.w800)),
        SizedBox(height: 6),
        Text('جاري تجهيز المكتب الدافئ…', style: TextStyle(color: Color(0xFFFBE7C6), fontSize: 15)),
        SizedBox(height: 20),
        SizedBox(width: 28, height: 28, child: CircularProgressIndicator(color: OfficeColors.amber, strokeWidth: 3)),
      ]),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: OfficeColors.cream,
      padding: const EdgeInsets.all(24),
      alignment: Alignment.center,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline, color: OfficeColors.terracotta, size: 48),
        const SizedBox(height: 12),
        const Text('تعذّر فتح المكتب', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: OfficeColors.brown)),
        const SizedBox(height: 8),
        Text(message, textAlign: TextAlign.center, style: const TextStyle(color: OfficeColors.brown)),
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: OfficeColors.teal),
          onPressed: onRetry,
          child: const Text('إعادة المحاولة'),
        ),
      ]),
    );
  }
}
