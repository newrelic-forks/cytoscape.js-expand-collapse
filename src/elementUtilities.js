const {
  runLayoutAsync,
  getClusterNodesExisitingInMap,
} = require("./layoutUtilities");

function elementUtilities(cy) {
  return {
    moveNodes: function (positionDiff, nodes, notCalcTopMostNodes) {
      var topMostNodes = notCalcTopMostNodes
        ? nodes
        : this.getTopMostNodes(nodes);
      var nonParents = topMostNodes.not(":parent");
      // moving parents spoils positioning, so move only nonparents
      nonParents.positions(function (ele, i) {
        return {
          x: nonParents[i].position("x") + positionDiff.x,
          y: nonParents[i].position("y") + positionDiff.y,
        };
      });
      for (var i = 0; i < topMostNodes.length; i++) {
        var node = topMostNodes[i];
        var children = node.children();
        this.moveNodes(positionDiff, children, true);
      }
    },
    getTopMostNodes: function (nodes) {
      //*//
      var nodesMap = {};
      for (var i = 0; i < nodes.length; i++) {
        nodesMap[nodes[i].id()] = true;
      }
      var roots = nodes.filter(function (ele, i) {
        if (typeof ele === "number") {
          ele = i;
        }

        var parent = ele.parent()[0];
        while (parent != null) {
          if (nodesMap[parent.id()]) {
            return false;
          }
          parent = parent.parent()[0];
        }
        return true;
      });

      return roots;
    },
    rearrange: async function (layoutBy) {
      if (layoutBy) {
        var hasGroupsNodes = !!cy
          .nodes()
          .some((node) => node.data().type === "group");
        if (hasGroupsNodes) {
          // get positions of nodes before preset layout
          const positions = {};
          (cy?.scratch("_cyExpandCollapse")?.positions ?? []).forEach(
            ({ nodeId, position }) => {
              positions[nodeId] = position;
            }
          );

          // run preset layout with the positions
          await runLayoutAsync(
            cy.layout({
              name: "preset",
              fit: !!layoutBy?.fit,
              positions: positions,
              // zoom: cy.zoom(),
              // pan: cy.pan(),
              padding: layoutBy?.padding ?? 50,
              animate: !!layoutBy?.animate,
              animationDuration: layoutBy?.animationDuration ?? 500,
              animationEasing: layoutBy?.animationEasing,
            })
          );
        } else {
          // clusters only for CISE layout
          var clusters = getClusterNodesExisitingInMap(
            cy,
            layoutBy?.clusters ?? []
          );

          cy.nodes().forEach((node) => {
            if (node.data().type === "cluster") {
              var finalEdge;
              cy.edges().forEach((edge) => {
                if (
                  edge.data().source === node.data().id ||
                  edge.data().target === node.data().id
                ) {
                  finalEdge = edge.remove();
                }
              });

              if (finalEdge?.length) {
                var restoreEdgeData = { ...finalEdge.data() };
                var restoreEdgeClasses = finalEdge.classes();

                var id = restoreEdgeData.id.split("_");
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

          await runLayoutAsync(cy.layout({ ...layoutBy, clusters: clusters }));
        }

        cy.scratch("_cyExpandCollapse")?.options?.layoutHandler?.();
        cy.scratch("_cyExpandCollapse").positions = null;
      }
    },
    convertToRenderedPosition: function (modelPosition) {
      var pan = cy.pan();
      var zoom = cy.zoom();

      var x = modelPosition.x * zoom + pan.x;
      var y = modelPosition.y * zoom + pan.y;

      return {
        x: x,
        y: y,
      };
    },
  };
}

module.exports = elementUtilities;
