import 'package:go_router/go_router.dart';
import '../screens/shared/splash_screen.dart';
import '../screens/shared/login_screen.dart';
import '../screens/shared/register_screen.dart';
import '../screens/shared/home_screen.dart';
import '../screens/shared/profile_screen.dart';
import '../screens/driver/driver_dashboard.dart';
import '../screens/driver/taxi_screen.dart';
import '../screens/driver/driving_school_screen.dart';
import '../screens/driver/transport_screen.dart';
import '../screens/driver/drone_delivery_screen.dart';
import '../screens/driver/trip_history_screen.dart';
import '../screens/driver/earnings_screen.dart';
import '../screens/driver/map_screen.dart';
import '../screens/verify/verify_dashboard.dart';
import '../screens/verify/call_center_screen.dart';
import '../screens/verify/video_call_screen.dart';
import '../screens/verify/id_verification_screen.dart';
import '../screens/verify/driver_verification_screen.dart';
import '../screens/verify/supervision_screen.dart';
import '../screens/shared/blockchain_wallet_screen.dart';

class AppRouter {
  static final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
      GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      GoRoute(path: '/wallet', builder: (_, __) => const BlockchainWalletScreen()),

      // Driver Platform Routes
      GoRoute(path: '/driver', builder: (_, __) => const DriverDashboard()),
      GoRoute(path: '/driver/taxi', builder: (_, __) => const TaxiScreen()),
      GoRoute(path: '/driver/school', builder: (_, __) => const DrivingSchoolScreen()),
      GoRoute(path: '/driver/transport', builder: (_, __) => const TransportScreen()),
      GoRoute(path: '/driver/drone', builder: (_, __) => const DroneDeliveryScreen()),
      GoRoute(path: '/driver/trips', builder: (_, __) => const TripHistoryScreen()),
      GoRoute(path: '/driver/earnings', builder: (_, __) => const EarningsScreen()),
      GoRoute(path: '/driver/map', builder: (_, __) => const MapScreen()),

      // Verify ID Routes
      GoRoute(path: '/verify', builder: (_, __) => const VerifyDashboard()),
      GoRoute(path: '/verify/call-center', builder: (_, __) => const CallCenterScreen()),
      GoRoute(path: '/verify/video-call', builder: (_, __) => const VideoCallScreen()),
      GoRoute(path: '/verify/id', builder: (_, __) => const IdVerificationScreen()),
      GoRoute(path: '/verify/driver', builder: (_, __) => const DriverVerificationScreen()),
      GoRoute(path: '/verify/supervision', builder: (_, __) => const SupervisionScreen()),
    ],
  );
}
