import 'package:flutter/material.dart';
import '../../config/theme.dart';
import '../../services/api_service.dart';

class DrivingSchoolScreen extends StatefulWidget {
  const DrivingSchoolScreen({super.key});

  @override
  State<DrivingSchoolScreen> createState() => _DrivingSchoolScreenState();
}

class _DrivingSchoolScreenState extends State<DrivingSchoolScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _api = ApiService();
  List<Map<String, dynamic>> _students = [];
  List<Map<String, dynamic>> _lessons = [];
  List<Map<String, dynamic>> _certifications = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final response = await _api.driverGet('/school/dashboard');
      _students = List<Map<String, dynamic>>.from(response['students'] ?? []);
      _lessons = List<Map<String, dynamic>>.from(response['lessons'] ?? []);
      _certifications = List<Map<String, dynamic>>.from(response['certifications'] ?? []);
    } catch (_) {}
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Driving School'),
        backgroundColor: ThronosTheme.schoolPurple,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          tabs: const [
            Tab(icon: Icon(Icons.people), text: 'Students'),
            Tab(icon: Icon(Icons.event), text: 'Lessons'),
            Tab(icon: Icon(Icons.workspace_premium), text: 'Certs'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildStudentsList(),
                _buildLessonsList(),
                _buildCertificationsList(),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddDialog,
        backgroundColor: ThronosTheme.schoolPurple,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildStudentsList() {
    if (_students.isEmpty) {
      return const Center(child: Text('No students enrolled'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _students.length,
      itemBuilder: (context, index) {
        final student = _students[index];
        return Card(
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: ThronosTheme.schoolPurple,
              child: Text(
                (student['name'] ?? 'S')[0],
                style: const TextStyle(color: Colors.white),
              ),
            ),
            title: Text(student['name'] ?? 'Student'),
            subtitle: Text('Progress: ${student['lessons_completed'] ?? 0}/${student['total_lessons'] ?? 20} lessons'),
            trailing: LinearProgressIndicator(
              value: ((student['lessons_completed'] ?? 0) / (student['total_lessons'] ?? 20)).clamp(0.0, 1.0),
              backgroundColor: Colors.grey[200],
              color: ThronosTheme.schoolPurple,
            ).constrained(width: 80),
          ),
        );
      },
    );
  }

  Widget _buildLessonsList() {
    if (_lessons.isEmpty) {
      return const Center(child: Text('No upcoming lessons'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _lessons.length,
      itemBuilder: (context, index) {
        final lesson = _lessons[index];
        return Card(
          child: ListTile(
            leading: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: ThronosTheme.schoolPurple.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.drive_eta, color: ThronosTheme.schoolPurple),
            ),
            title: Text(lesson['student_name'] ?? 'Student'),
            subtitle: Text('${lesson['type'] ?? 'Practice'} - ${lesson['date'] ?? 'TBD'}'),
            trailing: Text(lesson['duration'] ?? '1h', style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
        );
      },
    );
  }

  Widget _buildCertificationsList() {
    if (_certifications.isEmpty) {
      return const Center(child: Text('No certifications issued'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _certifications.length,
      itemBuilder: (context, index) {
        final cert = _certifications[index];
        return Card(
          child: ListTile(
            leading: const Icon(Icons.workspace_premium, color: ThronosTheme.accentGold, size: 32),
            title: Text(cert['student_name'] ?? ''),
            subtitle: Text('Issued: ${cert['date'] ?? ''}\nTx: ${(cert['tx_hash'] ?? '').toString().substring(0, 12)}...'),
            trailing: const Icon(Icons.verified, color: ThronosTheme.successGreen),
            isThreeLine: true,
          ),
        );
      },
    );
  }

  void _showAddDialog() {
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
          children: [
            const Text('Add New', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.person_add, color: ThronosTheme.schoolPurple),
              title: const Text('Enroll Student'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(Icons.event, color: ThronosTheme.schoolPurple),
              title: const Text('Schedule Lesson'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(Icons.workspace_premium, color: ThronosTheme.accentGold),
              title: const Text('Issue Certification'),
              subtitle: const Text('Recorded on Thronos blockchain'),
              onTap: () => Navigator.pop(context),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }
}

extension WidgetConstraint on Widget {
  Widget constrained({double? width, double? height}) {
    return SizedBox(width: width, height: height, child: this);
  }
}
