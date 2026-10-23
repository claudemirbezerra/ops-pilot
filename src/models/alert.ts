import { DataTypes, Model, type Sequelize } from "sequelize";

export const alertStatuses = ["firing", "resolved"] as const;
export const severities = ["low", "medium", "high", "critical"] as const;

export type AlertStatus = (typeof alertStatuses)[number];
export type Severity = (typeof severities)[number];

export class Alert extends Model {
  declare id: number;
  declare serviceId: number;
  declare title: string;
  declare detail: string;
  declare status: AlertStatus;
  declare severity: Severity;
}

export function initAlert(sequelize: Sequelize): void {
  Alert.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      serviceId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(180),
        allowNull: false,
      },
      detail: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(...alertStatuses),
        allowNull: false,
      },
      severity: {
        type: DataTypes.ENUM(...severities),
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "alerts",
      underscored: true,
    },
  );
}
