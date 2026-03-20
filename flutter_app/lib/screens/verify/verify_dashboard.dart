import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/verify_provider.dart';
import '../../providers/call_center_provider.dart';
import '../../config/theme.dart';

class VerifyDashboard extends StatefulWidget {
  const VerifyDashboard({super.key});

  @override
  State<VerifyDashboard> createState() => _VerifyDashboardState();
}

class _VerifyDashboardState extends State<VerifyDashboard> {
  @override
  void initState() {
    super.initState();
    context.read<VerifyProvider>().loadDashboard();
    context.read<CallCenterProvider>().loadCallCenterDashboard();
  }

  @override
  Widget build(BuildContext context) {
    final verify = context.watch<VerifyProvider>();
    final callCenter = context.watch<CallCenterProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Thronos Verify ID'),
        backgroundColor: ThronosTheme.secondaryColor,
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await verify.loadDashboard();
          await callCenter.loadCallCenterDashboard();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Stats
            Row(
              children: [
                _statCard('Pending', '${verify.pendingVerifications.length}', Icons.pending, ThronosTheme.warningOrange),
                const SizedBox(width: 8),
                _statCard('Today', '${verify.todayReviewed}', Icons.check_circle, ThronosTheme.successGreen),
                const SizedBox(width: 8),
                _statCard('Queue', '${callCenter.callQueue.length}', Icons.call, Colors.deepOrange),
                const SizedBox(width: 8),
                _statCard('Calls', '${callCenter.todayCalls}', Icons.headset_mic, ThronosTheme.primaryColor),
              ],
            ),
            const SizedBox(height: 24),

            // Call Center Status
            Card(
              color: callCenter.isAvailable ? ThronosTheme.successGreen.withValues(alpha: 0.1) : Colors.grey[100],
              child: ListTile(
                leading: Icon(
                  Icons.headset_mic,
                  color: callCenter.isAvailable ? ThronosTheme.successGreen : Colors.grey,
                ),
                title: Text(callCenter.isAvailable ? 'Call Center: AVAILABLE' : 'Call Center: OFFLINE'),
                trailing: Switch(
                  value: callCenter.isAvailable,
                  onChanged: (_) => callCenter.toggleAvailability(),
                ),
              ),
            ),

            if (callCenter.inCall)
              Card(
                color: Colors.red.withValues(alpha: 0.1),
                child: ListTile(
                  leading: const Icon(Icons.call, color: Colors.red),
                  title: Text('In call with ${callCenter.activeCallerName ?? "Unknown"}'),
                  trailing: IconButton(
                    icon: const Icon(Icons.call_end, color: Colors.red),
                    onPressed: () => callCenter.endCall(),
                  ),
                ),
              ),
            const SizedBox(height: 24),

            // Services
            const Text('Services', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            _serviceCard(context, 'Call Center', 'Handle calls & supervise', Icons.headset_mic, Colors.deepOrange, '/verify/call-center'),
            const SizedBox(height: 12),
            _serviceCard(context, 'Video KYC', 'Video verification calls', Icons.video_call, Colors.teal, '/verify/video-call'),
            const SizedBox(height: 12),
            _serviceCard(context, 'ID Verification', 'Document & identity checks', Icons.badge, ThronosTheme.primaryColor, '/verify/id'),
            const SizedBox(height: 12),
            _serviceCard(context, 'Driver Verification', 'License & vehicle checks', Icons.drive_eta, ThronosTheme.schoolPurple, '/verify/driver'),
            const SizedBox(height: 12),
            _serviceCard(context, 'Supervision Panel', 'Monitor drivers & drones', Icons.supervisor_account, Colors.brown, '/verify/supervision'),

            const SizedBox(height: 24),

            // Pending Verifications
            if (verify.pendingVerifications.isNotEmpty) ...[
              const Text('Pending Reviews', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              ...verify.pendingVerifications.take(5).map((v) => Card(
                    child: ListTile(
                      leading: const Icon(Icons.pending_actions, color: ThronosTheme.warningOrange),
                      title: Text('${v.type.value} Verification'),
                      subtitle: Text('User: ${v.userId.substring(0, 8)}...'),
                      trailing: ElevatedButton(
                        onPressed: () => verify.startReview(v.id),
                        child: const Text('Review'),
                      ),
                    ),
                  )),
            ],
          ],
        ),
      ),
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Icon(icon, color: color, size: 22),
              const SizedBox(height: 4),
              Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              Text(label, style: TextStyle(fontSize: 10, color: Colors.grey[600])),
            ],
          ),
        ),
      ),
    );
  }

  Widget _serviceCard(BuildContext context, String title, String subtitle, IconData icon, Color color, String route) {
    return Card(
      child: InkWell(
        onTap: () => context.go(route),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    Text(subtitle, style: TextStyle(color: Colors.grey[600], fontSize: 13)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.grey[400]),
            ],
          ),
        ),
      ),
    );
  }
}
