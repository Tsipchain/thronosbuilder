const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const BuildLog = sequelize.define('BuildLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    job_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'build_jobs',
        key: 'id'
      }
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    log_line: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    log_type: {
      type: DataTypes.ENUM('info', 'warning', 'error', 'success'),
      defaultValue: 'info'
    }
  }, {
    tableName: 'build_logs',
    timestamps: false,
    underscored: true
  });

  return BuildLog;
};
