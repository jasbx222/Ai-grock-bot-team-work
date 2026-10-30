import 'dart:io';

import 'package:flutter/services.dart';

/// Serves the bundled web build (assets/web/**) on 127.0.0.1 so the 3D office
/// runs fully offline inside the WebView (ES modules + fetch need http://).
class LocalAssetServer {
  LocalAssetServer({this.overrides = const {}});

  /// Paths served from memory instead of the bundle (e.g. a generated /config.js).
  final Map<String, String> overrides;

  HttpServer? _server;

  int get port => _server?.port ?? 0;

  static const _types = {
    'html': 'text/html; charset=utf-8',
    'js': 'text/javascript; charset=utf-8',
    'css': 'text/css; charset=utf-8',
    'json': 'application/json; charset=utf-8',
    'ttf': 'font/ttf',
    'png': 'image/png',
    'svg': 'image/svg+xml',
  };

  Future<int> start() async {
    if (_server != null) return port;
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server = server;
    server.listen((HttpRequest req) async {
      var path = Uri.decodeComponent(req.uri.path);
      if (path.isEmpty || path == '/') path = '/index.html';
      if (path.contains('..')) {
        req.response.statusCode = HttpStatus.forbidden;
        await req.response.close();
        return;
      }
      final override = overrides[path];
      if (override != null) {
        final ext = path.split('.').last.toLowerCase();
        req.response.headers
          ..set(HttpHeaders.contentTypeHeader, _types[ext] ?? 'text/plain; charset=utf-8')
          ..set(HttpHeaders.cacheControlHeader, 'no-store');
        req.response.write(override);
        await req.response.close();
        return;
      }
      try {
        final data = await rootBundle.load('assets/web$path');
        final ext = path.split('.').last.toLowerCase();
        req.response.headers
          ..set(HttpHeaders.contentTypeHeader, _types[ext] ?? 'application/octet-stream')
          ..set(HttpHeaders.cacheControlHeader, 'no-store');
        req.response.add(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
      } catch (_) {
        req.response.statusCode = HttpStatus.notFound;
      }
      await req.response.close();
    });
    return server.port;
  }

  Future<void> stop() async {
    await _server?.close(force: true);
    _server = null;
  }
}
