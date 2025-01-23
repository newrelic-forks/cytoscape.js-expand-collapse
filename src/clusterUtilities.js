function repairClusterEdges(cy) {
  cy.nodes().forEach((node) => {
    if (node.data().type === "cluster") {
      let finalEdge;
      cy.edges().forEach((edge) => {
        if (
          edge.data().source === node.data().id ||
          edge.data().target === node.data().id
        ) {
          finalEdge = edge.remove();
        }
      });

      if (finalEdge?.length) {
        let restoreEdgeData = { ...finalEdge.data() };
        let restoreEdgeClasses = [...finalEdge.classes()];
        let id = restoreEdgeData.id.split("_");

        if (restoreEdgeData.source === node.data().id) {
          id[0] = node.data().id;
        } else if (restoreEdgeData.target === node.data().id) {
          id[2] = node.data().id;
        }
        id = id.join("_");
        restoreEdgeData.id = id;

        delete restoreEdgeData.originalEnds;

        cy.add({
          group: "edges",
          data: restoreEdgeData,
          classes: restoreEdgeClasses,
        });
      }
    }
  });
}

module.exports = { repairClusterEdges };
