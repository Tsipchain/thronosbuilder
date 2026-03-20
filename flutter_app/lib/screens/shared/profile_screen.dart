import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../config/theme.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 50,
                  backgroundColor: ThronosTheme.primaryColor,
                  child: Text(
                    (user?.fullName ?? 'U')[0].toUpperCase(),
                    style: const TextStyle(fontSize: 36, color: Colors.white),
                  ),
                ),
                const SizedBox(height: 12),
                Text(user?.fullName ?? '', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Chip(
                  label: Text(user?.role.value.replaceAll('_', ' ').toUpperCase() ?? ''),
                  backgroundColor: ThronosTheme.secondaryColor.withValues(alpha: 0.15),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _tile(Icons.email, 'Email', user?.email ?? ''),
          _tile(Icons.phone, 'Phone', user?.phone ?? ''),
          _tile(Icons.account_balance_wallet, 'Wallet', user?.walletAddress ?? 'Not connected'),
          _tile(
            user?.isVerified == true ? Icons.verified : Icons.pending,
            'Status',
            user?.isVerified == true ? 'Verified' : 'Pending',
          ),
          const SizedBox(height: 24),
          ListTile(
            leading: const Icon(Icons.badge, color: ThronosTheme.primaryColor),
            title: const Text('Verify Identity'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/verify/id'),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Logout', style: TextStyle(color: Colors.red)),
            onTap: () async {
              await auth.logout();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
    );
  }

  Widget _tile(IconData icon, String label, String value) {
    return ListTile(
      leading: Icon(icon, color: ThronosTheme.primaryColor),
      title: Text(label),
      subtitle: Text(value),
    );
  }
}
