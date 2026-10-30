import 'dart:io';

import 'package:flutter/material.dart';

import 'local_server.dart';
import 'main.dart';
import 'office_page.dart' show buildWebConfig;

/// Desktop (Linux/Windows/macOS): no WebView plugin there, so we serve the
/// bundled office on 127.0.0.1 and open it in the system browser.
class DesktopOfficePage extends StatefulWidget {
  const DesktopOfficePage({super.key});

  @override
  State<DesktopOfficePage> createState() => _DesktopOfficePageState();
}

class _DesktopOfficePageState extends State<DesktopOfficePage> {
  final _server = LocalAssetServer(overrides: {'/config.js': buildWebConfig()});
  String? _url;
  String? _error;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      final port = await _server.start();
      setState(() => _url = 'http://127.0.0.1:$port/index.html');
      await _open();
    } catch (e) {
      setState(() => _error = '$e');
    }
  }

  Future<void> _open() async {
    final url = _url;
    if (url == null) return;
    try {
      if (Platform.isWindows) {
        await Process.run('cmd', ['/c', 'start', '', url]);
      } else if (Platform.isMacOS) {
        await Process.run('open', [url]);
      } else {
        await Process.run('xdg-open', [url]);
      }
    } catch (e) {
      setState(() => _error = 'افتح الرابط يدوياً: $url');
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
      body: Directionality(
        textDirection: TextDirection.rtl,
        child: Container(
          decoration: const BoxDecoration(
            gradient: RadialGradient(colors: [Color(0xFF5A3A26), Color(0xFF2B1F18)], radius: 1.1),
          ),
          alignment: Alignment.center,
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('🏠', style: TextStyle(fontSize: 56)),
            const SizedBox(height: 12),
            const Text('بيت القطط الدافئ', style: TextStyle(color: OfficeColors.cream, fontSize: 26, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(_url == null ? 'جاري التشغيل…' : 'المكتب مفتوح في المتصفح', style: const TextStyle(color: Color(0xFFFBE7C6), fontSize: 16)),
            if (_url != null) ...[
              const SizedBox(height: 6),
              SelectableText(_url!, textDirection: TextDirection.ltr, style: const TextStyle(color: Color(0xFFFBE7C6), fontSize: 13)),
              const SizedBox(height: 18),
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: OfficeColors.teal, minimumSize: const Size(220, 52)),
                onPressed: _open,
                icon: const Icon(Icons.open_in_browser),
                label: const Text('افتح المكتب مرة ثانية'),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: OfficeColors.amber)),
            ],
            const SizedBox(height: 16),
            const Text('خلي هذي النافذة مفتوحة طول ما تستخدم المكتب', style: TextStyle(color: Color(0xFFD9C3A5), fontSize: 13)),
          ]),
        ),
      ),
    );
  }
}
