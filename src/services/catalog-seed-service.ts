import { Op } from "sequelize";

import type { DatabaseConfig } from "../db/config.js";
import { createSequelize, ensureDatabase } from "../db/sequelize.js";
import { InvalidCatalogError } from "../domain/errors.js";
import { Alert, Service, initModels } from "../models/index.js";
import {
  primaryCatalog,
  summarizeCatalog,
  type CatalogSummary,
} from "../seed/primary-catalog.js";

export async function seedPrimaryCatalog(config: DatabaseConfig): Promise<CatalogSummary> {
  await ensureDatabase(config);
  const sequelize = createSequelize(config);

  try {
    initModels(sequelize);
    await Service.sync();
    await Alert.sync();

    await sequelize.transaction(async (transaction) => {
      await Alert.destroy({ where: { id: { [Op.gte]: 1 } }, transaction });
      await Service.destroy({ where: { id: { [Op.gte]: 1 } }, transaction });

      const idsBySlug = new Map<string, number>();
      for (const service of primaryCatalog.services) {
        const created = await Service.create(
          {
            slug: service.slug,
            name: service.name,
            description: service.description,
          },
          { transaction },
        );
        idsBySlug.set(service.slug, created.id);
      }

      for (const alert of primaryCatalog.alerts) {
        const serviceId = idsBySlug.get(alert.serviceSlug);
        if (serviceId === undefined) {
          throw new InvalidCatalogError(
            `Serviço ausente durante a carga: ${alert.serviceSlug}`,
          );
        }

        await Alert.create(
          {
            serviceId,
            title: alert.title,
            detail: alert.detail,
            status: alert.status,
            severity: alert.severity,
          },
          { transaction },
        );
      }
    });

    return summarizeCatalog(primaryCatalog);
  } finally {
    await sequelize.close();
  }
}
