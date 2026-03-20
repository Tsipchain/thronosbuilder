import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/driver_provider.dart';
import '../../config/theme.dart';
import '../../services/api_service.dart';

class TransportScreen extends StatefulWidget {
  const TransportScreen({super.key});

  @override
  State<TransportScreen> createState() => _TransportScreenState();
}

class _TransportScreenState extends State<TransportScreen> {
  final _api = ApiService();
  List<Map<String, dynamic>> _availableJobs = [];
  Map<String, dynamic>? _activeJob;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    context.read<DriverProvider>().setMode('transport');
    _loadJobs();
  }

  Future<void> _loadJobs() async {
    setState(() => _isLoading = true);
    try {
      final response = await _api.driverGet('/transport/jobs');
      _availableJobs = List<Map<String, dynamic>>.from(response['jobs'] ?? []);
      _activeJob = response['active_job'];
    } catch (_) {}
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transport & Delivery'),
        backgroundColor: ThronosTheme.transportGreen,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadJobs,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Active Job
                  if (_activeJob != null) ...[
                    Card(
                      color: ThronosTheme.transportGreen.withValues(alpha: 0.1),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.local_shipping, color: ThronosTheme.transportGreen),
                                const SizedBox(width: 8),
                                const Text('Active Delivery', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                const Spacer(),
                                Chip(
                                  label: Text((_activeJob!['status'] ?? 'active').toString().toUpperCase()),
                                  backgroundColor: ThronosTheme.transportGreen.withValues(alpha: 0.2),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Text('Package: ${_activeJob!['description'] ?? 'N/A'}'),
                            Text('Weight: ${_activeJob!['weight'] ?? '?'} kg'),
                            Text('From: ${_activeJob!['pickup_address'] ?? ''}'),
                            Text('To: ${_activeJob!['delivery_address'] ?? ''}'),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: ElevatedButton.icon(
                                    onPressed: () {},
                                    icon: const Icon(Icons.navigation),
                                    label: const Text('Navigate'),
                                    style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.transportGreen),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: ElevatedButton.icon(
                                    onPressed: () {},
                                    icon: const Icon(Icons.check_circle),
                                    label: const Text('Delivered'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Stats
                  Row(
                    children: [
                      _statCard('Available', '${_availableJobs.length}', Icons.inbox, ThronosTheme.transportGreen),
                      const SizedBox(width: 12),
                      _statCard('Today', '0', Icons.check_circle, ThronosTheme.primaryColor),
                    ],
                  ),
                  const SizedBox(height: 24),

                  const Text('Available Jobs', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),

                  if (_availableJobs.isEmpty)
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          children: [
                            Icon(Icons.local_shipping, size: 64, color: Colors.grey[300]),
                            const SizedBox(height: 16),
                            Text('No available jobs', style: TextStyle(color: Colors.grey[500])),
                          ],
                        ),
                      ),
                    ),

                  ..._availableJobs.map((job) => Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(_getJobIcon(job['type']), color: ThronosTheme.transportGreen),
                                  const SizedBox(width: 8),
                                  Text(job['type'] ?? 'Delivery', style: const TextStyle(fontWeight: FontWeight.bold)),
                                  const Spacer(),
                                  Text('${job['fare'] ?? '?'} THR', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Text('${job['description'] ?? ''}\n${job['weight'] ?? '?'} kg | ${job['distance'] ?? '?'} km'),
                              const SizedBox(height: 12),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  onPressed: () {},
                                  style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.transportGreen),
                                  child: const Text('Accept Job'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      )),
                ],
              ),
            ),
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(height: 8),
              Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              Text(label, style: TextStyle(color: Colors.grey[600])),
            ],
          ),
        ),
      ),
    );
  }

  IconData _getJobIcon(String? type) {
    switch (type) {
      case 'cargo': return Icons.inventory_2;
      case 'furniture': return Icons.chair;
      case 'food': return Icons.restaurant;
      default: return Icons.local_shipping;
    }
  }
}
