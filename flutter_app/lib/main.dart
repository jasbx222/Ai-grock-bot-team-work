import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'office_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));
  runApp(const AgentOfficeApp());
}

/// Cozy winter palette: cream, terracotta, amber, brown + muted teal accent.
class OfficeColors {
  static const cream = Color(0xFFF7EFE4);
  static const terracotta = Color(0xFFC8693F);
  static const amber = Color(0xFFD98E32);
  static const brown = Color(0xFF3B2A20);
  static const night = Color(0xFF0E1A33);
  static const teal = Color(0xFF4F8A8B);
}

class AgentOfficeApp extends StatelessWidget {
  const AgentOfficeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'مكتب الوكلاء',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar'),
      builder: (context, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: OfficeColors.teal, surface: OfficeColors.cream),
        scaffoldBackgroundColor: OfficeColors.night,
      ),
      home: const OfficePage(),
    );
  }
}
