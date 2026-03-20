import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/call_center_provider.dart';
import '../../config/theme.dart';

class SupervisionScreen extends StatefulWidget {
  const SupervisionScreen({super.key});

  @override
  State<SupervisionScreen> createState() => _SupervisionScreenState();
}

class _SupervisionScreenState extends State<SupervisionScreen> {
  @override
  void initState() {
    super.initState();
    context.read<CallCenterProvider>().loadCallCenterDashboard();
  }

  @override
  Widget build(BuildContext context) {
    final cc = context.watch<CallCenterProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Supervision Panel'),
        backgroundColor: Colors.brown,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Overview Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Live Monitoring', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _monitorStat('Active Drivers', '${cc.activeSupervisedDrivers.length}', Icons.directions_car, ThronosTheme.taxiYellow),
                      _monitorStat('Active Drones', '${cc.activeSupervisedDrones.length}', Icons.flight, ThronosTheme.droneBlue),
                      _monitorStat('Calls Today', '${cc.todayCalls}', Icons.call, Colors.deepOrange),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Map Placeholder
          Card(
            child: Container(
              height: 200,
              decoration: BoxDecoration(
                color: Colors.grey[200],
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.map, size: 48, color: ThronosTheme.primaryColor),
                    SizedBox(height: 8),
                    Text('Live Map - All Units'),
                    Text('Drivers & Drones in real-time', style: TextStyle(color: Colors.grey)),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Active Drivers
          const Text('Supervised Drivers', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (cc.activeSupervisedDrivers.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No drivers under supervision')))),
          ...cc.activeSupervisedDrivers.map((d) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: d['online'] == true ? ThronosTheme.successGreen : Colors.grey,
                    child: const Icon(Icons.person, color: Colors.white),
                  ),
                  title: Text(d['name'] ?? 'Driver'),
                  subtitle: Text('${d['mode'] ?? 'taxi'} | ${d['location'] ?? 'Unknown'}'),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(icon: const Icon(Icons.call, color: Colors.green), onPressed: () {}),
                      IconButton(icon: const Icon(Icons.location_on, color: ThronosTheme.primaryColor), onPressed: () {}),
                    ],
                  ),
                ),
              )),

          const SizedBox(height: 16),

          // Active Drones
          const Text('Supervised Drones', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (cc.activeSupervisedDrones.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No drones under supervision')))),
          ...cc.activeSupervisedDrones.map((d) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: ThronosTheme.droneBlue,
                    child: const Icon(Icons.flight, color: Colors.white),
                  ),
                  title: Text(d['name'] ?? 'Drone'),
                  subtitle: Text('Battery: ${d['battery'] ?? '?'}% | Alt: ${d['altitude'] ?? '?'}m'),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(icon: const Icon(Icons.pause_circle, color: Colors.orange), onPressed: () {}),
                      IconButton(icon: const Icon(Icons.home, color: Colors.red), onPressed: () {}),
                    ],
                  ),
                ),
              )),
        ],
      ),
    );
  }

  Widget _monitorStat(String label, String value, IconData icon, Color color) {
    return Column(
      children: [
        Icon(icon, color: color, size: 28),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[600])),
      ],
    );
  }
}
