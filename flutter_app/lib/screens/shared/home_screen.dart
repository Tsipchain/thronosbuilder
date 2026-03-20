import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/blockchain_provider.dart';
import '../../config/theme.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    context.read<BlockchainProvider>().loadWallet();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final blockchain = context.watch<BlockchainProvider>();
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Thronos'),
        actions: [
          IconButton(
            icon: const Icon(Icons.account_balance_wallet),
            onPressed: () => context.go('/wallet'),
          ),
          IconButton(
            icon: const Icon(Icons.person),
            onPressed: () => context.go('/profile'),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Welcome Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: ThronosTheme.primaryColor,
                      child: Text(
                        (user?.fullName ?? 'U')[0].toUpperCase(),
                        style: const TextStyle(fontSize: 24, color: Colors.white),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Welcome, ${user?.fullName ?? 'User'}',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Icon(
                                user?.isVerified == true ? Icons.verified : Icons.pending,
                                size: 16,
                                color: user?.isVerified == true ? ThronosTheme.successGreen : ThronosTheme.warningOrange,
                              ),
                              const SizedBox(width: 4),
                              Text(user?.isVerified == true ? 'Verified' : 'Pending Verification'),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Wallet Balance
            Card(
              color: ThronosTheme.primaryColor,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('THR Balance', style: TextStyle(color: Colors.white70)),
                        const SizedBox(height: 4),
                        Text(
                          '${blockchain.balance.toStringAsFixed(2)} THR',
                          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                      ],
                    ),
                    const Icon(Icons.currency_bitcoin, size: 40, color: ThronosTheme.accentGold),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Main Modules
            const Text('Platform Modules', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),

            // Driver Platform
            _buildModuleCard(
              context,
              title: 'Driver Platform',
              subtitle: 'Taxi, Schools, Transport, Drone',
              icon: Icons.directions_car,
              color: ThronosTheme.taxiYellow,
              route: '/driver',
            ),
            const SizedBox(height: 12),

            // Verify ID
            _buildModuleCard(
              context,
              title: 'Thronos Verify ID',
              subtitle: 'Call Center & Verification',
              icon: Icons.verified_user,
              color: ThronosTheme.secondaryColor,
              route: '/verify',
            ),
            const SizedBox(height: 24),

            // Quick Actions
            const Text('Quick Access', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 4,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              children: [
                _buildQuickAction(context, Icons.local_taxi, 'Taxi', ThronosTheme.taxiYellow, '/driver/taxi'),
                _buildQuickAction(context, Icons.school, 'Schools', ThronosTheme.schoolPurple, '/driver/school'),
                _buildQuickAction(context, Icons.local_shipping, 'Transport', ThronosTheme.transportGreen, '/driver/transport'),
                _buildQuickAction(context, Icons.flight, 'Drone', ThronosTheme.droneBlue, '/driver/drone'),
                _buildQuickAction(context, Icons.headset_mic, 'Call Center', Colors.deepOrange, '/verify/call-center'),
                _buildQuickAction(context, Icons.video_call, 'Video KYC', Colors.teal, '/verify/video-call'),
                _buildQuickAction(context, Icons.badge, 'Verify ID', Colors.indigo, '/verify/id'),
                _buildQuickAction(context, Icons.supervisor_account, 'Supervise', Colors.brown, '/verify/supervision'),
              ],
            ),
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (i) {
          setState(() => _currentIndex = i);
          switch (i) {
            case 0: context.go('/home'); break;
            case 1: context.go('/driver'); break;
            case 2: context.go('/verify'); break;
            case 3: context.go('/wallet'); break;
          }
        },
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.directions_car), label: 'Driver'),
          BottomNavigationBarItem(icon: Icon(Icons.verified_user), label: 'Verify'),
          BottomNavigationBarItem(icon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
        ],
      ),
    );
  }

  Widget _buildModuleCard(BuildContext context, {
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required String route,
  }) {
    return Card(
      child: InkWell(
        onTap: () => context.go(route),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 32, color: color),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    Text(subtitle, style: TextStyle(color: Colors.grey[600])),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQuickAction(BuildContext context, IconData icon, String label, Color color, String route) {
    return InkWell(
      onTap: () => context.go(route),
      borderRadius: BorderRadius.circular(12),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(height: 6),
          Text(label, style: const TextStyle(fontSize: 11), overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
