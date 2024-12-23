/**
 * Organizes nodes by their parent groups at each level.
 *
 * @param {Array} nodes - An array of node objects. Each node should have a `data` method that returns an object containing `type` and `parent` properties.
 * @returns {Array} An array of objects, each representing a level. Each object contains:
 *   - `level` (number): The level number (1, 2, etc.).
 *   - `items` (Array): An array of node groups at that level. For level 1, all nodes are combined into a single group.
 */
function getNodesByGroupLevels(nodes) {
  // Create a map to store nodes by their parent group at each level
  const levelGroups = {};
  // Filter out default nodes and process each node
  const filteredNodes = nodes.filter((node) => node.data().type !== "default");

  // First, organize nodes by their parent groups
  filteredNodes.forEach((node) => {
    const parentId = node.data().parent;

    // Level 1 (root level)
    if (parentId === undefined) {
      if (!levelGroups[1]) {
        levelGroups[1] = {
          root: [],
        };
      }
      levelGroups[1].root.push(node);
    }
    // Other levels
    else {
      // Calculate level based on the number of '::' in the parent
      const level = parentId.split("::").length + 1;

      if (!levelGroups[level]) {
        levelGroups[level] = {};
      }

      // Group by parent
      if (!levelGroups[level][parentId]) {
        levelGroups[level][parentId] = [];
      }
      levelGroups[level][parentId].push(node);
    }
  });

  // Convert the level groups to the required output format
  const result = Object.keys(levelGroups)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map((level, index) => ({
      level: index + 1, // Explicitly set length to 1, 2, etc.
      items:
        level === "1"
          ? [levelGroups[level].root] // For length 1, combine everything into a single group
          : Object.values(levelGroups[level]),
    }))
    .reverse();

  return result ?? [];
}

/**
 * Runs the given layout asynchronously and returns a promise that resolves when the layout stops.
 *
 * @param {Object} layout - The layout object that has an `on` method to listen for events and a `run` method to start the layout.
 * @returns {Promise<void>} A promise that resolves when the layout stops.
 */
function runLayoutAsync(layout) {
  return new Promise((resolve) => {
    layout.on("layoutstop", resolve);
    layout.run();
  });
}

/**
 * Resolves overlap of compound nodes in a cytoscape instance by temporarily replacing expanded nodes with positioning support nodes,
 * running the specified layout, and then restoring the original nodes.
 *
 * @param {Object} cy - The Cytoscape instance.
 * @param {Object} layoutBy - The layout options to be used for arranging the nodes.
 * @returns {Promise<void>} A promise that resolves when the layout has been applied and nodes have been restored.
 */
async function resolveCompoundNodesOverlap(cy, layoutBy) {
  const elementUtilities = require("./elementUtilities")(cy);
  const positioningSupportNodes = cy
    .nodes()
    .filter((node) => node.data().type === "positioning-support");

  if (positioningSupportNodes.length) {
    return;
  }
  const nodesByGroupLevels = getNodesByGroupLevels(cy.nodes());

  for (let i = 0; i < nodesByGroupLevels.length; i++) {
    let removedCollection = cy.collection();
    let positioningSupportCollection = cy.collection();
    let newGroupLevelNodesCollection = cy.collection();

    for (let j = 0; j < nodesByGroupLevels[i].items.length; j++) {
      const groupLevelNodes = nodesByGroupLevels[i].items[j];

      const newGroupLevelNodes = groupLevelNodes.map((node) => {
        //check if the node is expanded
        if (
          !node.hasClass("cy-expand-collapse-collapsed-node") &&
          node.isParent()
        ) {
          const positioningSupportNodeId = `support ${node.data().id}`;
          const positioningSupportNode = {
            group: "nodes",
            data: {
              id: positioningSupportNodeId,
              parent: node.data().parent,
              type: "positioning-support",
              label: `${node.data().label}`,
            },
            style: {
              width: node.boundingBox().w,
              height: node.boundingBox().h,
              padding: 0,
              "min-width": 0,
              "border-width": 0,
              shape: "round-rectangle",
            },
            position: {
              x: node.position("x"),
              y: node.position("y"),
            },
          };

          cy.add(positioningSupportNode);
          const removedNode = node.remove();
          removedCollection = removedCollection.union(removedNode);
          const newGroupLevelNode = cy.getElementById(positioningSupportNodeId);
          positioningSupportCollection =
            positioningSupportCollection.union(newGroupLevelNode);
          return newGroupLevelNode;
        }
        return node;
      });
      newGroupLevelNodesCollection =
        newGroupLevelNodesCollection.union(newGroupLevelNodes);
    }

    // If all nodes are collapsed
    if (removedCollection.length === 0 && nodesByGroupLevels.length === 1) {
      const reArrange = newGroupLevelNodesCollection.layout(layoutBy);

      await runLayoutAsync(reArrange);
    } else if (removedCollection.length > 0) {
      const reArrange = newGroupLevelNodesCollection.layout(layoutBy);

      await runLayoutAsync(reArrange);

      removedCollection.restore();
      removedCollection.forEach((removedNode) => {
        if (
          removedNode.group() !== "edges" ||
          removedNode.data()?.type === "default"
        ) {
          const positioningSupportNodeId = `support ${removedNode.data().id}`;
          const positioningSupportNode = cy.getElementById(
            positioningSupportNodeId
          );
          if (positioningSupportNode?.length) {
            // Determine the multiplier based on the relative positions of removedNode and positioningSupportNode
            const multiplier = {
              x:
                removedNode.position().x < positioningSupportNode.position().x
                  ? 1
                  : -1,
              y:
                removedNode.position().y < positioningSupportNode.position().y
                  ? 1
                  : -1,
            };

            // Calculate the difference in positions, adjusted by the multiplier
            const positionDiff = {
              x:
                multiplier.x === 1
                  ? positioningSupportNode.position().x -
                    removedNode.position().x
                  : (removedNode.position().x -
                      positioningSupportNode.position().x) *
                    -1,
              y:
                multiplier.y === 1
                  ? positioningSupportNode.position().y -
                    removedNode.position().y
                  : (removedNode.position().y -
                      positioningSupportNode.position().y) *
                    -1,
            };

            // Move the children of removedNode by the calculated position difference
            elementUtilities.moveNodes(
              positionDiff,
              removedNode.children(),
              undefined
            );
          }
        }
      });
      positioningSupportCollection.remove();
    }
  }
}

module.exports = { runLayoutAsync, resolveCompoundNodesOverlap };
