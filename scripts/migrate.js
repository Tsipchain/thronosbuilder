#!/usr/bin/env node
require('dotenv').config();
const { sequelize } = require('../src/models');

async function migrate() {
  const force = process.argv.includes('--force');
  const alter = process.argv.includes('--alter') || !force;

  console.log(`Running migrations (force: ${force}, alter: ${alter})...`);
  console.log(`Database: ${process.env.DATABASE_URL ? '[set]' : '[not set]'}`);

  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    if (force) {
      console.log('WARNING: --force will drop and recreate all tables!');
      // Give the operator 3 seconds to cancel
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    await sequelize.sync({ force, alter });
    console.log('All models synchronized successfully.');

    // Log table info
    const [results] = await sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log('Tables in database:');
    results.forEach(row => console.log(`  - ${row.table_name}`));

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrate();
