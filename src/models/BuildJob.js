const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const BuildJob = sequelize.define('BuildJob', {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    project_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    source_type: {
      type: DataTypes.ENUM('github', 'gitlab', 'zip'),
      allowNull: false
    },
    source_url: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    branch: {
      type: DataTypes.STRING(100),
      defaultValue: 'main'
    },
    build_type: {
      type: DataTypes.ENUM('apk', 'aab', 'ipa', 'both'),
      allowNull: false
    },
    platform: {
      type: DataTypes.ENUM('android', 'ios', 'both'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'building', 'success', 'failed', 'cancelled'),
      defaultValue: 'pending'
    },
    progress: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      }
    },
    android_artifact_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ios_artifact_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    build_logs: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    cost_thron: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false
    },
    payment_status: {
      type: DataTypes.ENUM('pending', 'paid', 'refunded'),
      defaultValue: 'pending'
    },
    github_run_id: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    tableName: 'build_jobs',
    timestamps: false,
    underscored: true
  });

  return BuildJob;
};
