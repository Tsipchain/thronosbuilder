import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'config/app_config.dart';
import 'config/routes.dart';
import 'config/theme.dart';
import 'providers/auth_provider.dart';
import 'providers/driver_provider.dart';
import 'providers/verify_provider.dart';
import 'providers/blockchain_provider.dart';
import 'providers/call_center_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  await AppConfig.init();
  runApp(const ThronosApp());
}

class ThronosApp extends StatelessWidget {
  const ThronosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => DriverProvider()),
        ChangeNotifierProvider(create: (_) => VerifyProvider()),
        ChangeNotifierProvider(create: (_) => BlockchainProvider()),
        ChangeNotifierProvider(create: (_) => CallCenterProvider()),
      ],
      child: MaterialApp.router(
        title: 'Thronos Driver & Verify',
        debugShowCheckedModeBanner: false,
        theme: ThronosTheme.light,
        darkTheme: ThronosTheme.dark,
        themeMode: ThemeMode.system,
        routerConfig: AppRouter.router,
      ),
    );
  }
}
