const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

const User = require('./User')(sequelize, Sequelize.DataTypes);
const BuildJob = require('./BuildJob')(sequelize, Sequelize.DataTypes);
const BuildLog = require('./BuildLog')(sequelize, Sequelize.DataTypes);

// Associations
User.hasMany(BuildJob, { foreignKey: 'user_id' });
BuildJob.belongsTo(User, { foreignKey: 'user_id' });

BuildJob.hasMany(BuildLog, { foreignKey: 'job_id' });
BuildLog.belongsTo(BuildJob, { foreignKey: 'job_id' });

module.exports = {
  sequelize,
  User,
  BuildJob,
  BuildLog
};
