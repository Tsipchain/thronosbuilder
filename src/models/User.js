const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    wallet_address: {
      type: DataTypes.STRING(42),
      allowNull: true,
      unique: true,
      validate: {
        is: /^0x[a-fA-F0-9]{40}$/
      }
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'users',
    timestamps: false,
    underscored: true
  });

  return User;
};
