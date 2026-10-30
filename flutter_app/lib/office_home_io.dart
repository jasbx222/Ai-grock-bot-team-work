import 'dart:io';

import 'package:flutter/material.dart';

import 'desktop_page.dart';
import 'office_page.dart';

class OfficeHome extends StatelessWidget {
  const OfficeHome({super.key});

  @override
  Widget build(BuildContext context) =>
      (Platform.isAndroid || Platform.isIOS) ? const OfficePage() : const DesktopOfficePage();
}
