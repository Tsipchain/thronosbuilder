import 'package:flutter/material.dart';
import '../../config/theme.dart';
import '../../services/api_service.dart';

class IdVerificationScreen extends StatefulWidget {
  const IdVerificationScreen({super.key});

  @override
  State<IdVerificationScreen> createState() => _IdVerificationScreenState();
}

class _IdVerificationScreenState extends State<IdVerificationScreen> {
  final _api = ApiService();
  int _currentStep = 0;
  String? _documentType = 'id_card';
  bool _isSubmitting = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ID Verification'),
        backgroundColor: ThronosTheme.primaryColor,
      ),
      body: Stepper(
        currentStep: _currentStep,
        onStepContinue: () {
          if (_currentStep < 3) {
            setState(() => _currentStep++);
          } else {
            _submitVerification();
          }
        },
        onStepCancel: () {
          if (_currentStep > 0) setState(() => _currentStep--);
        },
        steps: [
          Step(
            title: const Text('Select Document Type'),
            content: Column(
              children: [
                RadioListTile<String>(
                  value: 'id_card',
                  groupValue: _documentType,
                  onChanged: (v) => setState(() => _documentType = v),
                  title: const Text('National ID Card'),
                  secondary: const Icon(Icons.badge),
                ),
                RadioListTile<String>(
                  value: 'passport',
                  groupValue: _documentType,
                  onChanged: (v) => setState(() => _documentType = v),
                  title: const Text('Passport'),
                  secondary: const Icon(Icons.flight),
                ),
                RadioListTile<String>(
                  value: 'driver_license',
                  groupValue: _documentType,
                  onChanged: (v) => setState(() => _documentType = v),
                  title: const Text('Driver License'),
                  secondary: const Icon(Icons.drive_eta),
                ),
              ],
            ),
            isActive: _currentStep >= 0,
          ),
          Step(
            title: const Text('Upload Document'),
            content: Container(
              height: 200,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey, style: BorderStyle.solid),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.cloud_upload, size: 48, color: ThronosTheme.primaryColor),
                    SizedBox(height: 8),
                    Text('Tap to upload front of document'),
                    SizedBox(height: 4),
                    Text('JPG, PNG or PDF', style: TextStyle(color: Colors.grey, fontSize: 12)),
                  ],
                ),
              ),
            ),
            isActive: _currentStep >= 1,
          ),
          Step(
            title: const Text('Take Selfie'),
            content: Container(
              height: 200,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.camera_alt, size: 48, color: ThronosTheme.primaryColor),
                    SizedBox(height: 8),
                    Text('Take a selfie for face matching'),
                    SizedBox(height: 4),
                    Text('Make sure face is clearly visible', style: TextStyle(color: Colors.grey, fontSize: 12)),
                  ],
                ),
              ),
            ),
            isActive: _currentStep >= 2,
          ),
          Step(
            title: const Text('Submit & Blockchain Record'),
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Your verification will be:'),
                const SizedBox(height: 8),
                _infoRow(Icons.security, 'Reviewed by a certified agent'),
                _infoRow(Icons.video_call, 'May require a video call'),
                _infoRow(Icons.link, 'Recorded on Thronos blockchain'),
                _infoRow(Icons.shield, 'Data encrypted end-to-end'),
                const SizedBox(height: 12),
                if (_isSubmitting) const Center(child: CircularProgressIndicator()),
              ],
            ),
            isActive: _currentStep >= 3,
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: ThronosTheme.primaryColor),
          const SizedBox(width: 8),
          Text(text),
        ],
      ),
    );
  }

  Future<void> _submitVerification() async {
    setState(() => _isSubmitting = true);
    try {
      await _api.verifyPost('/verifications/submit', {
        'type': _documentType,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Verification submitted! You\'ll be notified when reviewed.')),
        );
        Navigator.pop(context);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Submission failed. Please try again.')),
        );
      }
    }
    setState(() => _isSubmitting = false);
  }
}
