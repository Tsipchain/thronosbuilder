import 'package:flutter/material.dart';
import '../../config/theme.dart';
import '../../services/api_service.dart';
import '../../services/websocket_service.dart';

class DroneDeliveryScreen extends StatefulWidget {
  const DroneDeliveryScreen({super.key});

  @override
  State<DroneDeliveryScreen> createState() => _DroneDeliveryScreenState();
}

class _DroneDeliveryScreenState extends State<DroneDeliveryScreen> {
  final _api = ApiService();
  final _ws = WebSocketService();
  List<Map<String, dynamic>> _drones = [];
  List<Map<String, dynamic>> _activeMissions = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
    _ws.messages.listen((msg) {
      if (msg['type'] == 'drone_telemetry') {
        _updateDroneTelemetry(msg);
      }
    });
  }

  void _updateDroneTelemetry(Map<String, dynamic> data) {
    setState(() {
      final idx = _drones.indexWhere((d) => d['id'] == data['drone_id']);
      if (idx >= 0) {
        _drones[idx] = {..._drones[idx], ...data};
      }
    });
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final response = await _api.driverGet('/drone/dashboard');
      _drones = List<Map<String, dynamic>>.from(response['drones'] ?? []);
      _activeMissions = List<Map<String, dynamic>>.from(response['active_missions'] ?? []);
      for (final drone in _drones) {
        _ws.subscribeDroneTelemetry(drone['id']);
      }
    } catch (_) {}
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Drone Delivery'),
        backgroundColor: ThronosTheme.droneBlue,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Fleet Overview
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Fleet Overview', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 12),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _fleetStat('Total', '${_drones.length}', Icons.flight, ThronosTheme.droneBlue),
                              _fleetStat(
                                'Flying',
                                '${_drones.where((d) => d['status'] == 'in_flight' || d['status'] == 'delivering').length}',
                                Icons.flight_takeoff,
                                ThronosTheme.successGreen,
                              ),
                              _fleetStat(
                                'Active Missions',
                                '${_activeMissions.length}',
                                Icons.assignment,
                                ThronosTheme.warningOrange,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // My Drones
                  const Text('My Drones', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  if (_drones.isEmpty)
                    const Center(child: Padding(padding: EdgeInsets.all(32), child: Text('No drones registered'))),
                  ..._drones.map((drone) => _buildDroneCard(drone)),

                  const SizedBox(height: 24),

                  // Active Missions
                  if (_activeMissions.isNotEmpty) ...[
                    const Text('Active Missions', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    ..._activeMissions.map((mission) => _buildMissionCard(mission)),
                  ],
                ],
              ),
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showNewMissionDialog,
        backgroundColor: ThronosTheme.droneBlue,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('New Mission', style: TextStyle(color: Colors.white)),
      ),
    );
  }

  Widget _fleetStat(String label, String value, IconData icon, Color color) {
    return Column(
      children: [
        Icon(icon, color: color, size: 28),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
      ],
    );
  }

  Widget _buildDroneCard(Map<String, dynamic> drone) {
    final status = drone['status'] ?? 'idle';
    final battery = (drone['battery_level'] as num?)?.toDouble() ?? 0;
    final isFlying = status == 'in_flight' || status == 'delivering';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isFlying ? Icons.flight_takeoff : Icons.flight_land,
                  color: isFlying ? ThronosTheme.droneBlue : Colors.grey,
                ),
                const SizedBox(width: 8),
                Text(drone['name'] ?? 'Drone', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _statusColor(status).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(status.toUpperCase(), style: TextStyle(color: _statusColor(status), fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.battery_charging_full, color: battery > 20 ? ThronosTheme.successGreen : ThronosTheme.errorRed, size: 18),
                const SizedBox(width: 4),
                Text('${battery.toStringAsFixed(0)}%'),
                const SizedBox(width: 16),
                const Icon(Icons.speed, size: 18),
                const SizedBox(width: 4),
                Text('Max: ${drone['max_payload_kg'] ?? '?'} kg'),
                const SizedBox(width: 16),
                const Icon(Icons.explore, size: 18),
                const SizedBox(width: 4),
                Text('Range: ${drone['max_range_km'] ?? '?'} km'),
              ],
            ),
            if (drone['altitude'] != null) ...[
              const SizedBox(height: 8),
              Text('Alt: ${(drone['altitude'] as num).toStringAsFixed(0)}m | Supervised: ${drone['is_supervised'] == true ? 'Yes' : 'No'}'),
            ],
            if (isFlying) ...[
              const SizedBox(height: 8),
              LinearProgressIndicator(
                backgroundColor: Colors.grey[200],
                color: ThronosTheme.droneBlue,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildMissionCard(Map<String, dynamic> mission) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: ThronosTheme.droneBlue.withValues(alpha: 0.05),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.assignment, color: ThronosTheme.droneBlue),
                const SizedBox(width: 8),
                Expanded(child: Text(mission['description'] ?? 'Mission', style: const TextStyle(fontWeight: FontWeight.bold))),
                Chip(label: Text((mission['status'] ?? 'active').toString().toUpperCase())),
              ],
            ),
            const SizedBox(height: 8),
            Text('Drone: ${mission['drone_name'] ?? 'N/A'}'),
            Text('Package: ${mission['package_weight'] ?? '?'} kg'),
            if (mission['estimated_minutes'] != null) Text('ETA: ${mission['estimated_minutes']} min'),
            if (mission['tx_hash'] != null)
              Text('Tx: ${mission['tx_hash'].toString().substring(0, 16)}...', style: const TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ),
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'in_flight':
      case 'delivering': return ThronosTheme.droneBlue;
      case 'idle': return Colors.grey;
      case 'charging': return ThronosTheme.warningOrange;
      case 'emergency': return ThronosTheme.errorRed;
      default: return Colors.grey;
    }
  }

  void _showNewMissionDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
          left: 24, right: 24, top: 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('New Delivery Mission', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            const TextField(decoration: InputDecoration(labelText: 'Pickup Address', prefixIcon: Icon(Icons.trip_origin))),
            const SizedBox(height: 12),
            const TextField(decoration: InputDecoration(labelText: 'Delivery Address', prefixIcon: Icon(Icons.location_on))),
            const SizedBox(height: 12),
            const TextField(
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: 'Package Weight (kg)', prefixIcon: Icon(Icons.scale)),
            ),
            const SizedBox(height: 12),
            const TextField(decoration: InputDecoration(labelText: 'Description', prefixIcon: Icon(Icons.description))),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.flight_takeoff),
                label: const Text('Launch Mission'),
                style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.droneBlue),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                'Mission will be recorded on Thronos blockchain',
                style: TextStyle(fontSize: 12, color: Colors.grey[500]),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
