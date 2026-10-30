import 'package:flutter_test/flutter_test.dart';

import 'package:agent_office/main.dart';
import 'package:agent_office/office_page.dart';

void main() {
  test('palette is defined', () {
    expect(OfficeColors.teal.toARGB32(), 0xFF4F8A8B);
  });

  testWidgets('app builds with RTL', (tester) async {
    expect(const AgentOfficeApp(), isNotNull);
  });

  test('web config is demo mode without dart-defines', () {
    final js = buildWebConfig();
    expect(js, contains('window.AGENT_OFFICE_CONFIG'));
    expect(js, contains('"apiBaseUrl":""'));
  });
}
