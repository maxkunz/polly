import { useAppStore } from "@/stores/appStore";
import { i18n } from "@/i18n";

export type SetupPermissionContext = {
  useExistingDivision: boolean;
};

type RequirementMode = "base" | "conditional";
type DisabledOptionKey = "createDivision";

type PermissionRequirement = {
  id: string;
  label: string;
  mode: RequirementMode;
  allOf: string[][];
  requiredWhen?: (context: SetupPermissionContext) => boolean;
  disabledOption?: DisabledOptionKey;
  hint?: string;
};

type Policy = {
  domain: string;
  entityName: string;
  actionSet: string[];
};

export type SetupPermissionStatus = {
  id: string;
  label: string;
  mode: RequirementMode;
  satisfied: boolean;
  permissions: string[];
  hint?: string;
};

export type SetupPermissionReport = {
  ok: boolean;
  baseOk: boolean;
  available: SetupPermissionStatus[];
  missing: SetupPermissionStatus[];
  disabledOptions: Record<DisabledOptionKey, boolean>;
};

export type SetupPermissionSnapshot = {
  userId: string;
  userName: string;
  policies: Policy[];
};

const REQUIREMENTS: PermissionRequirement[] = [
  {
    id: "groups-manage",
    label: "setup.permissions.requirements.groupsManage",
    mode: "base",
    allOf: [["directory:group:add"], ["directory:group:delete"], ["directory:group:view"]]
  },
  {
    id: "roles-manage",
    label: "setup.permissions.requirements.rolesManage",
    mode: "base",
    allOf: [
      ["authorization:role:add"],
      ["authorization:role:delete"],
      ["authorization:grant:add"],
      ["authorization:grant:delete"],
      ["authorization:grant:view"]
    ]
  },
  {
    id: "integrations-view",
    label: "setup.permissions.requirements.integrationsView",
    mode: "base",
    allOf: [["integrations:integration:view"]]
  },
  {
    id: "integrations-manage",
    label: "setup.permissions.requirements.integrationsManage",
    mode: "base",
    allOf: [
      ["integrations:integration:add"],
      ["integrations:integration:delete"],
      ["integrations:integration:edit"],
      ["integrations:integration:view"],
      ["integrations:action:add"],
      ["integrations:action:delete"],
      ["integrations:action:edit"],
      ["integrations:action:execute"],
      ["integrations:action:view"]
    ]
  },
  {
    id: "oauth-manage",
    label: "setup.permissions.requirements.oauthManage",
    mode: "base",
    allOf: [["oauth:client:view"], ["oauth:client:add"], ["oauth:client:edit"], ["oauth:client:delete"]]
  },
  {
    id: "divisions-view",
    label: "setup.permissions.requirements.divisionsView",
    mode: "base",
    allOf: [["authorization:division:view"]]
  },
  {
    id: "datatable-manage",
    label: "setup.permissions.requirements.datatableManage",
    mode: "base",
    allOf: [
      ["architect:datatable:add"],
      ["architect:datatable:delete"],
      ["architect:datatable:edit"],
      ["architect:datatable:view"],
      ["architect:datatableRow:add"],
      ["architect:datatableRow:delete"],
      ["architect:datatableRow:edit"],
      ["architect:datatableRow:view"]
    ]
  },
  {
    id: "flows-manage",
    label: "setup.permissions.requirements.flowsManage",
    mode: "base",
    allOf: [
      ["architect:flow:add"],
      ["architect:flow:delete"],
      ["architect:flow:edit"],
      ["architect:job:create"],
      ["architect:flow:publish"],
      ["architect:flow:view"]
    ]
  },
  {
    id: "division-create",
    label: "setup.permissions.requirements.divisionCreate",
    mode: "conditional",
    allOf: [["authorization:division:add"], ["authorization:division:delete"]],
    requiredWhen: (context) => !context.useExistingDivision,
    disabledOption: "createDivision",
    hint: "setup.permissions.divisionHint"
  },
];

function normalize(input: string | undefined | null): string {
  return (input ?? "").trim().toLowerCase();
}

function parsePermission(permission: string): Policy {
  const [domain = "", entityName = "", action = ""] = permission.split(":");
  return {
    domain: normalize(domain),
    entityName: normalize(entityName),
    actionSet: [normalize(action)]
  };
}

function actionMatches(policyActions: string[], requiredAction: string): boolean {
  const normalized = policyActions.map(normalize);
  return normalized.includes("*") || normalized.includes("all") || normalized.includes(requiredAction);
}

function entityMatches(policyEntity: string, requiredEntity: string): boolean {
  const normalizedPolicy = normalize(policyEntity);
  return normalizedPolicy === "*" || normalizedPolicy === normalize(requiredEntity);
}

function hasPermission(policies: Policy[], permission: string): boolean {
  const required = parsePermission(permission);

  return policies.some((policy) => {
    if (normalize(policy.domain) !== required.domain) return false;
    if (!entityMatches(policy.entityName, required.entityName)) return false;
    return actionMatches(policy.actionSet, required.actionSet[0]);
  });
}

function collectPolicies(subject: any): Policy[] {
  const grants = Array.isArray(subject?.grants) ? subject.grants : [];
  const results: Policy[] = [];

  for (const grant of grants) {
    const policies = Array.isArray(grant?.role?.policies) ? grant.role.policies : [];
    for (const policy of policies) {
      results.push({
        domain: normalize(policy?.domain),
        entityName: normalize(policy?.entityName),
        actionSet: Array.isArray(policy?.actions) ? policy.actions.map((action: string) => normalize(action)) : []
      });
    }
  }

  return results;
}

export async function loadSetupPermissionSnapshot(): Promise<SetupPermissionSnapshot> {
  const app = useAppStore();
  const subject = await app.genesys.authorizationApi.getAuthorizationSubjectsMe();
  const policies = collectPolicies(subject);

  return {
    userId: app.currentUser?.id ?? "",
    userName: app.currentUser?.name ?? "",
    policies
  };
}

export function evaluateSetupPermissions(
  snapshot: SetupPermissionSnapshot,
  context: SetupPermissionContext
): SetupPermissionReport {
  const available: SetupPermissionStatus[] = [];
  const missing: SetupPermissionStatus[] = [];
  const disabledOptions: Record<DisabledOptionKey, boolean> = {
    createDivision: false
  };

  for (const requirement of REQUIREMENTS) {
    const isRequired = requirement.requiredWhen ? requirement.requiredWhen(context) : true;
    const satisfied = requirement.allOf.every((permissionGroup) =>
      permissionGroup.some((permission) => hasPermission(snapshot.policies, permission))
    );

    // Die Option bleibt gesperrt, auch wenn bereits auf eine bestehende Division umgestellt wurde.
    if (requirement.disabledOption && !satisfied) {
      disabledOptions[requirement.disabledOption] = true;
    }
    if (!isRequired) continue;

    const status: SetupPermissionStatus = {
      id: requirement.id,
      label: i18n.global.t(requirement.label),
      mode: requirement.mode,
      satisfied,
      permissions: requirement.allOf.flat(),
      hint: requirement.hint ? i18n.global.t(requirement.hint) : undefined
    };

    if (satisfied) {
      available.push(status);
    } else {
      missing.push(status);
    }
  }

  const baseOk = missing.every((item) => item.mode !== "base");

  return {
    ok: missing.length === 0,
    baseOk,
    available,
    missing,
    disabledOptions
  };
}
