import 'package:flutter/material.dart';
import '../../config/theme.dart';

class MapScreen extends StatelessWidget {
  const MapScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Live Map')),
      body: Stack(
        children: [
          // Map placeholder - Google Maps integration
          Container(
            color: Colors.grey[200],
            child: const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.map, size: 80, color: ThronosTheme.primaryColor),
                  SizedBox(height: 16),
                  Text('Google Maps Integration', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  SizedBox(height: 8),
                  Text('Real-time driver & drone tracking'),
                ],
              ),
            ),
          ),
          // Bottom controls
          Positioned(
            bottom: 16,
            left: 16,
            right: 16,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _mapAction(Icons.my_location, 'Center', () {}),
                    _mapAction(Icons.local_taxi, 'Drivers', () {}),
                    _mapAction(Icons.flight, 'Drones', () {}),
                    _mapAction(Icons.layers, 'Layers', () {}),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _mapAction(IconData icon, String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: ThronosTheme.primaryColor),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 12)),
        ],
      ),
    );
  }
}
