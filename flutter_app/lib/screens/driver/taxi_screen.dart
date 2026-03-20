import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/driver_provider.dart';
import '../../config/theme.dart';

class TaxiScreen extends StatefulWidget {
  const TaxiScreen({super.key});

  @override
  State<TaxiScreen> createState() => _TaxiScreenState();
}

class _TaxiScreenState extends State<TaxiScreen> {
  @override
  void initState() {
    super.initState();
    final driver = context.read<DriverProvider>();
    driver.setMode('taxi');
    driver.loadAvailableTrips();
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Taxi Service'),
        backgroundColor: ThronosTheme.taxiYellow,
        foregroundColor: Colors.black,
      ),
      body: Column(
        children: [
          // Status Bar
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            color: driver.isOnline ? ThronosTheme.successGreen.withValues(alpha: 0.1) : Colors.grey[100],
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  driver.isOnline ? 'Accepting Rides' : 'Go online to accept rides',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: driver.isOnline ? ThronosTheme.successGreen : Colors.grey,
                  ),
                ),
                Switch(value: driver.isOnline, onChanged: (_) => driver.toggleOnline()),
              ],
            ),
          ),

          // Active Trip
          if (driver.activeTrip != null)
            Card(
              margin: const EdgeInsets.all(16),
              color: ThronosTheme.taxiYellow.withValues(alpha: 0.1),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Current Ride', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    _locationRow(Icons.trip_origin, driver.activeTrip!.pickup.address ?? 'Pickup', Colors.green),
                    const SizedBox(height: 8),
                    _locationRow(Icons.location_on, driver.activeTrip!.dropoff.address ?? 'Dropoff', Colors.red),
                    const SizedBox(height: 16),
                    if (driver.activeTrip!.fare != null)
                      Text('Fare: ${driver.activeTrip!.fare!.toStringAsFixed(2)} THR',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () => driver.startTrip(driver.activeTrip!.id),
                            icon: const Icon(Icons.play_arrow),
                            label: const Text('Start'),
                            style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.successGreen),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () => driver.completeTrip(driver.activeTrip!.id),
                            icon: const Icon(Icons.check),
                            label: const Text('Complete'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

          // Available Trips
          Expanded(
            child: driver.availableTrips.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.local_taxi, size: 64, color: Colors.grey[300]),
                        const SizedBox(height: 16),
                        Text(
                          driver.isOnline ? 'Waiting for rides...' : 'Go online to see rides',
                          style: TextStyle(color: Colors.grey[500], fontSize: 16),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: driver.availableTrips.length,
                    itemBuilder: (context, index) {
                      final trip = driver.availableTrips[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _locationRow(Icons.trip_origin, trip.pickup.address ?? 'Pickup', Colors.green),
                              const SizedBox(height: 8),
                              _locationRow(Icons.location_on, trip.dropoff.address ?? 'Dropoff', Colors.red),
                              const SizedBox(height: 12),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  if (trip.fare != null)
                                    Text('${trip.fare!.toStringAsFixed(2)} THR',
                                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                  if (trip.distance != null)
                                    Text('${trip.distance!.toStringAsFixed(1)} km', style: TextStyle(color: Colors.grey[600])),
                                ],
                              ),
                              const SizedBox(height: 12),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  onPressed: () => driver.acceptTrip(trip.id),
                                  style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.taxiYellow, foregroundColor: Colors.black),
                                  child: const Text('Accept Ride'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _locationRow(IconData icon, String text, Color color) {
    return Row(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 8),
        Expanded(child: Text(text, overflow: TextOverflow.ellipsis)),
      ],
    );
  }
}
