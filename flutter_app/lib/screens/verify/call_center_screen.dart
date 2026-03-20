import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/call_center_provider.dart';
import '../../config/theme.dart';

class CallCenterScreen extends StatefulWidget {
  const CallCenterScreen({super.key});

  @override
  State<CallCenterScreen> createState() => _CallCenterScreenState();
}

class _CallCenterScreenState extends State<CallCenterScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    context.read<CallCenterProvider>().loadCallCenterDashboard();
  }

  @override
  Widget build(BuildContext context) {
    final cc = context.watch<CallCenterProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Call Center'),
        backgroundColor: Colors.deepOrange,
        actions: [
          Container(
            margin: const EdgeInsets.all(8),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: cc.isAvailable ? ThronosTheme.successGreen : Colors.grey,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Center(
              child: InkWell(
                onTap: () => cc.toggleAvailability(),
                child: Text(
                  cc.isAvailable ? 'ONLINE' : 'OFFLINE',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          tabs: [
            Tab(icon: const Icon(Icons.call), text: 'Queue (${cc.callQueue.length})'),
            Tab(icon: const Icon(Icons.directions_car), text: 'Drivers (${cc.activeSupervisedDrivers.length})'),
            Tab(icon: const Icon(Icons.flight), text: 'Drones (${cc.activeSupervisedDrones.length})'),
          ],
        ),
      ),
      body: Column(
        children: [
          // Active Call Banner
          if (cc.inCall)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              color: Colors.red.withValues(alpha: 0.1),
              child: Row(
                children: [
                  const Icon(Icons.call, color: Colors.red),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Active Call: ${cc.activeCallerName ?? "Unknown"}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        const Text('Tap to manage call'),
                      ],
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed: () => cc.endCall(),
                    icon: const Icon(Icons.call_end),
                    label: const Text('End'),
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                  ),
                ],
              ),
            ),

          // Tab Content
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildCallQueue(cc),
                _buildDriverSupervision(cc),
                _buildDroneSupervision(cc),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCallQueue(CallCenterProvider cc) {
    if (cc.callQueue.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.phone_disabled, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('No calls in queue', style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: cc.callQueue.length,
      itemBuilder: (context, index) {
        final call = cc.callQueue[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: ListTile(
            leading: const CircleAvatar(
              backgroundColor: Colors.deepOrange,
              child: Icon(Icons.call, color: Colors.white),
            ),
            title: Text(call['caller_name'] ?? 'Unknown'),
            subtitle: Text(call['reason'] ?? 'Incoming call'),
            trailing: ElevatedButton.icon(
              onPressed: () => cc.answerCall(call['call_id']),
              icon: const Icon(Icons.call),
              label: const Text('Answer'),
              style: ElevatedButton.styleFrom(backgroundColor: ThronosTheme.successGreen),
            ),
          ),
        );
      },
    );
  }

  Widget _buildDriverSupervision(CallCenterProvider cc) {
    if (cc.activeSupervisedDrivers.isEmpty) {
      return const Center(child: Text('No drivers under supervision'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: cc.activeSupervisedDrivers.length,
      itemBuilder: (context, index) {
        final driver = cc.activeSupervisedDrivers[index];
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
                      Icons.circle,
                      size: 12,
                      color: driver['online'] == true ? ThronosTheme.successGreen : Colors.grey,
                    ),
                    const SizedBox(width: 8),
                    Text(driver['name'] ?? 'Driver', style: const TextStyle(fontWeight: FontWeight.bold)),
                    const Spacer(),
                    Chip(label: Text((driver['mode'] ?? 'taxi').toString().toUpperCase())),
                  ],
                ),
                const SizedBox(height: 8),
                Text('Location: ${driver['location'] ?? 'Unknown'}'),
                Text('Speed: ${driver['speed'] ?? 0} km/h'),
                if (driver['active_trip'] != null) Text('Trip: ${driver['active_trip']}'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    OutlinedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.call, size: 16),
                      label: const Text('Call'),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.message, size: 16),
                      label: const Text('Message'),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.map, size: 16),
                      label: const Text('Track'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildDroneSupervision(CallCenterProvider cc) {
    if (cc.activeSupervisedDrones.isEmpty) {
      return const Center(child: Text('No drones under supervision'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: cc.activeSupervisedDrones.length,
      itemBuilder: (context, index) {
        final drone = cc.activeSupervisedDrones[index];
        final isFlying = drone['status'] == 'in_flight' || drone['status'] == 'delivering';
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
                    Text(drone['name'] ?? 'Drone', style: const TextStyle(fontWeight: FontWeight.bold)),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isFlying ? ThronosTheme.droneBlue.withValues(alpha: 0.15) : Colors.grey[200],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        (drone['status'] ?? 'idle').toString().toUpperCase(),
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: isFlying ? ThronosTheme.droneBlue : Colors.grey),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('Battery: ${drone['battery'] ?? '?'}% | Alt: ${drone['altitude'] ?? '?'}m'),
                if (drone['mission'] != null) Text('Mission: ${drone['mission']}'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    OutlinedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.map, size: 16),
                      label: const Text('Track'),
                    ),
                    const SizedBox(width: 8),
                    if (isFlying)
                      OutlinedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.pause, size: 16, color: Colors.orange),
                        label: const Text('Hover'),
                        style: OutlinedButton.styleFrom(foregroundColor: Colors.orange),
                      ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.home, size: 16, color: Colors.red),
                      label: const Text('Return'),
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }
}
