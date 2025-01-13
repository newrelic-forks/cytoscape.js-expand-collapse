const { runLayoutAsync } = require("./layoutUtilities");

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
              zoom: cy.zoom(),
              pan: cy.pan(),
              padding: layoutBy?.padding ?? 50,
              animate: !!layoutBy?.animate,
              animationDuration: layoutBy?.animationDuration ?? 500,
              animationEasing: layoutBy?.animationEasing,
            })
          );
        } else {
          await runLayoutAsync(cy.layout(layoutBy));
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
