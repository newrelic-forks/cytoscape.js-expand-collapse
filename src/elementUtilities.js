var { repairEdges, restoreEdges } = require("./edgeUtilities");
var getSupportCy = require("./getSupportCy");
var {
  runLayoutAsync,
  getCiseClusterNodesExisitingInMap,
  adjustDagreLayoutWithSeparation,
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
    rearrange: async function (layoutBy, layoutHandler) {
      if (layoutBy) {
        var hasGroupsNodes = !!cy
          .nodes()
          .some((node) => node.data().type === "group");
        if (hasGroupsNodes) {
          if (
            cy?.scratch("_cyExpandCollapse")?.options?.groupLayoutBy?.name !==
            "dagre"
          ) {
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
                padding: layoutBy?.padding ?? 50,
                animate: !!layoutBy?.animate,
                animationDuration: layoutBy?.animationDuration ?? 500,
                animationEasing: layoutBy?.animationEasing,
              })
            );
          } else {
            var finalPositions = {};
            (cy?.scratch("_cyExpandCollapse")?.finalPositions ?? []).forEach(
              ({ nodeId, position }) => {
                finalPositions[nodeId] = position;
              }
            );

            var supportCy = getSupportCy(cy);
            supportCy.scratch("_cyExpandCollapse", {
              ...(cy.scratch("_cyExpandCollapse") ?? {}),
            });
            // run preset layout with the finalPositions
            await runLayoutAsync(
              supportCy.layout({
                name: "preset",
                fit: !!layoutBy?.fit,
                positions: finalPositions,
                padding: layoutBy?.padding ?? 50,
                animate: false,
              })
            );

            adjustDagreLayoutWithSeparation(supportCy, 100, 100);

            var supportFinalPositions = {};
            supportCy.nodes().map((node) => {
              supportFinalPositions[node.id()] = {
                x: node.position("x"),
                y: node.position("y"),
              };
            });

            // run preset layout with the supportFinalpositions
            await runLayoutAsync(
              cy.layout({
                name: "preset",
                fit: !!layoutBy?.fit,
                positions: supportFinalPositions,
                padding: layoutBy?.padding ?? 50,
                animate: !!layoutBy?.animate,
                animationDuration: layoutBy?.animationDuration ?? 500,
                animationEasing: layoutBy?.animationEasing,
              })
            );

            supportCy.destroy();
          }
        } else {
          // clusters of CISE layout

          repairEdges(cy);

          var ciseClusters = getCiseClusterNodesExisitingInMap(
            cy,
            layoutBy?.clusters ?? []
          );
          await runLayoutAsync(
            cy.layout({ ...layoutBy, clusters: ciseClusters })
          );

          restoreEdges(cy);
        }

        if (layoutHandler) {
          layoutHandler?.();
        }
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
