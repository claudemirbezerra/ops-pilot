import assert from "node:assert/strict";
import test from "node:test";

import { InvalidCatalogError } from "../domain/errors.js";
import {
  parsePrimaryCatalog,
  primaryCatalog,
  summarizeCatalog,
} from "./primary-catalog.js";

test("catálogo primário tem 5 serviços e 6 alertas, 3 em disparo e 3 resolvidos", () => {
  const summary = summarizeCatalog(primaryCatalog);

  assert.deepEqual(summary, {
    services: 5,
    alerts: 6,
    firing: 3,
    resolved: 3,
  });
  assert.deepEqual(
    primaryCatalog.services.map((service) => service.slug),
    ["api-gateway", "checkout", "payments", "auth", "notifications"],
  );
});

test("cada alerta aponta para um serviço do catálogo e as severidades variam", () => {
  const slugs = new Set(primaryCatalog.services.map((service) => service.slug));
  const severities = new Set(primaryCatalog.alerts.map((alert) => alert.severity));
  const alertsByService = new Map<string, number>();

  for (const alert of primaryCatalog.alerts) {
    assert.equal(slugs.has(alert.serviceSlug), true);
    alertsByService.set(alert.serviceSlug, (alertsByService.get(alert.serviceSlug) ?? 0) + 1);
  }

  assert.ok(severities.size >= 3);
  assert.ok([...alertsByService.values()].some((count) => count > 1));
});

test("catálogo recusa situação inválida, slug desconhecido e contagem errada", () => {
  const brokenStatus = {
    ...primaryCatalog,
    alerts: primaryCatalog.alerts.map((alert, index) =>
      index === 0 ? { ...alert, status: "open" } : alert,
    ),
  };
  const unknownService = {
    ...primaryCatalog,
    alerts: primaryCatalog.alerts.map((alert, index) =>
      index === 0 ? { ...alert, serviceSlug: "billing" } : alert,
    ),
  };
  const duplicated = {
    ...primaryCatalog,
    alerts: primaryCatalog.alerts.map((alert) => ({ ...alert, status: "firing" as const })),
  };

  assert.throws(() => parsePrimaryCatalog(brokenStatus), InvalidCatalogError);
  assert.throws(() => parsePrimaryCatalog(unknownService), InvalidCatalogError);
  assert.throws(() => parsePrimaryCatalog(duplicated), InvalidCatalogError);
});
