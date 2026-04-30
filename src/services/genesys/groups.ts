import { useAppStore } from "@/stores/appStore";

interface PermissionPolicy {
  domain: string;
  entityName: string;
  actionSet: string[];
  allowConditions: boolean;
}

interface RoleConfig {
  permissions: string[];
  permissionPolicies: PermissionPolicy[];
}

export async function createGroup(name: string, rulesVisible: boolean, visibility: string, type: string) {
  const { groupsApi } = useAppStore().genesys;

  const body = {
    name,
    rulesVisible,
    visibility,
    type,
  };

  return groupsApi.postGroups(body);
}

export function applyRolePlaceholder(jsonTemplate: string, roleName: string) {
  return jsonTemplate.replace("{{ROLE_NAME}}", roleName);
}

export async function createRole(config: RoleConfig | null | undefined, name: string, description?: string) {
  const { authorizationApi } = useAppStore().genesys;

  if (!config) {
    throw new Error("Role config is required.");
  }

  const body = {
    name,
    description,
    permissions: config.permissions,
    permissionPolicies: config.permissionPolicies,
  };

  return authorizationApi.postAuthorizationRoles(body);
}

export async function GroupWithRole(subjectId: string, divisionId: string, roleId: string) {
  const { usersApi } = useAppStore().genesys;

  const opts = {
    subjectType: "PC_GROUP",
  };

  return usersApi.postAuthorizationSubjectDivisionRole(subjectId, divisionId, roleId, opts);
}

export function getYourDivision() {
  const { objectsApi } = useAppStore().genesys;
  return objectsApi.getAuthorizationDivisions();
}

export async function getGroup(groupId: string) {
  const { groupsApi } = useAppStore().genesys;
  return groupsApi.getGroup(groupId);
}

export async function getYourGroup() {
  const { groupsApi } = useAppStore().genesys;
  return groupsApi.getGroups({ pageSize: 100 });
}

export async function getYourRole() {
  const { authorizationApi } = useAppStore().genesys;
  return authorizationApi.getAuthorizationRoles({ pageSize: 100 });
}

export async function createUser(name: string, email: string, divisionId: string, state?: string, password?: string) {
  const { usersApi } = useAppStore().genesys;

  const body = {
    name,
    email,
    divisionId,
    state,
    password,
  };

  return usersApi.postUsers(body);
}

export async function getListOfMembers() {
  const { usersApi } = useAppStore().genesys;
  const res = await usersApi.getUsers({ pageSize: 100 });
  return res.entities || [];
}

export async function addMembers(groupId: string, memberId: string, version: string) {
  const { groupsApi } = useAppStore().genesys;

  const body = {
    memberIds: [memberId],
    version: parseInt(version),
  };

  return groupsApi.postGroupMembers(groupId, body);
}

export async function updateGroup(groupId: string, version: number, name?: string, description?: string) {
  const { groupsApi } = useAppStore().genesys;

  const groupData: any = {
    version,
  };

  if (name) groupData.name = name;
  if (description) groupData.description = description;

  return groupsApi.putGroup(groupId, { body: groupData });
}

export async function deleteGroup(groupId: string) {
  const { groupsApi } = useAppStore().genesys;
  return groupsApi.deleteGroup(groupId);
}

export async function deleteRole(roleId: string) {
  const { authorizationApi } = useAppStore().genesys;
  return authorizationApi.deleteAuthorizationRole(roleId);
}

export async function deleteMembers(groupId: string, membersIds: string) {
  const { groupsApi } = useAppStore().genesys;
  return groupsApi.deleteGroupMembers(groupId, membersIds);
}
