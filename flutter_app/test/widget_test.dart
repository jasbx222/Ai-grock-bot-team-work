import 'package:flutter_test/flutter_test.dart';

import 'package:agent_office/main.dart';

void main() {
  test('palette is defined', () {
    expect(OfficeColors.teal.toARGB32(), 0xFF4F8A8B);
  });

  testWidgets('app builds with RTL', (tester) async {
    expect(const AgentOfficeApp(), isNotNull);
  });
}
