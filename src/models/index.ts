import type { Sequelize } from "sequelize";

import { Alert, initAlert } from "./alert.js";
import { Service, initService } from "./service.js";

export function initModels(sequelize: Sequelize): void {
  initService(sequelize);
  initAlert(sequelize);
  Alert.belongsTo(Service, { foreignKey: "serviceId", as: "service" });
  Service.hasMany(Alert, { foreignKey: "serviceId", as: "alerts" });
}

export { Alert, Service };
