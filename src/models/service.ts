import { DataTypes, Model, type Sequelize } from "sequelize";

export class Service extends Model {
  declare id: number;
  declare slug: string;
  declare name: string;
  declare description: string;
}

export function initService(sequelize: Sequelize): void {
  Service.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      slug: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "services",
      underscored: true,
    },
  );
}
