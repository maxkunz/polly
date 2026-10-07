import { useAppStore } from "@/stores/appStore";

export function makeJobForFlow() {
  const app = useAppStore();
  app.initGenesysClients();
  return app.genesys.architectApi.postFlowsJobs();
}

export function flowFetch(jobId: string) {
  const { architectApi } = useAppStore().genesys;
  return architectApi.getFlowsJob(jobId, { expand: ["messages"] });
}

export function deleteFlow(flowId: string) {
  const { architectApi } = useAppStore().genesys;
  return architectApi.deleteFlow(flowId);
}
