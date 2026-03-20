import 'package:flutter/material.dart';
import '../../config/theme.dart';
import '../../services/api_service.dart';

class VideoCallScreen extends StatefulWidget {
  const VideoCallScreen({super.key});

  @override
  State<VideoCallScreen> createState() => _VideoCallScreenState();
}

class _VideoCallScreenState extends State<VideoCallScreen> {
  final _api = ApiService();
  bool _inCall = false;
  bool _cameraOn = true;
  bool _micOn = true;
  String? _callerName;
  List<Map<String, dynamic>> _pendingCalls = [];

  @override
  void initState() {
    super.initState();
    _loadPendingCalls();
  }

  Future<void> _loadPendingCalls() async {
    try {
      final response = await _api.verifyGet('/video-calls/pending');
      setState(() {
        _pendingCalls = List<Map<String, dynamic>>.from(response['calls'] ?? []);
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_inCall) return _buildCallView();
    return _buildQueueView();
  }

  Widget _buildQueueView() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Video KYC'),
        backgroundColor: Colors.teal,
      ),
      body: _pendingCalls.isEmpty
          ? const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.video_call, size: 64, color: Colors.grey),
                  SizedBox(height: 16),
                  Text('No pending video calls'),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _pendingCalls.length,
              itemBuilder: (context, index) {
                final call = _pendingCalls[index];
                return Card(
                  child: ListTile(
                    leading: const CircleAvatar(
                      backgroundColor: Colors.teal,
                      child: Icon(Icons.video_call, color: Colors.white),
                    ),
                    title: Text(call['user_name'] ?? 'User'),
                    subtitle: Text('Type: ${call['verification_type'] ?? 'ID'}\n${call['created_at'] ?? ''}'),
                    isThreeLine: true,
                    trailing: ElevatedButton.icon(
                      onPressed: () => setState(() {
                        _inCall = true;
                        _callerName = call['user_name'];
                      }),
                      icon: const Icon(Icons.videocam),
                      label: const Text('Start'),
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.teal),
                    ),
                  ),
                );
              },
            ),
    );
  }

  Widget _buildCallView() {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // Remote video (placeholder)
            Container(
              color: Colors.grey[900],
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.person, size: 100, color: Colors.grey),
                    const SizedBox(height: 16),
                    Text(
                      _callerName ?? 'User',
                      style: const TextStyle(color: Colors.white, fontSize: 20),
                    ),
                    const Text('Video KYC Session', style: TextStyle(color: Colors.grey)),
                  ],
                ),
              ),
            ),

            // Local video (small overlay)
            Positioned(
              top: 16,
              right: 16,
              child: Container(
                width: 120,
                height: 160,
                decoration: BoxDecoration(
                  color: _cameraOn ? Colors.grey[800] : Colors.black,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white24),
                ),
                child: Center(
                  child: Icon(
                    _cameraOn ? Icons.person : Icons.videocam_off,
                    color: Colors.white54,
                    size: 40,
                  ),
                ),
              ),
            ),

            // Verification Controls
            Positioned(
              top: 16,
              left: 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.red,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.circle, color: Colors.white, size: 10),
                        SizedBox(width: 6),
                        Text('LIVE', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('Blockchain recorded', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  ),
                ],
              ),
            ),

            // Bottom Controls
            Positioned(
              bottom: 32,
              left: 0,
              right: 0,
              child: Column(
                children: [
                  // Verification actions
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        ElevatedButton.icon(
                          onPressed: () {},
                          icon: const Icon(Icons.check_circle, color: Colors.white),
                          label: const Text('Approve'),
                          style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.successGreen),
                        ),
                        const SizedBox(width: 16),
                        ElevatedButton.icon(
                          onPressed: () {},
                          icon: const Icon(Icons.cancel, color: Colors.white),
                          label: const Text('Reject'),
                          style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.errorRed),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  // Call controls
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _callControl(
                        _micOn ? Icons.mic : Icons.mic_off,
                        _micOn ? Colors.white24 : Colors.red,
                        () => setState(() => _micOn = !_micOn),
                      ),
                      const SizedBox(width: 20),
                      _callControl(
                        _cameraOn ? Icons.videocam : Icons.videocam_off,
                        _cameraOn ? Colors.white24 : Colors.red,
                        () => setState(() => _cameraOn = !_cameraOn),
                      ),
                      const SizedBox(width: 20),
                      _callControl(
                        Icons.call_end,
                        Colors.red,
                        () => setState(() => _inCall = false),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _callControl(IconData icon, Color bgColor, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: bgColor, shape: BoxShape.circle),
        child: Icon(icon, color: Colors.white, size: 28),
      ),
    );
  }
}
