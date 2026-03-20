import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../config/theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  bool _otpSent = false;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 60),
              const Icon(Icons.shield_outlined, size: 80, color: ThronosTheme.primaryColor),
              const SizedBox(height: 16),
              const Text(
                'THRONOS',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, letterSpacing: 4),
              ),
              const SizedBox(height: 8),
              Text(
                'Driver & Verify Platform',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: Colors.grey[600]),
              ),
              const SizedBox(height: 48),
              TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Phone Number',
                  hintText: '+30 6xx xxx xxxx',
                  prefixIcon: Icon(Icons.phone),
                ),
              ),
              const SizedBox(height: 16),
              if (!_otpSent)
                ElevatedButton(
                  onPressed: auth.isLoading
                      ? null
                      : () async {
                          final success = await auth.requestOtp(_phoneController.text.trim());
                          if (success) setState(() => _otpSent = true);
                        },
                  child: auth.isLoading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Send OTP'),
                ),
              if (_otpSent) ...[
                TextField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'OTP Code',
                    prefixIcon: Icon(Icons.lock_outline),
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: auth.isLoading
                      ? null
                      : () async {
                          final success = await auth.login(
                            _phoneController.text.trim(),
                            _otpController.text.trim(),
                          );
                          if (success && context.mounted) context.go('/home');
                        },
                  child: auth.isLoading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Login'),
                ),
              ],
              if (auth.error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Text(auth.error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center),
                ),
              const SizedBox(height: 24),
              TextButton(
                onPressed: () => context.go('/register'),
                child: const Text('Don\'t have an account? Register'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }
}
