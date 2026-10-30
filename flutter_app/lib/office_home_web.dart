import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

/// Flutter web / PWA: the office itself is the Vite build copied to web/app/.
class OfficeHome extends StatelessWidget {
  const OfficeHome({super.key});

  static bool _registered = false;

  @override
  Widget build(BuildContext context) {
    if (!_registered) {
      _registered = true;
      ui_web.platformViewRegistry.registerViewFactory('agent-office-frame', (int _) {
        final f = web.HTMLIFrameElement()
          ..src = 'app/index.html'
          ..style.border = 'none'
          ..style.width = '100%'
          ..style.height = '100%'
          ..allow = 'autoplay; fullscreen';
        return f;
      });
    }
    return const Scaffold(body: HtmlElementView(viewType: 'agent-office-frame'));
  }
}
