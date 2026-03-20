import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/verify_provider.dart';
import '../../config/theme.dart';

class DriverVerificationScreen extends StatefulWidget {
  const DriverVerificationScreen({super.key});

  @override
  State<DriverVerificationScreen> createState() => _DriverVerificationScreenState();
}

class _DriverVerificationScreenState extends State<DriverVerificationScreen> {
  @override
  void initState() {
    super.initState();
    context.read<VerifyProvider>().loadPending();
  }

  @override
  Widget build(BuildContext context) {
    final verify = context.watch<VerifyProvider>();
    final driverVerifications = verify.pendingVerifications
        .where((v) => v.type.value == 'driver_license' || v.type.value == 'vehicle_registration' || v.type.value == 'drone_permit')
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Driver Verification'),
        backgroundColor: ThronosTheme.schoolPurple,
      ),
      body: verify.activeVerification != null
          ? _buildReviewView(verify)
          : driverVerifications.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.verified_user, size: 64, color: Colors.grey),
                      SizedBox(height: 16),
                      Text('No pending driver verifications'),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: driverVerifications.length,
                  itemBuilder: (context, index) {
                    final v = driverVerifications[index];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: ListTile(
                        leading: Icon(_typeIcon(v.type.value), color: ThronosTheme.schoolPurple, size: 32),
                        title: Text(v.type.value.replaceAll('_', ' ').toUpperCase()),
                        subtitle: Text('User: ${v.userId.substring(0, 8)}...\nSubmitted: ${v.createdAt.toString().substring(0, 16)}'),
                        isThreeLine: true,
                        trailing: ElevatedButton(
                          onPressed: () => verify.startReview(v.id),
                          style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.schoolPurple),
                          child: const Text('Review'),
                        ),
                      ),
                    );
                  },
                ),
    );
  }

  Widget _buildReviewView(VerifyProvider verify) {
    final v = verify.activeVerification!;
    final notesController = TextEditingController();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(v.type.value.replaceAll('_', ' ').toUpperCase(),
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                // Document Preview
                Container(
                  height: 250,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.grey[200],
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.description, size: 48, color: Colors.grey),
                        SizedBox(height: 8),
                        Text('Document Image'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text('User ID: ${v.userId}'),
                Text('Submitted: ${v.createdAt}'),
                if (v.confidenceScore != null)
                  Text('AI Confidence: ${(v.confidenceScore! * 100).toStringAsFixed(1)}%'),
                const SizedBox(height: 16),
                TextField(
                  controller: notesController,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Review Notes',
                    hintText: 'Add notes about this verification...',
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () => verify.approveVerification(v.id, notes: notesController.text),
                        icon: const Icon(Icons.check_circle),
                        label: const Text('Approve'),
                        style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.successGreen),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () => verify.rejectVerification(v.id, reason: notesController.text),
                        icon: const Icon(Icons.cancel),
                        label: const Text('Reject'),
                        style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.errorRed),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Center(
                  child: Text('Decision will be recorded on blockchain', style: TextStyle(fontSize: 12, color: Colors.grey)),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  IconData _typeIcon(String type) {
    switch (type) {
      case 'driver_license': return Icons.drive_eta;
      case 'vehicle_registration': return Icons.directions_car;
      case 'drone_permit': return Icons.flight;
      default: return Icons.badge;
    }
  }
}
