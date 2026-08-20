import { useAppStore } from "@/stores/appStore";



// Choose your Division

export function getYourDivision() {
    const { objectsApi } = useAppStore().genesys;
    return objectsApi.getAuthorizationDivisions();
}


// CREATE DATA TABLE

export async function createDataTable(name: string, schema: object, divisionId: string) {
    const { architectApi } = useAppStore().genesys;
    return architectApi.postFlowsDatatables({
        name,
        division: { id: divisionId },
        schema
    });
}

// ADD ROW (zum Importieren)
export async function addDataTableRow(datatableId: string, row: Record<string, any>) {
    const { architectApi } = useAppStore().genesys;
    return architectApi.postFlowsDatatableRows(datatableId, row);
}



// ***************
// DELETE DATA TABLE (admin only) !!!
// ***************

export async function listDataTablesByDivision(divisionId: string) {
    const { architectApi } = useAppStore().genesys;
    const opts = {
        divisionId: [divisionId],
        pageSize: 100
    };
    const res = await architectApi.getFlowsDatatables(opts);
    return res.entities || [];
}



export async function deleteDataTable(datatableId: string, force: boolean = false) {
    const { architectApi } = useAppStore().genesys;
    let opts = {
        "force": force
    };
    return architectApi.deleteFlowsDatatable(datatableId, opts);
}


// ***************************************





// Falls man später bracuht:

// LIST ALL DATATABLES

export async function listDataTables() {
    const { architectApi } = useAppStore().genesys;
    return architectApi.getFlowsDatatables();
}
// GET COLUMNS / SCHEMA OF DATATABLE

export async function getDataTableColumns(datatableId: string) {
    const { architectApi } = useAppStore().genesys;
    const dt = await architectApi.getFlowsDatatable(datatableId, { expand: 'schema' });  // !!!
    //console.log("Ist Schema da ??? ");
    //console.log(dt);
    return dt?.schema; // Schema enthält die Spalteninformationen
}
// LIST of ROWS
export async function listDataTableRows(datatableId: string, pageSize: number = 100) {
    const { architectApi } = useAppStore().genesys;

    // Aufruf der API
    const res = await architectApi.getFlowsDatatableRows(datatableId, {
        pageSize: pageSize,
        showbrief: false
    });

    console.log("Rohdaten in listDataTableRows:", res);

    // Wenn 'entities' direkt in res liegt:
    if (res && res.entities) {
        return res.entities;
    }

    // Falls das SDK es doch in .data versteckt:
    if (res && res.data && res.data.entities) {
        return res.data.entities;
    }

    return []; // Fallback
}
// ONE ROW
export async function OneRowDataTable(datatableId: string, rowId: string) {
    const { architectApi } = useAppStore().genesys;
    const res = await architectApi.getFlowsDatatableRow(datatableId, rowId, { showbrief: false });
    console.log("OneRowDataTable getFlowsDatatableRow", res);
    return res; // Einzelnes Zeilen-Objekt (getFlowsDatatableRow liefert kein .entities Array)
}
// UPDATE ROW 
export async function updateDataTableRow(datatableId: string, rowKey: string, rowData: any) {
    const { architectApi } = useAppStore().genesys;

    // ... spread operator
    // const rowData = { key: 'key1', name: 'Alice' }
    // const rowBody = { ...rowData, age: 30 }
    // console.log(rowBody) // { key: 'key1', name: 'Alice', age: 30 }

    const rowBody = {
        ...rowData,
        key: rowKey // fügen den Key hier explizit wieder hinzu
    };

    return await architectApi.putFlowsDatatableRow(
        datatableId,
        rowKey,
        { body: rowBody }
    );
}

// DELETE ROW

export async function deleteDataTableRow(datatableId: string, rowId: string) {
    const { architectApi } = useAppStore().genesys;
    return architectApi.deleteFlowsDatatableRow(datatableId, rowId);
}
