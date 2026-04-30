import { useAppStore } from "@/stores/appStore";


// create
export async function createDivision(name: string, description?: string) {
  const { objectsApi } = useAppStore().genesys;
  return objectsApi.postAuthorizationDivisions({ name, description });
}

// update

export async function updateDivision( divisionId: string, name: string, description?: string ) {
    const { objectsApi } = useAppStore().genesys;
    return objectsApi.putAuthorizationDivision(divisionId, {
      name,
      description,
    });
  }

// delete

export async function deleteDivision(divisionId: string) {
    const { objectsApi } = useAppStore().genesys;
    return objectsApi.deleteAuthorizationDivision(divisionId);
  }

// get List

export async function getListDivisions() {
    const { objectsApi } = useAppStore().genesys;
    const res = await objectsApi.getAuthorizationDivisions({
      pageSize: 100
    })

    return res.entities || []
   
  }
