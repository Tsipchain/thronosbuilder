import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/driver_provider.dart';
import '../../config/theme.dart';

class DriverDashboard extends StatefulWidget {
  const DriverDashboard({super.key});

  @override
  State<DriverDashboard> createState() => _DriverDashboardState();
}

class _DriverDashboardState extends State<DriverDashboard> {
  @override
  void initState() {
    super.initState();
    context.read<DriverProvider>().loadDashboard();
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Driver Platform'),
        actions: [
          IconButton(icon: const Icon(Icons.history), onPressed: () => context.go('/driver/trips')),
          IconButton(icon: const Icon(Icons.map), onPressed: () => context.go('/driver/map')),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => driver.loadDashboard(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Online Toggle
            Card(
              color: driver.isOnline ? ThronosTheme.successGreen : Colors.grey[300],
              child: ListTile(
                leading: Icon(
                  driver.isOnline ? Icons.wifi : Icons.wifi_off,
                  color: driver.isOnline ? Colors.white : Colors.grey[700],
                ),
                title: Text(
                  driver.isOnline ? 'ONLINE' : 'OFFLINE',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: driver.isOnline ? Colors.white : Colors.grey[700],
                  ),
                ),
                subtitle: Text(
                  'Mode: ${driver.selectedMode.toUpperCase()}',
                  style: TextStyle(color: driver.isOnline ? Colors.white70 : Colors.grey[600]),
                ),
                trailing: Switch(
                  value: driver.isOnline,
                  onChanged: (_) => driver.toggleOnline(),
                  activeColor: Colors.white,
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Stats Row
            Row(
              children: [
                _statCard('Today', '${driver.todayEarnings.toStringAsFixed(0)} THR', Icons.today, ThronosTheme.accentGold),
                const SizedBox(width: 8),
                _statCard('Weekly', '${driver.weeklyEarnings.toStringAsFixed(0)} THR', Icons.date_range, ThronosTheme.secondaryColor),
                const SizedBox(width: 8),
                _statCard('Trips', '${driver.totalTrips}', Icons.route, ThronosTheme.primaryColor),
                const SizedBox(width: 8),
                _statCard('Rating', driver.rating.toStringAsFixed(1), Icons.star, ThronosTheme.warningOrange),
              ],
            ),
            const SizedBox(height: 24),

            // Active Trip
            if (driver.activeTrip != null)
              Card(
                color: ThronosTheme.primaryColor.withValues(alpha: 0.05),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.navigation, color: ThronosTheme.primaryColor),
                          const SizedBox(width: 8),
                          const Text('Active Trip', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                          const Spacer(),
                          Chip(label: Text(driver.activeTrip!.status.value.toUpperCase())),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text('From: ${driver.activeTrip!.pickup.address ?? "Pickup"}'),
                      Text('To: ${driver.activeTrip!.dropoff.address ?? "Dropoff"}'),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () => driver.completeTrip(driver.activeTrip!.id),
                              child: const Text('Complete'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 24),

            // Service Modes
            const Text('Services', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            _serviceCard(context, 'Taxi Service', 'Accept & complete taxi rides', Icons.local_taxi, ThronosTheme.taxiYellow, '/driver/taxi', 'taxi'),
            const SizedBox(height: 12),
            _serviceCard(context, 'Driving School', 'Manage lessons & students', Icons.school, ThronosTheme.schoolPurple, '/driver/school', 'school'),
            const SizedBox(height: 12),
            _serviceCard(context, 'Transport & Delivery', 'Package & cargo transport', Icons.local_shipping, ThronosTheme.transportGreen, '/driver/transport', 'transport'),
            const SizedBox(height: 12),
            _serviceCard(context, 'Drone Delivery', 'Autonomous & supervised drones', Icons.flight, ThronosTheme.droneBlue, '/driver/drone', 'drone'),
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
              Icon(icon, color: color, size: 24),
              const SizedBox(height: 4),
              Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              Text(label, style: TextStyle(fontSize: 10, color: Colors.grey[600])),
            ],
          ),
        ),
      ),
    );
  }

  Widget _serviceCard(BuildContext context, String title, String subtitle, IconData icon, Color color, String route, String mode) {
    final driver = context.read<DriverProvider>();
    return Card(
      child: InkWell(
        onTap: () {
          driver.setMode(mode);
          context.go(route);
        },
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
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
                    Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
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
