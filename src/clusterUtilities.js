function repairClusterEdges(cy) {
  var scratchData = cy.scratch("_cyExpandCollapse") ?? {};
  var originalClusteredEdgeids = {
    ...(scratchData.originalClusteredEdgeids ?? {}),
  };

  cy.nodes().forEach((node) => {
    if (node.data().type === "cluster") {
      const clusterId = node.data().id;
      const clusteredEdgesIds = new Set();
      const uniqueClusterEdges = {};

      cy.edges().forEach((edge) => {
        if (
          edge.data().source === clusterId ||
          edge.data().target === clusterId
        ) {
          const clusterEdge = edge.remove();
          const clusterEdgeId = `${clusterEdge.data().source}_${
            clusterEdge.data().label
          }_${clusterEdge.data().target}`;

          clusteredEdgesIds.add(clusterEdge.id());
          uniqueClusterEdges[clusterEdgeId] = clusterEdge;
        }
      });

      // originalClusteredEdgeids only on the initialization, after that just refer this to restore the edges when cluster is expanded
      if (!originalClusteredEdgeids[clusterId]) {
        originalClusteredEdgeids[clusterId] = clusteredEdgesIds;
      }

      Object.values(uniqueClusterEdges).forEach((retainedEdge) => {
        let restoreEdgeData = { ...retainedEdge.data() };
        let restoreEdgeClasses = [...retainedEdge.classes()];
        let id = restoreEdgeData.id.split("_");

        if (restoreEdgeData.source === clusterId) {
          id[0] = clusterId;
        } else if (restoreEdgeData.target === clusterId) {
          id[id.length - 1] = clusterId;
        }
        id = id.join("_");
        restoreEdgeData.id = id;

        delete restoreEdgeData.originalEnds;

        if (!cy.getElementById(id).length) {
          cy.add({
            group: "edges",
            data: restoreEdgeData,
            classes: restoreEdgeClasses,
          });
        }
      });
    }
  });

  scratchData.originalClusteredEdgeids = { ...originalClusteredEdgeids };
  cy.scratch("_cyExpandCollapse", scratchData);
}

module.exports = { repairClusterEdges };
