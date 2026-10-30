// Picks the right shell per platform:
//  - Android/iOS: WebView + loopback asset server (office_page.dart)
//  - Linux/Windows/macOS: loopback asset server + system browser (desktop_page.dart)
//  - Web (PWA): the Vite build is embedded as an iframe (web_page.dart)
export 'office_home_io.dart' if (dart.library.js_interop) 'office_home_web.dart';
