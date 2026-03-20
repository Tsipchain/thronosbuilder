import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/driver_provider.dart';
import '../../config/theme.dart';

class TripHistoryScreen extends StatefulWidget {
  const TripHistoryScreen({super.key});

  @override
  State<TripHistoryScreen> createState() => _TripHistoryScreenState();
}

class _TripHistoryScreenState extends State<TripHistoryScreen> {
  @override
  void initState() {
    super.initState();
    context.read<DriverProvider>().loadTripHistory();
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Trip History')),
      body: driver.tripHistory.isEmpty
          ? const Center(child: Text('No trips yet'))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: driver.tripHistory.length,
              itemBuilder: (context, index) {
                final trip = driver.tripHistory[index];
                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    leading: Icon(_typeIcon(trip.type.value), color: _typeColor(trip.type.value)),
                    title: Text('${trip.pickup.address ?? "A"} -> ${trip.dropoff.address ?? "B"}'),
                    subtitle: Text('${trip.type.value.toUpperCase()} | ${trip.createdAt.toString().substring(0, 16)}'),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('${trip.fare?.toStringAsFixed(2) ?? "0"} THR', style: const TextStyle(fontWeight: FontWeight.bold)),
                        if (trip.rating != null) Row(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.star, size: 14, color: ThronosTheme.warningOrange),
                          Text(' ${trip.rating!.toStringAsFixed(1)}'),
                        ]),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }

  IconData _typeIcon(String type) {
    switch (type) {
      case 'taxi': return Icons.local_taxi;
      case 'school': return Icons.school;
      case 'transport': return Icons.local_shipping;
      case 'drone': return Icons.flight;
      default: return Icons.directions_car;
    }
  }

  Color _typeColor(String type) {
    switch (type) {
      case 'taxi': return ThronosTheme.taxiYellow;
      case 'school': return ThronosTheme.schoolPurple;
      case 'transport': return ThronosTheme.transportGreen;
      case 'drone': return ThronosTheme.droneBlue;
      default: return ThronosTheme.primaryColor;
    }
  }
}
