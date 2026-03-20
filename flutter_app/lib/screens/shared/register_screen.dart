import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../models/user_model.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  UserRole _selectedRole = UserRole.driver;

  final _roles = [
    (UserRole.driver, 'Driver (Taxi/Transport)', Icons.directions_car),
    (UserRole.schoolInstructor, 'Driving School Instructor', Icons.school),
    (UserRole.droneOperator, 'Drone Operator', Icons.flight),
    (UserRole.callCenterAgent, 'Call Center Agent', Icons.headset_mic),
    (UserRole.agent, 'Verification Agent', Icons.verified_user),
  ];

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(labelText: 'Full Name', prefixIcon: Icon(Icons.person)),
                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.email)),
                validator: (v) => v == null || !v.contains('@') ? 'Valid email required' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone (+30...)', prefixIcon: Icon(Icons.phone)),
                validator: (v) => v == null || v.length < 10 ? 'Valid phone required' : null,
              ),
              const SizedBox(height: 24),
              const Text('Select Your Role', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              ..._roles.map((role) => RadioListTile<UserRole>(
                    value: role.$1,
                    groupValue: _selectedRole,
                    onChanged: (v) => setState(() => _selectedRole = v!),
                    title: Text(role.$2),
                    secondary: Icon(role.$3),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  )),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: auth.isLoading
                    ? null
                    : () async {
                        if (!_formKey.currentState!.validate()) return;
                        final success = await auth.register(
                          phone: _phoneController.text.trim(),
                          fullName: _nameController.text.trim(),
                          email: _emailController.text.trim(),
                          role: _selectedRole,
                        );
                        if (success && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Account created! Please login.')),
                          );
                          context.go('/login');
                        }
                      },
                child: auth.isLoading
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Register'),
              ),
              if (auth.error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Text(auth.error!, style: const TextStyle(color: Colors.red)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    super.dispose();
  }
}
