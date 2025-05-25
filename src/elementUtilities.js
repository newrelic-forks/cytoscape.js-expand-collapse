var {
  handleLayoutWithoutGroups,
  handleNonDagreLayoutWithGroups,
  handleDagreLayoutWithGroups,
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

    moveCompoundNode: function (node, oldPosition, newPosition) {
      var multiplier = {
        x: oldPosition.x < newPosition.x ? 1 : -1,
        y: oldPosition.y < newPosition.y ? 1 : -1,
      };

      // Calculate the difference in positions, adjusted by the multiplier
      var positionDiff = {
        x:
          multiplier.x === 1
            ? newPosition.x - oldPosition.x
            : (oldPosition.x - newPosition.x) * -1,
        y:
          multiplier.y === 1
            ? newPosition.y - oldPosition.y
            : (oldPosition.y - newPosition.y) * -1,
      };

      this.moveNodes(positionDiff, node.children(), undefined);
    },

    rearrange: async function () {
      var expandCollapseOptions =
        cy.scratch("_cyExpandCollapse")?.tempOptions ?? {};
      var hasGroupNodes = cy
        .nodes()
        .some((node) => node.data("type") === "group");
      var isDagreLayout =
        expandCollapseOptions?.groupLayoutBy?.name === "dagre";
      var layoutHandler = expandCollapseOptions?.layoutHandler;

      if (hasGroupNodes) {
        await (isDagreLayout
          ? handleDagreLayoutWithGroups(cy)
          : handleNonDagreLayoutWithGroups(cy, expandCollapseOptions));
      } else {
        await handleLayoutWithoutGroups(cy, expandCollapseOptions);
      }

      layoutHandler?.();
      cy.scratch("_cyExpandCollapse").positions = null;
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
