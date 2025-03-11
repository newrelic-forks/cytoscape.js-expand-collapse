function repairEdges(cy) {
  const edges = cy.edges();
  const uniqueEdges = {};
  edges.forEach((edge) => {
    const edgeId = `${edge.data().source}_${edge.data().target}`;
    const reversedEdgeId = `${edge.data().target}_${edge.data().source}`;
    if (!uniqueEdges[edgeId] && !uniqueEdges[reversedEdgeId]) {
      uniqueEdges[edgeId] = edge;
    }
  });

  const removedEdges = edges.remove();

  Object.values(uniqueEdges).forEach((edge) => {
    let restoreEdgeData = { ...(edge?.data?.() ?? {}) };
    restoreEdgeData.id = `${restoreEdgeData.source}_${restoreEdgeData.label}_${restoreEdgeData.target}`;

    let restoreEdgeClasses = [...(edge?.classes?.() ?? [])];

    if (!cy.getElementById(edge.id()).length) {
      cy.add({
        group: "edges",
        data: restoreEdgeData,
        classes: restoreEdgeClasses,
      });
    }
  });

  const scratchData = cy.scratch("_cyExpandCollapse") ?? {};
  cy.scratch("_cyExpandCollapse", { ...scratchData, removedEdges });
}

function restoreEdges(cy) {
  cy.edges().remove();

  const scratchData = cy.scratch("_cyExpandCollapse") ?? {};
  const removedEdges = scratchData.removedEdges ?? [];

  if (removedEdges.length) {
    removedEdges.restore();
  }

  cy.scratch("_cyExpandCollapse", { ...scratchData, removedEdges: [] });
}

module.exports = { repairEdges, restoreEdges };
